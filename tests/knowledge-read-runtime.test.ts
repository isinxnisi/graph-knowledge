import { afterEach, expect, it, vi } from "vitest";
import { knowledgeReadGuard, knowledgeReadConfiguration } from "../lib/server/knowledge-read-runtime";
import { themeGuard } from "../lib/server/theme-workbench";
afterEach(()=>vi.unstubAllEnvs());
function beta(){for(const [k,v] of Object.entries({KNOWLEDGE_RUNTIME:"beta",KNOWLEDGE_PUBLICATION_ENABLED:"1",KNOWLEDGE_PUBLIC_ORIGIN:"https://graph-beta.isinxnisi.com",KNOWLEDGE_DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:55476/plunode_knowledge75_beta",KNOWLEDGE_NEO4J_URL:"bolt://127.0.0.1:7699",KNOWLEDGE_NEO4J_PASSWORD:"fixture",THEME_WORKBENCH_ENABLED:"0"}))vi.stubEnv(k,v);}
it("βの公開読取だけを許可し、登録・訂正用の隔離guardは閉じたままにする",()=>{
 beta();for(const host of ['graph-beta.isinxnisi.com','localhost:3200','127.0.0.1:3200'])expect(()=>knowledgeReadGuard(new Request('http://localhost/',{headers:{host}}))).not.toThrow();
 expect(knowledgeReadConfiguration().beta).toBe(true);expect(()=>themeGuard()).toThrow();
 for(const host of ['localhost:3276','plunode.net','attacker.example'])expect(()=>knowledgeReadGuard(new Request('http://localhost/',{headers:{host}}))).toThrow();
});
it("βが3276・会員DB・本番originへ誤接続する設定を拒否する",()=>{
 beta();vi.stubEnv('KNOWLEDGE_DATABASE_URL','postgresql://fixture:fixture@127.0.0.1:55475/plunode_theme75');expect(()=>knowledgeReadConfiguration()).toThrow();
 beta();vi.stubEnv('KNOWLEDGE_NEO4J_URL','bolt://127.0.0.1:7698');expect(()=>knowledgeReadConfiguration()).toThrow();
 beta();vi.stubEnv('KNOWLEDGE_PUBLIC_ORIGIN','https://plunode.net');expect(()=>knowledgeReadConfiguration()).toThrow();
});
