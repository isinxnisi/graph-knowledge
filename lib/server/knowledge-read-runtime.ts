import {ThemeError,themeGuard} from "./theme-workbench";
import {KnowledgeError} from "./knowledge-foundation";
import {knowledgeDeployment,validateKnowledgeDatabase} from "./knowledge-deployment";
function deployment(){try{return knowledgeDeployment();}catch(e){throw new ThemeError(e instanceof KnowledgeError?e.message:"公開読取の設定を確認してください",503);}}
/** Managed reads are public projections, independent of member/worker write permissions. */
export function knowledgeReadGuard(request?:Request){
 const profile=deployment();
 if(profile){
  if(!profile.capabilities.includes("public-read")||process.env.KNOWLEDGE_PUBLICATION_ENABLED!=="1")throw new ThemeError("この機能は利用できません",404);
  if(request&&!profile.hosts.includes(request.headers.get("host")??""))throw new ThemeError("この環境では利用できません",403);
  return;
 }
 if(process.env.GRAPH_DEPLOYMENT==="production")throw new ThemeError("公開読取の配置設定が必要です",503);
 if(process.env.KNOWLEDGE_RUNTIME!=="beta"){themeGuard(request);return;}
 if(process.env.KNOWLEDGE_PUBLICATION_ENABLED!=="1"||process.env.KNOWLEDGE_PUBLIC_ORIGIN!=="https://graph-beta.isinxnisi.com")throw new ThemeError("公開読取のβ設定が一致しません",503);
 if(request&&!['graph-beta.isinxnisi.com','localhost:3200','127.0.0.1:3200'].includes(request.headers.get("host")??""))throw new ThemeError("この環境では利用できません",403);
}
export function knowledgeReadConfiguration(){
 knowledgeReadGuard();const profile=deployment(),beta=process.env.KNOWLEDGE_RUNTIME==="beta";
 const url=new URL(((profile||beta)?process.env.KNOWLEDGE_DATABASE_URL:process.env.THEME_DATABASE_URL)??"");
 if(profile){try{validateKnowledgeDatabase(profile,url.toString());}catch{throw new ThemeError("公開読取のDB設定が一致しません",503);}}
 else if(url.hostname!=="127.0.0.1"||url.port!==(beta?"55476":"55475")||url.pathname!==(beta?"/plunode_knowledge75_beta":"/plunode_theme75"))throw new ThemeError("公開読取のDB設定が一致しません",503);
 const neo=profile?.neo4j??(beta?"bolt://127.0.0.1:7699":"bolt://127.0.0.1:7698");
 if(process.env.KNOWLEDGE_PUBLICATION_ENABLED!=="1"||process.env.KNOWLEDGE_NEO4J_URL!==neo||!process.env.KNOWLEDGE_NEO4J_PASSWORD)throw new ThemeError("公開読取の接続設定を確認してください",503);
 return {beta,managed:!!profile||beta,databaseUrl:url.toString(),neo,password:process.env.KNOWLEDGE_NEO4J_PASSWORD};
}
