import {randomBytes,randomUUID} from 'node:crypto';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {automationTargetSchema,type AutomationTarget} from '../domain/theme-automation';
import {uploadProductImageSchema} from '../domain/product-authoring';
import {authorizeProductOperator,dispatchProductAuthoring} from './member/product-editorial';
import {memberTransaction} from './member/operations';
import {automationFailure,hashPreviewToken} from './theme-automation';
import {diagnosticError,themeDiagnostic} from './theme-automation-diagnostics';
import {defaultThemeImageModel,type ThemeImageGenerator} from './theme-image-generator';

type PreviewResult={evidence:Map<string,Buffer>;result:{build?:string;complete:boolean;names:string[]}};
type Job=QueryResultRow & {id:string;case_id:string;owner_id:string;execution_id:string;attempt_id:string;state:string;kind:'image'|'preview'};
type Outcome={state:'queued'|'generated'|'ready'|'blocked';code:string;bytes?:Buffer;result?:unknown;imageId?:string;preview?:Map<string,Buffer>};
const imageInput=z.strictObject({prompt:z.string().min(10).max(2500),alt:uploadProductImageSchema.shape.alt});
const leaseSeconds=300;
export const themeImageTrialOrigin='https://graph-beta.isinxnisi.com';
export const themeImageTrialPrompt=/^[ -~]{10,512}$/;

