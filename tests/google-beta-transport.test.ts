import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {google} from '@better-auth/core/social-providers';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
const mock=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('../lib/server/windows-beta-google-auth',()=>({GOOGLE_TOKEN_ENDPOINT:'https://oauth2.googleapis.com/token',GOOGLE_KEYS_ENDPOINT:'https://www.googleapis.com/oauth2/v3/certs',windowsBetaGoogleAuthFetch:mock.fetch}));
import {googleBetaTransportPlugins} from '../lib/server/member/google-beta-transport';
import {createMemberAuth} from '../lib/server/member/auth';
import type {MemberConfig} from '../lib/server/member/config';
import {Pool} from 'pg';
const config:MemberConfig={origin:'https://graph-beta.isinxnisi.com',databaseUrl:'postgresql://fixture@127.0.0.1/test',secret:'a'.repeat(64),cookiePrefix:'test',provider:{kind:'google',clientId:'test-client',clientSecret:'test-secret'}};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('PLUNODE_WINDOWS_HTTPS_TRANSPORT','1');vi.stubEnv('KNOWLEDGE_RUNTIME','beta');vi.stubEnv('KNOWLEDGE_PUBLIC_ORIGIN',config.origin);vi.stubEnv('KNOWLEDGE_MISSION_MCP_ENABLED','0');});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
async function provider(){const p=google({clientId:'test-client',clientSecret:'test-secret'});await googleBetaTransportPlugins(config)[0].init!({socialProviders:[p]} as never);return p;}
it('attaches to the real Better Auth context without altering the Google authorization/PKCE setup',async()=>{
 const pool=new Pool({connectionString:config.databaseUrl});
 try{const ctx=await createMemberAuth(config,pool).$context;const p=ctx.socialProviders.find(p=>p.id==='google')!;
 const url=await p.createAuthorizationURL({state:'state',codeVerifier:'verifier',redirectURI:config.origin+'/api/auth/callback/google'});
 expect(url.origin).toBe('https://accounts.google.com');expect(url.searchParams.get('state')).toBe('state');expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('code_challenge')).toBeTruthy();
 expect(ctx.options.advanced?.disableCSRFCheck).toBe(false);expect(ctx.options.advanced?.disableOriginCheck).toBe(false);
 }finally{await pool.end();}
});
it('uses the SDK form builder and returns standard tokens only after a successful exchange',async()=>{
 const p=await provider();mock.fetch.mockResolvedValue(new Response(JSON.stringify({access_token:'access',id_token:'id',expires_in:3600,scope:'openid email'})));
 expect(await p.validateAuthorizationCode({code:'one-use-code',codeVerifier:'verifier',redirectURI:config.origin+'/api/auth/callback/google'})).toMatchObject({accessToken:'access',idToken:'id',scopes:['openid','email']});
 const form=new URLSearchParams(mock.fetch.mock.calls[0][1].body);expect(form.get('code')).toBe('one-use-code');expect(form.get('code_verifier')).toBe('verifier');expect(form.get('client_secret')).toBe('test-secret');expect(mock.fetch).toHaveBeenCalledOnce();
});
it('fails closed and logs no raw error, code, client secret or token',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});mock.fetch.mockRejectedValue(Error('private-code test-secret access-token'));
 await expect((await provider()).validateAuthorizationCode({code:'private-code',codeVerifier:'verifier',redirectURI:config.origin+'/api/auth/callback/google'})).rejects.toThrow('TOKEN_EXCHANGE');
 expect(log.mock.calls.flat().join(' ')).toBe('Beta Google login: token exchange failed');expect(mock.fetch).toHaveBeenCalledOnce();
});
it('verifies signature, issuer, audience, expiry, algorithm and nonce before exposing Google profile claims',async()=>{
 const p=await provider(),{privateKey,publicKey}=await generateKeyPair('RS256');
 mock.fetch.mockImplementation(async()=>new Response(JSON.stringify({keys:[{...await exportJWK(publicKey),kid:'key',alg:'RS256',use:'sig'}]})));
 const sign=async(patch:Record<string,unknown>={})=>new SignJWT({sub:'subject',name:'Name',email:'test@example.com',email_verified:true,nonce:'bound',...patch}).setProtectedHeader({alg:'RS256',kid:'key'}).setIssuer('https://accounts.google.com').setAudience('test-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const token=await sign();expect(await p.getUserInfo({idToken:token,expectedIdTokenNonce:'bound'})).toMatchObject({user:{email:'test@example.com'}});
 expect(await p.getUserInfo({idToken:token,expectedIdTokenNonce:'wrong'})).toBeNull();
 for(const patch of [{iss:'https://evil.example'},{aud:'wrong'},{exp:1}]){
  const bad=await new SignJWT({sub:'subject',iss:'https://accounts.google.com',aud:'test-client',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...patch}).setProtectedHeader({alg:'RS256',kid:'key'}).sign(privateKey);
  expect(await p.getUserInfo({idToken:bad})).toBeNull();
 }
 const other=await generateKeyPair('RS256');const forged=await new SignJWT({sub:'subject'}).setProtectedHeader({alg:'RS256',kid:'key'}).setIssuer('https://accounts.google.com').setAudience('test-client').setIssuedAt().setExpirationTime('5m').sign(other.privateKey);expect(await p.getUserInfo({idToken:forged})).toBeNull();
 expect(await p.getUserInfo({idToken:'eyJhbGciOiJub25lIn0.eyJzdWIiOiJmb3JnZWQifQ.'})).toBeNull();
});
it('does not install for production, localhost, fixture provider or disabled beta transport',()=>{
 expect(googleBetaTransportPlugins({...config,origin:'https://plunode.net'})).toEqual([]);expect(googleBetaTransportPlugins({...config,origin:'http://127.0.0.1:3200'})).toEqual([]);
 expect(googleBetaTransportPlugins({...config,provider:{kind:'fixture',issuer:'http://127.0.0.1'}})).toEqual([]);
 vi.stubEnv('PLUNODE_WINDOWS_HTTPS_TRANSPORT','0');expect(googleBetaTransportPlugins(config)).toEqual([]);expect(mock.fetch).not.toHaveBeenCalled();
});
