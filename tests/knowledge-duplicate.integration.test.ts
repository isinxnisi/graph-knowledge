import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {knowledgeCommandSchema,knowledgeRecordContentSchema,type KnowledgeRecordVersion} from '../lib/domain/knowledge-foundation';
import {createKnowledgeFoundationService,ensureKnowledgeFoundationSchema,knowledgeDigest,KnowledgeError} from '../lib/server/knowledge-foundation';
import {captureDuplicates,commonDuplicatePins} from '../lib/server/knowledge-duplicates';
import {reuseDuplicatePlan,type AcceptancePlan} from '../lib/server/knowledge-acceptance';
const connectionString=process.env.KNOWLEDGE_TEST_DATABASE_URL;
describe.skipIf(!connectionString)('duplicate acceptance on isolated PostgreSQL',()=>{
 const pool=new Pool({connectionString,max:4}),foundation=createKnowledgeFoundationService(pool),actor={kind:'submission' as const,id:'duplicate-test'};
 const run=(c:unknown)=>foundation.execute({kind:'operator',id:'fixture-operator'},c);
 const content=(prefix:string)=>knowledgeRecordContentSchema.parse({kind:'relation',subjectId:prefix+'a',objectId:prefix+'b',assertion:'AはBを著した。',relation:'著した',evidence:[{id:'e',source:{id:prefix+'s',revision:1},locator:'本文',excerpt:'AはBを著した。'}]});
 async function seed(prefix:string){await run({action:'create-bundle',requestId:randomUUID(),reason:'隔離試験',entities:[{id:prefix+'a',content:{name:'A',kind:'person'}},{id:prefix+'b',content:{name:'B',kind:'work'}}],sources:[{id:prefix+'s',content:{title:'資料',url:'https://example.org/'+prefix}}],records:[{id:prefix+'original',content:content(prefix)}]});}
 function proposed(prefix:string):AcceptancePlan{
  const record=content(prefix);record.evidence[0].source={id:prefix+'submitted-source',revision:1};
  return {recordId:prefix+'new',references:[],operation:'create-relation',command:knowledgeCommandSchema.parse({action:'accept-record',requestId:randomUUID(),reason:'確認済み投稿',entities:[],sources:[{id:prefix+'submitted-source',content:{title:'題名だけ変更',url:'https://example.org/'+prefix+'?utm_source=retry'}}],entityPins:[{id:prefix+'a',revision:1},{id:prefix+'b',revision:1}],sourcePins:[],record:{id:prefix+'new',content:record}})};
 }
 beforeAll(async()=>{expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toMatch(/^plunode_knowledge75_test_/);await ensureKnowledgeFoundationSchema(pool);},30000);
 afterAll(async()=>{await pool.end();});
  it('versions a language-only correction and treats an exact retry or unchanged correction as existing',async()=>{
   const p='language-only-';await seed(p);
   const original=await foundation.get({kind:'reader',id:'reader'},'record',p+'original');
   const command=knowledgeCommandSchema.parse({action:'accept-record',requestId:randomUUID(),reason:'原語の指定を訂正',entities:[],sources:[],entityPins:[{id:p+'a',revision:1},{id:p+'b',revision:1}],sourcePins:[{id:p+'s',revision:1}],expectedRevision:1,record:{id:original.id,content:{...original.content,textLanguages:{assertion:{tag:'ja',basis:'declared'},relation:{tag:'ja',basis:'declared'}}}}});
   const saved=await foundation.execute(actor,command) as KnowledgeRecordVersion;
   expect(saved).toMatchObject({revision:2,disposition:'updated',content:{textLanguages:{assertion:{tag:'ja',basis:'declared'}}}});
   expect(await foundation.execute(actor,command)).toEqual(saved);
   expect(await foundation.get({kind:'reader',id:'reader'},'record',original.id,1)).toEqual(original);
   expect(await foundation.execute(actor,{...command,requestId:randomUUID(),expectedRevision:2})).toMatchObject({revision:2,disposition:'existing'});
   expect(await foundation.execute(actor,{...command,requestId:randomUUID(),expectedRevision:2,record:{id:original.id,content:original.content}})).toMatchObject({revision:3,disposition:'updated'});
   expect((await foundation.get({kind:'reader',id:'reader'},'record',original.id)).content.textLanguages).toBeUndefined();
  });
  it.each(['excerpt','locator'] as const)('preserves a deliberate %s-only correction through duplicate reuse',async field=>{
   const p='correct-'+field+'-';await seed(p);const original=content(p),corrected=structuredClone(original);corrected.evidence[0][field]='明示して訂正した引用・箇所';
   const plan:AcceptancePlan={recordId:p+'original',references:[],operation:'correct-record',command:knowledgeCommandSchema.parse({action:'accept-record',requestId:randomUUID(),reason:'引用の訂正',entities:[],sources:[],entityPins:[{id:p+'a',revision:1},{id:p+'b',revision:1}],sourcePins:[{id:p+'s',revision:1}],expectedRevision:1,record:{id:p+'original',content:corrected}})};
   const prepared=await reuseDuplicatePlan(pool,plan,await captureDuplicates(pool,corrected,p+'original'),null);
   expect(await foundation.execute(actor,prepared.command)).toMatchObject({revision:2,disposition:'updated',content:corrected});
   expect((await foundation.get({kind:'reader',id:'reader'},'record',p+'original',1)).content).toEqual(original);
  });
 it('reuses an existing fact without another record, revision, source or public change',async()=>{
  const p='duplicate-once-';await seed(p);const plan=proposed(p);if(plan.command.action!=='accept-record')throw Error('fixture');
  const before=(await pool.query('SELECT count(*)::int AS n FROM knowledge75.changes WHERE id LIKE $1',[p+'%'])).rows[0].n;
  const reuse=await reuseDuplicatePlan(pool,plan,await captureDuplicates(pool,plan.command.record.content),{sameAs:null,reason:'exact'});
  const prepared:unknown[]=[];const result=await foundation.execute(actor,reuse.command,{verify:async()=>{},prepare:async r=>{prepared.push(r);}}) as KnowledgeRecordVersion&{disposition:string};
  expect(result).toMatchObject({id:p+'original',revision:1,disposition:'existing'});expect(prepared[0]).toEqual(result);
  expect((await pool.query('SELECT count(*)::int AS n FROM knowledge75.changes WHERE id LIKE $1',[p+'%'])).rows[0].n).toBe(before);
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.objects WHERE id=$1",[p+'submitted-source'])).rows[0].n).toBe(0);
 });
 it('adds an independent source once and treats a paraphrase as the same fact',async()=>{
  const p='duplicate-source-';await seed(p);const plan=proposed(p);if(plan.command.action!=='accept-record')throw Error('fixture');
  plan.command.sources[0].content.url='https://independent.example.org/'+p;plan.command.record.content.assertion='Bの作者はAである。';
  const reuse=await reuseDuplicatePlan(pool,plan,await captureDuplicates(pool,plan.command.record.content),{sameAs:p+'original',reason:'同じ具体的な著者関係'});
  const result=await foundation.execute(actor,reuse.command) as KnowledgeRecordVersion;expect(result).toMatchObject({id:p+'original',revision:2});expect(result.content.assertion).toBe('AはBを著した。');expect(result.content.evidence).toHaveLength(2);
  const again=structuredClone(plan);again.command.requestId=randomUUID();if(again.command.action!=='accept-record')throw Error('fixture');
  const repeated=await reuseDuplicatePlan(pool,again,await captureDuplicates(pool,again.command.record.content),{sameAs:p+'original',reason:'同義'});
  expect(await foundation.execute(actor,repeated.command)).toMatchObject({id:p+'original',revision:2,disposition:'existing'});
  expect((await foundation.get({kind:'reader',id:'reader'},'record',p+'original',1)).content.evidence).toHaveLength(1);
 });
 it('keeps explicit evidence additions append-only even though they target an existing revision',async()=>{
  const p='duplicate-add-evidence-';await seed(p);const plan=proposed(p);if(plan.command.action!=='accept-record')throw Error('fixture');
  const original=content(p),incoming={...plan.command.record.content.evidence[0],id:'added',locator:'別の箇所',excerpt:'Bの作者はAである。'};
  plan.operation='add-evidence';plan.recordId=p+'original';plan.command.record={id:plan.recordId,content:{...original,evidence:[...original.evidence,incoming]}};
  plan.command.expectedRevision=1;plan.command.sourcePins=[{id:p+'s',revision:1}];
  const capture=await captureDuplicates(pool,plan.command.record.content,plan.recordId);
  const sameDocument=await reuseDuplicatePlan(pool,plan,capture,null);
  expect(await foundation.execute(actor,sameDocument.command)).toMatchObject({revision:1,disposition:'existing',content:{evidence:original.evidence}});
  plan.command.requestId=randomUUID();plan.command.sources[0].content.url='https://independent.example.org/'+p;
  const independent=await reuseDuplicatePlan(pool,plan,capture,null),result=await foundation.execute(actor,independent.command) as KnowledgeRecordVersion;
  expect(result).toMatchObject({id:plan.recordId,revision:2});expect(result.content.evidence).toHaveLength(2);
  expect(result.content.evidence[0]).toEqual(original.evidence[0]);expect(result.content.evidence[1]).toMatchObject({locator:incoming.locator,excerpt:incoming.excerpt,source:incoming.source});
 });
 it('links an existing record to another theme without changing fixed older themes or the record',async()=>{
  const p='duplicate-theme-';await seed(p);
  for(const id of ['one','two'])await run({action:'create-theme',requestId:randomUUID(),id:p+id,title:id,recordPins:[{id:p+'original',revision:1}]});
  const plan=proposed(p);if(plan.command.action!=='accept-record')throw Error('fixture');plan.command.themes=[{id:p+'one',revision:1},{id:p+'two',revision:1}];
  const capture=await captureDuplicates(pool,plan.command.record.content),reuse=await reuseDuplicatePlan(pool,plan,capture,null);
  expect(await foundation.execute(actor,reuse.command)).toMatchObject({disposition:'existing',revision:1});
  expect((await foundation.resolveTheme({kind:'reader',id:'reader'},p+'two')).theme.revision).toBe(1);
  // A genuinely additional source can refresh the explicitly selected theme;
  // the other theme and its pinned snapshot are untouched.
  plan.command.requestId=randomUUID();plan.command.themes=[{id:p+'one',revision:1}];plan.command.sources[0].content.url='https://new.example.org/'+p;
  const added=await reuseDuplicatePlan(pool,plan,capture,null);await foundation.execute(actor,added.command);
  expect((await foundation.resolveTheme({kind:'reader',id:'reader'},p+'one')).snapshot.records[0].revision).toBe(2);
  expect((await foundation.resolveTheme({kind:'reader',id:'reader'},p+'two')).snapshot.records[0].revision).toBe(1);
 });
 it('adds only a reference when another theme did not contain the existing record',async()=>{
  const p='duplicate-link-';await seed(p);
  await run({action:'create-bundle',requestId:randomUUID(),reason:'別の関係',entityPins:[{id:p+'a',revision:1},{id:p+'b',revision:1}],records:[{id:p+'other',content:{...content(p),relation:'翻訳した',assertion:'AはBを翻訳した。'}}]});
  await run({action:'create-theme',requestId:randomUUID(),id:p+'theme',title:'別テーマ',recordPins:[{id:p+'other',revision:1}]});
  const plan=proposed(p);if(plan.command.action!=='accept-record')throw Error('fixture');plan.command.themes=[{id:p+'theme',revision:1}];
  const reuse=await reuseDuplicatePlan(pool,plan,await captureDuplicates(pool,plan.command.record.content),null);
  expect(await foundation.execute(actor,reuse.command)).toMatchObject({id:p+'original',revision:1,disposition:'theme-linked'});
  expect((await foundation.resolveTheme({kind:'reader',id:'reader'},p+'theme')).theme.content.recordPins).toEqual([{id:p+'other',revision:1},{id:p+'original',revision:1}]);
 });
 it('does not inflate sources by arbitrary URL parameters returning the same already-verified text',async()=>{
  const p='duplicate-document-';await seed(p);const plan=proposed(p);if(plan.command.action!=='accept-record')throw Error('fixture');
  const url='https://example.org/'+p+'?arbitrary=another';plan.command.sources[0].content.url=url;
  const proof={url,bodySha256:'body',textSha256:'same-verified-document',excerptSha256:'quote',extractor:'fixture',checkedAt:new Date().toISOString()};
  const reuse=await reuseDuplicatePlan(pool,plan,await captureDuplicates(pool,plan.command.record.content),null,[proof],['same-verified-document']);
  expect(await foundation.execute(actor,reuse.command)).toMatchObject({revision:1,disposition:'existing'});
 });
 it('serializes the final candidate recheck so two simultaneous submissions cannot both create the fact',async()=>{
  const p='duplicate-race-';await seed(p);const a=proposed(p),b=proposed(p);if(a.command.action!=='accept-record'||b.command.action!=='accept-record')throw Error('fixture');
  for(const [i,plan] of [a,b].entries())if(plan.command.action==='accept-record'){plan.command.record.id=p+'concurrent-'+i;plan.command.record.content.relation='翻訳した';plan.command.record.content.assertion='AはBを翻訳した。';}
  const baseline=await commonDuplicatePins(pool,a.command.record.content),hash=knowledgeDigest(baseline);
  const guard={verify:async(c:import('pg').PoolClient)=>{if(knowledgeDigest(await commonDuplicatePins(c,content(p)))!==hash)throw new KnowledgeError('recheck',409,'DUPLICATE_REVIEW_REQUIRED');},prepare:async()=>{}};
  const results=await Promise.allSettled([foundation.execute(actor,a.command,guard),foundation.execute(actor,b.command,guard)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'DUPLICATE_REVIEW_REQUIRED'}});
  expect((await pool.query("SELECT count(*)::int AS n FROM knowledge75.objects WHERE kind='record' AND id LIKE $1",[p+'concurrent-%'])).rows[0].n).toBe(1);
 });
 it('excludes an unreadable record from AI candidates rather than exposing its text',async()=>{
  const p='duplicate-privacy-';await seed(p);await run({action:'set-visibility',requestId:randomUUID(),kind:'source',id:p+'s',expectedStatusRevision:1,visibility:'hidden',reason:'資料の非公開化'});
  expect((await captureDuplicates(pool,content(p))).review.candidates).toEqual([]);
 });
});
