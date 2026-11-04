import {translationTargetKey} from "./knowledge-translation";
import {translationTextLimit} from "./knowledge-translation";
import {knowledgeEntityContentSchema,knowledgeSourceContentSchema,knowledgeRecordContentSchema,type KnowledgePin} from "./knowledge-foundation";
import type {KnowledgeSubmissionContent,KnowledgeSubmissionContext} from "./knowledge-submission";
export function submissionIntentIssues(content:KnowledgeSubmissionContent,context?:KnowledgeSubmissionContext):string[]{
 const issues:string[]=[];
 if(content.schemaVersion!==2)issues.push("投稿先と操作を確認してください。現在の入力欄から申請内容を選び直せます。");
 if(content.schemaVersion===2&&!content.attribution)issues.push("公開する投稿者の表示を選んでください。");
 const entities=new Map(content.entities.map(e=>[e.id,e]));
 const same=(a:KnowledgePin|undefined,b:KnowledgePin|undefined)=>!!a&&!!b&&a.id===b.id&&a.revision===b.revision;
 for(const [index,item] of content.items.entries()){
  const prefix=`項目${index+1}：`,r=item.record,op=item.operation;
  const fail=(message:string)=>issues.push(prefix+message);
  if(op==='translate-text'){
   const v=item.translation,original=context?.texts?.find(t=>v&&translationTargetKey(t.target)===translationTargetKey(v.target));
   if(content.items.length!==1)fail('訳文は元の事実と分け、一件ずつ投稿してください。');
   if(!v||!original)fail('翻訳する原文を読み直してください。');
   else{if(!v.text.trim()||v.text.length>translationTextLimit(v.target))fail('訳文の内容と文字数を確認してください。');if(original.language?.tag===v.language)fail('原文と異なる訳文の言語を選んでください。');if((original.translation?.revision??0)!==v.expectedRevision)fail('訳文の最新版を読み直してください。');}
   continue;
  }
  if(item.translation)fail('訳文の投稿は翻訳の入口から行ってください。');
  const parsed=knowledgeRecordContentSchema.safeParse(r);if(!parsed.success){
   const issue=parsed.error.issues[0],field=issue?.path[0];
   if(field==="evidence")fail(r.evidence.length===0?"公開するには、事実を確かめた資料を1件以上追加してください。草稿は資料なしでも保存できます。":issue?.path.includes("locator")?"資料の「書かれている場所」を入力してください。":issue?.path.includes("excerpt")?"資料の「その部分の原文」は4000文字以内で入力してください。":"資料の内容を確認してください。資料は20件まで追加できます。");
   else if(field==="assertion")fail(op==="correct-record"?"訂正後の内容を1〜4000文字で入力してください。":"登録する事実を1〜4000文字で入力してください。");
   else if(field==="times")fail(`時期${typeof issue?.path[1]==="number"?issue.path[1]+1:""}の日付・範囲を確認してください。時期は16件まで追加できます。`);
   else if(field==="relation")fail("矢印に表示する言葉を200文字以内で入力してください。");
   else if(field==="scope")fail("事実の補足は3000文字以内で入力してください。");
   else fail("事実・対象・資料・時期の入力を確認してください。");
  }
  for(const id of [r.subjectId,r.objectId]){const e=content.entities.find(e=>e.id===id);if(e&&!knowledgeEntityContentSchema.safeParse(e.content).success)fail("人物・作品などの名前と分類を確認してください。");}
  for(const evidence of r.evidence){const source=content.sources.find(s=>s.id===evidence.source.id);if(source&&!knowledgeSourceContentSchema.safeParse(source.content).success)fail("資料名と、正しいURLまたは本の情報を記入してください。");}
  if(!op){fail("何を追加・訂正するか選んでください。");continue;}
  if(op==='create-entity'){
   if(r.kind!=='note'||!r.subjectId||!entities.has(r.subjectId)||r.objectId)fail("新しい対象の名前・分類と、その対象についての事実を入力してください。");
  }else if(op==='create-relation'){
   if(r.kind!=='relation'||!r.subjectId||!r.objectId||!r.relation.trim())fail("つながりの両端と、矢印に表示する言葉を入力してください。");
  }else if(op==='add-information'){
   if(r.kind==='relation')fail("出来事・補足の情報の種類を確認してください。");
   const a=item.about;if(!a){fail("何についての情報か、対象・関係・テーマを選んでください。");continue;}
   if(a.kind==='entity'&&(r.subjectId!==a.id||r.objectId))fail("選択した対象に情報を結び付けてください。");
   if(a.kind==='record'&&!same(r.aboutRecord,a))fail("補足する関係の参照を確認してください。");
   if(a.kind==='theme'&&(r.aboutTheme!==a.id||!item.themes?.some(t=>same(t,a))))fail("追加先のテーマを確認してください。");
  }else{
   if(!item.correction||!same(item.correction,item.about?.kind==='record'?item.about:undefined))fail("追加・訂正する元の関係を選んでください。");
   const old=context?.records?.find(v=>same(v,item.correction));
   if(!old)fail("元の記録をサーバーから読み直してください。");
   else if(op==='add-evidence'){
    const fields=['kind','subjectId','objectId','assertion','relation','polarity','scope','times','aboutRecord','aboutTheme'] as const;
    if(fields.some(k=>JSON.stringify(r[k]??null)!==JSON.stringify(old.content[k]??null)))fail("根拠の追加では元の事実や意味を変更できません。情報の訂正を選んでください。");
    if(old.content.evidence.some(e=>!r.evidence.some(v=>v.id===e.id&&JSON.stringify(v)===JSON.stringify(e))))fail("元の根拠を残したまま、新しい根拠を追加してください。");
    if(!r.evidence.some(e=>!old.content.evidence.some(v=>v.id===e.id)))fail("新しい根拠を追加してください。");
   }
  }
  if((op==='add-information'||op==='correct-record'||op==='add-evidence')&&item.about?.kind==='record'){
   const baseline=context?.records?.find(v=>same(v,item.about));
   if(!baseline)fail("参照する記録を読み直してください。");
  }
  if(r.kind!=='relation'&&!r.subjectId&&!r.objectId&&!r.aboutRecord&&!r.aboutTheme)fail("公開後に辿れる対象・関係・テーマが必要です。");
 }
 return [...new Set(issues)];
}
export function submissionReviewEvidence(item:KnowledgeSubmissionContent['items'][number],context?:KnowledgeSubmissionContext){
 const old=item.operation==='add-evidence'?context?.records?.find(r=>r.id===item.correction?.id&&r.revision===item.correction?.revision):undefined;
 return old?item.record.evidence.filter(e=>!old.content.evidence.some(v=>v.id===e.id)):item.record.evidence;
}
