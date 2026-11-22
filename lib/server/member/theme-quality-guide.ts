import {createHash} from 'node:crypto';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {THEME_QUALITY_GUIDE_ID,readThemeQualityGuideSchema,updateThemeQualityGuideSchema,type ReadThemeQualityGuide,type UpdateThemeQualityGuide} from '../../domain/theme-quality-guide';
import {readThemeWorkGuideSchema,updateThemeWorkGuideSchema,workGuideFocuses,type ReadThemeWorkGuide,type UpdateThemeWorkGuide,type WorkGuideContent} from '../../domain/theme-work-guide';
import {KnowledgeError,knowledgeDigest} from '../knowledge-foundation';
import {initialWorkGuide,workGuideSafety} from '../theme-work-guide-content';
import {boundedManagementHistory,managementGuideBody,managementGuideIndex} from './theme-work-guide-management';
import {workGuideTechnical} from '../theme-work-guide-technical';
import {isSiteOperator} from './site-operations';
import {memberTransaction} from './operations';

const id=THEME_QUALITY_GUIDE_ID,target='68213251-15c8-4e9c-9ca5-2bd60636abb4';
const conflict=(message:string,code:string)=>new KnowledgeError(message,409,code);
const notFound=()=>new KnowledgeError('その版のガイドはありません。',404,'GUIDE_NOT_FOUND');
export async function lockThemeQualityGuide(c:PoolClient,shared=false){
 await c.query(shared
  ?"SELECT pg_advisory_xact_lock_shared(hashtextextended('site-theme-quality-guide',0))"
  :"SELECT pg_advisory_xact_lock(hashtextextended('site-theme-quality-guide',0))");
}
async function authorize(c:PoolClient,owner:string){
 if(!isSiteOperator(owner)||!(await c.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[owner])).rowCount)
  throw new KnowledgeError('運営アカウントで接続してください。',403,'OPERATOR_REQUIRED');
}
async function guideRow(c:Pool|PoolClient,revision?:number){
 return (await c.query('SELECT * FROM site_editorial_guide_version WHERE guide_id=$1 AND ($2::integer IS NULL OR revision=$2) ORDER BY revision DESC LIMIT 1',[id,revision??null])).rows[0];
}
function markdown(row:QueryResultRow){
 const value:WorkGuideContent|undefined=row.work_guide;
 if(!value)return row.markdown as string;
 return ['# Plunode テーマ制作ガイドライン',value.required.principles,
  ...value.sections.map(section=>'## '+section.key+'\n\n'+section.markdown),
  '## 独立した見直し\n\n'+value.required['whole-theme-review'],
  '## 画面証拠\n\n対象言語でPC・スマートフォンを確認する。追加必須言語: '+value.evidence.requiredLocales.join(', ')+'。追加必須画面: '+value.evidence.requiredScreens.join(', ')+'。',
  ...value.assistance.filter(rule=>rule.enabled&&!rule.profiles.length&&!rule.phases.length&&!rule.focuses.length).map(rule=>'## 運用補助 '+rule.key+'\n\n'+rule.markdown),
 ].join('\n\n');
}
function version(row:QueryResultRow){
 return {id,revision:Number(row.revision),markdown:markdown(row),reason:row.reason,restoredFrom:row.restored_from??null,updatedAt:new Date(row.created_at).toISOString()};
}
function guideVersions(row?:QueryResultRow){
 return {id,revision:row?.revision??0,criteriaRevision:row?.criteria_revision??row?.revision??0,evidenceRevision:row?.evidence_revision??row?.revision??0};
}
export async function currentThemeGuideVersions(c:Pool|PoolClient,dynamic=false){
 const row=await guideRow(c);
 return dynamic?guideVersions(row):{id,revision:row?.revision??0};
}
export async function themeGuideRevision(c:PoolClient,revision:number){
 const row=await guideRow(c,revision);
 return row?guideVersions(row):null;
}
export async function currentThemeEvidenceRequirements(c:Pool|PoolClient){
 const row=await guideRow(c);
 return {versions:guideVersions(row),requirements:(row?.work_guide as WorkGuideContent|undefined)?.evidence??initialWorkGuide.evidence};
}
async function history(c:PoolClient,currentRevision:number,historyBefore?:number,includeImpact=false){
 const rows=(await c.query(`SELECT revision,reason,restored_from,created_at,created_by${includeImpact?',criteria_revision,evidence_revision,changed_sections':''} FROM site_editorial_guide_version WHERE guide_id=$1 AND revision<=$2 AND ($3::integer IS NULL OR revision<$3) ORDER BY revision DESC LIMIT 21`,[id,currentRevision,historyBefore??null])).rows;
 return {history:rows.slice(0,20).map(row=>({revision:row.revision,reason:row.reason,restoredFrom:row.restored_from??null,updatedAt:new Date(row.created_at).toISOString(),
  ...(includeImpact?{...guideVersions(row),changedSections:row.changed_sections??['legacy-full-text'],updatedBy:row.created_by}:{}),
 })),nextHistoryBefore:rows.length>20?rows[19].revision:null};
}
async function read(c:PoolClient,input:ReadThemeQualityGuide){
 const current=await guideRow(c);
 const selected=input.revision?await guideRow(c,input.revision):current;
 if(!selected&&input.revision)throw notFound();
 if(!selected)return {id,revision:0,currentRevision:0,markdown:null,updatedAt:null,history:[],nextHistoryBefore:null};
 return {...version(selected),currentRevision:current.revision,...await history(c,current.revision,input.historyBefore)};
}
function indexed(content:WorkGuideContent){
 return new Map<string,unknown>([
  ...Object.entries(content.required),
  ['evidence',content.evidence],
  ...content.sections.map(section=>[section.key,section] as const),
  ...content.assistance.map(rule=>['assistance-'+rule.key,rule] as const),
 ]);
}
function revisionImpact(previous:QueryResultRow|undefined,content:WorkGuideContent,revision:number){
 const next=indexed(content),before=previous?.work_guide?indexed(previous.work_guide):new Map();
 const changedSections=[...new Set([...before.keys(),...next.keys()])].filter(key=>knowledgeDigest(before.get(key)??null)!==knowledgeDigest(next.get(key)??null));
 const evidenceChanged=changedSections.includes('evidence');
 const criteriaChanged=evidenceChanged||changedSections.some(key=>key==='principles'||key==='whole-theme-review');
 const sectionVersions=Object.fromEntries([...next.keys()].map(key=>[key,changedSections.includes(key)?revision:previous?.section_versions?.[key]??revision]));
 return {changedSections,sectionVersions,criteriaRevision:criteriaChanged?revision:previous?.criteria_revision??revision,
  evidenceRevision:evidenceChanged?revision:previous?.evidence_revision??revision};
}
async function save(c:PoolClient,owner:string,input:UpdateThemeQualityGuide|UpdateThemeWorkGuide,structured:boolean){
 await lockThemeQualityGuide(c);
 const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const action=structured?'update-theme-work-guide':'update-theme-quality-guide';
 const receipt=(await c.query('SELECT action,payload_hash,result FROM site_operation_request WHERE operator_id=$1 AND request_id=$2',[owner,input.requestId])).rows[0];
 if(receipt){
  if(receipt.action!==action||receipt.payload_hash!==digest)throw conflict('同じ受付IDの内容が異なります。','REQUEST_REUSED');
  const row=await guideRow(c,receipt.result.revision);
  return {...version(row!),requestId:input.requestId,replayed:true,...(structured?{versions:guideVersions(row),changedSections:row?.changed_sections??['legacy-full-text']}: {})};
 }
 const current=await guideRow(c);
 if((current?.revision??0)!==input.expectedRevision)throw conflict('別の会話から更新されています。最新の本文と版を読み直してください。','GUIDE_CHANGED');
 const restored=input.restoreRevision?await guideRow(c,input.restoreRevision):undefined;
 if(input.restoreRevision&&!restored)throw notFound();
 const content:WorkGuideContent|undefined=restored?.work_guide??('changes' in input?input.changes:undefined);
 const body=content?markdown({work_guide:content}):restored?.markdown??('markdown' in input?input.markdown:undefined);
 if(!body||body.length>160000||Buffer.byteLength(body)>512000)
  throw new KnowledgeError('ガイド本文は160000文字かつ512KB以下にしてください。',400,'GUIDE_TOO_LARGE');
 const revision=input.expectedRevision+1, base=[id,revision,body,input.reason,input.restoreRevision??null,owner];
 const impact=content?revisionImpact(current,content,revision):undefined;
 const row=(content&&impact
  ?await c.query('INSERT INTO site_editorial_guide_version(guide_id,revision,markdown,reason,restored_from,created_by,work_guide,criteria_revision,evidence_revision,changed_sections,section_versions) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [id,revision,input.reason,input.restoreRevision??null,owner,JSON.stringify(content),impact.criteriaRevision,impact.evidenceRevision,impact.changedSections,JSON.stringify(impact.sectionVersions)])
  :await c.query('INSERT INTO site_editorial_guide_version(guide_id,revision,markdown,reason,restored_from,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',base)).rows[0];
 const value=version(row);
 await c.query(`INSERT INTO site_operation_request(operator_id,request_id,payload_hash,action,target_kind,target_id,reason,result)
  VALUES($1,$2,$3,$4,'editorial-guide',$5,$6,$7)`,[owner,input.requestId,digest,action,target,input.reason,JSON.stringify({id,revision,updatedAt:value.updatedAt,requestId:input.requestId})]);
 return {...value,requestId:input.requestId,replayed:false,...(structured?{versions:guideVersions(row),changedSections:row.changed_sections??['legacy-full-text']}: {})};
}

async function readWork(c:PoolClient,owner:string,origin:string,input:ReadThemeWorkGuide){
 const current=await guideRow(c);
 if(input.revision===0&&(!input.managementBody||current))throw notFound();
 const row=input.revision===0?undefined:input.revision?await guideRow(c,input.revision):current;
 if(!row&&input.revision)throw notFound();
 if((input.revision||input.historyBefore||input.managementBody)&&!input.management)throw new KnowledgeError('履歴の取得はmanagementを指定してください。',400,'GUIDE_HISTORY_REQUIRES_MANAGEMENT');
 if(input.managementBody&&input.revision===undefined)
  throw new KnowledgeError('本文取得には一覧で確認したrevisionを指定してください。',400,'GUIDE_BODY_REVISION_REQUIRED');
 let recovery=false;
 if(input.caseId){
  const item=(await c.query('SELECT phase,theme_id FROM theme_production.cases WHERE id=$1 AND owner_id=$2 AND origin=$3 AND environment=$4',
   [input.caseId,owner,origin,origin==='https://plunode.net'?'production':'beta'])).rows[0];
  if(!item)throw new KnowledgeError('制作案件がありません。',404,'NOT_FOUND');
  if(item.phase!==input.phase)throw conflict('案件の現在の工程を読み直してください。','PRODUCTION_PHASE_MISMATCH');
  recovery=!!(await c.query("SELECT 1 FROM theme_production.submissions WHERE case_id=$1 AND state NOT IN ('applied','withdrawn') LIMIT 1",[input.caseId])).rowCount;
  if(!recovery&&item.theme_id)recovery=true;
 }
 const content:WorkGuideContent=row?.work_guide??initialWorkGuide;
 const focuses=new Set([...input.focuses,...(recovery?['recovery']:[]),...(!input.caseId&&input.phase==='production'?['planning']:[])]);
 const mode=row?.work_guide?'structured':'full-text';
 if(input.management){
  const base={contractVersion:2,phase:input.phase,mode,versions:guideVersions(row),currentRevision:current?.revision??0};
  const legacyMarkdown=row?.markdown??null;
  if(input.managementBody){
   const {key,offset}=input.managementBody;
   return {...base,body:managementGuideBody(content,legacyMarkdown,key,offset)};
  }
  const {legacyMarkdown:legacy,...index}=managementGuideIndex(content,legacyMarkdown);
  const revisions=await history(c,current?.revision??0,input.historyBefore,true);
  return {...base,required:{
    principles:index.required.principles,...(input.phase==='review'?{'whole-theme-review':index.required['whole-theme-review']}:{}),
   },
   safety:[...(!input.caseId&&input.phase==='production'?[workGuideSafety.planning]:[]),workGuideSafety[input.phase]],
   technical:{fullContract:'get_theme_authoring_guide',workGuidance:'Use read_theme_work_guide without management for phase-specific schemas.'},
   supportedFocuses:workGuideFocuses,unknownFocuses:input.focuses.filter(value=>!workGuideFocuses.some(key=>key===value)),
   content:row?.work_guide?index:null,starter:row?.work_guide?undefined:index,
   ...(legacy?{markdown:legacy.markdown??null,legacyBodyKey:legacy.bodyKey}:{}),
   bodyRead:{tool:'read_theme_work_guide',management:true,revision:row?.revision??0,offset:0,
    instructions:'A bodyKey means the full field is available via managementBody:{key,offset}. Keep the selected revision for every part; concatenate body.text in order until nextOffset is null. Parse assistance bodies as JSON before updating.'},
   ...boundedManagementHistory(revisions.history,revisions.nextHistoryBefore),
  };
 }
 const selected=content.sections.filter(section=>section.focuses.some(focus=>focuses.has(focus)));
 const optional=(key:string,body:string)=>{
  const revision=row?.section_versions?.[key]??row?.revision??0;
  return {key,revision,...(revision>0&&input.knownVersions?.[key]===revision?{}:{markdown:body})};
 };
 return {
  contractVersion:2,phase:input.phase,mode,
  versions:guideVersions(row),currentRevision:current?.revision??0,
  supportedFocuses:workGuideFocuses,unknownFocuses:input.focuses.filter(value=>!workGuideFocuses.some(key=>key===value)),
  required:{principles:content.required.principles,...(input.phase==='review'?{'whole-theme-review':content.required['whole-theme-review']}: {})},
  safety:[...(!input.caseId&&input.phase==='production'?[workGuideSafety.planning]:[]),workGuideSafety[input.phase]],
  technical:workGuideTechnical(input.phase,focuses),
  evidence:content.evidence,
  sections:row?.work_guide?selected.map(section=>optional(section.key,section.markdown)):[],
  assistance:row?.work_guide?content.assistance.filter(rule=>rule.enabled&&(!rule.profiles.length||input.profile&&rule.profiles.includes(input.profile))&&
   (!rule.phases.length||rule.phases.includes(input.phase))&&(!rule.focuses.length||rule.focuses.some(focus=>focuses.has(focus))))
   .map(rule=>({...optional('assistance-'+rule.key,rule.markdown),observation:rule.observation,revisitOn:rule.revisitOn,retireWhen:rule.retireWhen})):[],
  ...(!row?.work_guide?{markdown:row?.markdown??null}: {}),
 };
}

export function createThemeQualityGuides(pool:Pool){return {
 read:(owner:string,raw:ReadThemeQualityGuide={})=>memberTransaction(pool,async c=>{await authorize(c,owner);return read(c,readThemeQualityGuideSchema.parse(raw));}),
 update:(owner:string,raw:UpdateThemeQualityGuide)=>memberTransaction(pool,async c=>{await authorize(c,owner);return save(c,owner,updateThemeQualityGuideSchema.parse(raw),false);}),
 readWork:(owner:string,origin:string,raw:ReadThemeWorkGuide)=>memberTransaction(pool,async c=>{await authorize(c,owner);return readWork(c,owner,origin,readThemeWorkGuideSchema.parse(raw));}),
 updateWork:(owner:string,raw:UpdateThemeWorkGuide)=>memberTransaction(pool,async c=>{await authorize(c,owner);return save(c,owner,updateThemeWorkGuideSchema.parse(raw),true);}),
};}
