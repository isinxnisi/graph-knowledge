/** Add sourced reading context to a new immutable beta edition. Never updates an existing snapshot. */
import {readFile,writeFile} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import {Pool} from "pg";
import rows from "../data/theme-reading-webb-context.json";
import input from "../data/theme-reading-webb.json";
import english from "../data/theme-reading-webb-english.json";
import {knowledgeOriginalText,type KnowledgeTextTarget} from "../lib/domain/knowledge-translation";
import {themeTimelineTextTargets} from "../lib/domain/knowledge-timeline-text";
import {translationId} from "../lib/server/knowledge-translation-storage";
import {createKnowledgeFoundationService} from "../lib/server/knowledge-foundation";
const config=JSON.parse(await readFile(process.env.HOME+"/.local/state/plunode-previews/beta-knowledge.json","utf8"));
const url=new URL(config.KNOWLEDGE_DATABASE_URL);
if(url.hostname!=="127.0.0.1"||url.port!=="55476"||url.pathname!=="/plunode_knowledge75_beta")throw Error("Dedicated beta knowledge DB required");
const pool=new Pool({connectionString:url.toString(),max:2}),service=createKnowledgeFoundationService(pool,{prepareSchema:async()=>{}}),actor={kind:"operator" as const,id:"theme-reading-editorial-preview"};
const run=(cmd:Record<string,unknown>)=>service.execute(actor,{requestId:randomUUID(),reason:"参考画像の不足是正。NASA資料の解説を新しい比較版へ追加。旧版を保持",...cmd});
try{
 const before=await service.resolveTheme(actor,input.id,1),head=await service.get(actor,"theme",input.id);
 if(head.revision===1){
  const missing=[];
  for(const row of rows){const old=await service.get(actor,"record",row.id).catch(()=>null);if(!old)missing.push({id:row.id,content:row.content});else if(old.revision!==1)throw Error("Editorial note changed; review required");}
  if(missing.length)await run({action:"create-bundle",records:missing,entityPins:before.theme.content.entityPins});
  await run({action:"edit-theme",id:input.id,expectedRevision:1,title:before.theme.content.title,description:before.theme.content.description,textLanguages:before.theme.content.textLanguages,recordPins:[...before.theme.content.recordPins,...rows.map(row=>({id:row.id,revision:1}))],timeline:before.theme.content.timeline,initialView:before.theme.content.initialView});
 }else if(head.revision!==2)throw Error("Theme has newer changes; review required");
 const result=await service.resolveTheme(actor,input.id,2);
 const targets:KnowledgeTextTarget[]=[{kind:"theme",id:input.id,revision:2,field:"title"},{kind:"theme",id:input.id,revision:2,field:"description"},...themeTimelineTextTargets(result.theme),...rows.map(row=>({kind:"record" as const,id:row.id,revision:1,field:"assertion" as const}))];
 let added=0;
 for(const target of targets){
  const version=target.kind==="theme"?result.theme:result.snapshot.records.find(v=>v.id===target.id)!;
  const original=knowledgeOriginalText(target,version.content).text;
  const text=target.kind==="record"?rows.find(v=>v.id===target.id)!.english:target.field==="title"?input.englishTitle:target.field==="description"?input.englishDescription:(english as Record<string,string>)[original]??(original==="打上げ・展開から最初の観測へ"?"From launch and deployment to the first observations":undefined);
  if(!text)throw Error("Missing checked English text: "+target.field);
  const exists=(await pool.query("SELECT id FROM knowledge75.text_translation_heads WHERE id=$1",[translationId(target,"en")])).rowCount;
  if(exists)continue;
  await run({action:"accept-translation",target,language:"en",text,originalHash:createHash("sha256").update(original).digest("hex"),expectedRevision:0});added++;
 }
 const unchanged=JSON.stringify(before.snapshot)===JSON.stringify((await service.resolveTheme(actor,input.id,1)).snapshot);
 if(!unchanged)throw Error("Old snapshot changed");
 await writeFile(".local/reading-context-verified.json",JSON.stringify(result),{mode:0o600});
 console.log(JSON.stringify({theme:input.id,revision:result.theme.revision,contextNotes:rows.length,translationsAdded:added,oldSnapshotUnchanged:unchanged}));
}finally{await pool.end();}
