import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {knowledgeTextTargetSchema,knowledgeOriginalText} from '../lib/domain/knowledge-translation';
import {createKnowledgeFoundationService,readKnowledgeTranslation,readKnowledgeTextOriginal,readKnowledgeTranslationById} from '../lib/server/knowledge-foundation';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import type {Driver} from "neo4j-driver";
import {createKnowledgePublicationService,ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {translationHash} from '../lib/server/knowledge-translation-storage';
import {geminiReviewRequest} from '../lib/server/gemini-knowledge-review';
import {captureKnowledgeCapsule} from '../lib/client/capsule-knowledge';
import {capsuleKnowledgeSchema} from '../lib/domain/capsule-knowledge';
it('restricts fields and disambiguates alias/evidence targets',()=>{
 expect(knowledgeTextTargetSchema.safeParse({kind:'entity',id:'a',revision:1,field:'assertion'}).success).toBe(false);
 expect(knowledgeTextTargetSchema.safeParse({kind:'record',id:'a',revision:1,field:'excerpt'}).success).toBe(false);
 expect(knowledgeOriginalText({kind:'record',id:'a',revision:1,field:'excerpt',evidenceId:'b'},{evidence:[{id:'a',excerpt:'Wrong'},{id:'b',excerpt:'Right'}]}).text).toBe('Right');
});
it('uses a distinct equivalence policy without changing factual source checking',()=>{
 const fact=geminiReviewRequest({assertion:'A wrote B',evidence:[],context:''});
 const translation=geminiReviewRequest({assertion:'AはBを書いた',evidence:[],context:'',translation:{originalText:'A wrote B',targetLanguage:'ja'}});
 expect(fact.systemInstruction.parts[0].text).toContain('PROVIDED excerpts');
 expect(translation.systemInstruction.parts[0].text).toContain('TRANSLATION EQUIVALENCE');
 expect(translation.systemInstruction.parts[0].text).toContain('negation');
});
const url=process.env.KNOWLEDGE_TEST_DATABASE_URL;
describe.skipIf(!url)('independent translation versions on isolated PostgreSQL',()=>{
 const pool=new Pool({connectionString:url,max:4}),foundation=createKnowledgeFoundationService(pool),operator={kind:'operator' as const,id:'translation-test'};
 const target={kind:'entity' as const,id:'translation-original',revision:1,field:'name' as const};
 const run=(v:unknown)=>foundation.execute(operator,v);
 const command=(text='Original name',expectedRevision=0)=>({action:'accept-translation',requestId:randomUUID(),target,language:'en',text,originalHash:translationHash('元の名前'),expectedRevision,reason:'隔離された訳文試験'});
 const read=async()=>{const c=await pool.connect();try{return await readKnowledgeTranslation(c,target,'en');}finally{c.release();}};
 beforeAll(async()=>{
  expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toMatch(/^plunode_knowledge75_test_/);
  await ensureKnowledgePublicationSchema(pool);await migrateKnowledgeTranslations(pool);
  await run({action:'create-bundle',requestId:randomUUID(),entities:[{id:target.id,content:{name:'元の名前',kind:'person',textLanguages:{name:{tag:'ja',basis:'declared'}}}}],records:[{id:'translation-fact',content:{kind:'note',subjectId:target.id,assertion:'資料に名前が載っている',evidence:[{id:'quote',source:{id:'translation-source',revision:1},locator:'冒頭',excerpt:'元の名前'}]}}],sources:[{id:'translation-source',content:{title:'資料',url:'https://example.org/translation'}}],reason:'隔離された原文'});
  await pool.query("INSERT INTO knowledge75.published_revisions(kind,id,revision) VALUES('entity',$1,1) ON CONFLICT DO NOTHING",[target.id]);
 },30000);
 afterAll(()=>pool.end());
 it('applies the additive migration idempotently and keeps the original untouched',async()=>{
  expect((await migrateKnowledgeTranslations(pool)).applied).toBe(false);
  const before=await pool.query('SELECT content FROM knowledge75.revisions WHERE id=$1',[target.id]);
  expect(await run(command())).toMatchObject({revision:1,disposition:'created'});
  expect((await read()).translation).toMatchObject({text:'Original name',originalText:'元の名前',target});
  expect((await pool.query('SELECT content FROM knowledge75.revisions WHERE id=$1',[target.id])).rows).toEqual(before.rows);
 });
 it('keeps history, ignores identical text and rejects competing/stale changes',async()=>{
  const v=(await read()).translation!;
  expect(await run(command('Original name',1))).toMatchObject({revision:1,disposition:'existing'});
  await run(command('The original name',1));
  const c=await pool.connect();try{expect(await readKnowledgeTranslationById(c,v.id,1)).toMatchObject({text:'Original name',revision:1});}finally{c.release();}
  await expect(run(command('A stale update',1))).rejects.toThrow('最新版');
  await expect(run({...command('Bad hash',2),originalHash:'0'.repeat(64)})).rejects.toThrow('一致');
 });
 it('pins the selected translation in a Capsule and rejects unrelated originals',async()=>{
  const v=(await read()).translation!,entity=await foundation.get({kind:'reader',id:'test'},'entity',target.id);
  const capsule=captureKnowledgeCapsule({title:'Translation',snapshot:{schemaVersion:1,entities:[entity],records:[],sources:[],mappings:[],translations:[v],initialView:'graph'}});
  await run(command('An updated name',2));
  expect(capsule.document!.knowledge!.snapshot.translations![0].text).toBe('The original name');
  const publication=createKnowledgePublicationService(pool,{} as Driver);
  expect(await publication.validateCapsuleKnowledge(capsule.document!.knowledge!)).toBe(true);
  const forged=structuredClone(capsule.document!.knowledge!);forged.snapshot.translations![0].text='Forged translation';
  expect(await publication.validateCapsuleKnowledge(forged)).toBe(false);
  const invalid=structuredClone(capsule.document!.knowledge!);invalid.snapshot.entities=[];
  expect(capsuleKnowledgeSchema.safeParse(invalid).success).toBe(false);
 });
 it('withdraws every translation edition and safely restores it using status CAS',async()=>{
  const v=(await read()).translation!;
  await run({action:'set-translation-visibility',requestId:randomUUID(),id:v.id,expectedStatusRevision:1,visibility:'hidden',reason:'停止試験'});
  const c=await pool.connect();try{await expect(readKnowledgeTranslationById(c,v.id,1)).rejects.toThrow();}finally{c.release();}
  await expect(run(command('Bypass hidden',3))).rejects.toThrow('停止');
  await run({action:'set-translation-visibility',requestId:randomUUID(),id:v.id,expectedStatusRevision:2,visibility:'public',reason:'復帰試験'});
  expect((await read()).translation?.revision).toBe(3);
 });
 it('rejects a new translation of a stale original while retaining its older public translation',async()=>{
  const original=await foundation.get({kind:'reader',id:'test'},'entity',target.id);
  await run({action:'correct',requestId:randomUUID(),kind:'entity',id:target.id,expectedRevision:1,content:{...original.content,name:'新しい名前'},reason:'原文の訂正'});
  await pool.query("INSERT INTO knowledge75.published_revisions(kind,id,revision) VALUES('entity',$1,2) ON CONFLICT DO NOTHING",[target.id]);
  await expect(run(command('Old target',3))).rejects.toThrow();
  expect((await read()).translation?.originalText).toBe('元の名前');
  const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await readKnowledgeTextOriginal(c,{...target,revision:2},true);await c.query('COMMIT');}finally{c.release();}
 });
 it('never discloses a translation when its original is hidden',async()=>{
  const v=(await read()).translation!;
  await run({action:'set-visibility',requestId:randomUUID(),kind:'entity',id:target.id,expectedStatusRevision:2,visibility:'hidden',reason:'原文停止'});
  const c=await pool.connect();try{await expect(readKnowledgeTranslationById(c,v.id,1)).rejects.toThrow();await expect(readKnowledgeTextOriginal(c,target)).rejects.toThrow();}finally{c.release();}
 });
});
