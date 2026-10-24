import {createHmac,timingSafeEqual} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {MemberError} from './http';

const cursorSchema=z.object({v:z.literal(1),scope:z.string(),user:z.string().nullable(),policy:z.string(),limit:z.number().int(),upper:z.string(),last:z.string(),id:z.uuid(),expires:z.number()});
// Only server-owned SQL identifiers are accepted. Cursor fields never become SQL.
export async function communityPage(c:PoolClient,req:Request,secret:string,scope:string,user:string|null,policy:string,sql:string,values:unknown[],time:string|null,id:string,descending=true,focusId?:string){
 const q=new URL(req.url).searchParams;
 const limit=Number(q.get('limit')??20);if(!Number.isInteger(limit)||limit<1||limit>50)throw new MemberError(400,'INVALID_PAGE');
 const raw=q.get(scope==='members'?'membersCursor':'cursor');
 let after:z.infer<typeof cursorSchema>|undefined;
 if(raw){try{if(raw.length>2500)throw Error();const [payload,mac,...extra]=raw.split('.');if(extra.length)throw Error();const expected=createHmac('sha256',secret).update('community-page:'+payload).digest();const supplied=Buffer.from(mac,'base64url');if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error();after=cursorSchema.parse(JSON.parse(Buffer.from(payload,'base64url').toString()));if(after.scope!==scope||after.user!==user||after.limit!==limit||after.expires<Date.now())throw Error();}catch{throw new MemberError(400,'INVALID_CURSOR');}if(after.policy!==policy)throw new MemberError(409,'PAGE_CHANGED');}
 // Resolve a position only inside the caller's already authorized query. Fetch
 // at most half a page of predecessors; never scan all posts in the client.
 if(focusId&&!raw&&time){
  const target=(await c.query(`${sql} AND ${id}=$${values.length+1}::uuid`,[...values,focusId])).rows[0];
  if(!target)throw new MemberError(404,'NOT_FOUND');
  const previous=await c.query(`${sql} AND (${time},${id}) < ($${values.length+1}::timestamptz,$${values.length+2}::uuid) ORDER BY ${time} DESC,${id} DESC LIMIT $${values.length+3}`,[...values,target.page_time,focusId,Math.floor(limit/2)+1]);
  if(previous.rows.length>Math.floor(limit/2)){
   const boundary=previous.rows.at(-1)!;
   after={v:1,scope,user,policy,limit,upper:(await c.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stamp")).rows[0].stamp,last:boundary.page_time,id:boundary.page_id,expires:Date.now()+15*60_000};
  }
 }
 const args=[...values],param=(v:unknown)=>{args.push(v);return '$'+args.length;};
 const upper=after?.upper??(await c.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stamp")).rows[0].stamp;
 let where=time?` AND ${time}<=${param(upper)}::timestamptz`:'';
 if(after)where+=time?` AND (${time},${id}) ${descending?'<':'>'} (${param(after.last)}::timestamptz,${param(after.id)}::uuid)`:` AND ${id} ${descending?'<':'>'} ${param(after.id)}::uuid`;
 const result=await c.query(`${sql}${where} ORDER BY ${time?time+(descending?' DESC,':' ASC,'):''}${id} ${descending?'DESC':'ASC'} LIMIT ${param(limit+1)}`,args);
 const rows:QueryResultRow[]=result.rows.slice(0,limit);let nextCursor:string|null=null;
 if(result.rows.length>limit){const tail=rows.at(-1)!;const state={v:1,scope,user,policy,limit,upper,last:tail.page_time??upper,id:tail.page_id,expires:after?.expires??Date.now()+15*60_000};const payload=Buffer.from(JSON.stringify(state)).toString('base64url');nextCursor=payload+'.'+createHmac('sha256',secret).update('community-page:'+payload).digest('base64url');}
 return {rows,nextCursor,partial:nextCursor!==null};
}
export const pageTime=(field:string)=>`to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_time`;
