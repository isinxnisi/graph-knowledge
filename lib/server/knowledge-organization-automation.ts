import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {organizationInputSchema,organizationProposalSchema,organizationCheckSchema,organizationRecord,ORGANIZATION_POLICY,type OrganizationInput,type OrganizationMaterial,type OrganizationProposal} from '../domain/knowledge-organization-job';
import {knowledgeCommandSchema,type KnowledgeCommand} from '../domain/knowledge-foundation';
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {createKnowledgeIdentity} from './knowledge-identity';
import {createOrganizationMaterialReader,readCommonOrganizationMaterial,organizationMeaningKey} from './knowledge-organization-material';
import {assertOrganizationSchema} from './knowledge-organization-schema';
import {organizationProposeRequest,organizationCheckRequest} from './knowledge-organization-prompt';
import {parseGeminiJson,type GeminiCallResult} from './gemini-knowledge-review';
import {reserveKnowledgeAI,quotaDate,nextQuotaDay} from './knowledge-ai-budget';
import {reviewRetryAt,aiFailureDiagnostic,REVIEW_SENDS_PER_ITEM_DAY} from './knowledge-ai-retry';
import type {ReviewConfig} from './knowledge-review-queue';
import {readSubmissionLegacyReferences} from './knowledge-submission-legacy';
import {publicSourceDocument,matchSourceExcerpt,SourceCheckError,type SourceProof} from './knowledge-source-verification';

