import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// Production images, synthetic users/sessions, disposable PostgreSQL only.
// No real Google callback, production requests, or KG writes occur here.
const tag=process.argv[2];assert.match(tag??"",/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/);
const dir=await mkdtemp(join(tmpdir(),"capsule-release-")),envFile=join(dir,"app.env");
const project="capsule-release-"+randomUUID(),origin="https://plunode.net",password=randomBytes(32).toString("hex");
const env:Record<string,string>={NEO4J_PASSWORD:randomBytes(32).toString("hex"),GRAPH_IMAGE_TAG:tag,GRAPH_WEB_PORT:"3202",GRAPH_BACKUP_DIRECTORY:dir,MEMBER_STORAGE_ENABLED:"1",MEMBER_ORIGIN:origin,MEMBER_DATABASE_URL:`postgresql://gk_member:${password}@graph-member-postgres:5432/graph_member`,MEMBER_POSTGRES_PASSWORD:password,MEMBER_POSTGRES_ADMIN_PASSWORD:randomBytes(32).toString("hex"),MEMBER_AUTH_SECRET:randomBytes(32).toString("hex"),MEMBER_GOOGLE_CLIENT_ID:"release-test.apps.googleusercontent.com",MEMBER_GOOGLE_CLIENT_SECRET:"synthetic-only",COMMUNITY_ENABLED:"1",SITE_OPERATIONS_ENABLED:"1",PUBLIC_PROFILES_ENABLED:"1"};
const args=["compose","-p",project,"--env-file",envFile,"-f","compose.production.yaml","--profile","member"];
function dc(command:string[],ok=true,input?:string){const r=spawnSync("docker",[...args,...command],{encoding:"utf8",env:{...process.env,...env},input,maxBuffer:8*1024*1024,timeout:120000});if(ok&&r.status!==0)throw Error("Isolated Capsule command failed: "+command[0]);return r;}
const sql=(q:string,db="graph_member")=>dc(["exec","-T","graph-member-postgres","psql","-X","-v","ON_ERROR_STOP=1","-U","postgres","-d",db,"-At"],true,q).stdout.trim();
const cli=(extra:string[])=>dc(["run","--rm","--no-deps","--entrypoint","node","member-ops","--import","tsx","scripts/member-migrate.ts",...extra,"--confirm-origin",origin]);
const full=["--public-profiles","--capsule-documents","--community-capsules","--capsule-comments","--capsule-share-recovery","--capsule-publications"];
function code(js:string){return dc(["run","--rm","--no-deps","--entrypoint","node","member-ops","--import","tsx","--input-type=module","-e",js]).stdout.trim();}
const ledger=(db="graph_member")=>JSON.parse(sql("SELECT json_object_agg(name,checksum) FROM member_migration",db)) as Record<string,string>;
const schema=(db="graph_member")=>JSON.parse(sql("SELECT json_object_agg(table_name,cols) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t",db)) as Record<string,string[]>;
function fingerprints(s:Record<string,string[]>,db="graph_member",old=false){return Object.fromEntries(Object.entries(s).map(([t,cols])=>[t,sql(`SELECT count(*)||':'||md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),'')) FROM (SELECT ${cols.map(c=>'"'+c+'"').join(',')} FROM "${t}" ${old&&t==='member_migration'?"WHERE name<'011'":''}) x`,db)]));}
const a=randomUUID(),b=randomUUID();
let cookieA="",cookieB="",token="";
async function req(path:string,method="GET",body?:unknown,person?:"a"|"b",shared=false){return fetch("http://127.0.0.1:3202"+path,{method,redirect:"manual",signal:AbortSignal.timeout(20000),headers:{origin,"content-type":"application/json",...(person?{cookie:person==="a"?cookieA:cookieB,"x-member-user":person==="a"?a:b}:{}),...(shared?{"x-capsule-token":token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function body(r:Response,status=200){const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j;}
try{
 await writeFile(envFile,Object.entries(env).map(([k,v])=>k+"="+v).join("\n")+"\n",{mode:0o600});dc(["config","--quiet"]);dc(["up","-d","--wait","--wait-timeout","90","graph-member-postgres"]);
 cli(["--public-profiles"]);assert.equal(Object.keys(ledger()).length,11);
 sql(`INSERT INTO "user"(id,name,email,"emailVerified",active,locale) VALUES('${a}','Fixture A','a@example.invalid',true,true,'ja'),('${b}','Fixture B','b@example.invalid',true,true,'ja')`);
 const oldSchema=schema(),before=fingerprints(oldSchema),oldLedger=ledger();
 for(const [name,sum] of Object.entries(oldLedger))assert.equal(sum,createHash("sha256").update(await readFile("db/member/"+name)).digest("hex"));
 dc(["exec","-T","graph-member-postgres","pg_dump","-U","postgres","-d","graph_member","-Fc","-f","/tmp/before.dump"]);
 sql("CREATE DATABASE rehearsal_restore OWNER gk_member");dc(["exec","-T","graph-member-postgres","pg_restore","-U","postgres","-d","rehearsal_restore","--no-owner","--role=gk_member","--exit-on-error","/tmp/before.dump"]);
 assert.deepEqual(schema("rehearsal_restore"),oldSchema);assert.deepEqual(fingerprints(oldSchema,"rehearsal_restore"),before);
 code(`import pg from 'pg';import {migrateMemberDatabase} from './lib/server/member/migrate.ts';const u=new URL(process.env.MEMBER_DATABASE_URL);u.pathname='/rehearsal_restore';const p=new pg.Pool({connectionString:u.href});try{await migrateMemberDatabase(p,true,true,true,true,true,true,true,true);await migrateMemberDatabase(p,true,true,true,true,true,true,true,true);}finally{await p.end();}`);
 assert.equal(Object.keys(ledger("rehearsal_restore")).length,16);assert.deepEqual(fingerprints(oldSchema,"rehearsal_restore",true),before);
 cli(full);const afterSchema=schema(),after=fingerprints(afterSchema);cli(full);assert.deepEqual(fingerprints(afterSchema),after);assert.deepEqual(fingerprints(oldSchema,"graph_member",true),before);
 assert.equal(Object.keys(ledger()).length,16);for(const [name,sum] of Object.entries(ledger()))assert.equal(sum,createHash("sha256").update(await readFile("db/member/"+name)).digest("hex"));
 console.log("PASS: old checksums/rows; separate DB restore; 011–015 rehearsal, CLI apply and idempotency");
 if(process.argv.includes('--google-profile-images')){
  const before=JSON.parse(sql("SELECT json_agg(p ORDER BY id) FROM public_profile p"));
  cli([...full,'--google-profile-images']);
  const after=JSON.parse(sql("SELECT json_agg(p ORDER BY id) FROM public_profile p"));
  assert.deepEqual(after,before.map((p:{user_id:string|null;icon:string;revision:number})=>p.user_id?{...p,icon:'google',revision:p.revision+(p.icon==='google'?0:1)}:p));
  assert.equal(Object.keys(ledger()).length,17);cli([...full,'--google-profile-images']);
  assert.deepEqual(JSON.parse(sql("SELECT json_agg(p ORDER BY id) FROM public_profile p")),after);
  sql(`UPDATE "user" SET image='https://lh3.googleusercontent.com/a/test-photo=s96-c' WHERE id='${a}'`);
  console.log('PASS: production member-ops 016 default/backfill, unchanged AI and repeat');
 }
 const session=(uid:string)=>JSON.parse(code(`import {createHmac} from 'node:crypto';import {createMemberAuth,memberPool} from './lib/server/member/auth.ts';import {memberConfig} from './lib/server/member/config.ts';const cfg=memberConfig();const pool=memberPool(cfg);const auth=createMemberAuth(cfg,pool);try{const ctx=await auth.$context;const s=await ctx.internalAdapter.createSession('${uid}');const signature=createHmac('sha256',process.env.MEMBER_AUTH_SECRET).update(s.token).digest('base64');console.log(JSON.stringify(ctx.authCookies.sessionToken.name+'='+encodeURIComponent(s.token+'.'+signature)));}finally{await pool.end();}`)) as string;
 cookieA=session(a);cookieB=session(b);dc(["up","-d","--no-deps","web"]);
 for(let n=0;n<60;n++){try{if((await req('/api/member/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.equal((await req('/api/member/profile')).status,401);assert.equal((await req('/api/member/capsule-capabilities','GET',undefined,'a')).status,200);
 if(process.argv.includes('--google-profile-images')){
  const me=await body(await req('/api/member/profile','GET',undefined,'a'));
  assert.equal(me.user.profile.icon,'google');assert.equal(me.user.profile.imageUrl,'https://lh3.googleusercontent.com/a/test-photo=s96-c');
  const publicProfile=await body(await req('/api/accounts/profiles/'+me.user.profile.handle));
  assert.equal(publicProfile.profile.imageUrl,me.user.profile.imageUrl);assert.ok(!('email' in publicProfile.profile));
  console.log('PASS: production Web authenticated and anonymous Google avatar projection');
 }
 const n1=randomUUID(),n2=randomUUID();const content={dataset:'public-kg',title:'公開図の第一版',note:'画像と共有本文の一致を確認',language:'ja',entityIds:[],claimIds:[],document:{schemaVersion:1,nodes:[{key:n1,title:'起点',description:'',badge:'',shape:'circle',origin:{kind:'local'}},{key:n2,title:'関係先',description:'',badge:'',shape:'diamond',origin:{kind:'local'}}],relations:[{key:randomUUID(),source:n1,target:n2,label:'関係する',note:'',origin:{kind:'local'}}],texts:[],evidence:[],unresolvedClaimIds:[],layout:{positions:{[n1]:{x:0,y:0},[n2]:{x:150,y:50}},pan:{x:0,y:0},zoom:1}}};
 const cap=(await body(await req('/api/member/capsules','POST',{requestId:randomUUID(),content},'a'),201)).capsule,p='/api/member/capsules/'+cap.id;
 const issued=await body(await req(p+'/share','POST',{expectedRevision:1,expectedShareId:null},'a'),201);token=issued.token;const link='/shared/'+token;
 assert.equal((await body(await req('/api/shared/capsule','GET',undefined,undefined,true))).capsule.revision,1);
 const post=async(revision:number,text:string)=>body(await req('/api/capsules/'+cap.id+'/discussion?revision='+revision,'POST',{requestId:randomUUID(),revision,body:text},'b',true),201);
 await post(1,'最初の図へのコメント');
 await body(await req(p,'PUT',{requestId:randomUUID(),expectedRevision:1,content:{...content,title:'改善した公開図'}},'a'));
 assert.equal((await body(await req('/api/shared/capsule','GET',undefined,undefined,true))).capsule.content.title,content.title);
 assert.equal((await req('/api/shared/capsule?revision=2','GET',undefined,undefined,true)).status,404);
 await body(await req(p+'/share','PATCH',{expectedRevision:2,expectedSharedRevision:1,expectedShareId:issued.share.id},'a'));
 assert.equal((await body(await req(p+'/share','GET',undefined,'a'))).token,token);
 const published=await body(await req('/api/shared/capsule','GET',undefined,undefined,true));assert.equal(published.capsule.content.title,'改善した公開図');
 await post(1,'旧図を見たままのコメント');await post(2,'改善後へのコメント');
 const discussion=await body(await req('/api/capsules/'+cap.id+'/discussion?revision=2','GET',undefined,'b',true));assert.deepEqual(discussion.posts.map((x:{revision:number})=>x.revision),[1,1,2]);
 const html=await(await req(link)).text();assert.ok(html.includes('property="og:title" content="改善した公開図"'));assert.ok(html.includes(origin+link+'/image/2'));assert.ok(html.includes('property="og:url" content="'+origin+link+'"'));assert.ok(!html.includes('graph-beta.isinxnisi.com'));
 const image=await req(link+'/image/2');assert.equal(image.status,200);assert.match(image.headers.get('content-type')??'',/image\/png/);const png=Buffer.from(await image.arrayBuffer());assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 const output=process.env.CAPSULE_RELEASE_EVIDENCE_DIR;if(output)await writeFile(join(output,'isolated-ogp.png'),png);
 const sign=await body(await req('/api/auth/sign-in/social','POST',{provider:'google',callbackURL:origin+'/member',disableRedirect:true}));assert.equal(new URL(sign.url).searchParams.get('redirect_uri'),origin+'/api/auth/callback/google');
 assert.equal((await req('/api/auth/sign-in/social','POST',{provider:'fixture',callbackURL:origin+'/member'})).status,400);
 await body(await req(p+'/share','DELETE',{expectedShareId:issued.share.id},'a'));
 assert.equal((await req('/api/shared/capsule','GET',undefined,undefined,true)).status,404);assert.equal((await req(link+'/image/2')).status,404);assert.ok(!(await(await req(link)).text()).includes('property="og:title" content="改善した公開図"'));
 console.log('PASS: production image HTTP save/revisit, explicit same-URL publication, old/current comment contexts, OGP metadata/PNG, stop; synthetic sessions only; Google redirect configuration');
}finally{dc(['down','-v','--remove-orphans'],false);await rm(dir,{recursive:true,force:true});}
