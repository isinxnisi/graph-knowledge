import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {memberTransaction} from './operations';
import {MemberError} from './http';
const inputSchema=z.strictObject({email:z.email(),expectedHandle:z.string().min(3),expectedGoogleSubjectHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),actor:z.string().min(1).max(80),reason:z.string().min(1).max(200)});
// Operator CLI only: designation is presentation, never membership or admin access.
export async function designateOfficialProfile(pool:Pool,raw:unknown,apply=false){
 const input=inputSchema.parse(raw);
 return memberTransaction(pool,async c=>{
  const users=(await c.query('SELECT id FROM "user" WHERE lower(email)=lower($1) AND "emailVerified"=true AND active=true FOR UPDATE',[input.email])).rows;
  if(users.length!==1)throw new MemberError(404,'VERIFIED_GOOGLE_ACCOUNT_REQUIRED');
  const uid=users[0].id;
  const accounts=(await c.query(`SELECT "accountId" FROM account WHERE "userId"=$1 AND "providerId"='google' FOR SHARE`,[uid])).rows;
  if(accounts.length!==1)throw new MemberError(404,'VERIFIED_GOOGLE_ACCOUNT_REQUIRED');
  const googleSubjectHash=createHash('sha256').update(accounts[0].accountId).digest('hex');
  if(input.expectedGoogleSubjectHash&&input.expectedGoogleSubjectHash!==googleSubjectHash)throw new MemberError(409,'GOOGLE_ACCOUNT_MISMATCH');
  const p=(await c.query('SELECT * FROM public_profile WHERE user_id=$1 FOR UPDATE',[uid])).rows[0];
  if(!p||!(p.handle===input.expectedHandle||p.handle==='plunode'&&p.official))throw new MemberError(409,'PROFILE_CHANGED');
  const changed=!p.official||p.handle!=='plunode'||p.display_name!=='Plunode公式';
  if(apply&&changed){
   const claim=await c.query("INSERT INTO public_handle_claim(handle,profile_id) VALUES('plunode',$1) ON CONFLICT DO NOTHING RETURNING handle",[p.id]);
   if(!claim.rowCount&&(await c.query("SELECT profile_id FROM public_handle_claim WHERE handle='plunode'")).rows[0]?.profile_id!==p.id)throw new MemberError(409,'HANDLE_UNAVAILABLE');
   await c.query("UPDATE public_profile SET handle='plunode',display_name='Plunode公式',official=true,revision=revision+1 WHERE id=$1",[p.id]);
   await c.query("INSERT INTO public_profile_operation(profile_id,actor,reason,from_handle,to_handle,official) VALUES($1,$2,$3,$4,'plunode',true)",[p.id,input.actor,input.reason,p.handle]);
  }
  return {handle:apply?'plunode':p.handle,displayName:apply?'Plunode公式':p.display_name,changed,applied:apply,googleSubjectHash};
 });
}
