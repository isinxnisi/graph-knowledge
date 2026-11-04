import {submissionIntentIssues,submissionReviewEvidence} from "../domain/knowledge-submission-intent";
import {readSubmissionLegacyReferences} from "./knowledge-submission-legacy";
import {ensurePublicationContributorSchema,persistPublicationContributor,finalizePublicationContributor} from "./member/knowledge-contributors";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {Pool,PoolClient,QueryResultRow} from "pg";
import {createHash} from "node:crypto";
import {knowledgeCommandSchema,type KnowledgeCommand} from "../domain/knowledge-foundation";
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission} from "../domain/knowledge-submission";
import {PUBLICATION_CONSENT_VERSION} from "../domain/knowledge-review-job";
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError} from "./knowledge-foundation";
import {verifySourceExcerpt,sourceURL,SourceCheckError,type SourceProof} from "./knowledge-source-verification";
import type {ReviewConfig} from "./knowledge-review-queue";
import {captureDuplicates,commonDuplicatePins,duplicateMatch,type DuplicateCapture,type DuplicateReview} from './knowledge-duplicates';
import {duplicateMeaning,duplicateSourceURL,mergeDuplicateEvidence} from '../domain/knowledge-duplicate';

export const acceptanceEnabled=()=>process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1';
export async function ensureAcceptanceSchema(pool:Pool){
 await ensurePublicationContributorSchema(pool);
 const referenceChecksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/023-knowledge-submission-contexts.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='023-knowledge-submission-contexts.sql'")).rows[0]?.checksum!==referenceChecksum)throw new KnowledgeError('申請対象用の明示migrationが必要です',503,'MIGRATION_REQUIRED');
 const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/022-knowledge-acceptance.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='022-knowledge-acceptance.sql'")).rows[0]?.checksum!==checksum)throw new KnowledgeError('公開受理用の明示migrationが必要です',503,'MIGRATION_REQUIRED');
}
export type AcceptancePlan={command:KnowledgeCommand;references:{kind:'entity'|'source'|'record'|'theme';id:string;revision:number;content?:unknown;legacy?:boolean}[];recordId:string};
export function acceptancePlan(value:KnowledgeSubmission,key:string,decisionId:string,observedRecord?:{id:string;revision:number;content:unknown}):AcceptancePlan{
 const item=value.content.items.find(i=>i.key===key);if(!item)throw new SourceCheckError('対象の項目がありません。');
 const issues=submissionIntentIssues({...value.content,items:[item]},value.context);if(issues.length)throw new SourceCheckError(issues.join(' / '));
 const references:AcceptancePlan['references']=[];
 const allocate=(kind:string,id:string)=>'submission:'+(kind==='record'?decisionId:knowledgeDigest({submission:value.id,revision:value.revision}).slice(0,32))+':'+kind+':'+knowledgeDigest(id).slice(0,16);
 const baseline=observedRecord??value.context?.records?.find(r=>r.id===item.correction?.id&&r.revision===item.correction?.revision);
 const about=item.about?.kind==='record'?value.context?.records?.find(r=>r.id===item.about!.id&&r.revision===item.about!.revision):undefined;
 const inputRecord={...item.record,...(item.operation==='add-information'&&about?{subjectId:about.content.subjectId,objectId:about.content.objectId}:{})};
 const used=[...new Set([inputRecord.subjectId,inputRecord.objectId].filter((v):v is string=>!!v))];
 const entities=value.content.entities.filter(e=>used.includes(e.id)).map(e=>({id:allocate('entity',e.id),content:{...e.content,description:'',aliases:[]}}));
 const legacyEntities=(value.context?.legacy?.entities??[]).filter(e=>used.includes(e.id)).map(e=>({id:e.id,content:value.context!.entities.find(v=>v.id===e.id)!.content,revision:e.revision,payload:e.payload,sha256:e.sha256}));
 const entityId=(id:string|null)=>{
  if(!id)return null;if(value.content.entities.some(e=>e.id===id))return allocate('entity',id);
  const observed=value.context?.entities.find(e=>e.id===id),pin=value.content.entityPins.find(e=>e.id===id)??(about&&observed?{id,revision:observed.revision??1}:undefined);
  if(!pin||!observed)throw new SourceCheckError('対象の取得版がありません。対象を選び直してください。');
  references.push({kind:'entity',...pin,content:observed.content,...(legacyEntities.some(e=>e.id===id)?{legacy:true}:{})});return id;
 };
 const legacyRecords=(value.context?.legacy?.records??[]).filter(e=>e.id===item.correction?.id||e.id===inputRecord.aboutRecord?.id).map(e=>({id:e.id,content:value.context!.records!.find(v=>v.id===e.id)!.content,revision:e.revision,payload:e.payload,sha256:e.sha256}));
 // A trusted legacy Claim brings its complete canonical endpoint and source set.
 for(const original of legacyRecords)for(const id of [original.content.subjectId,original.content.objectId].filter((v):v is string=>!!v))if(!legacyEntities.some(e=>e.id===id)){
  const e=value.context!.legacy!.entities.find(v=>v.id===id);if(!e)throw new SourceCheckError('旧KGの両端の原本がありません。');legacyEntities.push({...e,content:value.context!.entities.find(v=>v.id===id)!.content});
 }
 const legacySourceIds=new Set(legacyRecords.flatMap(r=>r.content.evidence.map(e=>e.source.id)));
 const legacySources=value.context?.sources.filter(s=>legacySourceIds.has(s.id)).map(({id,content})=>({id,content}))??[];
 const record={...inputRecord,subjectId:entityId(inputRecord.subjectId),objectId:entityId(inputRecord.objectId),evidence:inputRecord.evidence.map(e=>{
  const own=value.content.sources.find(s=>s.id===e.source.id&&e.source.revision===1);if(own)return {...e,source:{id:allocate('source',own.id),revision:1}};
  const source=value.context?.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
  if(!source||!value.content.sourcePins.some(s=>s.id===source.id&&s.revision===source.revision))throw new SourceCheckError('資料の取得版がありません。根拠を選び直してください。');
  references.push({kind:'source',...e.source,content:source.content,...(legacySources.some(s=>s.id===source.id)?{legacy:true}:{})});return e;
 })};
 // The author may not set a provenance marker. Foundation derives it from the
 // immutable original after verifying the semantic fields remain unchanged.
 delete record.legacySemantics;
 const sources=value.content.sources.filter(s=>item.record.evidence.some(e=>e.source.id===s.id&&e.source.revision===1)).map(s=>({id:allocate('source',s.id),content:s.content}));
 const id=item.correction?.id??allocate('record',item.key);
 if(item.correction){
  if(!baseline||baseline.id!==item.correction.id||baseline.revision!==item.correction.revision)throw new SourceCheckError('訂正する元の記録を選び直してください。');
  const old=baseline.content as typeof record;
  if(['kind','subjectId','objectId'].some(k=>old[k as keyof typeof old]!==record[k as keyof typeof old]))throw new SourceCheckError('関係の両端・種類が変わっています。別の知識として投稿してください。');
  references.push({kind:'record',...item.correction,content:baseline.content,...(legacyRecords.some(r=>r.id===id)?{legacy:true}:{})});
 }
 if(record.aboutRecord){const r=value.context?.records?.find(v=>v.id===record.aboutRecord!.id&&v.revision===record.aboutRecord!.revision);if(!r)throw new SourceCheckError('補足する関係の原本を読み直してください。');references.push({kind:'record',...record.aboutRecord,content:r.content,...(legacyRecords.some(v=>v.id===r.id)?{legacy:true}:{})});}
 const themes=item.themes??[];
 for(const p of themes){const t=value.context?.themes?.find(v=>v.id===p.id&&v.revision===p.revision);if(!t)throw new SourceCheckError('追加先テーマを選び直してください。');references.push({kind:'theme',...p,content:t.content});}
 const uniqueReferences=[...new Map(references.map(ref=>[ref.kind+':'+ref.id+'@'+ref.revision,ref])).values()];
 const command=knowledgeCommandSchema.parse({action:'accept-record',requestId:decisionId,entities,sources,legacyEntities,legacySources,legacyRecords,themes,entityPins:uniqueReferences.filter(r=>r.kind==='entity').map(({id,revision})=>({id,revision})),sourcePins:uniqueReferences.filter(r=>r.kind==='source').map(({id,revision})=>({id,revision})),record:{id,content:record},...(item.correction?{expectedRevision:item.correction.revision,preserveLegacySemantics:true}:{}),reason:'利用者投稿の内容確認・原資料照合による自動受理'});
 return {command,references:uniqueReferences,recordId:id};
}
async function verifyLegacyCommand(command:KnowledgeCommand){
 if(command.action!=='accept-record'||!(command.legacyEntities?.length||command.legacyRecords?.length))return;
 const entries=[...(command.legacyEntities??[]),...(command.legacyRecords??[])];const revision=entries[0].revision;
 let captured:Awaited<ReturnType<typeof readSubmissionLegacyReferences>>;try{captured=await readSubmissionLegacyReferences({revision,entityIds:command.legacyEntities?.map(e=>e.id)??[],claimIds:command.legacyRecords?.map(e=>e.id)??[]});}catch(e){if(e instanceof Error&&'status' in e&&Number(e.status)<500)throw new SourceCheckError(e.message);throw e;}
 for(const [kind,values] of [['entities',command.legacyEntities??[]],['records',command.legacyRecords??[]]] as const)for(const item of values){const current=captured.legacy[kind].find(e=>e.id===item.id);if(!current||current.sha256!==item.sha256)throw new SourceCheckError('旧KGの公開原本が変わりました。取得し直してください。');}
}
export async function verifyAcceptanceReferences(c:PoolClient,refs:AcceptancePlan['references'],lock=true){
 for(const ref of [...refs].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id))){
  const row=(await c.query(`SELECT o.*,r.content,EXISTS(SELECT 1 FROM knowledge75.published_revisions p WHERE p.kind=o.kind AND p.id=o.id AND p.revision=$3) AS published FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=$3 WHERE o.kind=$1 AND o.id=$2 ${lock?(ref.kind==='theme'?"FOR UPDATE OF o":"FOR SHARE OF o"):""}`,[ref.kind,ref.id,ref.revision])).rows[0];
  if(!row&&ref.legacy)continue;
  if(!row||row.visibility!=='public'||!row.published||(ref.kind!=='theme'&&ref.kind!=='source'&&row.current_revision!==ref.revision))throw new SourceCheckError('取得元の内容や公開範囲が変わりました。最新版を確認して投稿し直してください。');
  if(ref.kind==='theme'&&row.current_revision!==ref.revision){
   const current=(await c.query("SELECT content FROM knowledge75.revisions WHERE kind='theme' AND id=$1 AND revision=$2",[ref.id,row.current_revision])).rows[0]?.content;
   const base=ref.content as {title:string;description:string;initialView:string;timeline?:{axes:unknown;insets:unknown;placements:unknown[]};recordPins:{id:string;revision:number}[]};
   if(!current||!base||['title','description','initialView'].some(k=>current[k]!==base[k as keyof typeof base])||knowledgeDigest(current.timeline?.axes??null)!==knowledgeDigest(base.timeline?.axes??null)||knowledgeDigest(current.timeline?.insets??null)!==knowledgeDigest(base.timeline?.insets??null)||base.recordPins.some(p=>!current.recordPins.some((v:{id:string;revision:number})=>v.id===p.id&&v.revision===p.revision))||(base.timeline?.placements??[]).some(p=>!current.timeline?.placements.some((v:unknown)=>knowledgeDigest(v)===knowledgeDigest(p))))throw new SourceCheckError('追加先テーマの内容が変わりました。最新版を確認して投稿し直してください。');
  }
  if(ref.content&&knowledgeDigest(ref.content)!==knowledgeDigest(row.content))throw new SourceCheckError('対象名・資料の取得版が原記録と異なります。取得元の内容を確認してください。');
 }
}
async function verifyAcceptedSemantics(c:PoolClient,plan:AcceptancePlan){
 if(plan.command.action!=='accept-record'||!plan.command.expectedRevision)return;
 const cmd=plan.command,original=plan.references.find(r=>r.kind==='record'&&r.id===cmd.record.id)?.content as Record<string,unknown>|undefined;
 const typed=cmd.legacyRecords?.some(r=>r.id===cmd.record.id)||(await c.query("SELECT 1 FROM knowledge75.legacy_links WHERE record_id=$1 AND payload ? 'claim'",[cmd.record.id])).rowCount;
 if(typed&&original&&['kind','subjectId','objectId','relation','polarity','scope','times','aboutRecord','aboutTheme'].some(k=>knowledgeDigest(original[k]??null)!==knowledgeDigest((cmd.record.content as Record<string,unknown>)[k]??null)))throw new SourceCheckError('旧KGの型付き限定を変更する場合は、対象の関係を保って別の情報として投稿してください。');
}
function material(s:QueryResultRow):KnowledgeSubmission{const captured=s.reference_context??s.source_capsule?.captured;return {id:s.id,revision:s.current_revision,version:s.state_version,state:s.state,content:knowledgeSubmissionContentSchema.parse(s.content),digest:s.digest,createdAt:String(s.created_at),updatedAt:String(s.updated_at),...(captured?{context:captured}:{})};}

