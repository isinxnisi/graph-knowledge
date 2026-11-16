import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';import neo4j from 'neo4j-driver';import {randomUUID} from 'node:crypto';
import {createKnowledgeFoundationService} from '../lib/server/knowledge-foundation';
import {createKnowledgePublicationService,ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {hasThemeLocale,additiveThemeContent} from '../lib/domain/theme-locale';
import {translationHash} from '../lib/server/knowledge-translation-storage';
const pool=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL});const driver=neo4j.driver('bolt://127.0.0.1:1');
let foundation:ReturnType<typeof createKnowledgeFoundationService>,publication:ReturnType<typeof createKnowledgePublicationService>;
const actor={kind:'operator' as const,id:'isolated-language-editions'};
const run=(action:string,fields:Record<string,unknown>)=>foundation.execute(actor,{action,requestId:randomUUID(),reason:'隔離言語版試験',...fields});
const en=()=>publication.theme({themeId:'theme:fixture',language:'en'},{localeEdition:true});
const ja=()=>publication.theme({themeId:'theme:fixture',language:'ja'},{localeEdition:true});
async function translate(kind:string,id:string,revision:number,field:string,text:string){
 const original=await publication.textOriginal({kind,id,revision,field} as Parameters<typeof publication.textOriginal>[0]);
 return await run('accept-translation',{target:{kind,id,revision,field},language:'en',text,originalHash:original.hash,expectedRevision:0}) as {id:string};
}
async function ready(){await translate('theme','theme:fixture',1,'title','A telescope unfolds');await translate('theme','theme:fixture',1,'description','A journey into space.');await translate('record','r1',1,'assertion','The telescope launched.');}
async function edit(extra:Record<string,unknown>={}){const t=await foundation.get(actor,'theme','theme:fixture');return run('edit-theme',{id:t.id,expectedRevision:t.revision,title:t.content.title,description:t.content.description,initialView:t.content.initialView,recordPins:[{id:'r1',revision:1},{id:'r2',revision:1}],...extra});}
beforeAll(async()=>{expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() n')).rows[0].n).toBe('plunode_knowledge75_test_capsule_share');});
beforeEach(async()=>{
 await pool.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');foundation=createKnowledgeFoundationService(pool);
 await run('create-bundle',{entities:[{id:'entity',content:{name:'望遠鏡',kind:'work'}}],sources:[{id:'source',content:{title:'公開資料',url:'https://example.org/source'}}],records:['r1','r2'].map((id,i)=>({id,content:{kind:'episode',subjectId:'entity',assertion:i?'展開が完了した。':'望遠鏡が出発した。',times:[{id:'date',time:{kind:'calendar',from:i?'2022-01-04':'2021-12-25'}}],evidence:[{id:'proof',source:{id:'source',revision:1},locator:'本文'}]}}))});
 await ensureKnowledgePublicationSchema(pool);await migrateKnowledgeTranslations(pool);publication=createKnowledgePublicationService(pool,driver);
 await run('create-theme',{id:'theme:fixture',title:'望遠鏡をひらく',description:'宇宙への旅。',recordPins:[{id:'r1',revision:1}],initialView:'timeline'});
});
afterAll(async()=>{await pool.end();await driver.close();});
it('keeps an established English canonical body/search entry during Japanese additions, then automatically serves the completed newer edition',async()=>{
 await ready();expect(hasThemeLocale(await en(),'en')).toBe(true);await edit();
 const pending=await en();expect(pending.theme.revision).toBe(1);expect(pending.snapshot.records.map(r=>r.id)).toEqual(['r1']);expect(pending.localeEdition).toEqual({language:'en',servedRevision:1,latestRevision:2,state:'translation-pending'});expect(hasThemeLocale(pending,'en')).toBe(true);
 expect((await ja()).theme.revision).toBe(2);expect((await publication.themes({language:'en'})).themes.map(t=>t.id)).toContain('theme:fixture');
 await translate('record','r2',1,'assertion','The deployment completed.');const complete=await en();expect(complete.theme.revision).toBe(2);expect(complete.snapshot.records).toHaveLength(2);expect(complete.localeEdition).toBeUndefined();
});
it('does not make an initial language page from late partial translations of an old composition',async()=>{
 expect(hasThemeLocale(await en(),'en')).toBe(false);await ready();await edit();
 // Simulate a legacy/imported history whose old translations became available only later.
 await pool.query('UPDATE knowledge75.text_translation_revisions SET created_at=clock_timestamp()');
 expect(hasThemeLocale(await en(),'en')).toBe(false);await translate('record','r2',1,'assertion','Complete.');expect(hasThemeLocale(await en(),'en')).toBe(true);
});
it('preserves ordinary latest reads and exact edition/Capsule contracts rather than applying canonical fallback to them',async()=>{
 await ready();await edit();expect((await publication.theme({themeId:'theme:fixture',language:'en'})).theme.revision).toBe(2);
 expect(hasThemeLocale(await publication.theme({themeId:'theme:fixture',language:'en',revision:2},{localeEdition:true}),'en')).toBe(false);
 expect((await publication.theme({themeId:'theme:fixture',language:'en',revision:1},{localeEdition:true})).theme.revision).toBe(1);
});
it.each(['title','description'])('never retains across an explicit %s correction or edit/revert',async field=>{
 await ready();await edit({[field]:'明示訂正'});expect(hasThemeLocale(await en(),'en')).toBe(false);await edit({[field]:field==='title'?'望遠鏡をひらく':'宇宙への旅。'});expect(hasThemeLocale(await en(),'en')).toBe(false);
});
it('never restores removed membership even if a subsequent edit adds it back',async()=>{
 await ready();await edit({recordPins:[{id:'r2',revision:1}]});await edit();expect(hasThemeLocale(await en(),'en')).toBe(false);
});
it('rejects fallback through original corrections and reference-version replacements',async()=>{
 await ready();await edit();const r=await foundation.get(actor,'record','r1');await run('correct',{kind:'record',id:r.id,expectedRevision:1,content:{...r.content,assertion:'出発は訂正された。'}});expect(hasThemeLocale(await en(),'en')).toBe(false);
 await edit({recordPins:[{id:'r1',revision:2},{id:'r2',revision:1}]});expect(hasThemeLocale(await en(),'en')).toBe(false);
});
it('does not resurrect withdrawn newer Theme translations from a prior composition',async()=>{
 await ready();await edit();const t=await translate('theme','theme:fixture',2,'title','Revised English title');await run('set-translation-visibility',{id:t.id,expectedStatusRevision:1,visibility:'hidden'});expect(hasThemeLocale(await en(),'en')).toBe(false);
 expect(hasThemeLocale(await publication.theme({themeId:'theme:fixture',revision:1,language:'en'}),'en')).toBe(true);
});
it('withdrawn body translation suspends the language rather than reviving old text',async()=>{
 await ready();await edit();const head=(await pool.query("SELECT id FROM knowledge75.text_translation_heads WHERE target->>'kind'='record' AND target->>'id'='r1' AND target->>'field'='assertion'")).rows[0];await run('set-translation-visibility',{id:head.id,expectedStatusRevision:1,visibility:'hidden'});expect(hasThemeLocale(await en(),'en')).toBe(false);
});
it.each(['source','record','theme'])('current %s withdrawal/privacy gates every historical language edition',async kind=>{
 await ready();await edit();const id=kind==='source'?'source':kind==='record'?'r1':'theme:fixture',status=(await foundation.list(actor)).statuses.find(s=>s.kind===kind&&s.id===id)!;await run('set-visibility',{kind,id,expectedStatusRevision:status.revision,visibility:'hidden'});await expect(en()).rejects.toMatchObject({status:404});
});
it('nonexistent IDs remain unavailable and Japanese additions are not delayed',async()=>{await expect(publication.theme({themeId:'missing',language:'en'},{localeEdition:true})).rejects.toMatchObject({status:404});await edit();expect((await ja()).snapshot.records).toHaveLength(2);});
it('reuses a corrected public translation of the same original without a new Theme revision',async()=>{
 await ready();await edit();const original=await publication.textOriginal({kind:'record',id:'r1',revision:1,field:'assertion'});await run('accept-translation',{target:{kind:'record',id:'r1',revision:1,field:'assertion'},language:'en',text:'The observatory launched into space.',originalHash:translationHash(original.text),expectedRevision:1});const value=await en();expect(value.theme.revision).toBe(1);expect(value.displayTranslations?.some(t=>t.text==='The observatory launched into space.')).toBe(true);
});
it('addition comparison protects existing order, original text, removals and revision references',()=>{expect(additiveThemeContent({pins:[{id:'a',revision:1}]},{pins:[{id:'b',revision:1},{id:'a',revision:1}]})).toBe(true);expect(additiveThemeContent({pins:[{id:'a',revision:1}]},{pins:[{id:'a',revision:2}]})).toBe(false);expect(additiveThemeContent({title:'old'},{title:'new'})).toBe(false);});
