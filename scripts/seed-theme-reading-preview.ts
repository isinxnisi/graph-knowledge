/** Additive, repeatable representative-theme setup. Never touches the member DB, KG, schedules or existing Theme editions. */
import {readFile,writeFile} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import {Pool} from "pg";
import input from "../data/theme-reading-webb.json";
import english from "../data/theme-reading-webb-english.json";
import {knowledgeOriginalText,type KnowledgeTextTarget} from "../lib/domain/knowledge-translation";
import {recordTimeTextTargets,themeTimelineTextTargets} from "../lib/domain/knowledge-timeline-text";
import {translationId} from "../lib/server/knowledge-translation-storage";
import {createKnowledgeFoundationService} from "../lib/server/knowledge-foundation";
const config=JSON.parse(await readFile(process.env.HOME+"/.local/state/plunode-previews/beta-knowledge.json","utf8"));
const url=new URL(config.KNOWLEDGE_DATABASE_URL);if(url.hostname!=="127.0.0.1"||url.port!=="55476"||url.pathname!=="/plunode_knowledge75_beta")throw Error("Dedicated beta knowledge DB required");
const pool=new Pool({connectionString:url.toString(),max:2}),service=createKnowledgeFoundationService(pool,{prepareSchema:async()=>{}}),actor={kind:"operator" as const,id:"theme-reading-editorial-preview"};
const run=(cmd:Record<string,unknown>)=>service.execute(actor,{requestId:randomUUID(),reason:"2026-11-10 閲覧刷新の根拠付き比較テーマ。既存原本を保持",...cmd});
try{
 const existing=await service.get(actor,"theme",input.id).catch(()=>null);
 if(existing){console.log(JSON.stringify({replayed:true,id:existing.id,revision:existing.revision}));}
 else{
 const original=await service.resolveTheme(actor,input.sourceTheme.id,input.sourceTheme.revision);
 await run({action:"create-bundle",sources:input.sources,records:input.records.map(r=>({id:r.id,content:r.content})),entityPins:original.snapshot.entities.map(({id,revision})=>({id,revision}))});
 const timeline=structuredClone(original.theme.content.timeline!);timeline.axes[0].label="打上げ・展開から最初の観測へ";
 for(const r of input.records)for(const t of r.content.times??[])timeline.placements.push({recordId:r.id,timeId:t.id,axisId:"calendar"});
 await run({action:"create-theme",id:input.id,title:input.title,description:input.description,textLanguages:{title:{tag:"ja",basis:"declared"},description:{tag:"ja",basis:"declared"}},recordPins:[...original.theme.content.recordPins,...input.records.map(({id})=>({id,revision:1}))],entityPins:original.theme.content.entityPins,sourcePins:[...original.theme.content.sourcePins,...input.sources.map(({id})=>({id,revision:1}))],timeline,initialView:"split"});
 const translate=async(target:Record<string,unknown>,text:string,originalText:string)=>run({action:"accept-translation",target,language:"en",text,originalHash:createHash("sha256").update(originalText).digest("hex"),expectedRevision:0});
 await translate({kind:"theme",id:input.id,revision:1,field:"title"},input.englishTitle,input.title);
 await translate({kind:"theme",id:input.id,revision:1,field:"description"},input.englishDescription,input.description);
 await translate({kind:"theme",id:input.id,revision:1,field:"axisLabel",axisId:"calendar"},"From launch and deployment to the first observations",timeline.axes[0].label);
 for(const r of input.records){await translate({kind:"record",id:r.id,revision:1,field:"assertion"},r.english,r.content.assertion);}
 const final=await service.resolveTheme(actor,input.id,1);await writeFile(".local/reading-theme-verified.json",JSON.stringify(final),{mode:0o600});
 console.log(JSON.stringify({created:true,id:input.id,revision:1,records:final.snapshot.records.length,sources:final.snapshot.sources.length,existingEditionUnchanged:JSON.stringify((await service.resolveTheme(actor,input.sourceTheme.id,input.sourceTheme.revision)).snapshot)===JSON.stringify(original.snapshot)}));
 }
 const read=await service.resolveTheme(actor,input.id,1),targets:KnowledgeTextTarget[]=[...themeTimelineTextTargets(read.theme),...read.snapshot.entities.map(e=>({kind:"entity" as const,id:e.id,revision:e.revision,field:"name" as const})),...read.snapshot.records.flatMap(r=>[...recordTimeTextTargets(r),...(["assertion","scope","relation"] as const).map(field=>({kind:"record" as const,id:r.id,revision:r.revision,field}))])];
 let translationsAdded=0;
 for(const target of targets){const version=target.kind==="theme"?read.theme:(target.kind==="entity"?read.snapshot.entities:read.snapshot.records).find(v=>v.id===target.id)!;let original;try{original=knowledgeOriginalText(target,version.content).text;}catch{continue;}const text=(english as Record<string,string>)[original];if(!text)continue;const id=translationId(target,"en"),head=(await pool.query("SELECT id FROM knowledge75.text_translation_heads WHERE id=$1",[id])).rows[0];if(head)continue;await run({action:"accept-translation",target,language:"en",text,originalHash:createHash("sha256").update(original).digest("hex"),expectedRevision:0});translationsAdded++;}
 console.log(JSON.stringify({translationsAdded,originalThemeAndRecordRevisionsUnchanged:true}));

}finally{await pool.end();}
