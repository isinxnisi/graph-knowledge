import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {knowledgeDigest} from './knowledge-foundation';
import type {ReviewConfig} from './knowledge-review-queue';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
export const quotaDate=(now:Date)=>formatter.format(now);
export function nextQuotaDay(now:Date){const today=quotaDate(now),[y,m,d]=today.split('-').map(Number);let next=new Date(Date.UTC(y,m-1,d+1));while(quotaDate(next)===today)next=new Date(next.getTime()+3600000);return next;}
export function nextQuotaMonth(now:Date){const month=quotaDate(now).slice(0,7),[y,m]=month.split('-').map(Number);let next=new Date(Date.UTC(y,m,1));while(quotaDate(next).slice(0,7)===month)next=new Date(next.getTime()+3600000);return next;}
export async function reserveKnowledgeAI(c:PoolClient,cfg:ReviewConfig,input:{purpose:'submission'|'evaluation'|'collection-read'|'collection-check'|'collection-evaluation'|'translation-generate'|'translation-evaluation';policy:string;inputReserved:number;outputReserved:number;jobId?:string}){
 const project=(await c.query('SELECT * FROM member_knowledge.review_projects WHERE project_id=$1 FOR UPDATE',[cfg.projectId])).rows[0];if(!project||project.config_digest!==knowledgeDigest({...cfg,apiKeyFile:undefined}))throw Error('AI project configuration differs');
 const now=new Date(),day=quotaDate(now),month=day.slice(0,7),{inputReserved,outputReserved}=input;
 const usage=(await c.query(`SELECT COALESCE(sum(request_charge) FILTER(WHERE quota_day=$2),0)::int AS day_requests,COALESCE(sum(request_charge) FILTER(WHERE quota_month=$3),0)::int AS month_requests,
 COALESCE(sum(COALESCE(input_actual,input_reserved)) FILTER(WHERE quota_day=$2),0)::bigint AS day_input,COALESCE(sum(COALESCE(output_actual,output_reserved)) FILTER(WHERE quota_day=$2),0)::bigint AS day_output,
 COALESCE(sum(COALESCE(input_actual,input_reserved)) FILTER(WHERE quota_month=$3),0)::bigint AS month_input,COALESCE(sum(COALESCE(output_actual,output_reserved)) FILTER(WHERE quota_month=$3),0)::bigint AS month_output,
 COALESCE(sum(request_charge) FILTER(WHERE started_at>clock_timestamp()-interval '1 minute'),0)::int AS minute_requests,COALESCE(sum(COALESCE(input_actual,input_reserved)) FILTER(WHERE started_at>clock_timestamp()-interval '1 minute'),0)::bigint AS minute_input,
 COALESCE(sum(request_charge) FILTER(WHERE quota_day=$2 AND purpose LIKE 'collection-%'),0)::int AS collection_requests,
 COALESCE(sum(request_charge) FILTER(WHERE quota_month=$3 AND purpose LIKE 'collection-%'),0)::int AS collection_month_requests,
 COALESCE(sum(request_charge) FILTER(WHERE quota_day=$2 AND purpose LIKE 'translation-%'),0)::int AS translation_requests,
 COALESCE(sum(request_charge) FILTER(WHERE quota_month=$3 AND purpose LIKE 'translation-%'),0)::int AS translation_month_requests,
 COALESCE(sum(request_charge) FILTER(WHERE quota_day=$2 AND purpose LIKE '%evaluation'),0)::int AS evaluation_requests,
 COALESCE(sum(request_charge) FILTER(WHERE quota_month=$3 AND purpose LIKE '%evaluation'),0)::int AS evaluation_month_requests,
 max(started_at) AS last_start FROM member_knowledge.review_attempts WHERE project_id=$1`,[cfg.projectId,day,month])).rows[0];
 if(inputReserved>cfg.tokensPerMinute||inputReserved>cfg.inputTokensPerDay||outputReserved>cfg.outputTokensPerDay)return {state:'oversize' as const};
 let wait:Date|null=null,reason='';
 if(project.paused_until&&new Date(project.paused_until)>now){wait=new Date(project.paused_until);reason=project.pause_reason;}
 else if(usage.day_requests>=cfg.requestsPerDay){wait=nextQuotaDay(now);reason='このサービスの本日のAI利用上限（'+cfg.requestsPerDay+'回）に達しました。利用枠の更新後に自動再開します。';}
 else if(Number(usage.day_input)+inputReserved>cfg.inputTokensPerDay||Number(usage.day_output)+outputReserved>cfg.outputTokensPerDay){wait=nextQuotaDay(now);reason='このサービスの本日のAI処理量の上限に達しました。利用枠の更新後に自動再開します。';}
 else if(usage.month_requests>=cfg.requestsPerMonth||Number(usage.month_input)+inputReserved>cfg.inputTokensPerMonth||Number(usage.month_output)+outputReserved>cfg.outputTokensPerMonth){wait=nextQuotaMonth(now);reason='このサービスの今月のAI利用上限に達しました。利用枠の更新後に自動再開します。';}
 else if(input.purpose.endsWith('evaluation')&&(usage.evaluation_requests>=Math.floor(cfg.requestsPerDay/4)||usage.evaluation_month_requests>=Math.floor(cfg.requestsPerMonth/4))){wait=usage.evaluation_month_requests>=Math.floor(cfg.requestsPerMonth/4)?nextQuotaMonth(now):nextQuotaDay(now);reason='開発評価用のAI利用上限に達しました。投稿確認などの枠を残しています。';}
 else if(input.purpose.startsWith('collection-')&&(usage.collection_requests>=Math.floor(cfg.requestsPerDay/3)||usage.collection_month_requests>=Math.floor(cfg.requestsPerMonth/3))){wait=usage.collection_month_requests>=Math.floor(cfg.requestsPerMonth/3)?nextQuotaMonth(now):nextQuotaDay(now);reason='収集用の利用枠を待っています。投稿確認の枠を残しています。';}
 else if(input.purpose.startsWith('translation-')&&(usage.translation_requests>=Math.floor(cfg.requestsPerDay/6)||usage.translation_month_requests>=Math.floor(cfg.requestsPerMonth/6))){wait=usage.translation_month_requests>=Math.floor(cfg.requestsPerMonth/6)?nextQuotaMonth(now):nextQuotaDay(now);reason='翻訳用の利用枠を待っています。投稿確認の枠を残しています。';}
 else if(usage.minute_requests>=cfg.rpm||Number(usage.minute_input)+inputReserved>cfg.tokensPerMinute){wait=new Date(now.getTime()+61000);reason='利用が集中しています。順番に確認します。';}
 else if(usage.last_start){const after=new Date(new Date(usage.last_start).getTime()+Math.ceil(60000/cfg.rpm)+100);if(after>now){wait=after;reason='順番に確認しています。';}}
 if(wait)return {state:'wait' as const,wait,reason};
 const id=randomUUID();await c.query(`INSERT INTO member_knowledge.review_attempts(id,job_id,project_id,provider,model,policy,purpose,state,quota_day,quota_month,input_reserved,output_reserved) VALUES($1,$2,$3,'gemini',$4,$5,$6,'reserved',$7,$8,$9,$10)`,[id,input.jobId??null,cfg.projectId,cfg.model,input.policy,input.purpose,day,month,inputReserved,outputReserved]);
 return {state:'reserved' as const,id};
}
