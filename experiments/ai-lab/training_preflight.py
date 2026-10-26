"""Read-only offline container preflight; no model load, GPU access or training."""
import argparse
import json
from pathlib import Path
import subprocess
from runtime import EXPECTED_MODEL, frozen_write, held, now

INSPECT = r'''
import importlib.metadata as md
import json, math, os, struct, tempfile
from pathlib import Path
base=Path('/models/hub/models--Qwen--Qwen3.5-0.8B-Base/snapshots/dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68')
adapter=Path('/models/hub/models--jaredpalmer--kev-0.8b/snapshots/bf75a6a8848ea6960ff2ed108d9ed44c2941174f')
def header_info(directory):
 result=[]
 for path in directory.glob('*.safetensors'):
  with path.open('rb') as source:
   size=struct.unpack('<Q',source.read(8))[0]
   if size>16*1024*1024: raise ValueError('header_limit')
   header=json.loads(source.read(size))
  tensors=[v for k,v in header.items() if k!='__metadata__']
  result.append({'file':path.name,'bytes':path.stat().st_size,'parameters':sum(math.prod(v['shape']) for v in tensors),'dtypes':sorted({v['dtype'] for v in tensors})})
 return result
mounts=Path('/proc/mounts').read_text().splitlines()
readonly_models=any(x.split()[1]=='/models' and 'ro' in x.split()[3].split(',') for x in mounts)
readonly_root=any(x.split()[1]=='/' and 'ro' in x.split()[3].split(',') for x in mounts)
assert readonly_models and readonly_root
assert not any(Path('/dev').glob('nvidia*'))
assert not any(k for k in os.environ if any(x in k for x in ['TOKEN','PASSWORD','SECRET','API_KEY']))
interfaces=[p.name for p in Path('/sys/class/net').iterdir()]
assert interfaces==['lo']
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'write-probe';p.write_text('isolated tmp only');assert p.read_text()=='isolated tmp only'
weights=header_info(base)
assert weights and header_info(adapter)
params=sum(x['parameters'] for x in weights)
def version(name):
 try: return md.version(name)
 except md.PackageNotFoundError: return None
headers={}
for path in base.glob('*.safetensors'):
 with path.open('rb') as source:
  size=struct.unpack('<Q',source.read(8))[0];assert size<=16*1024*1024
  headers.update({k:v for k,v in json.loads(source.read(size)).items() if k!='__metadata__'})
embedding=sum(math.prod(v['shape']) for k,v in headers.items() if 'embed_tokens' in k)
config=json.loads((base/'config.json').read_text())
print(json.dumps({'checks':{'rootReadOnly':readonly_root,'modelMountReadOnly':readonly_models,'networkInterfaces':interfaces,'gpuDevices':False,'credentialsPresent':False,'ephemeralTmpWrite':True},'dependencies':{n:version(n) for n in ['torch','transformers','peft','accelerate','safetensors','bitsandbytes','triton','flash-linear-attention','causal-conv1d']},'baseWeightHeaders':weights,'adapterWeightHeaders':header_info(adapter),'baseParameters':params,'embeddingParameters':embedding,'baseFp32MiB':round(params*4/2**20,2),'baseFp16MiB':round(params*2/2**20,2),'idealFourBitAllWeightsMiB':round(params*.5/2**20,2),'modelType':config.get('model_type'),'architectures':config.get('architectures'),'proposedAdditionalVramMiB':2048,'baseAloneExceedsProposedCap':params*4>2048*2**20,'modelLoaded':False,'trainingExecuted':False}))
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    held(args.token)
    image=subprocess.check_output(['docker','image','inspect','kev-service:local','--format','{{.Id}}'],text=True,timeout=15).strip()
    mounts=json.loads(subprocess.check_output(['docker','inspect','kev-service-kev-1','--format','{{json .Mounts}}'],text=True,timeout=15))
    matches=[m for m in mounts if m['Destination']=='/models' and m['Type']=='volume']
    if len(matches)!=1: raise ValueError('known_model_mount_required')
    command=['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL',
             '--security-opt','no-new-privileges','--memory','512m','--memory-swap','512m','--cpus','1',
             '--pids-limit','64','--user','65534:65534','--tmpfs','/tmp:rw,noexec,nosuid,size=16m',
             '--mount','type=volume,src='+matches[0]['Name']+',dst=/models,readonly',
             '--env','HF_HUB_OFFLINE=1','--env','PYTHONDONTWRITEBYTECODE=1','--env','HOME=/tmp',
             '--entrypoint','python',image,'-']
    raw=subprocess.run(command,input=INSPECT,text=True,capture_output=True,timeout=45,check=True)
    result={'schemaVersion':1,'observedAt':now(),'imageId':image,'model':EXPECTED_MODEL,
            'status':'infrastructure-only-verified','trainingFeasibilityOverall':'not-evaluated',
            'assessedConfiguration':{'dtype':'float32','sharedKevConcurrent':True,'additionalVramCapMiB':2048,
                                     'verdict':'base-weight-lower-bound-exceeds-old-cap'},
            'dataReadiness':{'reviewedTrainingData':False,'independentFinalEvaluation':False,
                            'separateFromRuntimeFeasibility':True},'result':json.loads(raw.stdout),
            'limitations':['No torch/model import, forward, backward, optimizer, checkpoint save or reload.',
                           'Ephemeral preflight uses the existing image and read-only model volume; no independent training runtime is installed.',
                           'GPU kernels, backward/optimizer memory and checkpoint reload remain unmeasured.',
                           'Synthetic infrastructure probes are separate from reviewed training data and semantic evaluation.']}
    frozen_write(args.output,result)
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    main()
