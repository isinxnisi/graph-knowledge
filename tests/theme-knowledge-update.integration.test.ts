import {translationHash} from '../lib/server/knowledge-translation-storage';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createKnowledgeFoundationService,ensureKnowledgeFoundationSchema} from '../lib/server/knowledge-foundation';
import {themePublicationState,freezeThemeReleases} from '../lib/server/knowledge-theme-publication';
import {withOperatorThemeRead} from '../lib/server/knowledge-theme-access';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {publicDisplayTranslations} from '../lib/server/knowledge-display-translations';
import {knowledgeReleaseBase} from '../lib/server/knowledge-theme-knowledge-update';

const pool=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
const actor={kind:'operator' as const,id:'fixture'};
let f:ReturnType<typeof createKnowledgeFoundationService>;
const content={kind:'note',subjectId:'a',assertion:'Accepted background.',evidence:[{id:'e',source:{id:'s',revision:1},locator:'Body',excerpt:'Accepted background.'}]};
const savedCommands=new Map<string,unknown>();
async function accept(id='added',requestId=randomUUID(),pinRevision=1){
 let command=savedCommands.get(requestId);
 if(!command){const existing=(await pool.query("SELECT o.current_revision,r.content FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision WHERE o.kind='record' AND o.id=$1",[id])).rows[0];
  command={action:'accept-record',requestId,entities:[],sources:[],entityPins:[{id:'a',revision:1}],sourcePins:[{id:'s',revision:1}],record:{id,content:id==='base'?existing.content:{...content,assertion:id==='added'?content.assertion:id}},...(existing?{expectedRevision:existing.current_revision}:{}),themes:[{id:'theme',revision:pinRevision}],reason:'Accepted isolated evidence'};savedCommands.set(requestId,command);
 }
 return f.execute({kind:'collection',id:'verified-fixture'},command,{verify:async()=>{},prepare:async()=>{},retain:async()=>{}});
}
async function approve(){await pool.query("INSERT INTO knowledge75.theme_releases(theme_id,revision) VALUES('theme',1)");await pool.query("UPDATE knowledge75.theme_publications SET published_revision=1,updated_at=clock_timestamp() WHERE theme_id='theme'");}
async function current(){return f.get(actor,'theme','theme');}
async function edit(){await f.execute(actor,{action:'edit-theme',requestId:randomUUID(),id:'theme',expectedRevision:1,title:'Private editorial title',description:'Private prose',recordPins:[{id:'base',revision:1}],initialView:'graph',reason:'Unapproved manual draft'});}
beforeAll(async()=>{expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);expect((await pool.query('SELECT current_database() n')).rows[0].n).toBe('plunode_knowledge75_test_capsule_share');});
beforeEach(async()=>{
 savedCommands.clear();await pool.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');f=createKnowledgeFoundationService(pool);
 await f.execute(actor,{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'A',kind:'organization'}}],sources:[{id:'s',content:{title:'Source',url:'https://example.org/source'}}],records:[{id:'base',content:{...content,assertion:'Baseline.'}}],reason:'Isolated baseline'});
 await migrateKnowledgeTranslations(pool);
 await f.execute(actor,{action:'create-theme',requestId:randomUUID(),id:'theme',title:'Approved title',description:'Approved prose',recordPins:[{id:'base',revision:1}],initialView:'graph',stories:{version:1,items:[]},reason:'Isolated theme'});
},30000);
afterAll(()=>pool.end());

