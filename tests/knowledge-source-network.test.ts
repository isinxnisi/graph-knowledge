import {describe,it,expect,vi,beforeEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const mock=vi.hoisted(()=>({lookups:vi.fn(),requests:vi.fn(),responses:[] as {status:number;headers:Record<string,string>;body:string}[]}));
vi.mock('node:dns/promises',()=>({lookup:mock.lookups}));
vi.mock('node:https',()=>({request:mock.requests}));
import {publicSourceDocument,verifySourceExcerpt} from '../lib/server/knowledge-source-verification';
beforeEach(()=>{
 vi.clearAllMocks();mock.responses=[];mock.lookups.mockResolvedValue([{address:'8.8.8.8',family:4}]);
 mock.requests.mockImplementation((_url,options,cb)=>{
  const req=new EventEmitter() as EventEmitter&{end:()=>void};
  req.end=()=>queueMicrotask(()=>{const value=mock.responses.shift()!;const res=new PassThrough() as PassThrough&{statusCode:number;headers:Record<string,string>};res.statusCode=value.status;res.headers=value.headers;cb(res);res.end(value.body);});
  const pinned=vi.fn();options.lookup('untrusted-rebinding.example',{},pinned);expect(pinned).toHaveBeenCalledWith(null,'8.8.8.8',4);return req;
 });
});
describe('source network boundary',()=>{
 it('retains requested and final URLs only after a safe redirect and exact quote match',async()=>{
  mock.responses.push({status:302,headers:{location:'https://publisher.example.org/final'},body:''},{status:200,headers:{'content-type':'text/plain'},body:'A verified quote.'});
  expect(await verifySourceExcerpt('https://example.org/start#quote','verified quote')).toMatchObject({requestedUrl:'https://example.org/start',url:'https://publisher.example.org/final',textSha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(mock.lookups).toHaveBeenCalledTimes(2);
 });
 it('pins the checked address and transmits no cookies or authorization',async()=>{
  mock.responses.push({status:200,headers:{'content-type':'text/html'},body:'<p>A public source.</p>'});const result=await publicSourceDocument('https://example.org/source');expect(result.body.toString()).toContain('public source');
  const options=mock.requests.mock.calls[0][1];expect(options.family).toBe(4);expect(options.headers.Authorization).toBeUndefined();expect(options.headers.Cookie).toBeUndefined();expect(mock.lookups).toHaveBeenCalledTimes(1);
 });
 it('rechecks redirects and prevents a redirect into a private network',async()=>{
  mock.lookups.mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'127.0.0.1',family:4}]);mock.responses.push({status:302,headers:{location:'https://127.0.0.1/private'},body:''});await expect(publicSourceDocument('https://example.org')).rejects.toThrow('内部ネットワーク');expect(mock.requests).toHaveBeenCalledTimes(1);
 });
 it('rejects mixed public/private DNS answers in the selected address family',async()=>{
  mock.lookups.mockResolvedValueOnce([{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]);await expect(publicSourceDocument('https://example.org')).rejects.toThrow('内部ネットワーク');expect(mock.requests).not.toHaveBeenCalled();
 });
 it('keeps Retry-After as a temporary source failure',async()=>{
  mock.responses.push({status:429,headers:{'retry-after':'600'},body:''});await expect(publicSourceDocument('https://example.org')).rejects.toMatchObject({retryable:true,retryAfterMs:600000});
 });
 it('does not permanently reject input when a source explicitly presents a bot challenge',async()=>{mock.responses.push({status:403,headers:{'cf-mitigated':'challenge'},body:'challenge'});await expect(publicSourceDocument('https://example.org')).rejects.toMatchObject({retryable:true,message:expect.stringContaining('自動取得制限')});});
 it('rejects unsupported and oversized documents',async()=>{
  mock.responses.push({status:200,headers:{'content-type':'application/pdf'},body:'pdf'});await expect(publicSourceDocument('https://example.org')).rejects.toMatchObject({retryable:false});
  mock.responses.push({status:200,headers:{'content-type':'text/plain'},body:'a'.repeat(2000001)});await expect(publicSourceDocument('https://example.org')).rejects.toThrow('大きすぎ');
 });
});
