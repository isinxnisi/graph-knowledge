import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {reserveKnowledgeAI,quotaDate} from '../lib/server/knowledge-ai-budget';
import {entityCorrectionSummary} from '../lib/domain/knowledge-entity-correction';
import {readKnowledgeRecordVersion} from '../lib/server/knowledge-record-version';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createKnowledgeFoundationService,knowledgeDigest} from '../lib/server/knowledge-foundation';
import {ensureKnowledgePublicationSchema} from '../lib/server/knowledge-publication';
import {migrateKnowledgeTranslations} from '../lib/server/knowledge-translation-migrate';
import {migrateKnowledgeIdentities} from '../lib/server/knowledge-identity-migrate';
import {createKnowledgeImports} from '../lib/server/knowledge-import';
import {createKnowledgeImportHttp} from '../lib/server/knowledge-import-http';
import {importConfigurationSchema,type ImportPrincipal} from '../lib/domain/knowledge-import';
import {createReviewQueue,reviewConfigSchema} from '../lib/server/knowledge-review-queue';
import {matchSourceExcerpt,sourceURL,verifySourceExcerpt} from '../lib/server/knowledge-source-verification';
const origin='http://127.0.0.1:3221',token=randomBytes(32).toString('base64url'),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:5}),knowledge=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:5});
let p:ImportPrincipal,core:ReturnType<typeof createKnowledgeImports>,api:ReturnType<typeof createKnowledgeImportHttp>,foundation:ReturnType<typeof createKnowledgeFoundationService>;
const cfg=reviewConfigSchema.parse({projectId:'import-fixture',billingTier:'free',verifiedAt:new Date().toISOString(),model:'gemini-3.1-flash-lite',rpm:10,tokensPerMinute:30000,requestsPerDay:80,requestsPerMonth:2400,inputTokensPerDay:250000,outputTokensPerDay:160000,inputTokensPerMonth:7500000,outputTokensPerMonth:4800000,apiKeyFile:'/unused',allowedUsers:[randomUUID()]});
const source=(id='s')=>({id,content:{title:'Fixture source',url:'https://example.org/material'}});
const item=(key='one',assertion='AはBへ機器を提供した。')=>({key,operation:'create-relation',record:{kind:'relation',subjectId:'a',objectId:'b',relation:'提供した',assertion,evidence:[{id:'ev',source:{id:'s',revision:1},locator:'本文',excerpt:assertion}]}});
const payload=(packageId='fixture-'+randomUUID())=>({format:'plunode-knowledge-package',schemaVersion:1,namespace:'fixture',packageId,revision:1,entities:[],sources:[source()],entityPins:[{id:'a',revision:1},{id:'b',revision:1}],sourcePins:[],items:[item()]});
const request=(method='POST',body?:unknown,bearer=token,headers:Record<string,string>={})=>new Request(origin+'/api/knowledge-import/packages',{method,headers:{'content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const verify=vi.fn(async(url:string,excerpt:string)=>{sourceURL(url);return matchSourceExcerpt({url,type:'text/plain',body:Buffer.from(excerpt)},excerpt);});
function service(options:Parameters<typeof createKnowledgeImports>[3]={}){return createKnowledgeImports(pool,knowledge,async id=>id===p.id?p:null,{verify,...options});}
function http(){return createKnowledgeImportHttp(origin,async()=>importConfigurationSchema.parse({origin,principals:[p]}),async()=>core);}
const age=()=>pool.query("UPDATE member_knowledge.review_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE project_id=$1",[cfg.projectId]);
const response=(wire:string,support='supported',sameAs?:string|null)=>{
 const material=JSON.parse(JSON.parse(wire).contents[0].parts[0].text);
 return {state:'received' as const,status:200,raw:{responseId:'fixture-response',modelVersion:cfg.model,usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:10,totalTokenCount:130},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suitability:'legitimate',support,reason:'Fixture source agrees.',...(material.duplicateCheck?{duplicate:{sameAs:sameAs??material.duplicateCheck.candidates.find((c:{meaning:unknown})=>knowledgeDigest(c.meaning)===knowledgeDigest(material.duplicateCheck.proposed))?.id??null,reason:'fixture comparison'}}:{})})}]}}]}};
};
const dispatch=vi.fn(async(l:{wire:string;model:string})=>response(l.wire));
const send=async(value:unknown=payload())=>{const r=await api.post(request('POST',value));expect(r.status).toBe(202);return (await r.json()).receiptId as string;};
const status=(id:string)=>core.receipt(p,id);
beforeAll(async()=>{
 expect(process.env.MEMBER_TEST_CONTAINER).toMatch(/^gk-member-test-/);
 expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('graph_member_test');
 expect((await knowledge.query('SELECT current_database() name')).rows[0].name).toBe('plunode_knowledge75_test_capsule_share');
 await migrateMemberDatabase(pool,...Array(23).fill(true));
},30000);
beforeEach(async()=>{
 await pool.query('TRUNCATE knowledge_import.packages CASCADE');
 await pool.query('DELETE FROM member_knowledge.review_attempts WHERE project_id=$1',[cfg.projectId]);
 await pool.query('DELETE FROM member_knowledge.review_projects WHERE project_id=$1',[cfg.projectId]);
 await knowledge.query('DROP SCHEMA IF EXISTS knowledge75 CASCADE');
 foundation=createKnowledgeFoundationService(knowledge);
 await foundation.execute({kind:'operator',id:'fixture'},{action:'create-bundle',requestId:randomUUID(),entities:[{id:'a',content:{name:'A',kind:'organization'}},{id:'b',content:{name:'B',kind:'work'}}],sources:[{id:'baseline-source',content:{title:'Baseline',url:'https://example.org/baseline'}}],records:[{id:'baseline',content:{kind:'note',subjectId:'a',assertion:'Aという名前が記録された。',evidence:[{id:'old',source:{id:'baseline-source',revision:1},locator:'冒頭',excerpt:'Aという名前が記録された。'}]}}],reason:'isolated fixture'});
 await migrateKnowledgeTranslations(knowledge);await migrateKnowledgeIdentities(knowledge);await ensureKnowledgePublicationSchema(knowledge);
 await foundation.execute({kind:'operator',id:'fixture'},{action:'create-theme',requestId:randomUUID(),id:'theme',title:'Fixture theme',recordPins:[{id:'baseline',revision:1}],initialView:'graph'});
 p=importConfigurationSchema.parse({origin,principals:[{id:'fixture-sender',namespace:'fixture',tokenSha256:sha(token),expiresAt:new Date(Date.now()+86400000).toISOString(),operations:['create-entity','create-relation','add-information','add-evidence','correct-record','correct-entity','translate-text'],targets:{entities:'*',records:'*',themes:['theme']},allowNewEntities:true,packagesPerDay:100,itemsPerDay:1000,pendingItems:1000}]}).principals[0];
 core=service();api=http();verify.mockClear();dispatch.mockClear();await createReviewQueue(pool).heartbeat(cfg);
},30000);
afterAll(async()=>{await pool.end();await knowledge.end();});
describe('authenticated immutable external knowledge packages',()=>{
 it('requires the dedicated Bearer; member-looking headers and cookies grant no access',async()=>{
  expect((await api.post(request('POST',payload(),'',{cookie:'member-session=anything','x-member-user':randomUUID()}))).status).toBe(401);
  expect((await api.post(request('POST',payload(),'x'.repeat(43)))).status).toBe(401);
  expect((await api.post(request('POST',payload(),token,{origin:'https://foreign.invalid'}))).status).toBe(403);
  expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.packages')).rows[0].n).toBe(0);
 });
 it('rejects expiry, disabled credentials and wrong namespace without saving data',async()=>{
  p.disabled=true;expect((await api.post(request('POST',payload()))).status).toBe(401);p.disabled=false;
  p.expiresAt=new Date(0).toISOString();expect((await api.post(request('POST',payload()))).status).toBe(401);p.expiresAt=new Date(Date.now()+86400000).toISOString();
  expect((await api.post(request('POST',{...payload(),namespace:'foreign'}))).status).toBe(403);
 });
 it('deduplicates simultaneous retries and rejects different content under the same revision',async()=>{
  const v=payload();const responses=await Promise.all([api.post(request('POST',v)),api.post(request('POST',v))]);expect(responses.map(r=>r.status)).toEqual([202,202]);
  const ids=await Promise.all(responses.map(async r=>(await r.json()).receiptId));expect(ids[0]).toBe(ids[1]);
  expect((await api.post(request('POST',{...v,items:[item('one','違う内容。')]}))).status).toBe(409);
  expect((await pool.query('SELECT count(*)::int n FROM knowledge_import.packages')).rows[0].n).toBe(1);
 });
 it('rejects unknown envelope permissions, unsupported versions, duplicate keys and oversized input',async()=>{
  expect((await api.post(request('POST',{...payload(),ownerId:randomUUID()}))).status).toBe(400);
  expect((await api.post(request('POST',{...payload(),schemaVersion:99}))).status).toBe(400);
  expect((await api.post(request('POST',{...payload(),items:[item(),item()]}))).status).toBe(400);
  expect((await api.post(request('POST',{...payload(),padding:'x'.repeat(2000000)}))).status).toBe(413);
 });
 it('keeps partial resource errors local and publishes only the independently valid item',async()=>{
  const v={...payload(),sources:[source(),{id:'bad-source',content:{title:'no document'}}],items:[item(),{...item('bad'),record:{...item().record,evidence:[{id:'e',source:{id:'bad-source',revision:1},locator:'x',excerpt:'bad'}]}}]};
  const id=await send(v);expect((await status(id)).items.map(i=>i.state)).toEqual(['queued','needs-changes']);expect((await status(id)).resourceIssues).toHaveLength(1);
  expect(await core.processNext(cfg,dispatch)).toBe(true);expect((await status(id)).items[0].state).toBe('applied');expect(dispatch).toHaveBeenCalledTimes(1);
  expect((await pool.query('SELECT count(*)::int n FROM "user"')).rows[0].n).toBe(0);
  expect((await knowledge.query("SELECT DISTINCT actor_kind FROM knowledge75.revisions WHERE actor_kind='import'")).rows).toEqual([{actor_kind:'import'}]);
 });
 it('checks the original source before any inference and prevents private or unsafe URLs',async()=>{
  core=service({verify:verifySourceExcerpt});const v=payload();v.sources[0].content.url='https://127.0.0.1/private';const id=await send(v);await core.processNext(cfg,dispatch);
  expect((await status(id)).items[0].state).toBe('needs-changes');expect(dispatch).not.toHaveBeenCalled();
 });
 it('continues after unknown fields on one item without accepting a foundation command',async()=>{
  const id=await send({...payload(),items:[{...item('bad'),command:{action:'set-visibility'}},item('good')]});
  await core.processNext(cfg,dispatch);expect((await status(id)).items.map(i=>i.state)).toEqual(['needs-changes','applied']);
 });
 it('cannot use a credential to add information outside its target or theme scope',async()=>{
  p.targets.entities=['b'];const id=await send();expect((await status(id)).items[0].state).toBe('needs-changes');expect(await core.processNext(cfg,dispatch)).toBe(false);
 });
 it('cancels remaining work idempotently and does not infer or create knowledge',async()=>{
  const id=await send();expect((await api.cancel(request('POST',{}),id)).status).toBe(200);await core.cancel(p,id);
  expect((await status(id)).items[0].state).toBe('cancelled');expect(await core.processNext(cfg,dispatch)).toBe(false);expect(dispatch).not.toHaveBeenCalled();
 });
 it('honors cancellation while an external inference is in flight and retains consumption',async()=>{
  const id=await send();await core.processNext(cfg,async l=>{await core.cancel(p,id);return response(l.wire);});
  expect((await status(id)).items[0].state).toBe('cancelled');expect((await status(id)).items[0].usage.requests).toBe(1);
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].n).toBe(0);
 });
 it('honors revocation before final acceptance without confusing the sender with a member',async()=>{
  const id=await send();await core.processNext(cfg,async l=>{p.disabled=true;return response(l.wire);});expect((await status(id)).items[0].state).toBe('cancelled');p.disabled=false;
  expect((await status(id)).state).toBe('cancelled');
  await pool.query("UPDATE knowledge_import.items SET lease_until=clock_timestamp()-interval '1 second'");
  await core.processNext(cfg,dispatch);expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].n).toBe(0);
 });
 it('does not report a partially revoked package as fully reflected',async()=>{
  const value=payload();value.items.push({...item('two'),record:{...item('two').record,relation:'別の機器を提供した',assertion:'AはBへ別の機器を提供した。'}});
  const id=await send(value);await core.processNext(cfg,dispatch);
  await age();await core.processNext(cfg,async l=>{p.disabled=true;return response(l.wire);});p.disabled=false;
  const pending=await status(id);expect(pending.items.map(i=>i.state)).toEqual(['applied','cancelled']);expect(pending.state).toBe('processing');
  await pool.query("UPDATE knowledge_import.items SET state='published' WHERE package_id=$1 AND state='applied'",[id]);expect((await status(id)).state).toBe('completed-with-issues');
 });
 it('does not accept a response from another model and preserves failed-attempt quota',async()=>{
  const id=await send();await core.processNext(cfg,async l=>{const r=response(l.wire);r.raw.modelVersion='gemini-3.5-flash-lite';return r;});
  expect((await status(id)).items[0].state).toBe('retry');expect((await status(id)).items[0].usage.requests).toBe(1);
 });
 it('shares the global project allowance instead of creating an import-only quota',async()=>{
  const id=await send();await pool.query("INSERT INTO member_knowledge.review_attempts(id,project_id,provider,model,policy,purpose,state,quota_day,quota_month,input_reserved,output_reserved,request_charge) SELECT gen_random_uuid(),$1,'gemini',$2,'fixture','evaluation','delivery-unknown',(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date,to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM'),100,100,1 FROM generate_series(1,80)",[cfg.projectId,cfg.model]);
  await core.processNext(cfg,dispatch);expect((await status(id)).items[0].state).toBe('quota');expect(dispatch).not.toHaveBeenCalled();
 });
 it('keeps 503 status retryable and records safe diagnostics without leaking the provider body',async()=>{
  const id=await send();await core.processNext(cfg,async()=>({state:'http-error',status:503,category:'unavailable',retryAfter:'120',raw:{error:'secret echoed text'}}));
  const result=await status(id);expect(result.items[0].state).toBe('retry');expect(result.items[0].usage.unknownAttempts).toBe(1);
  expect(JSON.stringify((await pool.query('SELECT response FROM knowledge_import.attempts')).rows)).not.toContain('secret echoed');expect(result.items[0].nextAttemptAt).not.toBeNull();
 });
 it('reuses a committed operation after acknowledgement loss without another AI call',async()=>{
  const id=await send();core=service({afterKnowledgeCommit:async()=>{throw Error('fixture lost acknowledgement');}});await core.processNext(cfg,dispatch);core=service();
  await core.processNext(cfg,dispatch);expect((await status(id)).items[0].state).toBe('applied');expect(dispatch).toHaveBeenCalledTimes(1);
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].n).toBe(1);
 });
 it('reuses the same fact in another package without another content revision',async()=>{
  const first=await send();await core.processNext(cfg,dispatch);const pin=(await status(first)).items[0].result!;await age();
  const second=await send();await core.processNext(cfg,dispatch);expect((await status(second)).items[0].state).toBe('existing');expect((await status(second)).items[0].result?.id).toBe(pin.id);
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='record' AND id=$1",[pin.id])).rows[0].n).toBe(1);
 });
 it('rejects stale references before inference and stops cancelled qualifications',async()=>{
  const id=await send();await foundation.execute({kind:'operator',id:'fixture'},{action:'correct',requestId:randomUUID(),kind:'entity',id:'a',expectedRevision:1,content:{name:'A modified',kind:'organization'},reason:'fixture correction'});
  await core.processNext(cfg,dispatch);expect((await status(id)).items[0].state).toBe('needs-changes');expect(dispatch).not.toHaveBeenCalled();
 });
 it('returns no receipt or result to a different sending identity',async()=>{
  const id=await send();const other={...p,id:'other'};await expect(core.receipt(other,id)).rejects.toMatchObject({status:404});
  await expect(core.cancel(other,id)).rejects.toMatchObject({status:404});
 });
 it('does not silently rewrite an applied item through a new package revision',async()=>{
  const v=payload();const id=await send(v);await core.processNext(cfg,dispatch);await pool.query("UPDATE knowledge_import.items SET state='published' WHERE package_id=$1",[id]);
  const newer=await send({...v,revision:2,items:[item('one','別の意味。')]});expect((await status(newer)).items[0].state).toBe('needs-changes');
 });
 it('keeps an explicit correction and historical content versions distinct',async()=>{
  const v=payload(),id=await send(v);await core.processNext(cfg,dispatch);const pin=(await status(id)).items[0].result!;const old=await foundation.get({kind:'reader',id:'fixture'},'record',pin.id,pin.revision);
  await pool.query("UPDATE knowledge_import.items SET state='published' WHERE package_id=$1",[id]);await age();
  const corrected={...v,revision:2,sourcePins:old.content.evidence.map(e=>e.source),items:[{...item(),operation:'correct-record',reason:'日時を資料から補う',correction:{id:pin.id,revision:1},about:{kind:'record',id:pin.id,revision:1},record:{...old.content,assertion:'Aは2003年にBへ機器を提供した。',evidence:[...old.content.evidence,{id:'new',source:{id:'s',revision:1},locator:'本文',excerpt:'Aは2003年にBへ機器を提供した。'}]}}]};
  const next=await send(corrected);await core.processNext(cfg,dispatch);expect((await status(next)).items[0].state).toBe('applied');expect((await foundation.get({kind:'reader',id:'fixture'},'record',pin.id,1)).content).toEqual(old.content);
 });
 it('does not expose an old stopped result through the receipt',async()=>{
  const id=await send();await core.processNext(cfg,dispatch);const pin=(await status(id)).items[0].result!;
  const head=(await foundation.list({kind:'operator',id:'fixture'})).statuses.find(v=>v.kind==='record'&&v.id===pin.id)!;
  await foundation.execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'record',id:pin.id,expectedStatusRevision:head.revision,visibility:'hidden',reason:'fixture stop'});
  expect((await status(id)).items[0].result).toMatchObject({available:false,currentUrl:null});expect(JSON.stringify(await status(id))).not.toContain('AはBへ機器');
 });
 it('keeps package input immutable at the database boundary and reapplies migrations unchanged',async()=>{
  const id=await send();await expect(pool.query("UPDATE knowledge_import.packages SET payload='{}' WHERE id=$1",[id])).rejects.toThrow('immutable');
  const ledger=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
  await migrateMemberDatabase(pool,...Array(23).fill(true));expect((await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows).toEqual(ledger);
  const sql=await readFile('db/member/030-knowledge-import.sql','utf8');expect(ledger.find(v=>v.name==='030-knowledge-import.sql')?.checksum).toBe(sha(sql));
 });
 it('creates a new named entity and appends a pinned theme without requiring a human member',async()=>{
  const v=payload();const id=await send({...v,entityPins:[],entities:[{id:'new',content:{name:'New subject',kind:'person'}}],items:[{...item(),operation:'create-entity',themes:[{id:'theme',revision:1}],record:{kind:'note',subjectId:'new',assertion:'New subjectという名前が記録された。',evidence:item().record.evidence}}]});
  await core.processNext(cfg,dispatch);expect((await status(id)).items[0].state).toBe('applied');
  const theme=await foundation.get({kind:'reader',id:'fixture'},'theme','theme');expect(theme.revision).toBe(2);expect(theme.content.recordPins).toHaveLength(2);expect((await status(id)).items[0].result?.themes).toEqual([{id:'theme',revision:2}]);
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='entity' AND id LIKE 'import:%'")).rows[0].n).toBe(1);
 });
 it('retains received proof and response through lease recovery without another inference',async()=>{
  const id=await send();await core.processNext(cfg,async l=>{
   await pool.query("UPDATE knowledge_import.items SET lease_until=clock_timestamp()-interval '1 second'");
   return response(l.wire);
  });expect((await status(id)).items[0].state).toBe('running');
  await core.processNext(cfg,dispatch);expect((await status(id)).items[0].state).toBe('applied');expect(dispatch).not.toHaveBeenCalled();
 });
 it('rejects a source reference stopped while inference is in flight',async()=>{
  const id=await send();await core.processNext(cfg,async l=>{
   await foundation.execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'entity',id:'a',expectedStatusRevision:1,visibility:'hidden',reason:'fixture stop'});return response(l.wire);
  });expect((await status(id)).items[0].state).toBe('needs-changes');
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].n).toBe(0);
 });
 it('preserves accepted knowledge and cancellation reason when remaining work is cancelled',async()=>{
  const id=await send();await core.processNext(cfg,dispatch);
  await core.cancel(p,id,'sender stopped remaining work');
  const r=await status(id);expect(r.items[0].state).toBe('applied');expect(r.cancellation?.reason).toBe('sender stopped remaining work');
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].n).toBe(1);
 });

 it('accepts a translation with a pinned original without requiring a fake relation or evidence',async()=>{
  p.targets.sources=['baseline-source'];
  const v=payload();const id=await send({...v,sources:[],entityPins:[],items:[{key:'translation',operation:'translate-text',translation:{target:{kind:'record',id:'baseline',revision:1,field:'assertion'},language:'en',text:'The name A was recorded.',expectedRevision:0}}]});
  await core.processNext(cfg,async l=>{const material=JSON.parse(JSON.parse(l.wire).contents[0].parts[0].text);expect(material.translation.publicContext.surrounding.record.subjectId).toBe('a');expect(material.translation.contextHash).toMatch(/^[a-f0-9]{64}$/);return response(l.wire);});const result=await status(id);expect(result.items[0].state,result.items[0].reason).toBe('applied');expect(verify).not.toHaveBeenCalled();
  const proof=(await pool.query("SELECT decision->'translationReview' AS proof FROM knowledge_import.items WHERE package_id=$1",[id])).rows[0].proof;expect(proof.policy).toBe('translation-equivalence-v2-context');expect(proof.snapshot.reviewReferences.some((v:{kind:string})=>v.kind==='entity')).toBe(true);
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='record'")).rows[0].n).toBe(1);
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.text_translation_revisions")).rows[0].n).toBe(1);
 });
 it('does not send contextual sources outside the import principal scope',async()=>{
  const v=payload(),id=await send({...v,sources:[],entityPins:[],items:[{key:'translation',operation:'translate-text',translation:{target:{kind:'record',id:'baseline',revision:1,field:'assertion'},language:'en',text:'The name A was recorded.',expectedRevision:0}}]});
  await core.processNext(cfg,dispatch);const result=await status(id);expect(result.items[0].state).toBe('needs-changes');expect(result.items[0].reason).toContain('送信資格の許可範囲外');expect(dispatch).not.toHaveBeenCalled();
 });
 it('rejects an imported translation if its contextual subject is stopped during inference',async()=>{
  p.targets.sources=['baseline-source'];
  const v=payload(),id=await send({...v,sources:[],entityPins:[],items:[{key:'translation',operation:'translate-text',translation:{target:{kind:'record',id:'baseline',revision:1,field:'assertion'},language:'en',text:'The name A was recorded.',expectedRevision:0}}]});
  const infer=vi.fn(async(l:{wire:string})=>{await foundation.execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'entity',id:'a',expectedStatusRevision:1,visibility:'hidden',reason:'stop translation context'});return response(l.wire);});await core.processNext(cfg,infer);expect(infer).toHaveBeenCalledTimes(1);
  expect((await status(id)).items[0].state).toBe('needs-changes');expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.text_translation_revisions")).rows[0].n).toBe(0);
 });


});

