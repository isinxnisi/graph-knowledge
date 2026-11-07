import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {runMissionClient} from '../scripts/knowledge-mission-client';
let dir:string,config:string,token:string,lease:{runId:string;generation:number;token:string;expiresAt:string};const fetcher=vi.fn();
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'plunode-mission-client-'));config=path.join(dir,'client.json');token=randomBytes(32).toString('hex');lease={runId:randomUUID(),generation:1,token:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+1800000).toISOString()};await mkdir(path.join(dir,'checkpoints'),{mode:0o700});await writeFile(path.join(dir,'token'),token,{mode:0o600});await writeFile(config,JSON.stringify({origin:'https://graph-beta.isinxnisi.com',tokenFile:path.join(dir,'token'),checkpointDirectory:path.join(dir,'checkpoints')}),{mode:0o600});fetcher.mockReset();vi.stubGlobal('fetch',fetcher);fetcher.mockResolvedValue(Response.json({result:{lease}}));});
afterEach(async()=>{vi.unstubAllGlobals();expect(dir.startsWith(path.join(tmpdir(),'plunode-mission-client-'))).toBe(true);await rm(dir,{recursive:true,force:true});});
it('keeps both credentials private and revalidates a resumed brief before more research',async()=>{
 const first=await runMissionClient([config,'claim']);expect(JSON.stringify(first)).not.toContain(token);expect(JSON.stringify(first)).not.toContain(lease.token);expect(fetcher.mock.calls[0][1].headers.authorization).toBe('Bearer '+token);expect(fetcher.mock.calls[0][1].redirect).toBe('error');
 fetcher.mockResolvedValueOnce(Response.json({lease}));const resumed=await runMissionClient([config,'claim']);expect(fetcher).toHaveBeenCalledTimes(2);expect(JSON.parse(fetcher.mock.calls[1][1].body).action).toBe('resume');expect(JSON.stringify(resumed)).not.toContain(lease.token);expect((await lstat(path.join(dir,'checkpoints/mission-current.json'))).mode&0o777).toBe(0o600);
});
it('does not return a stale saved brief when its plan was stopped or changed',async()=>{
 await runMissionClient([config,'claim']);fetcher.mockResolvedValueOnce(Response.json({error:{code:'MISSION_LEASE_CHANGED'}},{status:409}));
 await expect(runMissionClient([config,'claim'])).rejects.toThrow('MISSION_LEASE_CHANGED');
 const saved=JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8'));expect(saved.lease).toBeUndefined();expect(saved.result.state).toBe('stale');
 fetcher.mockResolvedValueOnce(Response.json({result:{lease}}));await runMissionClient([config,'claim']);expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).action).toBe('claim');
});
it('retains its checkpoint when a resume response is incomplete',async()=>{
 await runMissionClient([config,'claim']);fetcher.mockResolvedValueOnce(Response.json({lease:null}));
 await expect(runMissionClient([config,'claim'])).rejects.toThrow('確認応答が不完全');
 expect(JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8')).lease.runId).toBe(lease.runId);
});
it('recovers a prepared delivery after an unknown response without requesting new research',async()=>{
 await runMissionClient([config,'claim']);const file=path.join(dir,'package.json');await writeFile(file,JSON.stringify({publicSource:'Example'}),{mode:0o600});fetcher.mockRejectedValueOnce(Error('response lost'));
 await expect(runMissionClient([config,'deliver',file])).rejects.toThrow('response lost');const saved=JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8'));expect(saved.pending.action).toBe('deliver');
 fetcher.mockResolvedValueOnce(Response.json({receiptId:randomUUID(),replayed:true}));const recovered=await runMissionClient([config,'claim']);expect(recovered.recoveredDelivery).toBe(true);expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toEqual(saved.pending);expect(JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8')).pending).toBeUndefined();
});
it('recovers an observation without dropping the live delivery lease',async()=>{
 await runMissionClient([config,'claim']);const file=path.join(dir,'urls.json');await writeFile(file,JSON.stringify(['https://example.org/source']),{mode:0o600});
 fetcher.mockRejectedValueOnce(Error('observation response lost'));await expect(runMissionClient([config,'observe',file])).rejects.toThrow('response lost');
 fetcher.mockResolvedValueOnce(Response.json({result:{observations:[{state:'first'}]}}));const recovered=await runMissionClient([config,'claim']);expect(recovered.recoveredObservation).toBe(true);
 const saved=JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8'));expect(saved.lease.runId).toBe(lease.runId);expect(saved.pending).toBeUndefined();
});

it('refuses structured chat data for a different run before it sends or reads any input path',async()=>{
 await runMissionClient([config,'claim']);fetcher.mockClear();
 await expect(runMissionClient([config,'deliver','/etc/passwd'],{expectedRunId:randomUUID(),payload:{}})).rejects.toThrow('MISSION_LEASE_CHANGED');
 expect(fetcher).not.toHaveBeenCalled();
});
it('sends chat payload as JSON instead of interpreting it as a file path',async()=>{
 await runMissionClient([config,'claim']);fetcher.mockResolvedValueOnce(Response.json({receiptId:randomUUID()}));
 await runMissionClient([config,'deliver','/etc/passwd'],{expectedRunId:lease.runId,payload:{publicSource:'https://example.org'}});
 const body=JSON.parse(fetcher.mock.calls.at(-1)![1].body);
 expect(body.package).toEqual({publicSource:'https://example.org'});expect(body.token).toBe(lease.token);
});
