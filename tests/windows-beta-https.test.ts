import {afterEach,expect,it,vi} from 'vitest';
import {parseWindowsBetaResponse,validateWindowsBetaDestination,windowsBetaHttpsEnabled} from '../lib/server/windows-beta-https';
afterEach(()=>vi.unstubAllEnvs());
it('is opt-in and cannot activate for a formal origin',()=>{
 vi.stubEnv('PLUNODE_WINDOWS_HTTPS_TRANSPORT','1');vi.stubEnv('KNOWLEDGE_RUNTIME','production');expect(windowsBetaHttpsEnabled()).toBe(false);
 vi.stubEnv('KNOWLEDGE_RUNTIME','beta');vi.stubEnv('KNOWLEDGE_PUBLIC_ORIGIN','https://plunode.net');expect(windowsBetaHttpsEnabled()).toBe(false);
});
it('limits Windows HTTPS to trusted hosts and validated public IPv4',()=>{
 validateWindowsBetaDestination(new URL('https://chatgpt.com/oauth/client.json'),'104.18.32.7','metadata');
 validateWindowsBetaDestination(new URL('https://files.oaiusercontent.com/file.png?signature=secret'),'104.18.32.7','attachment');
 validateWindowsBetaDestination(new URL('https://oaisdmntprkoreacentral.blob.core.windows.net/private/image?sig=test'),'20.60.1.1','attachment');
 expect(()=>validateWindowsBetaDestination(new URL('https://untrusted.blob.core.windows.net/private/image'),'20.60.1.1','attachment')).toThrow();
 for(const url of ['http://chatgpt.com/oauth/client.json','https://chatgpt.com.evil.example/file','https://user:pass@chatgpt.com/file','https://chatgpt.com:444/file','https://chatgpt.com/file#fragment'])expect(()=>validateWindowsBetaDestination(new URL(url),'104.18.32.7','metadata')).toThrow();
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1'])expect(()=>validateWindowsBetaDestination(new URL('https://chatgpt.com/file'),ip,'metadata')).toThrow();
 expect(()=>validateWindowsBetaDestination(new URL('https://www.amazon.co.jp/image.jpg'),'104.18.32.7','attachment')).toThrow();
});
it('retains binary response bytes, cache headers and redirect status without following them',async()=>{
 const raw=Buffer.concat([Buffer.from('HTTP/2 200 OK\r\nContent-Type: image/png\r\nETag: version1\r\n\r\n'),Buffer.from([0,255,128,10])]);
 const response=parseWindowsBetaResponse(raw,4,'GET');expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0,255,128,10]);expect(response.headers.get('etag')).toBe('version1');
 expect(()=>parseWindowsBetaResponse(raw,3,'GET')).toThrow();
 const redirect=parseWindowsBetaResponse(Buffer.from('HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/secret\r\n\r\n'),1024,'GET');expect(redirect.status).toBe(302);
});
