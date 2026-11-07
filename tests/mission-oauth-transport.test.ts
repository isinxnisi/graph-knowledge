import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
const mocks=vi.hoisted(()=>({configure:vi.fn(),resolve4:vi.fn(),resolve6:vi.fn(),cancel:vi.fn(),request:vi.fn()}));
vi.mock('node:dns/promises',()=>({Resolver:class{
 constructor(options:unknown){mocks.configure(options);}
 resolve4=mocks.resolve4;resolve6=mocks.resolve6;cancel=mocks.cancel;
}}));
vi.mock('node:https',()=>({request:mocks.request}));
import {fetchMissionClientMetadataResource as fetchMetadata} from '../lib/server/member/mission-oauth-transport';
const url='https://chatgpt.com/oauth/client.json';
beforeEach(()=>{
 vi.resetAllMocks();mocks.resolve4.mockResolvedValue(['104.18.32.7']);mocks.resolve6.mockResolvedValue(['2606:4700::6812:2007']);
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 mocks.request.mockImplementation((_url,_options,respond)=>{
  const req=Object.assign(new EventEmitter(),{end:()=>respond(Object.assign(Readable.from([Buffer.from('{}')]),{statusCode:200,headers:{'content-type':'application/json'},statusMessage:'OK'}))});
  return req;
 });
});
afterEach(()=>vi.restoreAllMocks());
it('pins the validated DNS address and preserves TLS identity without forwarding credentials',async()=>{
 const r=await fetchMetadata(url,{headers:{Accept:'application/json',Authorization:'secret',Cookie:'private=1','If-None-Match':'etag'}});
 expect(r.status).toBe(200);expect(await r.json()).toEqual({});
 expect(mocks.resolve4).toHaveBeenCalledOnce();expect(mocks.resolve6).not.toHaveBeenCalled();
 expect(mocks.configure).toHaveBeenCalledWith({timeout:1000,tries:2});
 const options=mocks.request.mock.calls[0][1];expect(options.servername).toBe('chatgpt.com');
 expect(options.family).toBe(4);
 expect(options.headers).toEqual({host:'chatgpt.com',accept:'application/json','if-none-match':'etag'});
 const callback=vi.fn();options.lookup('chatgpt.com',{all:true},callback);
 expect(callback).toHaveBeenCalledWith(null,[{address:'104.18.32.7',family:4}]);
 callback.mockClear();options.lookup('chatgpt.com',{},callback);
 expect(callback).toHaveBeenCalledWith(null,'104.18.32.7',4);
});
it('rejects private or mixed IPv4 answers before connecting',async()=>{
 for(const v4 of [['127.0.0.1'],['104.18.32.7','169.254.169.254'],[]]){
  mocks.resolve4.mockResolvedValue(v4);
  await expect(fetchMetadata(url)).rejects.toThrow('public-routable');
 }
 expect(mocks.request).not.toHaveBeenCalled();
});
it('fails closed when IPv4 DNS fails rather than trying the unavailable IPv6 route',async()=>{
 mocks.resolve4.mockRejectedValue(new Error('no A record'));
 await expect(fetchMetadata(url)).rejects.toThrow('no A record');
 expect(mocks.resolve6).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();
});
it('refuses other origins, credentials, ports and methods before DNS',async()=>{
 for(const target of ['http://chatgpt.com/oauth/client.json','https://chatgpt.com.evil.example/client.json','https://user:pass@chatgpt.com/oauth/client.json','https://chatgpt.com:8443/oauth/client.json'])await expect(fetchMetadata(target)).rejects.toThrow();
 await expect(fetchMetadata(url,{method:'POST'})).rejects.toThrow('GET or HEAD');
 expect(mocks.resolve4).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();
});
it('returns a redirect without following it and preserves conditional responses',async()=>{
 mocks.request.mockImplementation((_url,_options,respond)=>Object.assign(new EventEmitter(),{end:()=>respond(Object.assign(Readable.from([]),{statusCode:304,headers:{etag:'fresh'},statusMessage:'Not Modified'}))}));
 const r=await fetchMetadata(url);expect(r.status).toBe(304);expect(r.body).toBeNull();
 mocks.request.mockImplementation((_url,_options,respond)=>Object.assign(new EventEmitter(),{end:()=>respond(Object.assign(Readable.from([]),{statusCode:302,headers:{location:'https://example.com'},statusMessage:'Found'}))}));
 expect((await fetchMetadata(url)).status).toBe(302);expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('cancels in-flight DNS on the library deadline and never connects afterward',async()=>{
 const pending:((e:Error)=>void)[]=[];
 mocks.resolve4.mockImplementation(()=>new Promise((_resolve,reject)=>pending.push(reject)));
 mocks.resolve6.mockImplementation(()=>new Promise((_resolve,reject)=>pending.push(reject)));
 mocks.cancel.mockImplementation(()=>pending.forEach(reject=>reject(new Error('cancelled'))));
 const controller=new AbortController(),result=fetchMetadata(url,{signal:controller.signal});controller.abort();
 await expect(result).rejects.toThrow();expect(mocks.cancel).toHaveBeenCalledOnce();expect(mocks.request).not.toHaveBeenCalled();
});
it('handles repeated socket errors without an uncaught error event',async()=>{
 mocks.request.mockImplementation(()=>Object.assign(new EventEmitter(),{end:()=>{}}));
 const result=fetchMetadata(url);
 await vi.waitFor(()=>expect(mocks.request).toHaveBeenCalledOnce());
 const req=mocks.request.mock.results[0].value;
 req.emit('error',new Error('socket failed'));
 await expect(result).rejects.toThrow('socket failed');
 expect(()=>req.emit('error',new Error('late abort'))).not.toThrow();
 expect(console.warn).toHaveBeenCalledWith('Collection OAuth metadata request failed',{stage:'https',code:'UNKNOWN'});
});
