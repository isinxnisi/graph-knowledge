import type {PoolClient} from 'pg';
import {MemberError} from './http';

const limits={createHour:[5,3600],createDay:[20,86400],thread:[60,3600],post:[5,60],report:[10,3600],invitation:[60,3600]} as const;
// One bounded row per User/action. Atomic UPSERT serializes different
// communities too; untrusted forwarded IP headers are never a quota identity.
export async function communityAllowance(c:PoolClient,uid:string,action:keyof typeof limits) {
 const [limit,seconds]=limits[action];
 const result=await c.query(`INSERT INTO community_rate(user_id,action,window_start,used)
 VALUES($1,$2,floor(extract(epoch FROM clock_timestamp())/$3)::bigint,1)
 ON CONFLICT(user_id,action) DO UPDATE SET
  used=CASE WHEN community_rate.window_start=EXCLUDED.window_start THEN community_rate.used+1 ELSE 1 END,
  window_start=EXCLUDED.window_start
 WHERE community_rate.window_start<>EXCLUDED.window_start OR community_rate.used<$4 RETURNING used`,[uid,action,seconds,limit]);
 if(!result.rowCount)throw new MemberError(429,action.startsWith('create')?'CREATE_RATE_LIMIT':action.toUpperCase()+'_RATE_LIMIT');
}
