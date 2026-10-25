// Review-only local environment. Never loads beta/production credentials.
import {spawn} from 'node:child_process';
import {access,readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {datasetMode} from '../lib/domain/dataset';
import {startMemberOidc} from '../tests/support/member-oidc';
import {memberConfig} from '../lib/server/member/config';
import {createMemberAuth,memberAuthReady,memberPool} from '../lib/server/member/auth';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {createMemberService} from '../lib/server/member/service';

const state=join(homedir(),'.local/share/plunode-issue39-corrections');
const environment=JSON.parse(await readFile(join(state,'runtime.json'),'utf8'));
if(environment.MEMBER_ORIGIN!=='http://127.0.0.1:3221'||environment.MEMBER_AUTH_PROVIDER!=='fixture'||environment.NODE_ENV!=='test')throw Error('Isolated loopback test configuration required');
const db=new URL(environment.MEMBER_DATABASE_URL);
if(db.hostname!=='127.0.0.1'||db.port!=='55432'||db.pathname!=='/graph_member_test')throw Error('Dedicated review database required');
if(environment.GRAPH_DATASET!=='public-kg'||environment.NEO4J_URI!=='bolt://127.0.0.1:7695')throw Error('Isolated public KG copy required');
Object.assign(process.env,environment);
const config=memberConfig()!;
const pool=memberPool(config),issuer=await startMemberOidc();
await migrateMemberDatabase(pool,true,true,true);
const auth=createMemberAuth(config,pool);await memberAuthReady(auth);
const service=createMemberService(config,pool,auth,datasetMode(process.env.GRAPH_DATASET));
async function login(identity:string){
 const cookies=new Map<string,string>();
 const receive=(r:Response)=>{for(const h of r.headers.getSetCookie()){const p=h.split(';')[0],i=p.indexOf('=');cookies.set(p.slice(0,i),p.slice(i+1));}};
 const request=(path:string,method='GET',body?:unknown,id?:string)=>new Request(config.origin+path,{method,headers:{origin:config.origin,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'application/json',...(id?{'x-member-user':id}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const start=await auth.handler(request('/api/auth/sign-in/social','POST',{provider:'fixture',callbackURL:'/member',disableRedirect:true}));receive(start);
 const url=new URL((await start.json()).url);url.searchParams.set('fixture_identity',identity);url.searchParams.set('fixture_mode','valid');
 const consent=await fetch(url,{redirect:'manual'}),callback=new URL(consent.headers.get('location')!);
 const back=await auth.handler(request(callback.pathname+callback.search));receive(back);
 const result=await service.profile(request('/api/member/profile'));if(result.status!==200)throw Error('Review fixture login failed');
 const user=(await result.json()).user;
 return {user,request:(path:string,method='GET',body?:unknown)=>request(path,method,body,user.id)};
}
const alice=await login('alice'),bob=await login('bob');
process.env.SITE_OPERATOR_USER_IDS=alice.user.id;
let review:Record<string,string>;
try{review=JSON.parse(await readFile(join(state,'review.json'),'utf8'));}
catch{
 for(const [person,handle,name,icon] of [[alice,'review-explorer','灯りを辿る人','orbit'],[bob,'review-observer','余白の観察者','leaf']] as const){
  const own=await(await service.accounts.own(person.request('/api/accounts/me'))).json();
  await service.accounts.save(person.request('/api/accounts/me','PUT',{handle,displayName:name,bio:'関係と根拠を、少しずつ辿っています。',icon,timelinePublic:true,expectedRevision:own.revision}));
 }
 const created=await service.community.create(alice.request('/api/communities','POST',{requestId:randomUUID(),title:'コミュニティと管理のテスト状況',description:'隔離環境で、会話と人物表示の使い心地を確かめます。',visibility:'public'}));
 const community=(await created.json()).community;
 await service.community.change(bob.request('/api/communities','POST',{expectedRevision:community.revision}),community.id,'join');
 const current=(await(await service.community.read(alice.request('/api/communities'),community.id)).json()).community;
 const started=await service.community.createThread(alice.request('/api/communities','POST',{requestId:randomUUID(),expectedRevision:current.revision,title:'通報のテストを行う',body:'タイトルの近くから、話している人を辿れます。表示と操作を確かめましょう。',audience:'public'}),community.id);
 const thread=(await started.json()).id;
 await service.community.post(bob.request('/api/communities','POST',{requestId:randomUUID(),expectedRevision:1,body:'アイコンと表示名が一緒に見えるので、会話の流れを読みやすく感じます。'}),thread);
 await service.community.post(alice.request('/api/communities','POST',{requestId:randomUUID(),expectedRevision:1,body:'プロフィールと会話を行き来して、公開活動の表示も確かめられます。'}),thread);
 await service.community.createThread(alice.request('/api/communities','POST',{requestId:randomUUID(),expectedRevision:current.revision,title:'限定会話の検証',body:'この内容は公開プロフィールの活動には表示されません。',audience:'cohort'}),community.id);
 await service.accounts.follow(bob.request('/api/accounts/follows','PUT',{}),'review-explorer');
 review={community:community.id,thread,profile:'review-explorer',otherProfile:'review-observer'};
 await writeFile(join(state,'review.json'),JSON.stringify(review,null,2),{mode:0o600});
}
await pool.end();
console.log(JSON.stringify({origin:config.origin,review,authentication:'Local signed OIDC only; no beta or production connection'}));
// Serve the verified build so the lab's production CSP needs no unsafe-eval.
// NODE_ENV=test retains the existing fixture-only origin/DB/auth guards.
await access(join(process.cwd(),'.next-public/BUILD_ID'));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3221'],{env:process.env,stdio:'inherit'});
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;child.kill('SIGTERM');await issuer.close();};
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>resolve());});
await stop();
