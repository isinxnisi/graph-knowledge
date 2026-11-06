import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {runMissionClient} from '../scripts/knowledge-mission-client';
let dir:string,config:string,token:string,lease:{runId:string;generation:number;token:string;expiresAt:string};const fetcher=vi.fn();
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'plunode-mission-client-'));config=path.join(dir,'client.json');token=randomBytes(32).toString('hex');lease={runId:randomUUID(),generation:1,token:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+1800000).toISOString()};await mkdir(path.join(dir,'checkpoints'),{mode:0o700});await writeFile(path.join(dir,'token'),token,{mode:0o600});await writeFile(config,JSON.stringify({origin:'https://graph-beta.isinxnisi.com',tokenFile:path.join(dir,'token'),checkpointDirectory:path.join(dir,'checkpoints')}),{mode:0o600});fetcher.mockReset();vi.stubGlobal('fetch',fetcher);fetcher.mockResolvedValue(Response.json({result:{lease}}));});
afterEach(async()=>{vi.unstubAllGlobals();expect(dir.startsWith(path.join(tmpdir(),'plunode-mission-client-'))).toBe(true);await rm(dir,{recursive:true,force:true});});
it('keeps both credentials in private files and resumes a claimed brief without a second request',async()=>{
 const first=await runMissionClient([config,'claim']);expect(JSON.stringify(first)).not.toContain(token);expect(JSON.stringify(first)).not.toContain(lease.token);expect(fetcher.mock.calls[0][1].headers.authorization).toBe('Bearer '+token);expect(fetcher.mock.calls[0][1].redirect).toBe('error');
 await runMissionClient([config,'claim']);expect(fetcher).toHaveBeenCalledTimes(1);expect((await lstat(path.join(dir,'checkpoints/mission-current.json'))).mode&0o777).toBe(0o600);
});
it('recovers a prepared delivery after an unknown response without requesting new research',async()=>{
 await runMissionClient([config,'claim']);const file=path.join(dir,'package.json');await writeFile(file,JSON.stringify({publicSource:'Example'}),{mode:0o600});fetcher.mockRejectedValueOnce(Error('response lost'));
 await expect(runMissionClient([config,'deliver',file])).rejects.toThrow('response lost');const saved=JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8'));expect(saved.pending.action).toBe('deliver');
 fetcher.mockResolvedValueOnce(Response.json({receiptId:randomUUID(),replayed:true}));const recovered=await runMissionClient([config,'claim']);expect(recovered.recoveredDelivery).toBe(true);expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toEqual(saved.pending);expect(JSON.parse(await readFile(path.join(dir,'checkpoints/mission-current.json'),'utf8')).pending).toBeUndefined();
});
