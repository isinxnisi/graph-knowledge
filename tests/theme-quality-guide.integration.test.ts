import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createThemeQualityGuides} from '../lib/server/member/theme-quality-guide';
const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:5}),owner=randomUUID(),other=randomUUID(),member=randomUUID();
const guides=createThemeQualityGuides(pool);let first:{revision:number;updatedAt:string};
beforeAll(async()=>{
 vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATIONS_ENABLED','1');
 expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('graph_member_test');
 await migrateMemberDatabase(pool,...Array(31).fill(true));const baseline=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(32).fill(true));await migrateMemberDatabase(pool,...Array(32).fill(true));
 expect((await pool.query("SELECT name,checksum FROM member_migration WHERE name<>'041-theme-quality-guide.sql' ORDER BY name")).rows).toEqual(baseline);
 for(const id of [owner,other,member])await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",active,locale) VALUES($1,$2,$3,true,now(),now(),true,$4)',[id,'Guide operator',id+'@example.invalid','ja']);
 process.env.SITE_OPERATOR_USER_IDS=owner+','+other;
},30000);
afterAll(async()=>{delete process.env.SITE_OPERATOR_USER_IDS;vi.unstubAllEnvs();await pool.end();});
it('denies nonoperators and inactive operators without exposing text',async()=>{
 for(const id of ['',member]){await expect(guides.read(id)).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});await expect(guides.update(id,{requestId:randomUUID(),expectedRevision:0,markdown:'not saved',reason:'test'})).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});}
 await pool.query('UPDATE "user" SET active=false WHERE id=$1',[owner]);try{await expect(guides.read(owner)).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});}finally{await pool.query('UPDATE "user" SET active=true WHERE id=$1',[owner]);}
 expect((await guides.read(owner)).revision).toBe(0);
});
it('stores exact Markdown once, reads it across callers and replays a lost reply',async()=>{
 const input={requestId:randomUUID(),expectedRevision:0,markdown:'# 品質ガイド\n\n本文と末尾の改行。\n',reason:'初版'};
 const saved=await guides.update(owner,input);first=saved as typeof first;
 expect(saved.revision).toBe(1);expect(saved.markdown).toBe(input.markdown);
 expect((await createThemeQualityGuides(pool).read(other)).markdown).toBe(input.markdown);
 expect(await guides.update(owner,input)).toMatchObject({...saved,replayed:true});
 await expect(guides.update(owner,{...input,markdown:'different'})).rejects.toMatchObject({code:'REQUEST_REUSED'});
 expect((await pool.query("SELECT result FROM site_operation_request WHERE request_id=$1",[input.requestId])).rows[0].result).not.toHaveProperty('markdown');
});
it('serializes two chat edits, rejects stale versions and preserves history on restore',async()=>{
 const results=await Promise.allSettled([guides.update(owner,{requestId:randomUUID(),expectedRevision:1,markdown:'第二版A',reason:'改訂A'}),guides.update(other,{requestId:randomUUID(),expectedRevision:1,markdown:'第二版B',reason:'改訂B'})]);
 expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(1);expect(results.find(v=>v.status==='rejected')).toMatchObject({reason:{code:'GUIDE_CHANGED'}});
 const restored=await guides.update(other,{requestId:randomUUID(),expectedRevision:2,restoreRevision:1,reason:'初版の本文を新しい版に復元'});
 expect(restored).toMatchObject({revision:3,restoredFrom:1});
 const old=await guides.read(owner,{revision:1});expect(old.updatedAt).toBe(first.updatedAt);expect(old.currentRevision).toBe(3);expect(restored.markdown).toBe(old.markdown);
 expect((await guides.read(owner)).history.map(v=>v.revision)).toEqual([3,2,1]);expect((await guides.read(owner,{historyBefore:2})).history.map(v=>v.revision)).toEqual([1]);
 await expect(guides.read(owner,{revision:99})).rejects.toMatchObject({code:'GUIDE_NOT_FOUND'});
 await expect(guides.update(owner,{requestId:randomUUID(),expectedRevision:3,restoreRevision:99,reason:'存在しない版'})).rejects.toMatchObject({code:'GUIDE_NOT_FOUND'});
 expect((await guides.read(owner)).revision).toBe(3);
});
