import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {ThemeTime} from '../lib/domain/theme-workbench';
import {knowledgeTimelineProjection} from '../lib/domain/knowledge-timeline';
import {buildTimelineGroups} from '../lib/domain/theme-timeline';
import {createKnowledgeFoundationService,ensureKnowledgeFoundationSchema,knowledgeDigest} from '../lib/server/knowledge-foundation';
import {verifyAcceptanceReferences} from '../lib/server/knowledge-acceptance';
import {knowledgeRecordContentSchema,type KnowledgeThemeVersion,type KnowledgeRecordVersion} from '../lib/domain/knowledge-foundation';
const pool=new Pool({connectionString:process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL,max:2});
const service=createKnowledgeFoundationService(pool),operator={kind:'operator' as const,id:'submission-reference-proof'},actor={kind:'submission' as const,id:'submission-reference-proof'};
const id=(part:string)=>'repair:'+part+':'+randomUUID(),entity=id('entity'),source=id('source'),seed=id('seed'),one=id('theme'),two=id('theme');
const evidence=[{id:'evidence',source:{id:source,revision:1},locator:'本文',excerpt:'根拠のある事実。'}];
const record=(extra:Record<string,unknown>={})=>knowledgeRecordContentSchema.parse({kind:'note',subjectId:entity,assertion:'根拠のある事実。',evidence,...extra});
const cmd=(action:string,fields:Record<string,unknown>)=>({action,requestId:randomUUID(),reason:'独立DBで申請参照の検証',...fields});
const accept=(recordId:string,content:unknown,themes:unknown[]=[])=>cmd('accept-record',{entities:[],sources:[],entityPins:[{id:entity,revision:1}],sourcePins:[{id:source,revision:1}],record:{id:recordId,content},themes});
beforeAll(async()=>{if(!process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL)throw Error('Use the isolated --submissions harness');await ensureKnowledgeFoundationSchema(pool);await service.execute(operator,cmd('create-bundle',{entities:[{id:entity,content:{name:'検証対象',kind:'person'}}],sources:[{id:source,content:{title:'根拠',url:'https://example.org/source'}}],records:[{id:seed,content:record()}]}));for(const theme of [one,two])await service.execute(operator,cmd('create-theme',{id:theme,title:'参照の検証',description:'前からある説明',recordPins:[{id:seed,revision:1}],initialView:'graph'}));});
afterAll(()=>pool.end());
describe('accepted user records keep reachable identities and atomic theme membership',()=>{
 it('keeps operator preparation possible while rejecting orphan user publications',async()=>{const orphan=id('orphan');await expect(service.execute(actor,accept(orphan,record({subjectId:null})))).rejects.toThrow('辿れる');expect((await pool.query("SELECT 1 FROM knowledge75.objects WHERE kind='record' AND id=$1",[orphan])).rowCount).toBe(0);await expect(service.execute(operator,cmd('create-bundle',{records:[{id:orphan,content:record({subjectId:null})}],entityPins:[]}))).resolves.toBeTruthy();});
 it('appends the same record to multiple themes and preserves each old immutable version',async()=>{const r=id('shared');await service.execute(actor,accept(r,record(),[{id:one,revision:1},{id:two,revision:1}]));for(const theme of [one,two]){const old=await service.get(operator,'theme',theme,1) as KnowledgeThemeVersion,current=await service.get(operator,'theme',theme) as KnowledgeThemeVersion;expect(old.content.recordPins).toEqual([{id:seed,revision:1}]);expect(current.revision).toBe(2);expect(current.content.title).toBe(old.content.title);expect(current.content.description).toBe(old.content.description);expect(current.content.recordPins).toContainEqual({id:r,revision:1});}});
 it('allows independently accepted append-only posts to the same captured theme',async()=>{const baseline=await service.get(operator,'theme',one) as KnowledgeThemeVersion;const refs=[{kind:'theme' as const,id:one,revision:baseline.revision,content:baseline.content}];for(let n=0;n<2;n++)await service.execute(actor,accept(id('append'),record(),[{id:one,revision:baseline.revision}]),{verify:c=>verifyAcceptanceReferences(c,refs),prepare:async()=>{}});expect((await service.get(operator,'theme',one) as KnowledgeThemeVersion).revision).toBe(baseline.revision+2);});
 it('rolls back the record and all prior theme appends if any requested theme cannot be changed',async()=>{const r=id('rollback'),before=await service.get(operator,'theme',one);await expect(service.execute(actor,accept(r,record(),[{id:one,revision:before.revision},{id:'missing-theme',revision:1}]))).rejects.toThrow();expect((await pool.query("SELECT 1 FROM knowledge75.objects WHERE kind='record' AND id=$1",[r])).rowCount).toBe(0);expect(knowledgeDigest(await service.get(operator,'theme',one))).toBe(knowledgeDigest(before));});
 it('requires theme-only information to be appended in the same transaction and hides it after stopping the theme',async()=>{const r=id('about-theme'),theme=await service.get(operator,'theme',two);await expect(service.execute(actor,accept(r,record({subjectId:null,aboutTheme:two})))).rejects.toThrow('同時');await service.execute(actor,accept(r,record({subjectId:null,aboutTheme:two}),[{id:two,revision:theme.revision}]));const status=(await pool.query("SELECT status_revision FROM knowledge75.objects WHERE kind='theme' AND id=$1",[two])).rows[0];await service.execute(operator,cmd('set-visibility',{kind:'theme',id:two,expectedStatusRevision:status.status_revision,visibility:'hidden'}));await expect(service.get({kind:'user',id:'reader'},'record',r)).rejects.toThrow('閲覧');});
 it('retains a fixed public source edition even after its metadata has a newer version',async()=>{await service.execute(operator,cmd('correct',{kind:'source',id:source,expectedRevision:1,content:{title:'新しい資料名',url:'https://example.org/source'}}));const r=id('source-pin'),old=(await service.get(operator,'source',source,1)).content;await service.execute(actor,accept(r,record()),{verify:c=>verifyAcceptanceReferences(c,[{kind:'source',id:source,revision:1,content:old}]),prepare:async()=>{}});expect((await service.get(operator,'record',r) as KnowledgeRecordVersion).content.evidence[0].source).toEqual({id:source,revision:1});});
 it('preserves explicit about-record pins and never accepts self-reference',async()=>{const r=id('about-relation');await service.execute(actor,accept(r,record({aboutRecord:{id:seed,revision:1}})));expect((await service.get(operator,'record',r) as KnowledgeRecordVersion).content.aboutRecord).toEqual({id:seed,revision:1});const self=id('self');await expect(service.execute(actor,accept(self,record({aboutRecord:{id:self,revision:1}})))).rejects.toThrow('自分自身');});
 const timeCases:{name:string;time:ThemeTime;axis:string;reuse:boolean}[]=[
  {name:'calendar point',time:{kind:'calendar',from:'2026-11-04',label:''},axis:'calendar',reuse:true},
  {name:'compatible cycle',time:{kind:'cycle',axis:'一日',period:24,from:3,to:4,wrap:false,unit:'時間',label:'朝'},axis:'cycle',reuse:true},
  {name:'different cycle period',time:{kind:'cycle',axis:'一日',period:12,from:3,to:4,wrap:false,unit:'時間',label:'別の周期'},axis:'cycle',reuse:false},
  {name:'known qualitative stages',time:{kind:'qualitative',axis:'活動',from:'開始',to:'終了',coordinateMeaning:'活動段階',label:'活動'},axis:'qualitative',reuse:true},
  {name:'unknown qualitative stage',time:{kind:'qualitative',axis:'活動',from:'途中',to:'終了',coordinateMeaning:'活動段階',label:'途中から'},axis:'qualitative',reuse:false},
 ];
 it.each(timeCases)('appends $name to a compatible axis and preserves all displayed information',async test=>{
  const oldRecord=id('time-seed'),theme=id('time-theme'),next=id('time-accepted');
  const seedTimes=[{id:'cal',time:{kind:'calendar',from:'2020',label:''}},{id:'day',time:{kind:'cycle',axis:'一日',period:24,from:1,to:2,wrap:false,unit:'時間',label:'時刻'}},{id:'stage',time:{kind:'qualitative',axis:'活動',from:'開始',to:'終了',coordinateMeaning:'活動段階',label:'活動'}}];
  await service.execute(operator,cmd('create-bundle',{records:[{id:oldRecord,content:record({times:seedTimes})}],entityPins:[{id:entity,revision:1}]}));
  const timeline={version:1,axes:[{id:'calendar',kind:'calendar',label:'年月日'},{id:'cycle',kind:'cycle',label:'一日'},{id:'qualitative',kind:'qualitative',label:'活動',order:['開始','終了']}],placements:[{recordId:oldRecord,timeId:'cal',axisId:'calendar'},{recordId:oldRecord,timeId:'day',axisId:'cycle'},{recordId:oldRecord,timeId:'stage',axisId:'qualitative'}],insets:[]};
  await service.execute(operator,cmd('create-theme',{id:theme,title:'時期の種類を保つ',recordPins:[{id:oldRecord,revision:1}],timeline,initialView:'timeline'}));
  await service.execute(actor,accept(next,record({times:[{id:'added-time',time:test.time}]}),[{id:theme,revision:1}]));
  const resolved=await service.resolveTheme(operator,theme),placed=resolved.theme.content.timeline!.placements.find(p=>p.recordId===next)!;
  const axis=resolved.theme.content.timeline!.axes.find(a=>a.id===placed.axisId)!;
  expect(axis.kind).toBe(test.time.kind);expect(placed.axisId===test.axis).toBe(test.reuse);
  expect(resolved.theme.content.timeline!.axes.find(a=>a.id==='qualitative')!.order).toEqual(['開始','終了']);
  expect((await service.get(operator,'theme',theme,1)).content).toMatchObject({recordPins:[{id:oldRecord,revision:1}],timeline});
  const projection=knowledgeTimelineProjection(resolved.snapshot),groups=buildTimelineGroups(projection.records,projection.timeline);
  const displayed=groups.find(g=>g.records.some(r=>r.recordId===next));
  expect(displayed?.kind).toBe(test.time.kind);expect(displayed?.parentRecordId).toBeUndefined();
  expect(projection.records.filter(r=>r.recordId===next).map(r=>r.time)).toEqual([test.time]);
 });

});