type Reader=ReturnType<typeof createOrganizationMaterialReader>;
type WireResult=GeminiCallResult|{state:'not-sent'};
export type OrganizationLease={candidateId:string;attemptId:string;token:string;generation:number;stage:string;model:string;wire:string;wireHash:string};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
export function createKnowledgeOrganizationAutomation(member:Pool,knowledge:Pool,cfg:ReviewConfig,reader:Reader,options:{
 authorize:()=>void;actorId:string;
 evaluation?:boolean;
 captureLegacy?:typeof readSubmissionLegacyReferences;
 verifySource?:(url:string,excerpt:string)=>Promise<SourceProof>;
}){
 const foundation=createKnowledgeFoundationService(knowledge),identity=createKnowledgeIdentity(knowledge),captureLegacy=options.captureLegacy??readSubmissionLegacyReferences;
 const verifySource=options.verifySource??(async(url,excerpt)=>matchSourceExcerpt(await publicSourceDocument(url),excerpt));
 let ready:Promise<void>|undefined;
 async function schema(){ready??=(async()=>{
  await assertOrganizationSchema(knowledge);
  if(options.evaluation&&!(await knowledge.query('SELECT current_database() AS name')).rows[0].name.startsWith('plunode_knowledge75_test_'))throw new KnowledgeError('実AI評価は独立した検証DBだけで実行できます',403,'EVALUATION_DATABASE_REQUIRED');
  const name='032-organization-budget.sql',checksum=hash(await readFile(path.join(process.cwd(),'db/member',name),'utf8'));
  if((await member.query('SELECT checksum FROM member_migration WHERE name=$1',[name])).rows[0]?.checksum!==checksum)throw new KnowledgeError('自動整理の利用量migrationが必要です',503,'MIGRATION_REQUIRED');
 })().catch(e=>{ready=undefined;throw e;});await ready;}
 async function tx<T>(pool:Pool,run:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const result=await run(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 function materials(input:OrganizationInput){return input.kind==='meaning'?[input.record,...(input.reuse?[input.reuse.record]:[])]:[input.left,input.right,...input.records];}
 function sameMaterial(expected:OrganizationMaterial,current:OrganizationMaterial){
  if(knowledgeDigest(expected)===knowledgeDigest(current))return true;
  // Exact canonical KG content may have been captured by another accepted job.
  // Never tolerate a correction, stop/reopen or changed dependency at that bridge.
  return expected.origin==='public-kg'&&current.origin==='common'&&current.revision==='1'&&current.statusRevision==='1'
   &&current.references.every(r=>r.revision==='1'&&r.statusRevision==='1')
   &&knowledgeDigest(expected.content)===knowledgeDigest(current.content)
   &&knowledgeDigest([...expected.entities].sort((a,b)=>a.id.localeCompare(b.id)))===knowledgeDigest([...current.entities].sort((a,b)=>a.id.localeCompare(b.id)))
   &&knowledgeDigest([...expected.sources].sort((a,b)=>a.id.localeCompare(b.id)))===knowledgeDigest([...current.sources].sort((a,b)=>a.id.localeCompare(b.id)))&&!current.translatedNames.length;
 }
 async function validate(input:OrganizationInput,c?:PoolClient){
  options.authorize();
  for(const m of materials(input)){
   const current=c&&m.origin==='common'?await readCommonOrganizationMaterial(c,m):await reader.one(m);
   if(!sameMaterial(m,current))throw new KnowledgeError('整理中に対象・根拠・公開文脈が更新されました',409,'TARGET_CHANGED');
  }
  if(input.kind==='meaning'){
   const map=(await(c??knowledge).query("SELECT current_revision FROM knowledge75.objects WHERE kind='mapping' AND id=$1",[input.record.id])).rows[0];
   if((map?.current_revision??0)!==input.mappingRevision)throw new KnowledgeError('意味対応が変更されています',409,'TARGET_CHANGED');
   if(input.reuse){
    const prior=(await(c??knowledge).query(`SELECT v.revision,v.content FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision WHERE o.kind='mapping' AND o.id=$1 AND o.visibility='public'`,[input.reuse.record.id])).rows[0];
    if(prior?.revision!==input.reuse.mappingRevision||knowledgeDigest(prior?.content.concept)!==knowledgeDigest(input.reuse.concept)||prior.content.recordRevision!==Number(input.reuse.record.revision)||organizationMeaningKey(input.record)!==organizationMeaningKey(input.reuse.record))throw new KnowledgeError('再利用する意味対応が変わりました',409,'TARGET_CHANGED');
   }
  }else{
   const link=(await(c??knowledge).query('SELECT current_revision FROM knowledge75.entity_identity_links WHERE left_id=$1 AND right_id=$2',[input.left.id,input.right.id])).rows[0];
   if((link?.current_revision??0)!==input.identityRevision)throw new KnowledgeError('対象の関連付けが変わりました',409,'TARGET_CHANGED');
  }
 }
 async function owned(c:PoolClient,j:QueryResultRow){
  const current=(await c.query('SELECT * FROM knowledge75.organization_candidates WHERE id=$1 FOR UPDATE',[j.id])).rows[0];
  if(!current||current.lease_token!==j.lease_token||current.lease_generation!==j.lease_generation||!current.lease_until||new Date(current.lease_until).getTime()<=Date.now()||!['running','verified'].includes(current.state))throw new KnowledgeError('整理の実行権が更新されました',409,'LEASE_CHANGED');
  return current;
 }
 async function state(j:QueryResultRow,kind:string,reason:string,next?:Date){
  await knowledge.query(`UPDATE knowledge75.organization_candidates SET state=$4,reason=$5,next_attempt=COALESCE($6,next_attempt),current_attempt=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
   WHERE id=$1 AND lease_token=$2 AND lease_generation=$3 AND state IN('running','verified')`,[j.id,j.lease_token,j.lease_generation,kind,reason,next??null]);
 }
 async function supersede(j:QueryResultRow,reason:string){
  await state(j,'superseded',reason);
  await knowledge.query(`UPDATE knowledge75.patrol_tasks t SET state='pending',next_attempt=clock_timestamp(),comparison_cursor=NULL
   FROM knowledge75.patrol_targets p WHERE t.id=$1 AND p.origin=t.origin AND p.kind=t.kind AND p.id=t.target_id AND p.generation=t.target_generation AND p.present AND p.eligible AND t.state='planned'`,[j.task_id]);
 }
 async function settle(id:string,result:WireResult){
  const parsed=result.state==='received'?parseGeminiJson(result.raw):null,u=parsed?.usage;
  await member.query(`UPDATE member_knowledge.review_attempts SET state=$2,finished_at=clock_timestamp(),request_charge=$3,input_actual=$4,output_actual=$5,thoughts_actual=$6,cached_actual=$7,total_actual=$8,candidates_actual=$9
   WHERE id=$1 AND state IN('reserved','sending','delivery-unknown')`,[id,result.state,result.state==='not-sent'?0:1,result.state==='not-sent'?0:u?.promptTokenCount??null,result.state==='not-sent'?0:u?.candidatesTokenCount!=null&&u?.thoughtsTokenCount!=null?u.candidatesTokenCount+u.thoughtsTokenCount:null,u?.thoughtsTokenCount??null,u?.cachedContentTokenCount??null,u?.totalTokenCount??null,u?.candidatesTokenCount??null]);
 }
 async function recover(){
  // The member budget and knowledge journal live in separate databases. A
  // crash between reservation and retaining its pointer cannot strand budget
  // forever. After five minutes the three-minute sender lease has expired.
  const orphans=(await member.query(`SELECT id FROM member_knowledge.review_attempts WHERE project_id=$1
   AND purpose IN('organization-propose','organization-check') AND state='reserved'
   AND started_at<clock_timestamp()-interval '5 minutes' ORDER BY started_at LIMIT 20`,[cfg.projectId])).rows;
  for(const a of orphans)if(!(await knowledge.query('SELECT 1 FROM knowledge75.organization_attempts WHERE id=$1',[a.id])).rowCount)await settle(a.id,{state:'not-sent'});
  const rows=(await knowledge.query(`SELECT j.*,a.state AS attempt_state,a.response FROM knowledge75.organization_candidates j LEFT JOIN knowledge75.organization_attempts a ON a.id=j.current_attempt
   WHERE j.state IN('running','verified') AND j.lease_until<clock_timestamp() ORDER BY j.created_at LIMIT 20`)).rows;
  for(const j of rows){
   if(j.current_attempt){
    const r=j.response as WireResult|null;
    await settle(j.current_attempt,r??(j.attempt_state==='reserved'?{state:'not-sent'}:{state:'delivery-unknown'}));
   }
   await knowledge.query(`UPDATE knowledge75.organization_candidates SET state=CASE WHEN state='verified' THEN 'verified' ELSE 'retry' END,
    reason='停止前の保存済み結果から再開します',lease_token=NULL,lease_until=NULL,next_attempt=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1 AND lease_generation=$2 AND lease_until<clock_timestamp()`,[j.id,j.lease_generation]);
  }
 }
 async function claim(){
  return tx(knowledge,async c=>{
   options.authorize();const j=(await c.query(`SELECT * FROM knowledge75.organization_candidates WHERE
    (state IN('queued','retry','quota') OR state='verified' AND lease_token IS NULL OR state='unresolved' AND attempts<4)
    AND next_attempt<=clock_timestamp() AND policy=$1 ORDER BY (state='verified') DESC,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,[ORGANIZATION_POLICY])).rows[0];
   if(!j)return null;
   return (await c.query(`UPDATE knowledge75.organization_candidates SET state=CASE WHEN state='verified' THEN 'verified' ELSE 'running' END,
    lease_token=$2,lease_generation=lease_generation+1,lease_until=clock_timestamp()+interval '3 minutes',updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,[j.id,randomUUID()])).rows[0];
  });
 }
 function selectedEvidence(input:OrganizationInput,p:OrganizationProposal){
  if(input.kind!=='identity')throw new KnowledgeError('同一性の候補ではありません');
  const record=input.records.find(r=>r.id===p.evidenceRecordId);if(!record)throw new KnowledgeError('提示していない根拠は使えません');
  const evidence=organizationRecord(record).evidence.find(e=>e.id===p.evidenceId&&e.stance==='support');
  const source=evidence&&record.sources.find(s=>s.id===evidence.source.id&&s.revision===evidence.source.revision);
  if(!evidence?.excerpt.trim()||!source?.content.url)throw new KnowledgeError('同一性を裏付ける引用と公開資料が必要です');
  return {record,evidence,source};
 }
 function meaningConcept(input:Extract<OrganizationInput,{kind:'meaning'}>,p?:OrganizationProposal){
  if(input.reuse)return input.reuse.concept;
  if(!p||p.outcome!=='map'||p.evidenceId||p.evidenceRecordId)throw new KnowledgeError('意味対応の結果を確認できません');
  const existing=p.conceptId?input.concepts.find(c=>c.id===p.conceptId):undefined;
  if(p.conceptId&&!existing)throw new KnowledgeError('提示していない意味対応を指定できません');
  if(existing)return existing;
  if(!p.label||!p.definition)throw new KnowledgeError('意味対応の名前と定義が必要です');
  const record=organizationRecord(input.record),original=record.textLanguages?.relation??record.textLanguages?.assertion;
  const language={tag:original?.tag??'und',basis:'generated' as const};
  return {id:'concept:auto:'+knowledgeDigest([language,p.label,p.definition]).slice(0,40),revision:1,label:p.label,definition:p.definition,language};
 }
 async function bridge(input:OrganizationInput,j:QueryResultRow){
  const needed=input.kind==='identity'?[input.left,input.right,selectedEvidence(input,organizationProposalSchema.parse(j.proposal)).record]:[input.record];
  const legacy=needed.filter(m=>m.origin==='public-kg'&&['entity','record'].includes(m.kind));if(!legacy.length)return;
  const ids=[...new Set(legacy.filter(m=>m.kind==='entity').map(m=>m.id))],records=[...new Set(legacy.filter(m=>m.kind==='record').map(m=>m.id))];
  const captured=await captureLegacy({entityIds:ids,claimIds:records});
  for(const m of legacy){const found=m.kind==='entity'?captured.entities.find(e=>e.id===m.id):captured.records.find(r=>r.id===m.id);if(!found||knowledgeDigest(found.content)!==knowledgeDigest(m.content)||captured.revision!==m.revision)throw new KnowledgeError('旧KGの正本が更新されています',409,'TARGET_CHANGED');}
  const command=knowledgeCommandSchema.parse({action:'capture-legacy',requestId:knowledgeDigest([j.request_id,'capture']).slice(0,8)+'-'+knowledgeDigest([j.request_id,'capture']).slice(8,12)+'-4'+knowledgeDigest([j.request_id,'capture']).slice(13,16)+'-a'+knowledgeDigest([j.request_id,'capture']).slice(17,20)+'-'+knowledgeDigest([j.request_id,'capture']).slice(20,32),
   entities:captured.entities.map(e=>({id:e.id,content:e.content,revision:captured.revision,payload:captured.legacy.entities.find(v=>v.id===e.id)!.payload,sha256:captured.legacy.entities.find(v=>v.id===e.id)!.sha256})),sources:captured.sources.map(s=>({id:s.id,content:s.content})),
   records:captured.records.map(r=>({id:r.id,content:r.content,revision:captured.revision,payload:captured.legacy.records.find(v=>v.id===r.id)!.payload,sha256:captured.legacy.records.find(v=>v.id===r.id)!.sha256})),reason:'自動整理のため、公開済み旧KGの固定原本を同一IDで参照'});
  await foundation.execute({kind:'organizer',id:options.actorId},command,{verify:async c=>{await owned(c,j);await validate(input);},prepare:async()=>{}});
 }
 async function apply(j:QueryResultRow,input:OrganizationInput){
  options.authorize();await validate(input);
  if(j.input_hash!==knowledgeDigest(input)||j.policy!==ORGANIZATION_POLICY)throw new KnowledgeError('整理方針と入力hashを確認してください',409,'TARGET_CHANGED');
  if(!input.kind||!j.decision)throw new KnowledgeError('検証結果がありません');
  if(input.kind==='meaning'&&input.reuse){if(j.decision.kind!=='reuse'||j.decision.meaningKey!==organizationMeaningKey(input.record))throw new KnowledgeError('意味対応の再利用証明が異なります');}
  else{
   const last=(await knowledge.query('SELECT * FROM knowledge75.organization_attempts WHERE id=$1 AND candidate_id=$2 AND stage=\'check\' AND state=\'received\'',[j.decision.attemptId,j.id])).rows[0];
   if(!last||hash(last.wire)!==last.wire_hash||j.decision.wireHash!==last.wire_hash||JSON.stringify(organizationCheckRequest(input,organizationProposalSchema.parse(j.proposal)))!==last.wire)throw new KnowledgeError('保存した確認応答と入力が一致しません');
   const parsed=parseGeminiJson((last.response as GeminiCallResult&{raw:unknown}).raw);
   if(parsed.state!=='parsed'||parsed.modelVersion!==last.model||!organizationCheckSchema.parse(parsed.content).supported)throw new KnowledgeError('支持された確認結果がありません');
  }
  await bridge(input,j);
  const retain=async(c:PoolClient,result:unknown)=>{await c.query("UPDATE knowledge75.organization_candidates SET state='applied',result=$2,reason='確認した整理を自動反映しました',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[j.id,result]);};
  const verify=async(c:PoolClient)=>{options.authorize();await owned(c,j);await validate(input,c);};
  if(input.kind==='meaning'){
   const concept=meaningConcept(input,j.proposal?organizationProposalSchema.parse(j.proposal):undefined);
   const command:KnowledgeCommand=knowledgeCommandSchema.parse({action:'set-mappings',requestId:j.request_id,entries:[{recordId:input.record.id,recordRevision:input.record.origin==='public-kg'?1:Number(input.record.revision),expectedMappingRevision:input.mappingRevision}],concept,
    reason:input.reuse?'同一の文脈形・原語・限定に対する意味対応を自動再利用':'原文と保存根拠の文脈から自動で意味対応を確認（事実本文の再承認ではありません）'});
   await foundation.execute({kind:'organizer',id:options.actorId},command,{verify,retain,prepare:async()=>{}});
  }else{
   const proposal=organizationProposalSchema.parse(j.proposal),ev=selectedEvidence(input,proposal),proof=j.source_proof as SourceProof|null;
   if(!proof||Date.parse(proof.checkedAt)<Date.now()-3600000)throw new SourceCheckError('同一性の原資料を再確認します',true);
   await identity.act(options.actorId,{requestId:j.request_id,left:{id:input.left.id,revision:input.left.origin==='public-kg'?1:Number(input.left.revision)},right:{id:input.right.id,revision:input.right.origin==='public-kg'?1:Number(input.right.revision)},expectedRevision:input.identityRevision,state:'same',reference:proof.url,locator:ev.evidence.locator,reason:'原資料の引用と文脈を自動確認：'+proposal.reason},{verify,retain});
  }
 }
 async function consume(j:QueryResultRow,result:WireResult,attempt:QueryResultRow){
  await settle(attempt.id,result);
  if(result.state==='http-error'||result.state==='delivery-unknown'){
   const next=reviewRetryAt(j.attempts,result.state==='http-error'?result.retryAfter:null);
   if(result.state==='http-error'&&['authorization','invalid-request'].includes(result.category)){await state(j,'unresolved','AI接続設定を確認できません。他の整理は継続します',new Date(Date.now()+86400000));return;}
   await member.query('UPDATE member_knowledge.review_projects SET paused_until=GREATEST(COALESCE(paused_until,$2),$2),pause_reason=$3 WHERE project_id=$1',[cfg.projectId,next,'自動整理の接続が一時的に利用できません。間隔を空けて自動再開します']);
   await state(j,'retry','AI接続が一時的に利用できません。自動で再試行します',next);return;
  }
  if(result.state==='not-sent'){await state(j,'retry','送信前に確認条件が変わりました',reviewRetryAt(j.attempts));return;}
  const parsed=parseGeminiJson(result.raw);
  if(parsed.state!=='parsed'||parsed.modelVersion!==attempt.model){await state(j,'unresolved','確認応答または実行モデルを確認できません。他の整理を進めます',new Date(Date.now()+86400000));return;}
  if(j.stage==='propose'){
   const p=organizationProposalSchema.parse(parsed.content),input=organizationInputSchema.parse(j.input);
   if(p.outcome==='unclear'){await state(j,'unresolved',p.reason,new Date(Date.now()+7*86400000));return;}
   if(input.kind==='identity'&&p.outcome==='different'){await state(j,'rejected',p.reason);return;}
   if(input.kind==='meaning')meaningConcept(input,p);else{
    if(p.outcome!=='same'||p.conceptId||p.label||p.definition)throw new KnowledgeError('同一性の応答形式を確認できません');selectedEvidence(input,p);
   }
   await knowledge.query(`UPDATE knowledge75.organization_candidates SET proposal=$4,stage='check',state='queued',reason='候補の意味と根拠を確認します',current_attempt=NULL,lease_token=NULL,lease_until=NULL,next_attempt=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1 AND lease_token=$2 AND lease_generation=$3 AND state='running'`,[j.id,j.lease_token,j.lease_generation,p]);
  }else{
   const checked=organizationCheckSchema.parse(parsed.content);if(!checked.supported){await state(j,'unresolved',checked.reason,new Date(Date.now()+7*86400000));return;}
   await knowledge.query(`UPDATE knowledge75.organization_candidates SET decision=$4,state='verified',reason='確認した整理を反映します',lease_token=NULL,lease_until=NULL,next_attempt=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1 AND lease_token=$2 AND lease_generation=$3 AND state='running'`,[j.id,j.lease_token,j.lease_generation,{kind:'ai',attemptId:attempt.id,wireHash:attempt.wire_hash,policy:ORGANIZATION_POLICY,reason:checked.reason}]);
  }
 }
 return {
  validate,
  async processNext(infer:(lease:OrganizationLease)=>Promise<WireResult>){
   options.authorize();await schema();await recover();const j=await claim();if(!j)return false;
   let reservation:string|undefined,sending=false;
   try{
    const input=organizationInputSchema.parse(j.input);if(j.input_hash!==knowledgeDigest(input))throw new KnowledgeError('整理入力のhashが一致しません',409,'TARGET_CHANGED');await validate(input);
    if(j.state==='verified'){
     if(input.kind==='identity'&&(!j.source_proof||Date.parse(j.source_proof.checkedAt)<Date.now()-3600000)){
      const ev=selectedEvidence(input,organizationProposalSchema.parse(j.proposal));j.source_proof=await verifySource(ev.source.content.url!,ev.evidence.excerpt);
      await knowledge.query('UPDATE knowledge75.organization_candidates SET source_proof=$4 WHERE id=$1 AND lease_token=$2 AND lease_generation=$3',[j.id,j.lease_token,j.lease_generation,j.source_proof]);
     }
     await apply(j,input);return true;
    }
    if(j.current_attempt){
     const previous=(await knowledge.query('SELECT * FROM knowledge75.organization_attempts WHERE id=$1 AND candidate_id=$2 AND stage=$3',[j.current_attempt,j.id,j.stage])).rows[0];
     if(previous?.response){if(hash(previous.wire)!==previous.wire_hash)throw new KnowledgeError('保存したAI入力のhashが異なります');await consume(j,previous.response,previous);return true;}
    }
    if(j.kind==='identity'&&j.stage==='check'){
     const ev=selectedEvidence(input,organizationProposalSchema.parse(j.proposal));
     const proof=await verifySource(ev.source.content.url!,ev.evidence.excerpt);
     await knowledge.query('UPDATE knowledge75.organization_candidates SET source_proof=$4 WHERE id=$1 AND lease_token=$2 AND lease_generation=$3',[j.id,j.lease_token,j.lease_generation,proof]);
    }
    const day=quotaDate(new Date()),sent=(await member.query(`SELECT count(*)::int AS n FROM member_knowledge.review_attempts WHERE id IN(SELECT unnest($1::uuid[])) AND quota_day=$2 AND request_charge=1`,[(await knowledge.query('SELECT id FROM knowledge75.organization_attempts WHERE candidate_id=$1',[j.id])).rows.map(r=>r.id),day])).rows[0].n;
    if(sent>=REVIEW_SENDS_PER_ITEM_DAY){await state(j,'quota','この候補の本日の確認上限です。次の利用日に再開します',nextQuotaDay(new Date()));return true;}
    const request=j.stage==='propose'?organizationProposeRequest(input):organizationCheckRequest(input,organizationProposalSchema.parse(j.proposal));
    const wire=JSON.stringify(request),wireHash=hash(wire);if(Buffer.byteLength(wire)>120000)throw new KnowledgeError('公開文脈が大きいため、この候補は分けて再確認します');
    const r=await tx(member,c=>reserveKnowledgeAI(c,cfg,{purpose:options.evaluation?'organization-evaluation':j.stage==='propose'?'organization-propose':'organization-check',policy:ORGANIZATION_POLICY,inputReserved:Buffer.byteLength(wire)+1024,outputReserved:j.stage==='propose'?2048:1024}));
    if(r.state!=='reserved'){await state(j,r.state==='wait'?'quota':'unresolved',r.state==='wait'?r.reason:'この候補の文脈が利用上限を超えています',r.state==='wait'?r.wait:new Date(Date.now()+7*86400000));return true;}
    reservation=r.id;
    const attempt=await tx(knowledge,async c=>{
     await owned(c,j);options.authorize();
     const a=(await c.query(`INSERT INTO knowledge75.organization_attempts(id,candidate_id,lease_generation,stage,wire,wire_hash,model,state) VALUES($1,$2,$3,$4,$5,$6,$7,'reserved') RETURNING *`,[r.id,j.id,j.lease_generation,j.stage,wire,wireHash,cfg.model])).rows[0];
     await c.query('UPDATE knowledge75.organization_candidates SET current_attempt=$2,attempts=attempts+1 WHERE id=$1',[j.id,r.id]);return a;
    });
    options.authorize();await validate(input);
    await tx(knowledge,async c=>{await owned(c,j);await c.query("UPDATE knowledge75.organization_attempts SET state='sending' WHERE id=$1 AND state='reserved'",[r.id]);});
    await member.query("UPDATE member_knowledge.review_attempts SET state='sending' WHERE id=$1 AND state='reserved'",[r.id]);
    options.authorize();sending=true;
    const response=await infer({candidateId:j.id,attemptId:r.id,token:j.lease_token,generation:j.lease_generation,stage:j.stage,model:cfg.model,wire,wireHash});
    // Save the response before consuming it: restart/re-delivery never requires
    // another inference if the response was retained successfully.
    const safe=response.state==='http-error'?{...response,raw:null,retryAfter:aiFailureDiagnostic(response)?.retryAfter??null}:response;
    await knowledge.query('UPDATE knowledge75.organization_attempts SET state=$2,response=$3,finished_at=clock_timestamp() WHERE id=$1',[r.id,response.state,safe]);
    await settle(r.id,safe);
    await tx(knowledge,c=>owned(c,j));await consume({...j,attempts:j.attempts+1},safe,attempt);
   }catch(e){
    if(reservation)await settle(reservation,sending?{state:'delivery-unknown'}:{state:'not-sent'});
    if(e instanceof KnowledgeError&&e.code==='LEASE_CHANGED')return true;
    options.authorize();
    if(e instanceof KnowledgeError&&['TARGET_CHANGED','REFERENCE_NOT_PUBLIC','REVISION_CONFLICT'].includes(e.code))await supersede(j,'対象・根拠・意味対応が変わったため、更新後の文脈から確認し直します');
    else if(e instanceof SourceCheckError&&e.retryable)await state(j,'retry',e.message,reviewRetryAt(j.attempts));
    else await state(j,'unresolved',e instanceof KnowledgeError||e instanceof SourceCheckError?e.message:'確認結果を利用できません。他の整理を進めます',new Date(Date.now()+7*86400000));
   }
   return true;
  },
 };
}