/** Resolve reuse before retaining the immutable decision. Keep the published
 * wording and qualifiers, and add only new independent evidence. */
export async function reuseDuplicatePlan(knowledge:Pool,plan:AcceptancePlan,capture:DuplicateCapture,advice:unknown,proofs:SourceProof[]=[],knownDocuments:string[]=[]):Promise<AcceptancePlan>{
 if(plan.command.action!=='accept-record')return plan;
 const cmd=structuredClone(plan.command),other=duplicateMatch(capture,advice);
 const match=cmd.expectedRevision?capture.candidates.find(r=>r.id===cmd.record.id):other;
 if(!match)return plan;
 if(cmd.expectedRevision&&other&&cmd.record.id!==other.id)throw new SourceCheckError('訂正後の内容は別の既存知識と重複します。その知識への根拠追加を選んでください。');
 // Deliberate corrections may improve wording on this SAME record. Novelty
 // protection must not throw away an explicitly requested editorial change.
 if(cmd.expectedRevision&&knowledgeDigest(duplicateMeaning(match.content))!==knowledgeDigest(duplicateMeaning(cmd.record.content)))return plan;
 const refs=[...plan.references];
 const legacy=capture.legacy?.records.find(r=>r.id===match.id);
 if(legacy){
  const raw=capture.legacy!.legacy.records.find(r=>r.id===match.id)!;
  cmd.legacyRecords=[...(cmd.legacyRecords??[]).filter(r=>r.id!==match.id),{...raw,content:legacy.content}];
  for(const id of [legacy.content.subjectId,legacy.content.objectId].filter((v):v is string=>!!v)){
   const e=capture.legacy!.entities.find(e=>e.id===id)!,rawEntity=capture.legacy!.legacy.entities.find(e=>e.id===id)!;
   if(!cmd.legacyEntities?.some(e=>e.id===id))cmd.legacyEntities=[...(cmd.legacyEntities??[]),{...rawEntity,content:e.content}];
   if(!cmd.entityPins.some(e=>e.id===id))cmd.entityPins.push({id,revision:e.revision});
  }
  const ids=new Set(legacy.content.evidence.map(e=>e.source.id));
  for(const s of capture.legacy!.sources.filter(s=>ids.has(s.id)))if(!cmd.legacySources?.some(v=>v.id===s.id))cmd.legacySources=[...(cmd.legacySources??[]),{id:s.id,content:s.content}];
 }
 const oldSources:import("../domain/knowledge-duplicate").DuplicateSource[]=[];
 for(const p of match.content.evidence.map(e=>e.source)){
  const imported=capture.legacy?.sources.find(s=>s.id===p.id&&s.revision===p.revision);
  const row=imported??(await knowledge.query("SELECT id,revision,content FROM knowledge75.revisions WHERE kind='source' AND id=$1 AND revision=$2",[p.id,p.revision])).rows[0];
  if(!row)throw new SourceCheckError('既存の知識の資料を確認できません。取得し直してください。');
  oldSources.push({id:row.id,revision:Number(row.revision),content:row.content});
  if(!cmd.sourcePins.some(s=>s.id===p.id&&s.revision===p.revision))cmd.sourcePins.push(p);
  if(!refs.some(r=>r.kind==='source'&&r.id===p.id&&r.revision===p.revision))refs.push({kind:'source',...p,content:row.content,...(imported?{legacy:true}:{})});
 }
 const allSources=[...oldSources,...(cmd.legacySources??[]).map(s=>({...s,revision:1})),...cmd.sources.map(s=>({...s,revision:1})),...refs.filter(r=>r.kind==='source').map(r=>({id:r.id,revision:r.revision,content:r.content as typeof oldSources[number]['content']}))];
 // Same fetched document under a different URL is not a fresh source. Retain
 // this proof in the decision; do not strip meaningful query parameters.
 const incoming={...cmd.record.content,evidence:cmd.record.content.evidence.filter(e=>{
  const source=allSources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
  const proof=source?.content.url?proofs.find(p=>duplicateSourceURL(p.url)===duplicateSourceURL(source.content.url!)):undefined;
  return !proof||!knownDocuments.includes(proof.textSha256)||oldSources.some(s=>s.id===e.source.id&&s.revision===e.source.revision);
 })};
 cmd.record={id:match.id,content:mergeDuplicateEvidence(match.content,incoming,allSources)};
 if(cmd.record.content.evidence.length>20)throw new SourceCheckError('この知識の根拠が20件を超えます。既存の資料を確認し、必要なら運営へ相談してください。');
 cmd.sources=cmd.sources.filter(s=>cmd.record.content.evidence.some(e=>e.source.id===s.id));
 cmd.expectedRevision=match.revision;cmd.preserveLegacySemantics=true;
 const reference={kind:'record' as const,id:match.id,revision:match.revision,content:match.content,...(legacy?{legacy:true}:{})};
 if(!refs.some(r=>r.kind==='record'&&r.id===match.id))refs.push(reference);
 return {command:knowledgeCommandSchema.parse(cmd),references:refs,recordId:match.id};
}
export function createKnowledgeAcceptance(pool:Pool,knowledge:Pool,hooks:{afterDecision?:()=>Promise<void>;afterPrepare?:()=>Promise<void>}={},verify=verifySourceExcerpt){
 let ready:Promise<void>|undefined;
 const ensure=async()=>{ready??=ensureAcceptanceSchema(pool).catch(e=>{ready=undefined;throw e;});await ready;};
 async function locked<T>(jobId:string,action:(c:PoolClient,s:QueryResultRow,j:QueryResultRow)=>Promise<T>){
  const seed=(await pool.query('SELECT s.owner_id,s.id FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id WHERE j.id=$1',[jobId])).rows[0];if(!seed)return null;
  const c=await pool.connect();try{await c.query('BEGIN');const active=(await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[seed.owner_id])).rows[0]?.active;
   const s=(await c.query('SELECT s.*,r.content,r.digest,r.source_capsule,r.reference_context FROM member_knowledge.submissions s JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision WHERE s.id=$1 FOR UPDATE OF s',[seed.id])).rows[0];
   const j=(await c.query('SELECT * FROM member_knowledge.review_jobs WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
   if(!active||!s||!j||s.state!=='queued'||s.current_revision!==j.revision||s.digest!==j.submitted_digest){await c.query('ROLLBACK');return null;}
   const result=await action(c,s,j);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const foundation=createKnowledgeFoundationService(knowledge);
 async function delivered(decision:QueryResultRow,result:unknown){
  const disposition=(result as {disposition?:string}).disposition;
  const reason=disposition==='existing'?'同じ知識が登録済みです。記録・保存版・活動履歴は増やしていません。':disposition==='theme-linked'?'既存の知識を指定したテーマへ追加しました。':'知識へ反映しました。';
  // Acknowledgement is idempotent even if private account/job rows no longer exist.
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("UPDATE member_knowledge.publication_decisions SET state='published',result=$2,published_at=clock_timestamp(),reason=$3 WHERE id=$1",[decision.id,result,reason]);await c.query("UPDATE member_knowledge.review_jobs SET state='accepted',reason=$2,lease_token=NULL,lease_until=NULL WHERE id=$1 AND state='accepted'",[decision.job_id,reason]);await finalizePublicationContributor(c,decision.id,result as {id:string;revision:number});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async function deliver(decision:QueryResultRow,prepare:(result:unknown)=>Promise<void>=async()=>{}){
  await verifyLegacyCommand(decision.command);
  const result=await foundation.execute({kind:'submission',id:'member-submission-v1'},decision.command,{verify:async c=>{
   const guard=decision.proofs?.duplicates;
   if(guard){const current=(await commonDuplicatePins(c,guard.record)).map(r=>({id:r.id,revision:r.revision,digest:knowledgeDigest(r.content)}));if(knowledgeDigest(current)!==knowledgeDigest(guard.common))throw new KnowledgeError('既存の知識が増えたため重複を確認し直します',409,'DUPLICATE_REVIEW_REQUIRED');}
   await verifyAcceptanceReferences(c,decision.references_json);await verifyAcceptedSemantics(c,{command:decision.command,references:decision.references_json,recordId:decision.command.record.id});},prepare});
  await hooks.afterDecision?.();await delivered(decision,result);
 }
 return {
 async duplicates(value:KnowledgeSubmission,key:string):Promise<DuplicateReview|undefined>{
  const plan=acceptancePlan(value,key,'00000000-0000-4000-8000-000000000001',value.context?.records?.find(r=>r.id===value.content.items.find(i=>i.key===key)?.correction?.id));
  if(plan.command.action!=='accept-record')return;
  return (await captureDuplicates(knowledge,plan.command.record.content,plan.command.expectedRevision?plan.recordId:undefined)).review;
 },
 async validateReview(jobId:string){
  const row=(await pool.query("SELECT s.*,r.content,r.digest,r.source_capsule,r.reference_context,j.item_key,j.consent_version FROM member_knowledge.review_jobs j JOIN member_knowledge.submissions s ON s.id=j.submission_id JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision WHERE j.id=$1",[jobId])).rows[0];
  if(!row||row.consent_version!==PUBLICATION_CONSENT_VERSION)return null;
  const c=await knowledge.connect().catch(()=>null);if(!c)return {reason:"取得元の公開状態を確認できません。時間をおいて再試行します。",retryable:true};
  try{
   const value=material(row),item=value.content.items.find(i=>i.key===row.item_key)!;
   if(!item.record.evidence.length)throw new SourceCheckError('資料と、本文から引用した根拠の抜粋を追加してください。');
   for(const evidence of submissionReviewEvidence(item,value.context)){
    const source=value.content.sources.find(s=>s.id===evidence.source.id&&evidence.source.revision===1)??value.context?.sources.find(s=>s.id===evidence.source.id&&s.revision===evidence.source.revision);
    if(!source?.content.url)throw new SourceCheckError('書誌だけの資料はまだ自動照合できません。公開URLを追加してください。');
    sourceURL(source.content.url);if(!evidence.excerpt.trim())throw new SourceCheckError('資料本文から引用した根拠の抜粋を追加してください。');
   }
   const observed=value.context?.records?.find((r:{id:string})=>r.id===item.correction?.id);
   const plan=acceptancePlan(value,item.key,jobId,observed);
   await verifyLegacyCommand(plan.command);
   await c.query('BEGIN READ ONLY');await verifyAcceptanceReferences(c,plan.references,false);await verifyAcceptedSemantics(c,plan);await c.query('COMMIT');return null;
  }catch(e){await c.query('ROLLBACK');return {reason:e instanceof SourceCheckError?e.message:'取得元の公開状態を確認できません。時間をおいて再試行します。',retryable:!(e instanceof SourceCheckError)||e.retryable};}finally{c.release();}
 },
 async run(config:ReviewConfig){
  await ensure();
  const indexed=(await pool.query("SELECT d.id,d.job_id,d.result FROM member_knowledge.publication_decisions d JOIN member_knowledge.review_jobs j ON j.id=d.job_id WHERE d.state='published' AND j.state='accepted' LIMIT 20")).rows;
  for(const d of indexed){
   const exists=(await knowledge.query("SELECT 1 FROM knowledge75.publication_control c JOIN knowledge75.publication_records r ON r.generation=c.active_generation JOIN knowledge75.objects o ON o.kind='record' AND o.id=r.id WHERE c.singleton AND r.id=$1 AND r.revision>=$2 AND o.visibility='public'",[d.result.id,d.result.revision])).rowCount;
   if(exists)await pool.query("UPDATE member_knowledge.review_jobs SET state='published',reason=$2 WHERE id=$1 AND state='accepted'",[d.job_id,d.result?.disposition==='existing'?'同じ知識が登録済みです。記録・保存版・活動履歴は増やしていません。':d.result?.disposition==='theme-linked'?'既存の知識を指定したテーマへ追加しました。':'知識として公開しました。']);
  }
  const pending=(await pool.query("SELECT * FROM member_knowledge.publication_decisions WHERE state='pending' AND not_before<=clock_timestamp() ORDER BY created_at LIMIT 1")).rows[0];
  if(pending){
   if(knowledgeDigest(pending.command)!==pending.digest)throw Error('Accepted command digest differs');
   try{await deliver(pending);}catch(e){const blocked=e instanceof SourceCheckError||e instanceof KnowledgeError&&e.status<500;await pool.query("UPDATE member_knowledge.publication_decisions SET state=$2,attempts=attempts+1,reason=$3,not_before=clock_timestamp()+interval '120 seconds' WHERE id=$1",[pending.id,blocked?'blocked':'pending',blocked?(e as Error).message:'公開処理との接続を再試行しています。受理内容は保存されています。']);if(blocked)await pool.query("UPDATE member_knowledge.review_jobs SET state='needs-changes',reason=$2 WHERE id=$1 AND state='accepted'",[pending.job_id,(e as Error).message]);}
   return true;
  }
  const candidates=(await pool.query(`SELECT j.id FROM member_knowledge.review_jobs j LEFT JOIN member_knowledge.source_checks s ON s.job_id=j.id JOIN member_knowledge.submissions p ON p.id=j.submission_id WHERE j.consent_version=$1 AND p.owner_id=ANY($2::uuid[]) AND (j.state='reviewed' OR j.state='source-retry' AND s.not_before<=clock_timestamp() OR j.state='verifying' AND s.lease_until<clock_timestamp()) ORDER BY j.created_at LIMIT 8`,[PUBLICATION_CONSENT_VERSION,config.allowedUsers])).rows;
  for(const candidate of candidates){
   const token=randomUUID();const lease=await locked(candidate.id,async(c,s,j)=>{
    if(!['reviewed','source-retry','verifying'].includes(j.state)||j.consent_version!==PUBLICATION_CONSENT_VERSION||!j.operator_confirmation_id&&(j.result?.suitability!=='legitimate'||j.result?.support!=='supported'))return null;
    const prior=(await c.query('SELECT * FROM member_knowledge.source_checks WHERE job_id=$1',[j.id])).rows[0];
    if(prior&&j.state==='verifying'&&new Date(prior.lease_until)>new Date()||prior&&j.state==='source-retry'&&new Date(prior.not_before)>new Date())return null;
    if(prior?.attempts>=3){await c.query("UPDATE member_knowledge.review_jobs SET state='attention',reason='原資料の接続を3回試しました。資料URLを確認してください。' WHERE id=$1",[j.id]);return null;}
    await c.query("INSERT INTO member_knowledge.source_checks(job_id,attempts,token,lease_until) VALUES($1,1,$2,clock_timestamp()+interval '180 seconds') ON CONFLICT(job_id) DO UPDATE SET attempts=source_checks.attempts+1,token=$2,lease_until=clock_timestamp()+interval '180 seconds'",[j.id,token]);
    await c.query("UPDATE member_knowledge.review_jobs SET state='verifying',reason='原資料の本文と抜粋を照合しています。' WHERE id=$1",[j.id]);return {s,j};
   });if(!lease)continue;
   try{
    const value=material(lease.s),item=value.content.items.find(i=>i.key===lease.j.item_key)!;
    if(!item.record.evidence.length)throw new SourceCheckError('根拠の資料と、資料本文からの抜粋を追加してください。');
    const proofs:SourceProof[]=[];const start=Date.now();
    for(const evidence of submissionReviewEvidence(item,value.context)){
     if(Date.now()-start>45000)throw new SourceCheckError('複数資料の取得に時間がかかっています。時間をおいて再試行します。',true);
     const source=value.content.sources.find(s=>s.id===evidence.source.id&&evidence.source.revision===1)??value.context?.sources.find(s=>s.id===evidence.source.id&&s.revision===evidence.source.revision);
     if(!source?.content.url)throw new SourceCheckError('書誌だけの資料はまだ自動照合できません。本文を確認できる公開URLを追加してください。');
     proofs.push(await verify(source.content.url,evidence.excerpt));
    }
    const originalPlan=acceptancePlan(value,item.key,lease.j.id,value.context?.records?.find((r:{id:string})=>r.id===item.correction?.id));
    if(originalPlan.command.action!=='accept-record')throw Error('Unexpected publication action');
    const capture=await captureDuplicates(knowledge,originalPlan.command.record.content,originalPlan.command.expectedRevision?originalPlan.recordId:undefined);
    const exact=capture.review.candidates.some(c=>knowledgeDigest(c.meaning)===knowledgeDigest(duplicateMeaning(originalPlan.command.action==='accept-record'?originalPlan.command.record.content:item.record)));
    if(capture.review.candidates.length&&!exact&&knowledgeDigest(capture.review)!==knowledgeDigest(lease.j.result?.duplicateCheck??null))throw new KnowledgeError('既存の知識が増えたため重複を確認し直します',409,'DUPLICATE_REVIEW_REQUIRED');
    const match=originalPlan.command.expectedRevision?capture.candidates.find(r=>r.id===originalPlan.recordId):duplicateMatch(capture,lease.j.result?.duplicate);
    const known=match?(await pool.query("SELECT proofs->'sources' AS sources FROM member_knowledge.publication_decisions WHERE state='published' AND (command->'record'->>'id'=$1 OR result->>'id'=$1)",[match.id])).rows.flatMap(r=>(r.sources??[]).map((s:SourceProof)=>s.textSha256)):[];
    const plan=await reuseDuplicatePlan(knowledge,originalPlan,capture,lease.j.result?.duplicate,proofs,known);
    const retainedProofs={sources:proofs,review:lease.j.result,operatorConfirmationId:lease.j.operator_confirmation_id??null,consent:lease.j.consent_version,duplicates:{record:originalPlan.command.record.content,common:capture.common}};
    const decision={id:lease.j.id,job_id:lease.j.id,command:plan.command,digest:knowledgeDigest(plan.command),references_json:plan.references,proofs:retainedProofs};
    await deliver(decision,async result=>{
     const accepted=await locked(lease.j.id,async(c,s,j)=>{
      const check=(await c.query('SELECT token FROM member_knowledge.source_checks WHERE job_id=$1 FOR UPDATE',[j.id])).rows[0];if(j.state!=='verifying'||check?.token!==token)throw new KnowledgeError('受付版が変わりました',409,'STALE');
      await c.query("INSERT INTO member_knowledge.publication_decisions(id,job_id,command,digest,references_json,proofs,state) VALUES($1,$2,$3,$4,$5,$6,'pending') ON CONFLICT(id) DO NOTHING",[decision.id,j.id,decision.command,decision.digest,JSON.stringify(plan.references),JSON.stringify(retainedProofs)]);
      if((result as {disposition?:string}).disposition!=='existing')await persistPublicationContributor(c,{decisionId:decision.id,ownerId:s.owner_id,attribution:value.content.attribution??'anonymous',recordId:plan.recordId,submissionId:value.id,submissionRevision:value.revision,operation:plan.recordId!==originalPlan.recordId?'add-evidence':item.operation!,entityIds:[...new Set(plan.command.action==='accept-record'?[plan.command.record.content.subjectId,plan.command.record.content.objectId].filter((v):v is string=>!!v):[])],themeIds:item.themes?.map(t=>t.id)??[]});
      await c.query("UPDATE member_knowledge.source_checks SET proofs=$2 WHERE job_id=$1",[j.id,JSON.stringify(proofs)]);
      await c.query("UPDATE member_knowledge.review_jobs SET state='accepted',reason='受理しました。公開へ反映しています。' WHERE id=$1",[j.id]);return true;
     });if(!accepted)throw new KnowledgeError('受付版または会員状態が変わりました',409,'STALE');await hooks.afterPrepare?.();
    });
   }catch(e){
    await locked(lease.j.id,async(c,_s,j)=>{
     if(j.state!=='verifying')return;
     if(e instanceof KnowledgeError&&e.code==='DUPLICATE_REVIEW_REQUIRED'){await c.query("UPDATE member_knowledge.review_jobs SET state='queued',reason='既存の知識が更新されたため、重複を確認し直します。',not_before=clock_timestamp()+interval '5 seconds' WHERE id=$1",[j.id]);return;}
     const reason=e instanceof SourceCheckError?e.message:e instanceof KnowledgeError&&e.code==='CONFLICT'?'取得元が更新されました。最新版を確認して投稿し直してください。':'原資料・公開接続を確認できません。時間をおいて再試行します。';
     const retry=!(e instanceof SourceCheckError)||e.retryable;
     await c.query('UPDATE member_knowledge.source_checks SET reason=$2,not_before=clock_timestamp()+$3::integer*interval \'1 millisecond\',lease_until=NULL WHERE job_id=$1',[j.id,reason,e instanceof SourceCheckError?e.retryAfterMs:120000]);
     await c.query('UPDATE member_knowledge.review_jobs SET state=$2,reason=$3 WHERE id=$1',[j.id,retry?'source-retry':'needs-changes',reason]);
    });
   }
   return true;
  }
  return false;
 }};
}
