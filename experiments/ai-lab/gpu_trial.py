"""One operator-controlled short inference trial; never a GPU training gate."""
import argparse
from pathlib import Path
import time
from core import HERE,read_json,digest,wire
from runtime import LIMITS,probe,held,sealed_write,read_sealed,now
from monitoring import monitored_execute

PROFILE={**LIMITS,'gateVersion':'kev-short-window-v1','startBelowC':77,'minFreeVramMiB':1536,
         'utilizationWindowSamples':6,'windowMedianMaxPercent':5,'maxSamplesAbove20Percent':2,
         'maxTemperatureRiseInWindowC':1,'clientAbortAtC':80,'scope':'one-short-inference-only-not-training'}

def window_probe():
    window=[]
    for i in range(6):
        window.append(probe())
        if i!=5:time.sleep(.5)
    return {**window[-1],'window':window}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--token',required=True);parser.add_argument('--run-id',required=True)
    parser.add_argument('--home',type=Path,default=Path.home()/'.local/share/plunode-ai-lab/first-sortie-20261026')
    args=parser.parse_args();held(args.token)
    task=next(t for t in read_json(HERE/'data/tasks.json')['tasks'] if t['id']=='pluto-supervisor')
    result=monitored_execute(args.home,args.run_id,task,args.token,limits=PROFILE,observation=window_probe)
    telemetry=read_sealed(args.home/'telemetry'/(args.run_id+'.json'))
    rows=[s for s in telemetry['samples'] if 'usedMiB' in s]
    at_send=result.get('resourcesAtSend',{}).get('gpu')
    summary={'at':now(),'runId':args.run_id,'gateVersion':PROFILE['gateVersion'],'status':result['status'],
             'errorCode':result['errorCode'],'requestSent':(args.home/'runs'/args.run_id/'dispatch.json').exists(),
             'resourcesAtSend':at_send,'wallSeconds':result['metrics']['wallSeconds'],
             'peak':{k:max(s[k] for s in rows) for k in ['temperatureC','utilizationPercent','powerWatts','usedMiB']},
             'minimumFreeVramMiB':min(s['freeMiB'] for s in rows),
             'apparentAdditionalVramMiB':max(s['usedMiB'] for s in rows)-at_send['usedMiB'] if at_send else None,
             'serverCancellationGuaranteed':False,'trainingGateChanged':False,
             'conclusion':'single-observation-only; no OOM-based threshold lowering; GPU scheduling remains disabled'}
    sealed_write(args.home/'gpu-trials'/(args.run_id+'.json'),summary)
    print(wire(summary))
