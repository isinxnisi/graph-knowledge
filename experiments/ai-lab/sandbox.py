"""Bounded CPU-only ephemeral jobs; never restarts or writes shared Kev."""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
from core import HERE, digest, file_hash, read_json, require, uid
from runtime import EXPECTED_MODEL, held, local_lock, now, probe, read_sealed, sealed_write

IMAGE='sha256:b5b1dcd8fa386e60744f213c3a7ba4b4916adace3372333f6694c8c9c6157d12'
LIMITS={'ramMiB':6144,'cpus':2,'wallSeconds':180,'outputMiB':256,'minAvailableRamMiB':10240,'minFreeDiskMiB':2048}

def run_stage(directory, phase, token, *, stop_file=None, seconds=180):
    held(token);require(not stop_file or not Path(stop_file).exists(),'operator_stop');name='plunode-education-'+str(uuid.uuid4());label=str(uuid.uuid4())
    mounts=json.loads(subprocess.check_output(['docker','inspect','kev-service-kev-1','--format','{{json .Mounts}}'],text=True,timeout=10))
    volume=next(m['Name'] for m in mounts if m['Destination']=='/models' and m['Type']=='volume')
    output=directory/'output';output.mkdir(mode=0o700,exist_ok=True)
    command=['docker','run','--name',name,'--label','plunode.education='+label,'--network','none','--read-only',
             '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','6g','--memory-swap','6g','--cpus','2',
             '--pids-limit','128','--user',str(os.getuid())+':'+str(os.getgid()),'--tmpfs','/tmp:rw,noexec,nosuid,size=64m',
             '--mount','type=volume,src='+volume+',dst=/models,readonly',
             '--mount','type=bind,src='+str(output)+',dst=/out',
             '--mount','type=bind,src='+str(directory/'input.json')+',dst=/input.json,readonly',
             '--mount','type=bind,src='+str(HERE/'cpu_step.py')+',dst=/step.py,readonly',
             '--env','HF_HOME=/models','--env','HF_HUB_OFFLINE=1','--env','PYTHONDONTWRITEBYTECODE=1',
             '--env','HOME=/tmp','--env','OMP_NUM_THREADS=2','--entrypoint','python',IMAGE,'/step.py',phase]
    sealed_write(directory/(phase+'-intent.json'),{'at':now(),'container':name,'ownershipLabel':label,'phase':phase,'image':IMAGE,'sourceSha256':file_hash(HERE/'cpu_step.py'),'limits':LIMITS})
    start=time.monotonic();samples=[];reason=None
    with (directory/(phase+'.log')).open('w') as log:
        process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
        try:
            while process.poll() is None:
                samples.append(probe())
                size=sum(p.stat().st_size for p in output.rglob('*') if p.is_file())
                if time.monotonic()-start>seconds:reason='wall_limit'
                if size>LIMITS['outputMiB']*2**20:reason='output_limit'
                if stop_file and Path(stop_file).exists():reason='operator_stop'
                if reason:break
                time.sleep(1)
        finally:
            if process.poll() is None:
                owner=subprocess.check_output(['docker','inspect',name,'--format','{{index .Config.Labels "plunode.education"}}'],text=True,timeout=10).strip()
                require(owner==label,'container_ownership')
                subprocess.run(['docker','stop','--time','3',name],capture_output=True,check=True,timeout=15)
                process.wait(timeout=10)
    state=json.loads(subprocess.check_output(['docker','inspect',name,'--format','{{json .State}}'],text=True,timeout=10))
    require(not state['Running'],'container_still_running')
    events_file=output/('reload-events.jsonl' if phase=='reload' else 'events.jsonl')
    events=[json.loads(line) for line in events_file.read_text().splitlines()] if events_file.exists() else []
    result={'phase':phase,'status':'completed' if state['ExitCode']==0 and reason is None else 'failed','reason':reason,
            'exitCode':state['ExitCode'],'oomKilled':state['OOMKilled'],'wallSeconds':time.monotonic()-start,
            'events':events,'resources':samples,'gpuDevices':False,'network':'none','sharedModelMount':'read-only'}
    sealed_write(directory/(phase+'-result.json'),result)
    owner=subprocess.check_output(['docker','inspect',name,'--format','{{index .Config.Labels "plunode.education"}}'],text=True,timeout=10).strip()
    require(owner==label,'container_ownership');subprocess.run(['docker','rm',name],check=True,capture_output=True,timeout=10)
    return result

def experiment(home, run_id, request, token, *, stop_file=None):
    uid(run_id);held(token);home=Path(home)
    with local_lock(home):
        directory=home/'experiments'/run_id
        if (directory/'result.json').exists():
            result=read_sealed(directory/'result.json');require(result['inputSha256']==digest(request),'input_identity');return result
        require(not directory.exists(),'interrupted_experiment_no_retry')
        directory.mkdir(parents=True,mode=0o700)
        sealed_write(directory/'intent.json',{'runId':run_id,'at':now(),'inputSha256':digest(request),'sourceSha256':file_hash(HERE/'cpu_step.py'),'model':EXPECTED_MODEL,'limits':LIMITS,'codeCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE.parents[1],text=True).strip()})
        # Container reads a frozen plain input; targets are outside the inference request.
        from runtime import frozen_write
        frozen_write(directory/'input.json',request)
        observation=probe()
        result={'runId':run_id,'inputSha256':digest(request),'purpose':request['purpose'],'startedAt':now(),'status':'held',
                'reason':None,'optimizerUpdates':0,'checkpointReloaded':False,'stages':[],'model':EXPECTED_MODEL,'limits':LIMITS}
        if stop_file and Path(stop_file).exists():result['reason']='operator_stop'
        elif observation.get('availableRamMiB',0)<LIMITS['minAvailableRamMiB']:result['reason']='ram_headroom'
        elif observation['freeDiskMiB']<LIMITS['minFreeDiskMiB']:result['reason']='disk_headroom'
        else:
            result['status']='failed'
            experiment_start=time.monotonic()
            for phase in ('train','reload'):
                remaining=LIMITS['wallSeconds']-(time.monotonic()-experiment_start)
                if remaining<=0:result['reason']='wall_limit';break
                stage=run_stage(directory,phase,token,stop_file=stop_file,seconds=remaining);result['stages'].append(stage)
                if phase=='train':result['optimizerUpdates']=int(any(e['stage']=='optimizer' for e in stage['events']))
                if stage['status']!='completed':result['reason']=stage['reason'] or ('oom' if stage['oomKilled'] else 'stage_failed');break
                if phase=='reload':result.update(status='completed',checkpointReloaded=True)
        result['finishedAt']=now();sealed_write(directory/'result.json',result);return result

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--home',type=Path,required=True);parser.add_argument('--run-id',required=True);parser.add_argument('--token',required=True)
    args=parser.parse_args()
    row={'taskId':'synthetic-infrastructure-only','state':'A B','instructions':'Select A.','criteria':{'A':'A','B':'B'}}
    result=experiment(args.home,args.run_id,{'purpose':'synthetic-infrastructure-only','train':row,'target':'A','holdout':[row]},args.token)
    print(json.dumps({k:result[k] for k in ['runId','status','reason','optimizerUpdates','checkpointReloaded']}))
