import {describe,it,expect} from 'vitest';
import {entityCaption} from '../lib/client/knowledge-canvas';
import type {KnowledgeEntityVersion} from '../lib/domain/knowledge-foundation';

const entity={id:'work',revision:1,content:{name:'A manga',aliases:[],kind:'work',description:'A publisher entry for volume one.',language:'en'},createdAt:'2026-11-12T00:00:00Z',reason:'Existing public original'} as KnowledgeEntityVersion;
describe('fixed theme entity captions',()=>{
 it('uses the checked reading caption without changing the common original',()=>{
  expect(entityCaption(entity,[],undefined,'en',[{target:{id:'work',revision:1},text:'A detective robot retells an earlier story.'}])).toBe('A detective robot retells an earlier story.');
  expect(entity.content.description).toBe('A publisher entry for volume one.');
 });
 it('keeps the original description outside that exact id and revision',()=>{
  expect(entityCaption(entity,[],undefined,'en')).toBe(entity.content.description);
  for(const target of [{id:'work',revision:2},{id:'another-work',revision:1}])expect(entityCaption(entity,[],undefined,'en',[{target,text:'A caption for a different original.'}])).toBe(entity.content.description);
 });
});
