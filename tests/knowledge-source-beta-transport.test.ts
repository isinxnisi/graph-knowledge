import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn(),enabled:vi.fn(),fetch:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:mock.lookup}));
vi.mock('node:https',()=>({request:mock.request}));
vi.mock('../lib/server/windows-beta-https',()=>({windowsBetaHttpsEnabled:mock.enabled,windowsBetaHttps:mock.fetch}));
import {publicSourceDocument,verifySourceExcerpt} from '../lib/server/knowledge-source-verification';
beforeEach(()=>{vi.clearAllMocks();mock.enabled.mockReturnValue(true);mock.lookup.mockResolvedValue([{address:'8.8.8.8',family:4}]);});
describe('beta source transport keeps normal verification',()=>{
 it('retains fetched body hashes and exact quote matching through the selected transport',async()=>{
  mock.fetch.mockImplementation(async()=>new Response('<p>Original public evidence.</p>',{headers:{'content-type':'text/html'}}));
  const proof=await verifySourceExcerpt('https://example.org/source#part','public evidence');expect(proof).toMatchObject({url:'https://example.org/source',bodySha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(mock.fetch).toHaveBeenCalledWith(new URL('https://example.org/source'),'8.8.8.8','source',expect.any(AbortSignal),'GET',{Accept:'text/html, text/plain;q=0.9','Accept-Encoding':'identity'});expect(mock.request).not.toHaveBeenCalled();
  await expect(verifySourceExcerpt('https://example.org/source','invented quote')).rejects.toMatchObject({retryable:false});
 });
 it('checks every redirect and blocks private or mixed DNS before transport',async()=>{
  mock.fetch.mockResolvedValue(new Response(null,{status:302,headers:{location:'https://private.example/doc'}}));mock.lookup.mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'10.1.1.1',family:4}]);
  await expect(publicSourceDocument('https://example.org')).rejects.toThrow('内部ネットワーク');expect(mock.fetch).toHaveBeenCalledTimes(1);
  mock.fetch.mockClear();mock.lookup.mockResolvedValueOnce([{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]);await expect(publicSourceDocument('https://example.org')).rejects.toThrow('内部ネットワーク');expect(mock.fetch).not.toHaveBeenCalled();
 });
 it('does not turn blocked, overloaded, or non-text sources into evidence',async()=>{
  mock.fetch.mockResolvedValueOnce(new Response('challenge',{status:403}));await expect(publicSourceDocument('https://example.org')).rejects.toMatchObject({retryable:false});
  mock.fetch.mockResolvedValueOnce(new Response('',{status:503,headers:{'retry-after':'600'}}));await expect(publicSourceDocument('https://example.org')).rejects.toMatchObject({retryable:true,retryAfterMs:600000});
  mock.fetch.mockResolvedValueOnce(new Response('pdf',{headers:{'content-type':'application/pdf'}}));await expect(publicSourceDocument('https://example.org')).rejects.toMatchObject({retryable:false});
 });
 it('keeps an explicit site challenge retryable without treating its page as evidence',async()=>{mock.fetch.mockResolvedValue(new Response('Just a moment',{status:403,headers:{'cf-mitigated':'challenge'}}));await expect(verifySourceExcerpt('https://example.org','quote')).rejects.toMatchObject({retryable:true,message:expect.stringContaining('自動取得制限')});});
 it('keeps the existing source size limit permanent rather than retrying oversized pages',async()=>{mock.fetch.mockRejectedValue(new Error('BETA_HTTPS_TOO_LARGE'));await expect(verifySourceExcerpt('https://example.org','quote')).rejects.toMatchObject({retryable:false,message:expect.stringContaining('大きすぎ')});});
 it('keeps transport failures retryable instead of bypassing source verification',async()=>{mock.fetch.mockRejectedValue(new Error('BETA_HTTPS_TRANSPORT'));await expect(verifySourceExcerpt('https://example.org','quote')).rejects.toMatchObject({retryable:true});});
});
