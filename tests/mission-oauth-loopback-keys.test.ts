import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createMcpProtectedRequestHandler} from '@better-auth/mcp';

it('uses local public keys while enforcing the public issuer, audience, expiry, signature and scope',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('ES256');
 const jwk={...await exportJWK(publicKey),kid:'beta-key',alg:'ES256',use:'sig'};
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[jwk]}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const addr=server.address();if(!addr||typeof addr==='string')throw Error('TEST_ADDRESS');
 const issuer='https://graph-beta.isinxnisi.com/api/auth',resource='https://graph-beta.isinxnisi.com/api/knowledge-collection/mcp';
 const handler=createMcpProtectedRequestHandler({issuer,audience:resource,jwksUrl:`http://127.0.0.1:${addr.port}/jwks`,requiredScopes:['missions:collect']},()=>Response.json({ok:true}));
 const sign=async(overrides:Record<string,unknown>={},key=privateKey)=>new SignJWT({iss:issuer,aud:resource,sub:'operator',scope:'missions:collect',exp:Math.floor(Date.now()/1000)+60,...overrides}).setProtectedHeader({alg:'ES256',kid:'beta-key'}).sign(key);
 const check=async(token:string)=>handler(new Request(resource,{method:'POST',headers:{authorization:'Bearer '+token}}));
 try{
  expect((await check(await sign())).status).toBe(200);
  expect((await check(await sign({iss:'https://other.invalid/api/auth'}))).status).toBe(401);
  expect((await check(await sign({aud:'https://other.invalid/mcp'}))).status).toBe(401);
  expect((await check(await sign({exp:1}))).status).toBe(401);
  const wrong=await generateKeyPair('ES256');expect((await check(await sign({},wrong.privateKey))).status).toBe(401);
  expect((await check(await sign({scope:'themes:compose'}))).status).toBe(403);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
