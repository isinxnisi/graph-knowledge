/** Revise only owned comparison notes and create a new immutable beta Theme edition. */
import {readFile} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {Pool} from "pg";
import rows from "../data/theme-reading-webb-narrative.json";
import input from "../data/theme-reading-webb.json";
import english from "../data/theme-reading-webb-english.json";
import {createKnowledgeFoundationService} from "../lib/server/knowledge-foundation";
import {knowledgeOriginalText,type KnowledgeTextTarget} from "../lib/domain/knowledge-translation";
import {themeTimelineTextTargets} from "../lib/domain/knowledge-timeline-text";
import {translationId} from "../lib/server/knowledge-translation-storage";
const cfg=JSON.parse(await readFile(process.env.HOME+"/.local/state/plunode-previews/beta-knowledge.json","utf8")),url=new URL(cfg.KNOWLEDGE_DATABASE_URL);
if(url.hostname!=="127.0.0.1"||url.port!=="55476"||url.pathname!=="/plunode_knowledge75_beta")throw Error("Dedicated beta knowledge DB required");
const pool=new Pool({connectionString:url.toString(),max:2}),service=createKnowledgeFoundationService(pool,{prepareSchema:async()=>{}}),actor={kind:"operator" as const,id:"theme-reading-editorial-preview"};
const run=(cmd:Record<string,unknown>)=>service.execute(actor,{requestId:randomUUID(),reason:"読む動機が伝わる文章へ根拠付き比較noteを訂正。旧版を保持",...cmd});
try{
 const old1=await service.resolveTheme(actor,input.id,1),old2=await service.resolveTheme(actor,input.id,2),head=await service.get(actor,"theme",input.id);
 if(head.revision===2){
  for(const row of rows){if(!row.id.startsWith("reading-20261110:webb:"))throw Error("Not an owned comparison note");const current=await service.get(actor,"record",row.id);if(current.revision===1)await run({action:"correct",kind:"record",id:row.id,expectedRevision:1,content:row.content});else if(current.revision!==2)throw Error("Note has newer changes");}
  await run({action:"edit-theme",id:input.id,expectedRevision:2,title:old2.theme.content.title,description:old2.theme.content.description,textLanguages:old2.theme.content.textLanguages,recordPins:old2.theme.content.recordPins.map(pin=>rows.some(row=>row.id===pin.id)?{...pin,revision:2}:pin),timeline:old2.theme.content.timeline,initialView:old2.theme.content.initialView});
 }else if(head.revision!==3)throw Error("Theme has newer changes");
 const final=await service.resolveTheme(actor,input.id,3),targets:KnowledgeTextTarget[]=[{kind:"theme",id:input.id,revision:3,field:"title"},{kind:"theme",id:input.id,revision:3,field:"description"},...themeTimelineTextTargets(final.theme),...rows.map(row=>({kind:"record" as const,id:row.id,revision:2,field:"assertion" as const}))];let added=0;
 for(const target of targets){const version=target.kind==="theme"?final.theme:final.snapshot.records.find(v=>v.id===target.id)!;const original=knowledgeOriginalText(target,version.content).text;const text=target.kind==="record"?rows.find(row=>row.id===target.id)!.english:target.field==="title"?input.englishTitle:target.field==="description"?input.englishDescription:(english as Record<string,string>)[original]??(original==="打上げ・展開から最初の観測へ"?"From launch and deployment to the first observations":undefined);if(!text)throw Error("Missing checked English text");if((await pool.query("SELECT id FROM knowledge75.text_translation_heads WHERE id=$1",[translationId(target,"en")])).rowCount)continue;await run({action:"accept-translation",target,language:"en",text,originalHash:createHash("sha256").update(original).digest("hex"),expectedRevision:0});added++;}
 const preserved=JSON.stringify(old1.snapshot)===JSON.stringify((await service.resolveTheme(actor,input.id,1)).snapshot)&&JSON.stringify(old2.snapshot)===JSON.stringify((await service.resolveTheme(actor,input.id,2)).snapshot);if(!preserved)throw Error("Old snapshot changed");console.log(JSON.stringify({theme:input.id,revision:3,correctedNotes:rows.length,translationsAdded:added,oldSnapshotsPreserved:preserved}));
}finally{await pool.end();}