const fixed=async(id='baseline',revision=1)=>{const c=await knowledge.connect();try{return await readKnowledgeRecordVersion(c,{id,revision});}finally{c.release();}};
async function entityCorrectionPackage(){
 const before=await foundation.get({kind:'reader',id:'fixture'},'entity','a',1);
 const after={...before.content,name:'Alpha',aliases:['A'],description:'A was recorded as Alpha.'};
 return {...payload(),entityPins:[{id:'a',revision:1}],items:[{key:'entity-correction',operation:'correct-entity',about:{kind:'entity',id:'a',revision:1},entityCorrection:{target:{id:'a',revision:1},content:after,reason:'Correct the original name using the source.'},record:{kind:'note',subjectId:'a',assertion:entityCorrectionSummary(before.content,after),evidence:item().record.evidence}}]};
}
describe('original Entity correction and fixed published reader',()=>{
 it('atomically corrects one subject without changing its identity or old versions and recovers an acknowledgement loss',async()=>{
  const old=await fixed(),v=await entityCorrectionPackage(),id=await send(v);
  core=service({afterKnowledgeCommit:async()=>{throw Error('fixture lost ack');}});await core.processNext(cfg,dispatch);core=service();await core.processNext(cfg,dispatch);
  const result=(await status(id)).items[0];expect(result.state).toBe('applied');expect(dispatch).toHaveBeenCalledTimes(1);
  expect((await foundation.get({kind:'reader',id:'fixture'},'entity','a')).content).toEqual(v.items[0].entityCorrection.content);
  expect((await foundation.get({kind:'reader',id:'fixture'},'entity','a',1)).content.name).toBe('A');
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.revisions WHERE kind='entity' AND id='a'")).rows[0].n).toBe(2);
  const op=(await knowledge.query("SELECT input FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].input;expect(op.entityPins).toContainEqual({id:'a',revision:1});
  const shown=await fixed(result.result!.id,result.result!.revision);expect(shown.record.entities[0].revision).toBe(2);
  expect((await fixed()).record).toEqual(old.record);
  const wire=JSON.parse(JSON.parse(dispatch.mock.calls[0][0].wire).contents[0].parts[0].text);
  expect(wire.entityCorrection).toMatchObject({before:{name:'A'},after:{name:'Alpha'},reason:v.items[0].entityCorrection.reason});
 });
 it('rejects reclassification, unchanged content and missing reasons before inference',async()=>{
  for(const mode of ['kind','unchanged','reason']){
   const v=await entityCorrectionPackage();
   if(mode==='kind')v.items[0].entityCorrection.content.kind='person';
   if(mode==='reason')v.items[0].entityCorrection.reason='';
   if(mode==='unchanged')v.items[0].entityCorrection.content=(await foundation.get({kind:'reader',id:'fixture'},'entity','a',1)).content as (typeof v.items)[0]['entityCorrection']['content'];
   const id=await send(v);await core.processNext(cfg,dispatch);expect((await status(id)).items[0].state).toBe('needs-changes');
  }
  expect(dispatch).not.toHaveBeenCalled();expect((await foundation.get({kind:'reader',id:'fixture'},'entity','a')).revision).toBe(1);
 });
 it('rejects a stale Entity after review and does not commit its audit record',async()=>{
  const id=await send(await entityCorrectionPackage());
  await core.processNext(cfg,async l=>{await foundation.execute({kind:'operator',id:'fixture'},{action:'correct',requestId:randomUUID(),kind:'entity',id:'a',expectedRevision:1,content:{name:'A newer',kind:'organization'},reason:'concurrent edit'});return response(l.wire);});
  expect((await status(id)).items[0].state).toBe('needs-changes');expect((await foundation.get({kind:'reader',id:'fixture'},'entity','a')).content.name).toBe('A newer');
  expect((await knowledge.query("SELECT count(*)::int n FROM knowledge75.operations WHERE actor_kind='import'")).rows[0].n).toBe(0);
 });
 it('keeps old facts and subject labels separate from the latest revision and denies stopped dependencies',async()=>{
  const old=await fixed();await foundation.execute({kind:'operator',id:'fixture'},{action:'correct',requestId:randomUUID(),kind:'entity',id:'a',expectedRevision:1,content:{name:'Alpha',kind:'organization'},reason:'name correction'});
  await foundation.execute({kind:'operator',id:'fixture'},{action:'correct',requestId:randomUUID(),kind:'record',id:'baseline',expectedRevision:1,entityPins:[{id:'a',revision:2}],content:{...old.record.record.content,assertion:'Alpha was recorded.'},reason:'fact correction'});
  const current=await fixed('baseline',2),historical=await fixed();expect(historical.record.record.content.assertion).toBe('Aという名前が記録された。');expect(historical.record.entities[0].content.name).toBe('A');expect(historical.currentRevision).toBe(2);expect(current.record.entities[0].content.name).toBe('Alpha');
  await foundation.execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'entity',id:'a',expectedStatusRevision:(await foundation.list({kind:'operator',id:'fixture'})).statuses.find(v=>v.kind==='entity'&&v.id==='a')!.revision,visibility:'hidden',reason:'stop'});
  await expect(fixed()).rejects.toMatchObject({status:404});
 });
 it('does not turn a private historical revision public when only a later revision was published',async()=>{
  await knowledge.query("DELETE FROM knowledge75.published_revisions WHERE kind='record' AND id='baseline' AND revision=1");
  const old=await foundation.get({kind:'operator',id:'fixture'},'record','baseline',1);
  await foundation.execute({kind:'operator',id:'fixture'},{action:'correct',requestId:randomUUID(),kind:'record',id:'baseline',expectedRevision:1,entityPins:[{id:'a',revision:1}],content:{...old.content,assertion:'Public version'},reason:'public version'});
  await expect(fixed()).rejects.toMatchObject({status:404});expect((await fixed('baseline',2)).record.record.content.assertion).toBe('Public version');
 });
});

