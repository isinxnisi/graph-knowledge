import type {GuideVersions} from '../domain/theme-work-guide';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {createHash,timingSafeEqual} from 'node:crypto';
import {isSiteOperator} from './member/site-operations';
import {automationTargetSchema,type AutomationTarget,type ThemeAutomationCommand} from '../domain/theme-automation';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {themeAutomationBuild,themeAutomationEnabled,themeDiagnostic} from './theme-automation-diagnostics';

export const automationFailure=(code:string,message:string,status=409)=>new KnowledgeError(message,status,code);
const missing=()=>automationFailure('NOT_FOUND','対象の作業または証拠がありません。',404);
type AutomationEventIdentity={caseId:string;requestId:string;executionId:string};

export async function enqueueThemeAutomation(c:PoolClient,origin:string,command:Extract<ThemeAutomationCommand,{action:'generate-theme-image'|'capture-theme-preview'}>,target?:AutomationTarget){
  const kind=command.action==='generate-theme-image'?'image':'preview';
  const input=command.action==='generate-theme-image'?{prompt:command.prompt,alt:command.alt}:{targetDigest:command.targetDigest};
  // A model-assistance edit may advance the audit revision during a preview retry.
  const evidenceTarget=target?.evidenceRevision===undefined?target:{...target,guideRevision:target.evidenceRevision};
  const digest=knowledgeDigest({kind,input,target:evidenceTarget});
  const prior=(await c.query('SELECT case_id,digest FROM theme_production.automation_requests WHERE id=$1',[command.requestId])).rows[0];
  if(prior){
    if(prior.case_id!==command.caseId||prior.digest!==digest)throw automationFailure('REQUEST_CHANGED','同じ受付IDに異なる内容は送れません。');
    return {automationId:command.requestId,replayed:true};
  }
  if(kind==='image'){
    const same=(await c.query("SELECT id FROM theme_production.automation_requests WHERE case_id=$1 AND kind='image' AND digest=$2 ORDER BY created_at LIMIT 1",[command.caseId,digest])).rows[0];
    if(same)return {automationId:same.id,replayed:true};
  }
  const active=(await c.query(`SELECT id,digest FROM theme_production.automation_requests
    WHERE case_id=$1 AND kind=$2 AND state IN ('queued','running','generated','storing') ORDER BY created_at DESC LIMIT 1`,
    [command.caseId,kind])).rows[0];
  if(active){
    if(active.digest===digest)return {automationId:active.id,replayed:true};
    throw automationFailure('AUTOMATION_BUSY','別の素材または画面の受付が進行中です。');
  }
  await c.query(`INSERT INTO theme_production.automation_requests (id,case_id,execution_id,kind,digest,input,target)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[command.requestId,command.caseId,command.executionId,kind,digest,JSON.stringify(input),target?JSON.stringify(target):null]);
  await themeDiagnostic(c,origin,{...identity(command),stage:kind,code:'QUEUED'});
  return {automationId:command.requestId,replayed:false};
}
function identity(input:AutomationEventIdentity){return {caseId:input.caseId,requestId:input.requestId,executionId:input.executionId};}

export async function readThemeAutomation(c:Pool|PoolClient,caseId:string,automationId?:string){
  const rows=(await c.query(`SELECT id,kind,state,reason,result,image_id,created_at,updated_at FROM theme_production.automation_requests
    WHERE case_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY created_at DESC LIMIT 20`,[caseId,automationId??null])).rows;
  if(automationId&&!rows.length)throw missing();
  const events=(await c.query(`SELECT ingress_id AS "ingressId",request_id AS "requestId",execution_id AS "executionId",attempt_id AS "attemptId",
    environment,build,stage,code,at FROM theme_production.diagnostics WHERE case_id=$1 AND ($2::uuid IS NULL OR request_id=$2)
    ORDER BY id DESC LIMIT 35`,[caseId,automationId??null])).rows;
  return {requests:rows.map(r=>({automationId:r.id,kind:r.kind,state:r.state,reason:r.reason,imageId:r.image_id,result:r.result,createdAt:r.created_at,updatedAt:r.updated_at})),events,
    observation:events.length?'observed':'no-recorded-event'};
}

export async function readThemeEvidence(c:PoolClient,origin:string,command:Extract<ThemeAutomationCommand,{action:'read-theme-evidence'}>,target:AutomationTarget){
  const r=(await c.query(`SELECT a.target,a.result,e.bytes FROM theme_production.automation_requests a
    JOIN theme_production.preview_evidence e ON e.request_id=a.id
    WHERE a.id=$1 AND a.case_id=$2 AND a.kind='preview' AND a.state='ready' AND e.name=$3`,[command.automationId,command.caseId,command.name])).rows[0];
  if(!r)throw missing();
  assertEvidenceTarget(r,target);
  await c.query('INSERT INTO theme_production.preview_reads VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[command.automationId,command.executionId,command.name]);
  await themeDiagnostic(c,origin,{...identity(command),stage:'preview-evidence',code:'SERVED'});
  return {metadata:{automationId:command.automationId,name:command.name,target:r.target,build:r.result.build},image:Buffer.from(r.bytes)};
}
function assertEvidenceTarget(row:QueryResultRow,target:{digest:string;guide:GuideVersions}|AutomationTarget){
  const guide='guide' in target?target.guide.revision:target.guideRevision;
  const evidenceRevision='guide' in target?target.guide.evidenceRevision:target.evidenceRevision;
  const guideMatches=evidenceRevision===undefined?row.target?.guideRevision===guide:row.target?.evidenceRevision===evidenceRevision;
  if(row.target?.digest!==target.digest||!guideMatches||row.result?.build!==themeAutomationBuild())throw automationFailure('PREVIEW_TARGET_CHANGED','対象版・ガイド・画面ビルドのいずれかが変わりました。現在版で再採取してください。');
}
export async function assertThemeEvidence(c:PoolClient,caseId:string,executionId:string,evidenceId:string|undefined,target:{digest:string;guide:GuideVersions},required=false){
  if(!(await c.query("SELECT to_regclass('theme_production.automation_requests') AS ready")).rows[0].ready){
    if(required)throw automationFailure('PREVIEW_EVIDENCE_REQUIRED','現在版の必須画面証拠を取得してください。');
    return;
  }
  const opted=(await c.query("SELECT 1 FROM theme_production.automation_requests WHERE case_id=$1 AND kind='preview' LIMIT 1",[caseId])).rowCount;
  if(!required&&!opted&&!evidenceId)return;
  const r=evidenceId&&(await c.query("SELECT target,result FROM theme_production.automation_requests WHERE id=$1 AND case_id=$2 AND kind='preview' AND state='ready'",[evidenceId,caseId])).rows[0];
  if(!r||r.result?.complete!==true)throw automationFailure('PREVIEW_EVIDENCE_REQUIRED','現在版の必須画面証拠を取得してください。');
  assertEvidenceTarget(r,target);
  const rows=(await c.query(`SELECT e.name,r.execution_id IS NOT NULL AS served FROM theme_production.preview_evidence e
    LEFT JOIN theme_production.preview_reads r ON r.request_id=e.request_id AND r.execution_id=$2 AND r.name=e.name WHERE e.request_id=$1`,
    [evidenceId,executionId])).rows;
  const names=new Set(rows.map(row=>row.name));
  if(rows.some(row=>!row.served)||!Array.isArray(r.result.names)||!rows.length||
   rows.length!==r.result.names.length||r.result.names.some((name:string)=>!names.has(name)))
   throw automationFailure('PREVIEW_EVIDENCE_UNREAD','すべての画面証拠を今回の見直し実行で読み取ってください。');
  if(target.guide.evidenceRevision!==undefined){
   const snapshot=automationTargetSchema.parse(r.target);
   if(snapshot.locales.some(locale=>[390,1440].some(width=>['overview',...(snapshot.requirements?.requiredScreens??[])]
    .some(name=>!names.has(`${locale}-${width}-${name}.png`)))))
    throw automationFailure('PREVIEW_EVIDENCE_REQUIRED','必須の言語・画面幅・画面証拠が揃っていません。');
  }
}

export const PREVIEW_HEADER='x-plunode-preview-grant';
export const hashPreviewToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function previewGrant(pool:Pool,origin:string,headers:Headers){
  const token=headers.get(PREVIEW_HEADER);
  if(!themeAutomationEnabled()||!token||!(/^[a-f0-9]{64}$/).test(token))throw missing();
  const key=hashPreviewToken(token);
  const r=(await pool.query(`SELECT g.token_hash,a.target,c.owner_id FROM theme_production.preview_grants g
    JOIN theme_production.automation_requests a ON a.id=g.request_id AND a.attempt_id=g.attempt_id
    JOIN theme_production.cases c ON c.id=a.case_id JOIN "user" u ON u.id=c.owner_id
    WHERE g.token_hash=$1 AND g.expires_at>clock_timestamp() AND a.lease_until>clock_timestamp()
    AND a.kind='preview' AND a.state='running' AND c.phase='review' AND c.status NOT IN ('completed','abandoned')
    AND u.active AND c.origin=$2`,[key,origin])).rows[0];
  if(!r||!isSiteOperator(r.owner_id)||!timingSafeEqual(Buffer.from(key),Buffer.from(r.token_hash)))throw missing();
  return automationTargetSchema.parse(r.target);
}
export function assertPreviewTheme(target:AutomationTarget,themeId:string,revision?:number,locale?:'ja'|'en'){
  if(target.theme.id!==themeId||target.theme.revision!==revision||locale&&!target.locales.includes(locale))throw missing();
}
