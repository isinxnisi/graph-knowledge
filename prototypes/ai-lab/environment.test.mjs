import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import http from 'node:http';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../../experiments/ai-lab/.runtime/observer/package.json',import.meta.url));
const {request}=require('@playwright/test');
const client=await request.newContext();
const publicOrigin='https://graph-ailab.isinxnisi.com';
function localHost(port,host){return new Promise((resolve,reject)=>{
 const req=http.get({hostname:'127.0.0.1',port,path:'/ai-lab',headers:{Host:host,'X-Forwarded-Host':'graph-ailab.isinxnisi.com'}},res=>{res.resume();resolve(res.statusCode);});
 req.on('error',reject);
});}
try{
 const images=[];
 for(const base of ['http://127.0.0.1:3268','http://127.0.0.1:3286',publicOrigin]){
  for(const path of ['/','/ai-lab','/ai-character-study','/ai-apprentice-study','/api/dataset']){
   const r=await client.get(base+path);assert.equal(r.status(),200,base+path);
   assert.ok(r.headers()['cache-control'].includes('no-store'));
   assert.ok(r.headers()['x-robots-tag'].includes('noindex'));
   assert.ok(r.headers()['content-security-policy'].includes("connect-src 'self'"));
  }
  for(const path of ['/.env.public','/.runtime/runs','/preview/public.json','/api/ai/run','/api/training'])assert.equal((await client.get(base+path)).status(),404,base+path);
  for(const path of ['/api/auth/sign-in','/api/member/profile'])assert.equal((await client.post(base+path,{data:{}})).status(),503,base+path);
  assert.equal((await client.post(base+'/api/entities',{data:{}})).status(),404);
  const png=await client.get(base+'/character-study/v02-soft-flat.png');assert.equal(png.status(),200);
  images.push(createHash('sha256').update(await png.body()).digest('hex'));
  console.log('PASS',base,'routes, noindex/CSP, private paths, write boundaries');
 }
 assert.equal(new Set(images).size,1,'same candidate image through both ports and Tunnel');
 for(const port of [3268,3286]){
  assert.equal(await localHost(port,'graph-ailab.isinxnisi.com'),200);
  for(const host of ['invalid.example','graph-ailab.isinxnisi.com.invalid','graph-beta.isinxnisi.com'])assert.equal(await localHost(port,host),404);
 }
 for(const base of ['https://graph-beta.isinxnisi.com','https://graph-com.isinxnisi.com']){
  assert.equal((await client.get(base)).status(),200);assert.equal((await client.get(base+'/api/dataset')).status(),200);console.log('PASS unchanged preview available',base);
 }
 console.log('PASS image identity and exact Host allowlist on both loopback ports');
}finally{await client.dispose();}