describe('historical publication visibility',()=>{
 it('uses only an activated snapshot and preserves its original subject labels',async()=>{
  const first=await fixed(),dto=first.record;
  async function store(id:string,published:boolean,body:unknown){await knowledge.query("INSERT INTO knowledge75.publication_generations(id,state,source_sequence,digest,record_count,published_at) VALUES($1,$2,1,'fixture',1,$3)",[id,published?'ready':'staged',published?new Date():null]);await knowledge.query("INSERT INTO knowledge75.publication_records(generation,id,revision,body,dependencies,search_text,relation_label,polarity) VALUES($1,'baseline',1,$2,'[]','fixture','','affirmed')",[id,JSON.stringify(body)]);}
  await store('staged',false,{...dto,record:{...dto.record,content:{...dto.record.content,assertion:'Never published capture'}}});
  expect((await fixed()).record.record.content.assertion).toBe(dto.record.content.assertion);
  await store('public',true,dto);
  await foundation.execute({kind:'operator',id:'fixture'},{action:'correct',requestId:randomUUID(),kind:'entity',id:'a',expectedRevision:1,content:{name:'Changed now',kind:'organization'},reason:'new name'});
  expect(await fixed()).toMatchObject({contextBasis:'published-generation',record:{entities:[{content:{name:'A'}}]}});
  await foundation.execute({kind:'operator',id:'fixture'},{action:'set-visibility',requestId:randomUUID(),kind:'source',id:'baseline-source',expectedStatusRevision:1,visibility:'hidden',reason:'stop source'});
  await expect(fixed()).rejects.toMatchObject({status:404});
 });
});

