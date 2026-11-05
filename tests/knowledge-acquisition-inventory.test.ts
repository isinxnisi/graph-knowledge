import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {captureDuplicates} from '../lib/server/knowledge-duplicates';
import {reuseDuplicatePlan,type AcceptancePlan} from '../lib/server/knowledge-acceptance';
import {knowledgeCommandSchema} from '../lib/domain/knowledge-foundation';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createKnowledgeFoundationService,ensureKnowledgeFoundationSchema,knowledgeDigest} from '../lib/server/knowledge-foundation';
import {knownSourceDocuments,retainSourceAcquisitions,acquisitionProofSchema} from '../lib/server/knowledge-source-registry';
import {matchSourceExcerpt} from '../lib/server/knowledge-source-verification';
import {verifiedSourceDocumentKey} from '../lib/domain/knowledge-source-identity';
import {createTargetInventory,type LegacyInventoryReader} from '../lib/server/knowledge-target-inventory';
const url=process.env.KNOWLEDGE_TEST_DATABASE_URL,actor={kind:'submission' as const,id:'acquisition-inventory-test'};
describe.skipIf(!url)('shared proof registry and resumable target inventory',()=>{
 const pool=new Pool({connectionString:url,max:5}),f=createKnowledgeFoundationService(pool);
 const proof=matchSourceExcerpt({url:'https://example.org/source',type:'text/plain',body:Buffer.from('A launched B. Other context.')},'A launched B.');
 const command=(id:string)=>({action:'accept-record',requestId:randomUUID(),entities:[{id:id+'-a',content:{name:'A',kind:'person'}},{id:id+'-b',content:{name:'B',kind:'work'}}],sources:[{id:id+'-s',content:{title:'Original source',url:proof.url}}],entityPins:[],sourcePins:[],record:{id,content:{kind:'relation',subjectId:id+'-a',objectId:id+'-b',relation:'launched',assertion:'A launched B.',evidence:[{id:'ev',source:{id:id+'-s',revision:1},locator:'First sentence',excerpt:'A launched B.'}]}},reason:'隔離検証'});
 async function seed(id:string,proofs=[proof]){const cmd=command(id);return f.execute(actor,cmd,{verify:async()=>{},prepare:async()=>{},retain:async(c,result)=>retainSourceAcquisitions(c,{actorId:actor.id,requestId:cmd.requestId,result,proofs})});}
 beforeAll(async()=>{expect((await pool.query('SELECT current_database() AS n')).rows[0].n).toMatch(/^plunode_knowledge75_test_/);await ensureKnowledgeFoundationSchema(pool);await migrateKnowledgeIdentities(pool);const before=(await pool.query('SELECT name,checksum FROM knowledge75.migrations ORDER BY name')).rows;await ensureKnowledgeFoundationSchema(pool);expect((await pool.query('SELECT name,checksum FROM knowledge75.migrations ORDER BY name')).rows).toEqual(before);});afterAll(()=>pool.end());
 it('retains one fixed observation and binding on replay without creating a new record edition',async()=>{
  const cmd=command('proof-replay'),hooks={verify:async()=>{},prepare:async()=>{},retain:async(c:import('pg').PoolClient,result:unknown)=>retainSourceAcquisitions(c,{actorId:actor.id,requestId:cmd.requestId,result,proofs:[proof]})};
  const result=await f.execute(actor,cmd,hooks);expect(await f.execute(actor,cmd,hooks)).toEqual(result);
  expect(await knownSourceDocuments(pool,{id:'proof-replay',revision:1})).toEqual([verifiedSourceDocumentKey(proof)]);
  expect((await pool.query('SELECT count(*)::int AS n FROM knowledge75.source_acquisitions WHERE request_id=$1',[cmd.requestId])).rows[0].n).toBe(1);
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.revisions WHERE id='proof-replay'")).rows[0].n).toBe(1);
 });
 it('reuses a verified collected document across another URL without a private member-decision lookup',async()=>{
  const cmd=knowledgeCommandSchema.parse({...command('proof-cross-path'),entities:[],entityPins:[{id:'proof-replay-a',revision:1},{id:'proof-replay-b',revision:1}]});
  if(cmd.action!=='accept-record')throw Error('Unexpected command');
  cmd.record.content.subjectId='proof-replay-a';cmd.record.content.objectId='proof-replay-b';cmd.sources[0].content.url='https://mirror.example/other-url';
  const incoming={...proof,url:'https://mirror.example/other-url'};
  const capture=await captureDuplicates(pool,cmd.record.content);
  const plan:AcceptancePlan={command:cmd,references:[],recordId:cmd.record.id,operation:'create-relation'};
  const reused=await reuseDuplicatePlan(pool,plan,capture,undefined,[incoming],await knownSourceDocuments(pool,{id:'proof-replay',revision:1}));
  expect(reused.recordId).toBe('proof-replay');
  if(reused.command.action!=='accept-record')throw Error('Unexpected command');
  expect(reused.command.sources).toEqual([]);expect(reused.command.record.content.evidence).toHaveLength(1);
  const result=await f.execute(actor,reused.command,{verify:async()=>{},prepare:async()=>{},retain:async(c,result)=>retainSourceAcquisitions(c,{actorId:actor.id,requestId:reused.command.requestId,result,proofs:[incoming]})});
  expect(result).toMatchObject({id:'proof-replay',revision:1,disposition:'existing'});
 });
 it('does not certify another URL, another excerpt, unpublished data or a stopped dependency',async()=>{
  await seed('proof-mismatch',[{...proof,url:'https://different.example/source'}]);expect(await knownSourceDocuments(pool,{id:'proof-mismatch',revision:1})).toEqual([]);
  await seed('proof-quote',[{...proof,excerptSha256:'0'.repeat(64)}]);expect(await knownSourceDocuments(pool,{id:'proof-quote',revision:1})).toEqual([]);
  await seed('proof-stop');await f.execute({kind:'operator',id:'fixture-operator'},{action:'set-visibility',requestId:randomUUID(),kind:'source',id:'proof-stop-s',expectedStatusRevision:1,visibility:'hidden',reason:'公開停止'});
  expect(await knownSourceDocuments(pool,{id:'proof-stop',revision:1})).toEqual([]);
  await seed('proof-private');await pool.query("DELETE FROM knowledge75.published_revisions WHERE kind='record' AND id='proof-private'");
  expect(await knownSourceDocuments(pool,{id:'proof-private',revision:1})).toEqual([]);
 });
 it('rolls back the record and operation if retention fails',async()=>{
  await expect(seed('proof-atomic',[{...proof,textSha256:'invalid'}])).rejects.toThrow();
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.objects WHERE id LIKE 'proof-atomic%'")).rows[0].n).toBe(0);
  expect(acquisitionProofSchema.safeParse({...proof,url:'https://secret:password@example.org'}).success).toBe(false);
 });
 it('scans every common target through pages, omits incomplete generations and marks private targets ineligible',async()=>{
  const inventory=createTargetInventory(pool,async()=>{throw Error('Not used')});let p=await inventory.scanPage('common',3);expect(p.state).toBe('scanning');await expect(inventory.page(p.id)).rejects.toMatchObject({code:'INVENTORY_INCOMPLETE'});
  const id=p.id;while(p.state!=='complete')p=await inventory.scanPage('common',3);expect(p.id).toBe(id);
  let after=null as null|{kind:'entity'|'source'|'record'|'theme'|'mapping';id:string};const all=[];do{const page=await inventory.page(id,after,4);all.push(...page.items);after=page.next;}while(after);
  expect(all.length).toBe((await pool.query('SELECT count(*)::int AS n FROM knowledge75.objects')).rows[0].n);
  expect(all.find(e=>e.id==='proof-stop-s')?.eligible).toBe(false);expect(new Set(all.map(e=>e.kind+':'+e.id)).size).toBe(all.length);
 });
 it('abandons a changed generation without reporting unseen targets deleted',async()=>{
  const inventory=createTargetInventory(pool,async()=>{throw Error('Not used')});const first=await inventory.scanPage('common',1);await seed('inventory-new');const second=await inventory.scanPage('common',1);expect(second.id).not.toBe(first.id);expect((await pool.query('SELECT state FROM knowledge75.target_inventory_runs WHERE id=$1',[first.id])).rows[0].state).toBe('stale');
 });
 it('resumes the legacy origin, includes withdrawn records, and never treats a partial page as the whole KG',async()=>{
  const items=[{kind:'entity' as const,id:'legacy-a',revision:'kg-1',statusRevision:'kg-1',digest:knowledgeDigest({name:'A'}),visibility:'public',eligible:true},{kind:'record' as const,id:'legacy-r',revision:'kg-1',statusRevision:'kg-1',digest:knowledgeDigest({fact:'A'}),visibility:'withdrawn',eligible:false},{kind:'source' as const,id:'legacy-s',revision:'kg-1',statusRevision:'kg-1',digest:knowledgeDigest({url:proof.url}),visibility:'public',eligible:true}];
  const reader:LegacyInventoryReader=async({revision,after,limit})=>{expect(revision??'kg-1').toBe('kg-1');const start=after?items.findIndex(e=>e.id===after.id)+1:0,page=items.slice(start,start+limit);return {revision:'kg-1',items:page,next:start+limit<items.length?{kind:page.at(-1)!.kind,id:page.at(-1)!.id}:null};};
  const one=createTargetInventory(pool,reader),first=await one.scanPage('public-kg',1),two=createTargetInventory(pool,reader);let p=first;while(p.state!=='complete')p=await two.scanPage('public-kg',1);expect(p.id).toBe(first.id);expect((await two.page(p.id)).items).toEqual(items);
 });
 it('detects a legacy release change and rejects malformed provider pages atomically',async()=>{
  const reader:LegacyInventoryReader=async()=>({revision:'kg-2',items:[{kind:'entity',id:'a',revision:'kg-2',statusRevision:'kg-2',digest:'a'.repeat(64),visibility:'public',eligible:true}],next:{kind:'entity',id:'a'}});
  const inventory=createTargetInventory(pool,reader),p=await inventory.scanPage('public-kg',1);
  const changed=createTargetInventory(pool,async()=>{throw Object.assign(Error('Changed'),{code:'DATASET_CHANGED'});});
  expect((await changed.scanPage('public-kg',1)).state).toBe('stale');
  const bad=createTargetInventory(pool,async()=>({revision:'bad',items:[],next:{kind:'entity',id:'phantom'}}));await expect(bad.scanPage('public-kg',1)).rejects.toMatchObject({code:'INVENTORY_PAGE_INVALID'});
  expect((await pool.query('SELECT state FROM knowledge75.target_inventory_runs WHERE id=$1',[p.id])).rows[0].state).toBe('stale');
 });
});
