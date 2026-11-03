import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {acceptancePlan} from '../lib/server/knowledge-acceptance';
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission} from '../lib/domain/knowledge-submission';
function value(){return {id:randomUUID(),revision:1,version:2,state:'queued',digest:'test',createdAt:'',updatedAt:'',content:knowledgeSubmissionContentSchema.parse({title:'私有の投稿タイトル',entities:[{id:'a',content:{name:'A',kind:'人物',aliases:['私有の別名'],description:'未選択の私有説明'}}],sources:[{id:'s',content:{title:'公開資料',url:'https://example.org/source',bibliography:'明示した公開資料の書誌'}}],items:[{key:'r',record:{kind:'relation',subjectId:'a',objectId:'a',assertion:'Aは自分について記録した。',relation:'記録した',evidence:[{id:'q',source:{id:'s',revision:1},locator:'本文',excerpt:'Aは自分について記録した。'}]}}]})} satisfies KnowledgeSubmission;}
describe('server publication plan',()=>{
 it('publishes only selected material and allocates stable shared IDs within the receipt',()=>{
  const v=value(),first=acceptancePlan(v,'r',randomUUID()),second=acceptancePlan(v,'r',randomUUID());expect(first.command.action).toBe('accept-record');if(first.command.action!=='accept-record'||second.command.action!=='accept-record')throw Error('fixture');
  expect(first.command.entities[0].id).toBe(second.command.entities[0].id);expect(first.command.record.id).not.toBe(second.command.record.id);expect(first.command.record.content.subjectId).toBe(first.command.record.content.objectId);
  const wire=JSON.stringify(first.command);expect(wire).not.toContain('私有');expect(first.command.sources[0].content.bibliography).toBe('明示した公開資料の書誌');expect(first.command.entities[0].content.aliases).toEqual([]);expect(first.command.entities[0].content.description).toBe('');
 });
 it('never accepts a client supplied correction target without a trusted captured baseline',()=>{
  const v=value();v.content.items[0].correction={id:'another-record',revision:1};expect(()=>acceptancePlan(v,'r',randomUUID())).toThrow('元の記録');
 });
 it('does not let a correction silently change the identity or direction of the relationship',()=>{
  const v=value();v.content.items[0].correction={id:'old-record',revision:1};
  expect(()=>acceptancePlan(v,'r',randomUUID(),{id:'old-record',revision:1,content:{...v.content.items[0].record,subjectId:'other'}})).toThrow('両端');
 });
});
