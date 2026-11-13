import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const mock=vi.hoisted(()=>({spawn:vi.fn(),lookup:vi.fn(),config:'',args:[] as string[],status:200,exit:0}));
vi.mock('node:child_process',()=>({spawn:mock.spawn}));
vi.mock('node:dns/promises',()=>({lookup:mock.lookup}));
import {GOOGLE_KEYS_ENDPOINT,GOOGLE_TOKEN_ENDPOINT,windowsBetaGoogleAuthFetch} from '../lib/server/windows-beta-google-auth';
const secret='private-client-secret',code='private-code';
const init=():RequestInit=>({method:'POST',redirect:'error',headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:'pkce-secret',redirect_uri:'https://graph-beta.isinxnisi.com/api/auth/callback/google',client_id:'client',client_secret:secret}).toString()});
beforeEach(()=>{
 vi.clearAllMocks();mock.config='';mock.status=200;mock.exit=0;
 vi.stubEnv('PLUNODE_WINDOWS_HTTPS_TRANSPORT','1');vi.stubEnv('KNOWLEDGE_RUNTIME','beta');vi.stubEnv('KNOWLEDGE_PUBLIC_ORIGIN','https://graph-beta.isinxnisi.com');
 mock.lookup.mockResolvedValue([{address:'142.250.1.1',family:4}]);
 mock.spawn.mockImplementation((_file,args)=>{
  mock.args=args;
  const child=new EventEmitter() as EventEmitter&{stdin:PassThrough;stdout:PassThrough;kill:()=>void};
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.kill=vi.fn();
  child.stdin.on('data',c=>mock.config+=c.toString());
  child.stdin.on('finish',()=>queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('HTTP/2 '+mock.status+' OK\r\nContent-Type: application/json\r\n\r\n{"keys":[]}'));child.emit('close',mock.exit);}));
  return child;
 });
});
afterEach(()=>vi.unstubAllEnvs());
it('sends the exact code exchange on stdin once, with PKCE, verified TLS and public DNS pinning',async()=>{
 expect((await windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).status).toBe(200);
 expect(mock.spawn).toHaveBeenCalledOnce();expect(mock.args.join(' ')).not.toContain(secret);expect(mock.args.join(' ')).not.toContain(code);
 expect(mock.args).not.toContain('--insecure');expect(mock.args).toContain('oauth2.googleapis.com:443:142.250.1.1');expect(mock.args).toContain('--max-redirs');
 const wire=mock.config.split('\n').find(l=>l.startsWith('data-binary = '))!;
 expect(JSON.parse(wire.slice(14))).toBe(init().body);
});
it('permits only the fixed public verification keys GET',async()=>{
 expect(await (await windowsBetaGoogleAuthFetch(GOOGLE_KEYS_ENDPOINT,{method:'GET',redirect:'error',headers:{accept:'application/json'}})).json()).toEqual({keys:[]});
 expect(mock.config).not.toContain('data-binary');
});
it('never activates for production or when the beta option is absent',async()=>{
 vi.stubEnv('KNOWLEDGE_RUNTIME','production');await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).rejects.toThrow('DISABLED');
 vi.stubEnv('KNOWLEDGE_RUNTIME','beta');vi.stubEnv('PLUNODE_WINDOWS_HTTPS_TRANSPORT','0');await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).rejects.toThrow('DISABLED');expect(mock.spawn).not.toHaveBeenCalled();
});
it('rejects arbitrary destinations, redirects, headers, methods and malformed/duplicate fields before sending credentials',async()=>{
 for(const url of [GOOGLE_TOKEN_ENDPOINT+'?x=1',GOOGLE_TOKEN_ENDPOINT+'#x',GOOGLE_TOKEN_ENDPOINT.replace('oauth2','other'),'https://user:secret@oauth2.googleapis.com/token'])await expect(windowsBetaGoogleAuthFetch(url,init())).rejects.toThrow();
 for(const patch of [{method:'GET'},{redirect:'follow'}, {headers:{authorization:secret}}, {body:String(init().body)+'&code=second'}, {body:String(init().body).replace('graph-beta.isinxnisi.com','evil.example')},{body:'a'.repeat(32769)}] as RequestInit[])await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,{...init(),...patch})).rejects.toThrow();
 expect(mock.spawn).not.toHaveBeenCalled();
});
it('rejects private/mixed addresses and pre-aborted requests',async()=>{
 mock.lookup.mockResolvedValue([{address:'127.0.0.1',family:4}]);await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).rejects.toThrow('ADDRESS');
 await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,{...init(),signal:AbortSignal.abort()})).rejects.toThrow();expect(mock.spawn).not.toHaveBeenCalled();
});
it('preserves provider rejection, refuses redirects and never retries a failed code exchange',async()=>{
 mock.status=400;expect((await windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).status).toBe(400);
 mock.spawn.mockClear();mock.status=302;await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).rejects.toThrow('TRANSPORT');expect(mock.spawn).toHaveBeenCalledOnce();
 mock.spawn.mockClear();mock.exit=28;await expect(windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,init())).rejects.toThrow('TRANSPORT');expect(mock.spawn).toHaveBeenCalledOnce();
});
