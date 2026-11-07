import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {serializeSignedCookie} from 'better-call';
import {createLocalJWKSet,jwtVerify} from 'jose';
import {verifyOAuthQueryParams} from '@better-auth/oauth-provider';
import {createMemberAuth} from '../lib/server/member/auth';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {MISSION_SCOPE,MISSION_MCP_PATH,signedMissionOAuthQuery} from '../lib/server/member/mission-oauth';

// A restored, disposable member DB only. This script never uses a beta member
// session, real Google login or live ChatGPT client credentials.
const connectionString=process.env.MISSION_OAUTH_TEST_DATABASE_URL;
if(!connectionString||!/^plunode_mcp_restore_[a-f0-9]{12}$/.test(new URL(connectionString).pathname.slice(1)))throw Error('Dedicated restored OAuth test database required');
process.env.KNOWLEDGE_MISSION_MCP_ENABLED='1';
const pool=new Pool({connectionString}),origin='https://mission.example.test',resource=origin+MISSION_MCP_PATH;
const secret=randomBytes(32).toString('hex'),clientId='fixture-'+randomUUID(),redirect='https://client.example.test/callback';
const checked:string[]=[];
try{
 const original=(await pool.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2")).rows;
 const fingerprints=async()=>{const result:Record<string,string>={};for(const t of original){if(t.tablename==='member_migration')continue;const name='"'+t.schemaname+'"."'+t.tablename+'"';result[name]=(await pool.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS h FROM (SELECT md5(row_to_json(t)::text) AS h FROM ${name} t) x`)).rows[0].h;}return result;};
 const before=await fingerprints(),ledger=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,...Array(26).fill(true));
 assert.deepEqual(await fingerprints(),before);const current=(await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;
 for(const old of ledger)assert(current.some(v=>v.name===old.name&&v.checksum===old.checksum));
 await migrateMemberDatabase(pool,...Array(26).fill(true));assert.deepEqual((await pool.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows,current);assert.deepEqual(await fingerprints(),before);checked.push('restored migration, old rows and checksums preserved, repeated unchanged');
 const auth=createMemberAuth({origin,databaseUrl:connectionString,secret,cookiePrefix:'gk-mcp-fixture',provider:{kind:'google',clientId:'fixture',clientSecret:'fixture'}},pool),ctx=await auth.$context;
 const user=await ctx.internalAdapter.createUser({name:'OAuth fixture',email:randomUUID()+'@example.test',emailVerified:true,active:true,locale:'ja'},{method:'oauth',oauth:{providerId:'google',profile:{}}});
 const session=await ctx.internalAdapter.createSession(user.id,false);
 const cookie=(await serializeSignedCookie(ctx.authCookies.sessionToken.name,session.token,secret)).split(';')[0];
 await pool.query('INSERT INTO mission_oauth_client (id,"clientId",name,"redirectUris",scopes,"grantTypes","responseTypes","tokenEndpointAuthMethod","requirePKCE",disabled,"skipConsent") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,false,false)',[randomUUID(),clientId,'Fixture client',JSON.stringify([redirect]),JSON.stringify([MISSION_SCOPE,'offline_access']),JSON.stringify(['authorization_code','refresh_token']),JSON.stringify(['code']),'none']);
 await pool.query('INSERT INTO mission_oauth_client_resource (id,"clientId","resourceId") VALUES ($1,$2,$3)',[randomUUID(),clientId,resource]);
 const request=(path:string,init?:RequestInit)=>auth.handler(new Request(origin+'/api/auth'+path,init));
 const metadata=await(await request('/.well-known/oauth-authorization-server')).json();
 assert(metadata.code_challenge_methods_supported.includes('S256'));assert.equal(metadata.registration_endpoint,undefined);assert(!metadata.scopes_supported.includes('email'));checked.push('metadata, PKCE and restricted scopes');
 const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const params=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:MISSION_SCOPE+' offline_access',state:randomUUID(),code_challenge:challenge,code_challenge_method:'S256',resource});
 const authorize=await request('/oauth2/authorize?'+params,{headers:{cookie}});
 assert.equal(authorize.status,302);const consentUrl=new URL(authorize.headers.get('location')!,origin);assert.equal(consentUrl.pathname,'/collection-connect');
 const signed=signedMissionOAuthQuery(consentUrl.searchParams);assert(await verifyOAuthQueryParams(signed,ctx.secret));assert(!await verifyOAuthQueryParams(signed.replace('S256','plain'),ctx.secret));checked.push('signed consent and tampering rejection');
 const consent=await request('/oauth2/consent',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({accept:true,oauth_query:signed})});
 assert.equal(consent.status,200);const next=await consent.json(),callback=new URL(next.url);assert(callback.searchParams.get('code'));assert.equal(callback.searchParams.get('iss'),origin+'/api/auth');
 const exchange={grant_type:'authorization_code',client_id:clientId,redirect_uri:redirect,code:callback.searchParams.get('code')!,code_verifier:verifier,resource};
 const tokenRequest=(body:Record<string,string>)=>request('/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
 const tokenResponse=await tokenRequest(exchange);assert.equal(tokenResponse.status,200);const tokens=await tokenResponse.json();assert(tokens.refresh_token);checked.push('consent, code exchange and persistent refresh grant');
 const jwks=await(await request('/jwks')).json(),key=createLocalJWKSet(jwks);
 const verified=await jwtVerify(tokens.access_token,key,{issuer:origin+'/api/auth',audience:resource,typ:'at+jwt'});
 assert.equal(verified.payload.sub,user.id);assert.equal(verified.payload.client_id,clientId);assert(String(verified.payload.scope).split(' ').includes(MISSION_SCOPE));
 await assert.rejects(jwtVerify(tokens.access_token,key,{issuer:origin+'/api/auth',audience:'https://other.example/mcp'}));checked.push('audience, identity and scope');
 const refresh=await tokenRequest({grant_type:'refresh_token',client_id:clientId,refresh_token:tokens.refresh_token,resource});assert.equal(refresh.status,200);const rotated=await refresh.json();assert(rotated.access_token&&rotated.refresh_token);checked.push('refresh rotation');
 const revoked=await request('/oauth2/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:rotated.refresh_token,client_id:clientId,token_type_hint:'refresh_token'})});assert.equal(revoked.status,200);
 assert.equal((await tokenRequest({grant_type:'refresh_token',client_id:clientId,refresh_token:rotated.refresh_token,resource})).status,400);assert.equal((await tokenRequest(exchange)).status,400);checked.push('revocation and one-use authorization code');
 console.log(JSON.stringify({ok:true,checks:checked,realGoogle:false,realChatGPT:false}));
}finally{await pool.end();}
