import { ThemeError, themeGuard } from "./theme-workbench";
/** The beta exposes published reads only; the local operator guard stays unchanged. */
export function knowledgeReadGuard(request?:Request) {
 if(process.env.KNOWLEDGE_RUNTIME!=="beta"){themeGuard(request);return;}
 if(process.env.KNOWLEDGE_PUBLICATION_ENABLED!=="1"||process.env.KNOWLEDGE_PUBLIC_ORIGIN!=="https://graph-beta.isinxnisi.com")throw new ThemeError("公開読取のβ設定が一致しません",503);
 if(request){const host=request.headers.get("host");if(!["graph-beta.isinxnisi.com","localhost:3200","127.0.0.1:3200"].includes(host??""))throw new ThemeError("この環境では利用できません",403);}
}
export function knowledgeReadConfiguration(){
 knowledgeReadGuard();const beta=process.env.KNOWLEDGE_RUNTIME==="beta";
 const url=new URL((beta?process.env.KNOWLEDGE_DATABASE_URL:process.env.THEME_DATABASE_URL)??"");
 if(url.hostname!=="127.0.0.1"||url.port!==(beta?"55476":"55475")||url.pathname!==(beta?"/plunode_knowledge75_beta":"/plunode_theme75"))throw new ThemeError("公開読取のDB設定が一致しません",503);
 const neo=beta?"bolt://127.0.0.1:7699":"bolt://127.0.0.1:7698";
 if(process.env.KNOWLEDGE_PUBLICATION_ENABLED!=="1"||process.env.KNOWLEDGE_NEO4J_URL!==neo||!process.env.KNOWLEDGE_NEO4J_PASSWORD)throw new ThemeError("公開読取の接続設定を確認してください",503);
 return {beta,databaseUrl:url.toString(),neo,password:process.env.KNOWLEDGE_NEO4J_PASSWORD};
}