it('publishes accepted knowledge atomically, preserving old editions and idempotent delivery',async()=>{
 await approve();const before=await current(),requestId=randomUUID();const result=await accept('added',requestId);
 expect(await themePublicationState(pool,'theme')).toMatchObject({publishedRevision:2,workingRevision:2,workingChanges:false});
 expect(await f.get({kind:'user',id:'reader'},'theme','theme',1)).toEqual(before);
 const latest=await f.get({kind:'user',id:'reader'},'theme','theme');expect(latest.content).toMatchObject({title:'Approved title',stories:before.content.stories});expect(latest.content.recordPins).toHaveLength(2);
 expect(await accept('added',requestId)).toEqual(result);await accept('added');
 expect((await current()).revision).toBe(2);expect((await pool.query('SELECT count(*)::int n FROM knowledge75.theme_release_approvals')).rows[0].n).toBe(2);
 expect(await knowledgeReleaseBase(pool,'theme',2)).toBe(1);
 await expect(pool.query("UPDATE knowledge75.theme_knowledge_revisions SET parent_revision=1")).rejects.toThrow('immutable');
 const checksums=(await pool.query('SELECT * FROM knowledge75.migrations ORDER BY name')).rows;await ensureKnowledgeFoundationSchema(pool);expect((await pool.query('SELECT * FROM knowledge75.migrations ORDER BY name')).rows).toEqual(checksums);
});
it('never publishes an unapproved manual draft, while public readers receive accepted knowledge',async()=>{
 await approve();await edit();const draft=await current();await accept();
 expect(await themePublicationState(pool,'theme')).toMatchObject({publishedRevision:3,workingRevision:4,workingChanges:true});
 const published=await f.get({kind:'user',id:'reader'},'theme','theme');expect(published.content).toMatchObject({title:'Approved title',description:'Approved prose'});expect(published.content.recordPins).toHaveLength(2);
 expect((await current()).content).toMatchObject({title:'Private editorial title',description:'Private prose'});expect((await current()).content.recordPins).toHaveLength(2);
 expect(await withOperatorThemeRead(()=>f.get({kind:'user',id:'reader'},'theme','theme',2))).toEqual(draft);
 await expect(f.get({kind:'user',id:'reader'},'theme','theme',2)).rejects.toMatchObject({status:404});
 await expect(f.get({kind:'user',id:'reader'},'theme','theme',4)).rejects.toMatchObject({status:404});
 await accept();expect((await current()).revision).toBe(4);
});
it('does not overwrite a pin deliberately removed from an unpublished draft',async()=>{
 await approve();await accept();
 await f.execute(actor,{action:'edit-theme',requestId:randomUUID(),id:'theme',expectedRevision:2,title:'Draft with explicit removal',description:'',recordPins:[{id:'added',revision:1}],initialView:'graph',reason:'Private removal'});
 // The already-public baseline must not be re-added to the draft by another receipt.
 await accept('base');expect((await current()).revision).toBe(3);expect((await current()).content.recordPins.map(p=>p.id)).toEqual(['added']);
 await accept('other');expect((await f.get({kind:'user',id:'reader'},'theme','theme')).content.recordPins.map(p=>p.id)).toEqual(['base','added','other']);
 expect((await current()).content.recordPins.map(p=>p.id)).toEqual(['added','other']);
});
it('keeps newly created themes private even after trusted operator-side knowledge intake',async()=>{
 await expect(accept()).rejects.toMatchObject({code:'REVISION_NOT_PUBLIC'});
 await f.execute({kind:'import',id:'operator-intake'},{action:'accept-record',requestId:randomUUID(),entities:[],sources:[],entityPins:[{id:'a',revision:1}],sourcePins:[{id:'s',revision:1}],record:{id:'added',content},themes:[{id:'theme',revision:1}],reason:'Validated private intake'},{operatorTheme:true,verify:async()=>{},prepare:async()=>{},retain:async()=>{}});
 expect(await themePublicationState(pool,'theme')).toMatchObject({state:'private',publishedRevision:null,workingRevision:2});
 await expect(f.get({kind:'user',id:'reader'},'theme','theme')).rejects.toMatchObject({status:404});expect((await current()).content.recordPins).toHaveLength(2);
});
it('does not publish pending Theme translations and retains draft translation lineage across a fork',async()=>{
 const translation=async(revision:number,text:string)=>f.execute(actor,{action:'accept-translation',requestId:randomUUID(),target:{kind:'theme',id:'theme',revision,field:'title'},language:'ja',expectedRevision:0,originalHash:translationHash(revision===1?'Approved title':'Private editorial title'),text,reason:'Isolated translation'});
 await translation(1,'承認済み見出し');await approve();const c=await pool.connect();try{await freezeThemeReleases(c,'theme');}finally{c.release();}
 await edit();await translation(2,'編集中の見出し');await accept();
 const client=await pool.connect();try{
  const publicText=await publicDisplayTranslations(client,[{kind:'theme',id:'theme',revision:3,field:'title'}],'ja');expect(publicText[0].text).toBe('承認済み見出し');
  const privateText=await withOperatorThemeRead(()=>publicDisplayTranslations(client,[{kind:'theme',id:'theme',revision:4,field:'title'}],'ja'));expect(privateText[0].text).toBe('編集中の見出し');
 }finally{client.release();}
});
it('serializes concurrent accepted additions without loss or duplicate revisions',async()=>{
 await approve();await Promise.all([accept('added'),accept('second')]);
 expect((await f.get({kind:'user',id:'reader'},'theme','theme')).content.recordPins.map(p=>p.id).sort()).toEqual(['added','base','second']);
 expect(await themePublicationState(pool,'theme')).toMatchObject({publishedRevision:3,workingChanges:false});
});

it('keeps translation-only draft changes pending while publishing accepted knowledge',async()=>{
 await approve();const c=await pool.connect();try{await freezeThemeReleases(c,'theme');}finally{c.release();}
 await f.execute(actor,{action:'accept-translation',requestId:randomUUID(),target:{kind:'theme',id:'theme',revision:1,field:'title'},language:'ja',expectedRevision:0,originalHash:translationHash('Approved title'),text:'まだ承認されていない訳文',reason:'Pending translation'});
 await accept();expect(await themePublicationState(pool,'theme')).toMatchObject({publishedRevision:2,workingRevision:2,workingChanges:true});
 const client=await pool.connect();try{expect(await publicDisplayTranslations(client,[{kind:'theme',id:'theme',revision:2,field:'title'}],'ja')).toEqual([]);}finally{client.release();}
});
it('rolls back public release and provenance on interrupted acceptance, then safely retries',async()=>{
 await approve();const requestId=randomUUID(),command={action:'accept-record',requestId,entities:[],sources:[],entityPins:[{id:'a',revision:1}],sourcePins:[{id:'s',revision:1}],record:{id:'added',content},themes:[{id:'theme',revision:1}],reason:'Accepted isolated evidence'};
 await expect(f.execute({kind:'collection',id:'verified-fixture'},command,{verify:async()=>{},prepare:async()=>{throw Error('Interrupted receipt commit');}})).rejects.toThrow('Interrupted receipt commit');
 expect(await themePublicationState(pool,'theme')).toMatchObject({publishedRevision:1,workingRevision:1,workingChanges:false});expect((await pool.query('SELECT count(*)::int n FROM knowledge75.theme_knowledge_revisions')).rows[0].n).toBe(0);
 await f.execute({kind:'collection',id:'verified-fixture'},command,{verify:async()=>{},prepare:async()=>{}});expect(await themePublicationState(pool,'theme')).toMatchObject({publishedRevision:2,workingRevision:2,workingChanges:false});
});
