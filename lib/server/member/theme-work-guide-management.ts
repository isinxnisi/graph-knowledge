import type {WorkGuideContent} from '../../domain/theme-work-guide';
import {KnowledgeError} from '../knowledge-foundation';

const bodyBudget=6000;
const jsonBytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value));

/** The index carries the complete ordered structure, with references for bodies
 * that would make one MCP result too large. Offsets use JavaScript string units. */
export function managementGuideIndex(content:WorkGuideContent,legacyMarkdown?:string|null){
 let remaining=bodyBudget;
 const allRequiredBytes=jsonBytes(content.required);
 const required=Object.fromEntries(Object.entries(content.required).map(([key,value])=>[
  key,allRequiredBytes<=2400?value:{bodyKey:key},
 ]));
 if(allRequiredBytes<=2400)remaining-=allRequiredBytes;
 const include=(key:string,markdown:string)=>{
  const size=jsonBytes(markdown);
  if(size>remaining)return {bodyKey:key};
  remaining-=size;
  return {markdown};
 };
 const sections=content.sections.map(({key,focuses,markdown})=>({key,focuses,...include(key,markdown)}));
 const assistance=content.assistance.map(rule=>({key:rule.key,enabled:rule.enabled,bodyKey:'assistance-'+rule.key}));
 return {required,sections,assistance,evidence:content.evidence,
  ...(legacyMarkdown?{legacyMarkdown:include('legacy',legacyMarkdown)}:{})};
}

export function managementGuideBody(content:WorkGuideContent,legacyMarkdown:string|null,bodyKey:string,offset:number){
 const rule=content.assistance.find(value=>'assistance-'+value.key===bodyKey);
 const body=bodyKey==='legacy'?legacyMarkdown
  :bodyKey==='principles'||bodyKey==='whole-theme-review'?content.required[bodyKey]
  :rule?JSON.stringify(rule):content.sections.find(value=>value.key===bodyKey)?.markdown;
 if(body==null)throw new KnowledgeError('指定のガイド本文がありません。',404,'GUIDE_BODY_NOT_FOUND');
 if(offset>=body.length||(offset>0&&/[\uDC00-\uDFFF]/.test(body[offset])))
  throw new KnowledgeError('本文の次の取得位置を確認してください。',400,'GUIDE_BODY_OFFSET');
 let bytes=0,end=offset;
 for(const character of body.slice(offset)){
  bytes+=jsonBytes(character)-2;
  if(bytes>bodyBudget)break;
  end+=character.length;
 }
 return {key:bodyKey,format:rule?'json':'markdown',offset,text:body.slice(offset,end),nextOffset:end<body.length?end:null};
}

export function boundedManagementHistory<T extends {revision:number}>(entries:T[],nextHistoryBefore:number|null){
 const history:T[]=[];
 let remaining=4000;
 for(const entry of entries){
  const bytes=jsonBytes(entry);
  if(history.length&&bytes>remaining)return {history,nextHistoryBefore:history[history.length-1].revision};
  history.push(entry);
  remaining-=bytes;
 }
 return {history,nextHistoryBefore};
}