export function createThemeAutomationWorker(pool:Pool,origin:string,generator:ThemeImageGenerator|null,capture:(target:AutomationTarget,token:string)=>Promise<PreviewResult>,trialImageId?:string){
  if(trialImageId&&(origin!==themeImageTrialOrigin||generator?.name!=='openai'||generator.model!==defaultThemeImageModel||!z.uuidv4().safeParse(trialImageId).success)){
    throw Error('A beta image trial requires one exact receipt and the fixed OpenAI image model.');
  }
  const event=(job:Job,stage:string,code:string)=>({stage,code,caseId:job.case_id,requestId:job.id,executionId:job.execution_id,attemptId:job.attempt_id});
  async function recover(c:PoolClient){
    const expired=(await c.query(`UPDATE theme_production.automation_requests a SET
      state=CASE WHEN a.state='storing' THEN 'generated' WHEN a.kind='preview' AND a.attempt_count<3 THEN 'queued' ELSE 'blocked' END,
      reason=CASE WHEN a.state='storing' THEN 'STORAGE_RESUMED' WHEN a.kind='preview' THEN 'PREVIEW_INTERRUPTED' ELSE 'IMAGE_GENERATION_UNKNOWN' END,
      lease_until=NULL,updated_at=clock_timestamp()
      FROM theme_production.cases p WHERE p.id=a.case_id AND p.origin=$1
      AND ($2::uuid IS NULL OR (a.id=$2 AND a.kind='image' AND p.environment='beta' AND p.workflow='manual'))
      AND a.state IN ('running','storing') AND a.lease_until<=clock_timestamp()
      RETURNING a.*`,[origin,trialImageId??null])).rows as Job[];
    for(const row of expired)await themeDiagnostic(c,origin,event(row,row.kind,row.reason));
  }

  async function claim(){
    return memberTransaction(pool,async c=>{
      if(!(await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS held',['theme-automation:'+origin])).rows[0].held)return null;
      await recover(c);
      const job=(await c.query(`SELECT a.*,p.owner_id FROM theme_production.automation_requests a JOIN theme_production.cases p ON p.id=a.case_id
        WHERE p.origin=$1 AND p.status NOT IN ('completed','abandoned') AND a.available_at<=clock_timestamp()
        AND ($3::uuid IS NULL OR (a.id=$3 AND a.kind='image' AND p.environment='beta' AND p.workflow='manual'))
        AND ((a.kind='image' AND (a.state='generated' OR $2 AND a.state='queued' AND a.provider_started_at IS NULL)) OR
             (a.kind='preview' AND p.phase='review' AND a.state='queued'))
        ORDER BY a.available_at,a.created_at FOR UPDATE OF a SKIP LOCKED LIMIT 1`,[origin,!!generator,trialImageId??null])).rows[0] as Job|undefined;
      if(!job)return null;
      const storing=job.state==='generated';
      if(job.kind==='image'&&!storing){
        if(trialImageId&&!themeImageTrialPrompt.test(imageInput.parse(job.input).prompt)){
          throw automationFailure('IMAGE_TRIAL_PROMPT','Use a short ASCII text-only trial prompt (10–512 characters).',400);
        }
        const daily=(await c.query(`SELECT count(*)::int AS n FROM theme_production.automation_requests a
          JOIN theme_production.cases p ON p.id=a.case_id
          WHERE p.origin=$1 AND a.provider=$2 AND a.provider_started_at>=date_trunc('day',clock_timestamp(),'UTC')`,[origin,generator!.name])).rows[0].n;
        if(daily>=(trialImageId?1:generator!.dailyLimit)){
          await c.query("UPDATE theme_production.automation_requests SET reason='IMAGE_DAILY_LIMIT',available_at=date_trunc('day',clock_timestamp(),'UTC')+interval '1 day' WHERE id=$1",[job.id]);
          await themeDiagnostic(c,origin,event(job,'image','IMAGE_DAILY_LIMIT'));
          return null;
        }
      }
      try{await authorizeProductOperator(c,job.owner_id);}catch(e){
        const code=diagnosticError(e,'WORKER_AUTH_UNAVAILABLE');
        if(code!=='OPERATOR_REQUIRED')throw e;
        await c.query("UPDATE theme_production.automation_requests SET state='blocked',reason=$2,updated_at=clock_timestamp() WHERE id=$1",[job.id,code]);
        await themeDiagnostic(c,origin,event(job,job.kind,code));
        return null;
      }
      const attemptId=randomUUID();
      job.state=storing?'storing':'running';
      await c.query(`UPDATE theme_production.automation_requests SET state=$2,reason=NULL,attempt_id=$3,attempt_count=attempt_count+1,
        provider=COALESCE(provider,$4),provider_started_at=CASE WHEN $4::text IS NULL THEN provider_started_at ELSE clock_timestamp() END,lease_until=clock_timestamp()+$5*interval '1 second',updated_at=clock_timestamp() WHERE id=$1`,
        [job.id,job.state,attemptId,job.kind==='image'&&!storing?generator!.name:null,leaseSeconds]);
      job.attempt_id=attemptId;
      await themeDiagnostic(c,origin,event(job,storing?'image-storage':job.kind,job.kind==='image'&&!storing?'PROVIDER_RESERVED':'STARTED'));
      return job;
    });
  }

  async function settle(job:Job,outcome:Outcome){
    await memberTransaction(pool,async c=>{
      const updated=await c.query(`UPDATE theme_production.automation_requests SET state=$3,reason=$4,generated_bytes=$5,
        result=$6,image_id=$7,lease_until=NULL,available_at=clock_timestamp()+$8*interval '1 second',updated_at=clock_timestamp()
        WHERE id=$1 AND attempt_id=$2 AND state IN ('running','storing') AND lease_until>clock_timestamp()`,
        [job.id,job.attempt_id,outcome.state,outcome.state==='ready'||outcome.state==='generated'?null:outcome.code,
          outcome.bytes??null,outcome.result?JSON.stringify(outcome.result):null,outcome.imageId??null,outcome.code==='STORAGE_RETRY'?30:0]);
      if(!updated.rowCount)throw automationFailure('AUTOMATION_LEASE_EXPIRED','内部処理の期限が切れました。');
      if(outcome.preview)for(const [name,bytes] of outcome.preview)await c.query(
        'INSERT INTO theme_production.preview_evidence(request_id,name,bytes) VALUES($1,$2,$3)',[job.id,name,bytes]);
      await c.query('DELETE FROM theme_production.preview_grants WHERE request_id=$1 AND attempt_id=$2',[job.id,job.attempt_id]);
      await themeDiagnostic(c,origin,event(job,job.state==='storing'?'image-storage':job.kind,outcome.code));
    });
  }

  async function store(job:Job){
    const input=imageInput.parse(job.input),source=z.object({provider:z.string(),model:z.string()}).parse(job.result);
    const value=await dispatchProductAuthoring(pool,job.owner_id,{
      action:'upload-product-image',requestId:job.id,role:'illustration',alt:input.alt,base64:Buffer.from(job.generated_bytes).toString('base64'),
      provenance:{id:'theme-generation:'+source.provider+':'+source.model,kind:'generated',
        terms:source.provider==='fixture'?'β検証用の代替画像。':'生成挿絵。原資料ではありません。',credit:source.provider+' '+source.model,creditDisplay:'internal'},
    });
    return z.object({imageId:z.string().regex(/^[a-f0-9]{64}$/)}).parse(value).imageId;
  }

  async function execute(job:Job):Promise<Outcome>{
    if(job.kind==='preview'){
      const token=randomBytes(32).toString('hex');
      await pool.query(`INSERT INTO theme_production.preview_grants SELECT $1,id,attempt_id,lease_until
        FROM theme_production.automation_requests WHERE id=$2 AND attempt_id=$3 AND lease_until>clock_timestamp()`,[hashPreviewToken(token),job.id,job.attempt_id]);
      const value=await capture(automationTargetSchema.parse(job.target),token);
      return {state:'ready',code:value.result.complete?'EVIDENCE_READY':'EVIDENCE_INCOMPLETE',result:{...value.result,target:job.target},preview:value.evidence};
    }
    if(job.state==='storing'){
      const imageId=await store(job);
      return {state:'ready',code:'IMAGE_REGISTERED',imageId,result:job.result};
    }
    const input=imageInput.parse(job.input);
    await themeDiagnostic(pool,origin,event(job,'image-provider','SEND_STARTED'));
    const {bytes,usage,providerRequestId}=await generator!.generate(input.prompt,job.attempt_id);
    return {state:'generated',code:'IMAGE_BYTES_STORED',bytes,result:{
      provider:generator!.name,model:generator!.model,providerAttemptId:job.attempt_id,usage:usage??null,providerRequestId:providerRequestId??null,
    }};
  }

  async function runOnce(){
    const job=await claim();
    if(!job)return false;
    let outcome:Outcome;
    try{outcome=await execute(job);}
    catch(error){
      const storing=job.state==='storing',fallback=storing?'IMAGE_STORAGE_UNAVAILABLE':job.kind==='image'?'IMAGE_GENERATION_UNKNOWN':'PREVIEW_FAILED';
      const code=diagnosticError(error,fallback);
      outcome=storing&&job.attempt_count<4&&code==='IMAGE_STORAGE_UNAVAILABLE'
        ?{state:'generated',code:'STORAGE_RETRY',bytes:job.generated_bytes,result:job.result}
        :{state:'blocked',code,...(storing?{result:job.result}:{})};
    }
    await settle(job,outcome);
    return true;
  }

  async function prune(){
    await memberTransaction(pool,async c=>{
      await c.query("DELETE FROM theme_production.preview_grants WHERE expires_at<clock_timestamp()");
      await c.query(`DELETE FROM theme_production.preview_evidence e USING theme_production.automation_requests a
        WHERE a.id=e.request_id AND a.updated_at<clock_timestamp()-interval '30 days'`);
      await c.query(`DELETE FROM theme_production.preview_reads r USING theme_production.automation_requests a
        WHERE a.id=r.request_id AND a.updated_at<clock_timestamp()-interval '30 days'`);
      await c.query("DELETE FROM theme_production.diagnostics WHERE at<clock_timestamp()-interval '30 days'");
    });
  }
  async function trialResult(){
    if(!trialImageId)return null;
    return (await pool.query(`SELECT a.state,a.reason,a.image_id AS "imageId",a.result
      FROM theme_production.automation_requests a JOIN theme_production.cases c ON c.id=a.case_id
      WHERE a.id=$1 AND a.kind='image' AND c.origin=$2 AND c.environment='beta' AND c.workflow='manual'`,
    [trialImageId,origin])).rows[0]??null;
  }
  return {runOnce,prune,trialResult};
}
