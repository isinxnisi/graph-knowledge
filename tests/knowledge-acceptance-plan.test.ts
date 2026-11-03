import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {acceptancePlan} from '../lib/server/knowledge-acceptance';
import {submissionIntentIssues,submissionReviewEvidence} from '../lib/domain/knowledge-submission-intent';
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission} from '../lib/domain/knowledge-submission';
import {knowledgeRecordContentSchema} from '../lib/domain/knowledge-foundation';
function value():KnowledgeSubmission{return {id:randomUUID(),revision:1,version:2,state:'queued',digest:'test',createdAt:'',updatedAt:'',content:knowledgeSubmissionContentSchema.parse({schemaVersion:2,attribution:'anonymous',title:'私有の投稿タイトル',entities:[{id:'a',content:{name:'A',kind:'人物',aliases:['私有の別名'],description:'未選択の私有説明'}}],sources:[{id:'s',content:{title:'公開資料',url:'https://example.org/source',bibliography:'明示した公開資料の書誌'}}],items:[{key:'r',operation:'create-relation',record:{kind:'relation',subjectId:'a',objectId:'a',assertion:'Aは自分について記録した。',relation:'記録した',evidence:[{id:'q',source:{id:'s',revision:1},locator:'本文',excerpt:'Aは自分について記録した。'}]}}]})};}
function correction(){const v=value(),item=v.content.items[0];item.operation='correct-record';item.correction={id:'old-record',revision:1};item.about={kind:'record',...item.correction};v.content.entityPins=[{id:'a',revision:1}];v.content.sourcePins=[{id:'s',revision:1}];v.content.entities=[];v.content.sources=[];v.context={entities:[{id:'a',revision:1,content:{name:'A',kind:'person',aliases:[],description:'',language:'ja'}}],sources:[{id:'s',revision:1,content:{title:'資料',url:'https://example.org/source',bibliography:'',language:'ja'}}],records:[{...item.correction,content:knowledgeRecordContentSchema.parse(item.record)}]};return v;}
describe('server publication plan',()=>{
 it('publishes selected facts, with stable shared entity IDs and no private descriptions',()=>{
  const v=value(),first=acceptancePlan(v,'r',randomUUID()),second=acceptancePlan(v,'r',randomUUID());if(first.command.action!=='accept-record'||second.command.action!=='accept-record')throw Error('fixture');
  expect(first.command.entities[0].id).toBe(second.command.entities[0].id);expect(first.command.record.id).not.toBe(second.command.record.id);expect(first.command.record.content.subjectId).toBe(first.command.record.content.objectId);
  const wire=JSON.stringify(first.command);expect(wire).not.toContain('私有');expect(first.command.sources[0].content.bibliography).toBe('明示した公開資料の書誌');expect(first.command.entities[0].content.aliases).toEqual([]);expect(first.command.entities[0].content.description).toBe('');
 });
 it('does not publish ambiguous old drafts or orphan event/background records',()=>{
  const v=value();delete v.content.schemaVersion;expect(()=>acceptancePlan(v,'r',randomUUID())).toThrow('投稿先');
  v.content.schemaVersion=2;v.content.items[0]={...v.content.items[0],operation:'add-information',record:{...v.content.items[0].record,kind:'note',subjectId:null,objectId:null}};
  expect(submissionIntentIssues(v.content)).toEqual(expect.arrayContaining([expect.stringContaining('何について')]));
 });
 it('requires a conscious public byline choice without blocking private drafts',()=>{const v=value();delete v.content.attribution;expect(knowledgeSubmissionContentSchema.safeParse(v.content).success).toBe(true);expect(()=>acceptancePlan(v,'r',randomUUID())).toThrow('投稿者の表示');});
 it('never accepts a supplied correction without its captured baseline',()=>{const v=correction();delete v.context;expect(()=>acceptancePlan(v,'r',randomUUID())).toThrow('元の記録');});
 it('does not let a correction silently change the endpoint identity',()=>{const v=correction();v.context!.records![0].content.subjectId='other';expect(()=>acceptancePlan(v,'r',randomUUID())).toThrow('両端');});
 it('keeps one record identity when adding evidence and reviews only the addition',()=>{
  const v=correction(),item=v.content.items[0];item.operation='add-evidence';item.record.evidence.push({...item.record.evidence[0],id:'q-new',excerpt:'追加した根拠'});
  const plan=acceptancePlan(v,'r',randomUUID());if(plan.command.action!=='accept-record')throw Error('fixture');expect(plan.recordId).toBe('old-record');expect(plan.command.expectedRevision).toBe(1);expect(plan.command.record.content.evidence).toHaveLength(2);expect(submissionReviewEvidence(item,v.context).map(e=>e.id)).toEqual(['q-new']);
  item.record.assertion='同時に変えた主張';expect(()=>acceptancePlan(v,'r',randomUUID())).toThrow('元の事実');
 });
 it('reuses one accepted record across several explicitly selected themes',()=>{
  const v=value(),theme={title:'テーマ',description:'',recordPins:[{id:'old',revision:1}],entityPins:[],sourcePins:[],mappingPins:[],initialView:'graph' as const};
  v.content.items[0].themes=[{id:'one',revision:1},{id:'two',revision:4}];v.context={entities:[],sources:[],themes:[{id:'one',revision:1,content:theme},{id:'two',revision:4,content:theme}]};
  const plan=acceptancePlan(v,'r',randomUUID());if(plan.command.action!=='accept-record')throw Error('fixture');expect(plan.command.themes).toEqual(v.content.items[0].themes);expect(plan.references.filter(r=>r.kind==='theme')).toHaveLength(2);
 });
 it('anchors relation background to both canonical entities without creating another relationship',()=>{
  const v=value(),item=v.content.items[0],base=knowledgeRecordContentSchema.parse(item.record);v.content.entities=[];v.content.entityPins=[{id:'a',revision:2}];v.context={entities:[{id:'a',revision:2,content:{name:'A',kind:'person',aliases:[],description:'',language:'ja'}}],sources:[],records:[{id:'old',revision:3,content:base}]};
  item.operation='add-information';item.about={kind:'record',id:'old',revision:3};item.record={...item.record,kind:'note',subjectId:null,objectId:null,aboutRecord:{id:'old',revision:3}};
  const plan=acceptancePlan(v,'r',randomUUID());if(plan.command.action!=='accept-record')throw Error('fixture');expect(plan.command.record.content.kind).toBe('note');expect(plan.command.record.content.subjectId).toBe('a');expect(plan.command.record.content.aboutRecord).toEqual({id:'old',revision:3});
 });
});
