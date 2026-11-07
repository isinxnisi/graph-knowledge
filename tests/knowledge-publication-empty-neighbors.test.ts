import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import type {Driver} from 'neo4j-driver';
import {createKnowledgePublicationService} from '../lib/server/knowledge-publication';
vi.mock('../lib/server/knowledge-identity-resolution',()=>({identityGroup:async(_c:unknown,ids:string[])=>ids}));
const generation='k75-'+ 'a'.repeat(32);
const center={id:'subject-with-a-fact',revision:1,content:{name:'新しく登録した場所',kind:'place',description:'',aliases:[],language:'ja'},createdAt:'2026-11-04T00:00:00Z',reason:'公開'};
function setup(hasRelation:boolean){
 const query=vi.fn(async(sql:string)=>{
  if(sql.includes('SELECT g.* FROM knowledge75.publication_generations'))return {rows:[{id:generation,source_sequence:'1',digest:'a'.repeat(64),record_count:1,created_at:new Date(),published_at:new Date()}],rowCount:1};
  if(sql.includes('SELECT e.body FROM knowledge75.publication_entities'))return {rows:[{body:center}],rowCount:1};
  if(sql.startsWith('SELECT 1 FROM knowledge75.publication_records r'))return {rows:hasRelation?[{'?column?':1}]:[],rowCount:hasRelation?1:0};
  return {rows:[],rowCount:0};
 });
 const release=vi.fn(),session=vi.fn(()=>{throw Error('Neo4j temporarily unavailable');});
 const pool={connect:async()=>({query,release})} as unknown as Pool,driver={session} as unknown as Driver;
 return {service:createKnowledgePublicationService(pool,driver,{}, {prepareSchema:async()=>{}}),query,session,release};
}
it('returns a successful zero degree for a note-only Entity without waiting for Neo4j',async()=>{const s=setup(false);expect(await s.service.neighbors({entityId:center.id})).toEqual({generation,records:[],entities:[],center,hasMore:false,nextCursor:null});expect(s.session).not.toHaveBeenCalled();expect(s.release).toHaveBeenCalledOnce();expect(s.query.mock.calls.some(([sql])=>sql.includes("'{record,content,kind}'='relation'")&&sql.includes('published_revisions'))).toBe(true);});
it('does not turn a failed graph read into zero relations when the public index contains a relation',async()=>{const s=setup(true);await expect(s.service.neighbors({entityId:center.id})).rejects.toThrow('Neo4j temporarily unavailable');expect(s.session).toHaveBeenCalledOnce();expect(s.release).toHaveBeenCalledOnce();});
