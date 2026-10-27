import { spawnSync } from "node:child_process";
import { createServer, request } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { chromium } from "@playwright/test";

const name=`gk-issue52-browser-${process.pid}`, folder=resolve(`.local/${name}`), image=process.argv[2] ?? "graph-knowledge-web:issue52-candidate";
mkdirSync(folder,{recursive:true,mode:0o700});
const docker=(args:string[])=>{ const r=spawnSync("docker",args,{encoding:"utf8",maxBuffer:4*1024*1024}); if(r.status!==0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
const cert=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",`${folder}/key.pem`,"-out",`${folder}/cert.pem`,"-days","1","-subj","/CN=issue52-fixture.cloudflareaccess.com","-addext","subjectAltName=DNS:issue52-fixture.cloudflareaccess.com"],{stdio:"ignore"}); if(cert.status!==0) throw Error("Test TLS certificate generation failed");
const {publicKey,privateKey}=await generateKeyPair("RS256"), audience="a".repeat(64);
writeFileSync(`${folder}/jwks.json`,JSON.stringify({keys:[{...await exportJWK(publicKey),kid:"issue52",alg:"RS256"}]}));
const token=await new SignJWT({email:"fixture@example.invalid",type:"app"}).setProtectedHeader({alg:"RS256",kid:"issue52"}).setIssuer("https://issue52-fixture.cloudflareaccess.com").setAudience(audience).setSubject("fixture-admin").setIssuedAt().setExpirationTime("30m").sign(privateKey);
const headers={host:"plunode-admin.isinxnisi.com","cf-access-jwt-assertion":token};
// Native fetch deliberately ignores Host in this Node release. Use the HTTP
// client for explicit alternate-host / origin-bypass probes.
function originRequest(url: string, init: { headers?: Record<string, string> } = {}) {
  return new Promise<Response>((resolveResponse, reject) => {
    const req=request(url,{headers:init.headers},res=>{
      const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(chunk));
      res.on("end",()=>resolveResponse(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?v.join(","):v!]))})));
    }); req.on("error",reject);req.end();
  });
}
const gateway=createServer((req,res)=>{
  const upstream=request({hostname:"127.0.0.1",port:3218,path:req.url,method:req.method,headers:{...req.headers,...headers}},reply=>{res.writeHead(reply.statusCode!,reply.headers);reply.pipe(res);});
  upstream.on("error",()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  docker(["network","create",name]);
  docker(["run","-d","--name",`${name}-db`,"--network",name,"--network-alias","graph-neo4j","-e","NEO4J_AUTH=neo4j/isolated-issue52-test","-e","NEO4J_server_memory_heap_initial__size=128m","-e","NEO4J_server_memory_heap_max__size=256m","-e","NEO4J_server_memory_pagecache_size=128m","--memory=768m","neo4j:5.26.31-community"]);
  console.log(docker(["run","--rm","--name",`${name}-seed`,"--network",name,"-v",`${process.cwd()}:/work`,"-w","/work","-e","KG_ADMIN_ISOLATED_TEST=issue52","-e","NEO4J_READ_TIMEOUT_MS=10000","-e","GRAPH_DEPLOYMENT=production","-e","GRAPH_DATASET=public-kg","-e","NEO4J_URI=bolt://graph-neo4j:7687","-e","NEO4J_DATABASE=neo4j","-e","NEO4J_USER=neo4j","-e","NEO4J_PASSWORD=isolated-issue52-test","node:24.21.0-bookworm-slim","node","node_modules/vitest/vitest.mjs","run","tests/kg-admin.integration.test.ts","--no-file-parallelism"]));
  docker(["run","-d","--name",`${name}-jwks`,"--network",name,"--network-alias","issue52-fixture.cloudflareaccess.com","-v",`${folder}:/test:ro`,"-v",`${process.cwd()}/tests/kg-admin-jwks-server.mjs:/server.mjs:ro`,"node:24.21.0-bookworm-slim","node","/server.mjs"]);
  docker(["run","-d","--name",`${name}-web`,"--network",name,"-p","127.0.0.1:3218:3000","--memory=384m","--cpus=0.5","--read-only","--tmpfs","/tmp:size=16m","-v",`${folder}/cert.pem:/test/cert.pem:ro`,"-e","NODE_EXTRA_CA_CERTS=/test/cert.pem","-e","NODE_OPTIONS=--max-old-space-size=256","-e","NEO4J_READ_TIMEOUT_MS=10000","-e","GRAPH_DEPLOYMENT=production","-e","GRAPH_DATASET=public-kg","-e","KG_ADMIN_ENABLED=1","-e","KG_ADMIN_ACCESS_TEAM=issue52-fixture","-e",`KG_ADMIN_ACCESS_AUD=${audience}`,"-e","NEO4J_URI=bolt://graph-neo4j:7687","-e","NEO4J_USER=neo4j","-e","NEO4J_PASSWORD=isolated-issue52-test","-e","NEO4J_DATABASE=neo4j",image]);
  for(let i=0;i<60;i++){try{await originRequest("http://127.0.0.1:3218/kg-admin");break;}catch{await new Promise(r=>setTimeout(r,1000));}}
  for(const path of ["/kg-admin","/en/kg-admin","/api/kg-admin","/api/kg-admin/","/api/entities","/operations","/api/auth/get-session","/_next/static/fake.js"]){
    const response=await originRequest(`http://127.0.0.1:3218${path}`);
    if(path.endsWith("/")) { assert.equal(response.status,308); assert.equal(response.headers.get("location"),"/api/kg-admin"); }
    else assert.equal(response.status,404);
  }
  for(const host of ["plunode.net","graph.isinxnisi.net","graph-beta.isinxnisi.com","localhost:3218"]){assert.equal((await originRequest("http://127.0.0.1:3218/api/kg-admin",{headers:{...headers,host,"x-forwarded-host":headers.host}})).status,404);}
  const response=await originRequest("http://127.0.0.1:3218/api/kg-admin?view=entities",{headers}); assert.equal(response.status,200); assert.match(response.headers.get("cache-control")!,/no-store/); const result=await response.json(); assert.equal(result.total,325);assert.equal(result.items.length,40);
  const root=await originRequest("http://127.0.0.1:3218/",{headers});assert.equal(root.status,307);assert.equal(root.headers.get("location"),"https://plunode-admin.isinxnisi.com/kg-admin");
  assert.equal((await originRequest("http://127.0.0.1:3218/api/kg-admin?revision=old",{headers})).status,409);
  assert.equal((await originRequest("http://127.0.0.1:3218/api/kg-admin?min=4&max=2",{headers})).status,400);
  assert.equal((await originRequest("http://127.0.0.1:3218/api/entities",{headers})).status,404);
  docker(["run","-d","--name",`${name}-public`,"--network",name,"-p","127.0.0.1:3220:3000","-e","GRAPH_DATASET=public-kg","--memory=384m",image]);
  for(let i=0;i<30;i++){try{await originRequest("http://127.0.0.1:3220/kg-admin");break;}catch{await new Promise(r=>setTimeout(r,1000));}}
  for(const host of ["plunode.net","graph.isinxnisi.net","graph-beta.isinxnisi.com","plunode-admin.isinxnisi.com"]){
    for(const path of ["/kg-admin","/en/kg-admin","/api/kg-admin"]) assert.equal((await originRequest(`http://127.0.0.1:3220${path}`,{headers:{...headers,host}})).status,404);
  }
  await new Promise<void>(r=>gateway.listen(3219,"127.0.0.1",r));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto("http://127.0.0.1:3219/kg-admin");await page.getByText("325 件",{exact:false}).waitFor();
  await page.screenshot({path:`${folder}/desktop.png`,fullPage:false});
  await page.getByRole("button",{name:"次へ",exact:true}).click();await page.getByText("41–80",{exact:false}).waitFor();
  await page.getByRole("button",{name:"前へ",exact:true}).click();await page.getByText("1–40",{exact:false}).waitFor();
  await page.getByRole("button",{name:"Entity 000",exact:true}).click();await page.getByRole("link",{name:"Graphで探索 ↗"}).waitFor();
  assert.match(await page.getByRole("link",{name:"Graphで探索 ↗"}).getAttribute("href") ?? "",/\/explore\//);
  await page.getByRole("button",{name:"閉じる",exact:true}).click();
  await page.getByRole("button",{name:"Island一覧",exact:true}).click();await page.getByText("106 件",{exact:false}).waitFor();
  await page.getByRole("button",{name:"絞り込み・並び順"}).click();await page.getByRole("spinbutton",{name:"最小",exact:true}).fill("220");await page.getByRole("spinbutton",{name:"最大",exact:true}).fill("220");await page.getByRole("button",{name:"適用",exact:true}).last().click();await page.getByText("1 件",{exact:false}).waitFor();
  await page.getByRole("button",{name:"Entity 000",exact:true}).click();await page.getByText("220 件",{exact:false}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.goto("http://127.0.0.1:3219/kg-admin");await page.getByText("325 件",{exact:false}).waitFor();
  const visibleRows=await page.locator("tbody tr").evaluateAll(rows=>rows.filter(r=>r.getBoundingClientRect().bottom<=window.innerHeight).length); assert.ok(visibleRows>=12,`Visible rows: ${visibleRows}`);
  await page.screenshot({path:`${folder}/mobile.png`,fullPage:false});
  await page.getByRole("button",{name:"メニュー",exact:true}).click();await page.getByRole("button",{name:"概況",exact:true}).click();await page.getByRole("heading",{name:"概況",exact:true}).waitFor();
  await page.goto("http://127.0.0.1:3219/en/kg-admin");await page.getByText("325 results",{exact:false}).waitFor();await page.getByRole("button",{name:"Filters & sorting"}).click();
  await page.screenshot({path:`${folder}/mobile-filters-en.png`,fullPage:false});
  console.log(JSON.stringify({browser:"passed",mobileVisibleRows:visibleRows,artifacts:folder,resources:docker(["stats","--no-stream","--format","{{.Name}} {{.MemUsage}} {{.CPUPerc}}",`${name}-web`,`${name}-db`])}));
} finally {
  await browser?.close();gateway.close();
  for(const suffix of ["seed","web","db","jwks","public"]) spawnSync("docker",["rm","-f",`${name}-${suffix}`],{stdio:"ignore"});
  spawnSync("docker",["network","rm",name],{stdio:"ignore"});
}