describe('reviewed local AI budget',()=>{
 const reserve=async(config:typeof cfg,purpose:'submission'|'evaluation'|'collection-evaluation'='submission')=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await reserveKnowledgeAI(c,config,{purpose,policy:'budget-fixture',inputReserved:100,outputReserved:100});await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const seed=async(config:typeof cfg,n:number,purpose:string)=>{const day=quotaDate(new Date());await pool.query("INSERT INTO member_knowledge.review_attempts(id,project_id,provider,model,policy,purpose,state,quota_day,quota_month,input_reserved,output_reserved,input_actual,output_actual,started_at,request_charge) SELECT gen_random_uuid(),$1,'gemini',$2,'fixture',$3,'received',$4,$5,1,1,1,1,clock_timestamp()-interval '2 minutes',1 FROM generate_series(1,$6)",[config.projectId,config.model,purpose,day,day.slice(0,7),n]);};
 it('permits 400/day and stops at the configured boundary without claiming provider exhaustion',async()=>{
  const config=reviewConfigSchema.parse({...cfg,projectId:'budget-'+randomUUID(),requestsPerDay:400,requestsPerMonth:12400});expect(reviewConfigSchema.safeParse({...config,requestsPerDay:401}).success).toBe(false);await createReviewQueue(pool).heartbeat(config);await seed(config,399,'submission');
  expect((await reserve(config)).state).toBe('reserved');const stopped=await reserve(config);expect(stopped.state).toBe('wait');if(stopped.state==='wait'){expect(stopped.reason).toContain('400回');expect(stopped.reason).not.toContain('無料');}
 });
 it('caps all development evaluations together without blocking ordinary submissions',async()=>{
  const config=reviewConfigSchema.parse({...cfg,projectId:'evaluation-budget-'+randomUUID(),requestsPerDay:400,requestsPerMonth:12400});await createReviewQueue(pool).heartbeat(config);await seed(config,99,'evaluation');await seed(config,1,'collection-evaluation');
  const stopped=await reserve(config,'evaluation');expect(stopped.state).toBe('wait');if(stopped.state==='wait')expect(stopped.reason).toContain('開発評価用');expect((await reserve(config)).state).toBe('reserved');
 });
});
