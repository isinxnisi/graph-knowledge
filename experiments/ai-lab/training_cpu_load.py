#!/usr/bin/env python3
"""Independent CPU checkpoint load only. No forward/backward/optimizer/save."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

from runtime import EXPECTED_MODEL, Kev, held, now, probe, require, sealed_write, local_lock

LOAD = r'''
import os,json,time,resource
from pathlib import Path
assert not any(Path('/dev').glob('nvidia*'))
assert [p.name for p in Path('/sys/class/net').iterdir()]==['lo']
mounts=[x.split() for x in Path('/proc/mounts').read_text().splitlines()]
assert any(x[1]=='/models' and 'ro' in x[3].split(',') for x in mounts)
start=time.monotonic()
import torch
torch.set_num_threads(2)
assert not torch.cuda.is_available()
from kev.checkpoint import Checkpoint,LoadOptions
ck=Checkpoint('/models/hub/models--jaredpalmer--kev-0.8b/snapshots/bf75a6a8848ea6960ff2ed108d9ed44c2941174f')
assert ck.meta.base=='Qwen/Qwen3.5-0.8B-Base' and ck.meta.base_revision=='dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68'
tok,model=ck.load('cpu',LoadOptions(dtype=torch.float32,merge=False,attn='eager',backend='torch',cuda_graphs=False,fused=False))
parameters=list(model.parameters())
assert all(p.device.type=='cpu' for p in parameters)
print('PLUNODE_LOAD_RESULT='+json.dumps({'device':'cpu','dtype':str(parameters[0].dtype),'parameters':sum(p.numel() for p in parameters),
 'wallSeconds':time.monotonic()-start,'peakRssMiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,
 'checkpointLoaded':True,'adapterMerged':False,'pointerHeadLoaded':True,'forwardExecuted':False,'backwardExecuted':False,
 'optimizerUpdated':False,'checkpointSaved':False,'cudaAvailable':torch.cuda.is_available()}),flush=True)
'''


def load_only(args):
    held(args.token)
    require(not args.output.exists(), 'new_output_required')
    before=probe(); runtime_before=Kev().runtime()
    if before.get('availableRamMiB',0)<10240:
        sealed_write(args.output,{'status':'held','reason':'cpu_load_requires_10GiB_available','observedAt':now(),'resources':before})
        print(json.dumps({'status':'held','reason':'cpu_load_requires_10GiB_available'}));return
    image=subprocess.check_output(['docker','inspect','kev-service-kev-1','--format','{{.Image}}'],text=True,timeout=10).strip()
    mounts=json.loads(subprocess.check_output(['docker','inspect','kev-service-kev-1','--format','{{json .Mounts}}'],text=True,timeout=10))
    volume=next(m['Name'] for m in mounts if m['Destination']=='/models' and m['Type']=='volume')
    identity=str(uuid.uuid4());name='plunode-lab-cpu-load-'+identity
    sealed_write(args.output.with_suffix('.intent.json'),{'stage':'checkpoint-load-only','at':now(),
                 'containerName':name,'ownershipLabel':identity,'imageId':image,'inferenceCalls':0,
                 'optimizerUpdates':0,'automaticRetry':False})
    command=['docker','run','--name',name,'--label','plunode.lab.load='+identity,'-i','--network','none','--read-only',
             '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','6g','--memory-swap','6g','--cpus','2',
             '--pids-limit','128','--user','65534:65534','--tmpfs','/tmp:rw,noexec,nosuid,size=64m',
             '--mount','type=volume,src='+volume+',dst=/models,readonly','--env','HF_HUB_OFFLINE=1',
             '--env','HF_HOME=/models','--env','PYTHONDONTWRITEBYTECODE=1','--env','HOME=/tmp','--env','OMP_NUM_THREADS=2',
             '--entrypoint','python',image,'-']
    started=time.monotonic();held(args.token);timed_out=False
    try:
        result=subprocess.run(command,input=LOAD,text=True,capture_output=True,timeout=120)
        raw=result.stdout;stderr=result.stderr
    except subprocess.TimeoutExpired as error:
        timed_out=True;raw=(error.stdout or b'').decode() if isinstance(error.stdout,bytes) else error.stdout or ''
        stderr='load_timeout'
        # Stop only our named, labelled ephemeral container. Shared Kev is untouched.
        label=subprocess.check_output(['docker','inspect',name,'--format','{{index .Config.Labels "plunode.lab.load"}}'],text=True,timeout=10).strip()
        require(label==identity,'owned_container_required')
        subprocess.run(['docker','stop','--time','3',name],check=True,capture_output=True,timeout=15)
    state=json.loads(subprocess.check_output(['docker','inspect',name,'--format','{{json .State}}'],text=True,timeout=10))
    require(not state['Running'],'owned_load_still_running')
    lines=[line.split('=',1)[1] for line in raw.splitlines() if line.startswith('PLUNODE_LOAD_RESULT=')]
    measured=json.loads(lines[0]) if len(lines)==1 else None
    record={'schemaVersion':1,'observedAt':now(),'stage':'checkpoint-load-only','model':EXPECTED_MODEL,'imageId':image,
            'status':'completed' if measured and state['ExitCode']==0 else 'failed','wallSeconds':time.monotonic()-started,
            'container':{'network':'none','modelMount':'read-only','gpuDevices':False,'ramCapMiB':6144,'cpuCap':2,
                         'exitCode':state['ExitCode'],'oomKilled':state['OOMKilled'],'timedOut':timed_out},
            'measurement':measured,'resourcesBefore':before,'resourcesAfter':probe(),
            'sharedRuntimeBefore':runtime_before,'sharedRuntimeAfter':Kev().runtime(),
            'trainingFeasibilityOverall':'not-evaluated','optimizerUpdates':0,'stderr':stderr[-6000:]}
    sealed_write(args.output,record)
    label=subprocess.check_output(['docker','inspect',name,'--format','{{index .Config.Labels "plunode.lab.load"}}'],text=True,timeout=10).strip()
    require(label==identity,'owned_container_required')
    subprocess.run(['docker','rm',name],check=True,capture_output=True,timeout=10)
    print(json.dumps({k:record[k] for k in ['status','stage','wallSeconds','container','measurement','optimizerUpdates']}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    # A durable intent without a result requires inspection, never automatic re-entry.
    require(not args.output.with_suffix('.intent.json').exists(),'load_intent_exists_no_retry')
    with local_lock(args.output.parent):
        load_only(args)
