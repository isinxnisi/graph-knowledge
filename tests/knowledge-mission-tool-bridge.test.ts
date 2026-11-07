import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createMissionToolBridge} from '../lib/server/knowledge-mission-tool-bridge';

it('accepts only finite delivery operations, never paths, shell commands or arbitrary HTTP',async()=>{
 const execute=vi.fn(),bridge=createMissionToolBridge('/private/client.json',execute);
 for(const raw of [
  {action:'shell',command:'echo hello'},
  {action:'claim',origin:'https://another.example'},
  {action:'deliver',runId:randomUUID(),file:'/etc/passwd'},
  {action:'observe',runId:randomUUID(),urls:[]},
 ])expect(await bridge.call(raw)).toEqual({ok:false,code:'INVALID_ARGUMENT'});
 expect(execute).not.toHaveBeenCalled();
});
it('keeps the trusted client path fixed and binds structured payloads to their run',async()=>{
 const execute=vi.fn().mockResolvedValue({receiptId:'receipt'}),bridge=createMissionToolBridge('/private/client.json',execute);
 const runId=randomUUID(),value={format:'public-package',items:[]};
 expect(await bridge.call({runId,action:'deliver',package:value})).toEqual({ok:true,result:{receiptId:'receipt'}});
 expect(execute).toHaveBeenCalledWith(['/private/client.json','deliver'],{expectedRunId:runId,payload:value});
});
it('serializes operations so one call cannot overwrite another run checkpoint',async()=>{
 let release!:(value:unknown)=>void;
 const execute=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValueOnce({result:{lease:null}});
 const bridge=createMissionToolBridge('/private/client.json',execute);
 const a=bridge.call({action:'claim'}),b=bridge.call({action:'claim'});
 await Promise.resolve();expect(execute).toHaveBeenCalledTimes(1);release({result:{lease:null}});
 await Promise.all([a,b]);expect(execute).toHaveBeenCalledTimes(2);
});
it('does not return raw client errors or credentials, and allows a later retry',async()=>{
 const execute=vi.fn().mockRejectedValueOnce(Error('private bearer secret123')).mockRejectedValueOnce(Error('MISSION_LEASE_CHANGED')).mockResolvedValueOnce({result:{lease:null}});
 const bridge=createMissionToolBridge('/private/client.json',execute),input={action:'claim'};
 expect(await bridge.call(input)).toEqual({ok:false,code:'DELIVERY_UNAVAILABLE'});
 expect(await bridge.call(input)).toEqual({ok:false,code:'MISSION_LEASE_CHANGED'});
 expect((await bridge.call(input)).ok).toBe(true);
});
