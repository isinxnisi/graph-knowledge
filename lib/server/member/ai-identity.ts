import type {Pool} from 'pg';
import {z} from 'zod';
import {memberTransaction} from './operations';
import {MemberError} from './http';
export const aiIdentityOperationSchema=z.strictObject({id:z.uuidv4(),status:z.enum(['active','suspended']),actor:z.string().regex(/^[a-zA-Z0-9_.@-]{1,80}$/),reason:z.string().trim().min(1).max(200)});
// Operator CLI only. AI identities never become human sessions or receive grants.
export async function operateAiIdentity(pool:Pool,raw:unknown,apply=false){const input=aiIdentityOperationSchema.parse(raw);return memberTransaction(pool,async c=>{
 const row=(await c.query('SELECT status FROM ai_identity WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!row)throw new MemberError(404,'NOT_FOUND');
 const changed=row.status!==input.status;
 if(apply&&changed){await c.query('UPDATE ai_identity SET status=$2 WHERE id=$1',[input.id,input.status]);await c.query('INSERT INTO ai_identity_operation(ai_identity_id,status,actor,reason) VALUES($1,$2,$3,$4)',[input.id,input.status,input.actor,input.reason]);}
 return {id:input.id,status:apply?input.status:row.status,changed,applied:apply};
});}
