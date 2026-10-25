import { spawn } from "node:child_process";
import { memberConfig } from "../lib/server/member/config";
import {createMemberAuth,memberAuthReady, memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { startMemberOidc } from "../tests/support/member-oidc";

const config = memberConfig();
if (!config || config.provider.kind !== "fixture") throw new Error("Use npm run test:member:e2e with its disposable database");
const pool = memberPool(config);
const issuer = await startMemberOidc();
let child: ReturnType<typeof spawn> | undefined;
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  child?.kill("SIGTERM");
  await issuer.close(); await pool.end();
}
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
try {
    await migrateMemberDatabase(pool, process.env.COMMUNITY_ENABLED === "1",process.env.SITE_OPERATIONS_ENABLED==='1',process.env.PUBLIC_PROFILES_ENABLED==='1');
  if(process.env.SITE_OPERATIONS_ENABLED==='1'){
    // Real test OIDC before Web startup; no client-selected role or auth bypass.
    const auth=createMemberAuth(config,pool);await memberAuthReady(auth);
    const cookies=new Map<string,string>(),receive=(r:Response)=>{for(const h of r.headers.getSetCookie()){const p=h.split(';')[0],i=p.indexOf('=');cookies.set(p.slice(0,i),p.slice(i+1));}},cookie=()=>[...cookies].map(([k,v])=>k+'='+v).join('; ');
    const req=(path:string,method='GET',body?:unknown)=>new Request(config.origin+path,{method,headers:{cookie:cookie(),origin:config.origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const start=await auth.handler(req('/api/auth/sign-in/social','POST',{provider:'fixture',callbackURL:'/member',disableRedirect:true}));receive(start);
    const url=new URL((await start.json()).url);url.searchParams.set('fixture_identity','alice');url.searchParams.set('fixture_mode','valid');
    const consent=await fetch(url,{redirect:'manual'}),redirect=new URL(consent.headers.get('location')!);
    const result=await auth.handler(req(redirect.pathname+redirect.search));receive(result);
    const session=await auth.api.getSession({headers:req('/').headers});if(!session?.user.id)throw Error('Operator fixture OIDC failed');
    process.env.SITE_OPERATOR_USER_IDS=session.user.id;
  }
  child = spawn("node", ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.member.config.ts", ...process.argv.slice(2)], { env: process.env, stdio: "inherit" });
  process.exitCode = await new Promise<number>((resolve, reject) => { child!.once("error", reject); child!.once("exit", code => resolve(code ?? 1)); });
  // Normal completion must not signal the already-exited Playwright process.
  child = undefined;
} finally { await stop(); }
