import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sealLabArtifact} from '../lib/server/ai-lab-artifact.ts';
const web=process.argv[2]||'graph-knowledge-web:ai-lab-issue36-20261022',ops=process.argv[3]||'graph-ai-lab-artifact:issue36-20261022';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']}).trim();
const imageId=docker('image','inspect','--format','{{.Id}}',web), token=randomUUID(), containers=[];
const directory=await mkdtemp(path.join(tmpdir(),'plunode-lab-package-'));
const initial=JSON.parse(await readFile('data/ai-lab/initial.json','utf8')), next=sealLabArtifact({...initial.payload,version:'package-trial-v2'});
await writeFile(path.join(directory,'input.json'),JSON.stringify(next)+'\n');
await writeFile(path.join(directory,'initial.json'),JSON.stringify(initial)+'\n');
const report={webImage:imageId,opsImage:docker('image','inspect','--format','{{.Id}}',ops),initialSha256:initial.sha256,trialSha256:next.sha256,results:[]};
function owned(name){return docker('inspect','--format','{{.Image}} {{index .Config.Labels "plunode.ai-lab-trial"}}',name)===imageId+' '+token;}
function remove(name){if(owned(name))docker('rm','-f',name);}
function start(enabled,mount=false){const name='gk-ai-lab-trial-'+randomUUID();docker('run','-d','--name',name,'--label','plunode.ai-lab-trial='+token,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','768m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,noexec,size=16m',...(mount?['--mount',`type=bind,src=${directory},dst=/artifact,readonly`]:[]),'-e','GRAPH_DATASET=public-kg','-e','GRAPH_DEPLOYMENT=production','-e','AI_LAB_ENABLED='+Number(enabled),...(mount?['-e','AI_LAB_ARTIFACT_DIRECTORY=/artifact']:[]),web);containers.push(name);return name;}
function request(name,route,binary=false){
 const code=`(async()=>{const r=await fetch('http://127.0.0.1:3000'+${JSON.stringify(route)},{signal:AbortSignal.timeout(5000)});const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,bytes:b.length,csp:r.headers.get('content-security-policy'),sha256:require('node:crypto').createHash('sha256').update(b).digest('hex'),body:${binary?'null':"b.toString()"}}));})().catch(()=>process.exit(1));`;
 return JSON.parse(docker('exec',name,'node','-e',code));
}
async function ready(name,enabled){for(let i=0;i<40;i++){try{const r=request(name,'/api/ai-lab');if(r.status===(enabled?200:404))return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Trial Web did not become ready');}
function stats(name){return JSON.parse(docker('stats','--no-stream','--format','{{json .}}',name));}
function activate(file,expected){return JSON.parse(docker('run','--rm','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,noexec,size=16m','--mount',`type=bind,src=${directory},dst=/output`,ops,'activate',file,'https://plunode.net','/output',expected));}
try{
 const disabled=start(false);await ready(disabled,false);assert.equal(request(disabled,'/ai-lab').status,404);report.disabled=stats(disabled);remove(disabled);containers.splice(containers.indexOf(disabled),1);
 const enabled=start(true,true);await ready(enabled,true);
 for(const route of ['/ai-lab','/en/ai-lab']){const r=request(enabled,route);assert.equal(r.status,200);assert.ok(r.body.includes(route.includes('/en/')?'Apprentice exploration AI':'探索者見習いAI'));report.results.push({route,status:r.status,bytes:r.bytes});}
 const document=request(enabled,'/ai-lab');assert.match(document.csp,/connect-src 'self'/);
 const assets=[...document.body.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:css|js|woff2))(?:\?[^"\s]*)?"/g)].map(m=>m[1]);
 for(const extension of ['css','js']){const asset=assets.find(a=>a.endsWith('.'+extension));assert.ok(asset,extension);const result=request(enabled,asset,true);assert.equal(result.status,200);assert.ok(result.bytes>0);report.results.push({staticAsset:extension,status:result.status,bytes:result.bytes});}
 const font=JSON.parse(docker('exec',enabled,'node','-e',"console.log(JSON.stringify(require('node:fs').readdirSync('/app/.next-public/static/media').find(n=>n.endsWith('.woff2'))))"));assert.ok(font);const fontResult=request(enabled,'/_next/static/media/'+font,true);assert.equal(fontResult.status,200);assert.ok(fontResult.bytes>0);report.results.push({staticAsset:'woff2',status:fontResult.status,bytes:fontResult.bytes});
 assert.equal(JSON.parse(request(enabled,'/api/ai-lab').body).sha256,initial.sha256);
 const png=request(enabled,'/ai-lab/apprentice-profile.png',true);assert.equal(png.status,200);assert.equal(png.sha256,createHash('sha256').update(await readFile('public/ai-lab/apprentice-profile.png')).digest('hex'));
 for(const route of ['/.env.public','/.runtime/runs','/data/ai-lab/initial.json','/api/ai-lab/run'])assert.equal(request(enabled,route).status,404);
 const files=JSON.parse(docker('exec',enabled,'node','-e',"const fs=require('node:fs');console.log(JSON.stringify({uid:process.getuid(),private:['.env.public','.git','experiments','prototypes','scripts/ai-lab-artifact.ts'].filter(p=>fs.existsSync('/app/'+p)),writable:['/app','/app/data','/app/data/ai-lab','/app/data/ai-lab/initial.json','/artifact'].filter(p=>{try{fs.accessSync(p,fs.constants.W_OK);return true;}catch{return false;}})}))"));
 assert.equal(files.uid,1000);assert.deepEqual(files.private,[]);assert.deepEqual(files.writable,[]);report.permissions=files;
 assert.equal(docker('inspect','--format','{{.HostConfig.NetworkMode}}',enabled),'none');assert.equal(docker('inspect','--format','{{json .HostConfig.DeviceRequests}}',enabled),'null');
 report.enabled=stats(enabled);
 // Only public HTTPS reads occur in this one-shot operator. The Web is offline.
 activate('/output/initial.json','none');
 const activated=activate('/output/input.json',initial.sha256);assert.equal(activated.sha256,next.sha256);assert.equal(JSON.parse(request(enabled,'/api/ai-lab').body).sha256,next.sha256);
 await writeFile(path.join(directory,'broken.json'),JSON.stringify({...next,sha256:'0'.repeat(64)}));
 assert.throws(()=>activate('/output/broken.json',next.sha256));assert.equal(JSON.parse(request(enabled,'/api/ai-lab').body).sha256,next.sha256);
 const rollback=activate('/output/releases/'+initial.sha256+'.json',next.sha256);assert.equal(rollback.sha256,initial.sha256);assert.equal(JSON.parse(request(enabled,'/api/ai-lab').body).sha256,initial.sha256);
 docker('restart','--time','5',enabled);await ready(enabled,true);assert.equal(JSON.parse(request(enabled,'/api/ai-lab').body).sha256,initial.sha256);
 // A broken external pointer at cold start uses the independently shipped initial version.
 await writeFile(path.join(directory,'current.json'),'{broken');docker('restart','--time','5',enabled);await ready(enabled,true);assert.equal(JSON.parse(request(enabled,'/api/ai-lab').body).sha256,initial.sha256);
 report.results.push({offlineBirthPage:true,noModelOrKgConnection:true,readOnlyWeb:true,liveSwitch:true,invalidUpdateRetainsOld:true,rollback:true,restart:true,coldBrokenPointerUsesBundled:true,validatedKgRevision:activated.validatedKgRevision});
 await writeFile('/tmp/plunode-issue36-package.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{for(const name of containers)remove(name);await rm(directory,{recursive:true,force:true});}
