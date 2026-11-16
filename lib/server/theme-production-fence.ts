import {AsyncLocalStorage} from 'node:async_hooks';
import type {Pool,PoolClient} from 'pg';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import type {ProductionSubmissionCommand} from '../domain/theme-production';

type Context={pool:Pool;owner:string;caseId:string;executionId:string;leaseToken:string;submissionId:string;digest:string};
const context=new AsyncLocalStorage<Context>();
export const withThemeProductionSubmission=<T>(value:Context,call:()=>Promise<T>)=>context.run(value,call);
/** Inert for ordinary/manual writes and all normal worker processing. */
export async function assertThemeProductionLease(client?:Pool|PoolClient){
 const ctx=context.getStore();if(!ctx)return;
 const c=client&&'release' in client?client:ctx.pool;
 if('release' in c)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-production:'+ctx.caseId]);
 const r=await c.query(`SELECT 1 FROM theme_production.cases WHERE id=$1 AND owner_id=$2 AND execution_id=$3 AND lease_token=$4 AND lease_until>clock_timestamp() AND status<>'completed'`,[ctx.caseId,ctx.owner,ctx.executionId,ctx.leaseToken]);
 if(!r.rowCount)throw new KnowledgeError('実行権が失効しました。現在の案件を読み、新しい実行権で再開してください。',409,'PRODUCTION_LEASE_EXPIRED');
}
/** A known prepared request cannot be delivered through the old API without its live case capability. */
export async function guardThemeProductionRequest(pool:Pool,owner:string,command:{action:string;requestId?:string;[key:string]:unknown}){
 if(!command.requestId)return;
 if(!(await pool.query("SELECT to_regclass('theme_production.submissions') AS ready")).rows[0].ready)return;
 const rows=(await pool.query('SELECT id,case_id,digest,command_action FROM theme_production.submissions WHERE owner_id=$1 AND command_request_id=$2',[owner,command.requestId])).rows;
 if(!rows.length)return;
 const ctx=context.getStore();
 if(!ctx||ctx.owner!==owner||!rows.some(r=>r.id===ctx.submissionId&&r.case_id===ctx.caseId&&r.digest===ctx.digest&&r.command_action===command.action)||knowledgeDigest(command)!==ctx.digest)throw new KnowledgeError('案件の保存済み送信はdispatch_theme_production_submissionから実行してください。',409,'PRODUCTION_FENCE_REQUIRED');
 await assertThemeProductionLease();
}
export function productionCommandRequest(command:ProductionSubmissionCommand){return command.requestId;}

/** Only the bounded cross-DB publication commit holds a session fence. Research,
 * validation and HTTP calls do not prevent a later claimant after lease expiry. */
export async function withThemeProductionPublication<T>(pool:Pool,work:()=>Promise<T>){
 const ctx=context.getStore();if(!ctx)return work();const c=await pool.connect();
 try{await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['theme-production:'+ctx.caseId]);await assertThemeProductionLease();return await work();}
 finally{await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['theme-production:'+ctx.caseId]);c.release();}
}
