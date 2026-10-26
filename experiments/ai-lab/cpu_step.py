"""Offline container program: existing Kev adapter/head, one bounded update or reload.

Executed only by sandbox.py. Synthetic probes are not education or improvement.
"""
import hashlib
import json
from pathlib import Path
import resource
import sys
import time

START=time.monotonic()
OUT=Path('/out')
def event(stage, **fields):
    value={'stage':stage,'wallSeconds':time.monotonic()-START,'cpuSeconds':time.process_time(),
           'peakRssMiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,**fields}
    with (OUT/('reload-events.jsonl' if sys.argv[1]=='reload' else 'events.jsonl')).open('a') as f:
        f.write(json.dumps(value,allow_nan=False)+'\n');f.flush();__import__('os').fsync(f.fileno())
    print(json.dumps(value),flush=True)

assert not any(Path('/dev').glob('nvidia*'))
assert [p.name for p in Path('/sys/class/net').iterdir()]==['lo']
assert any(x.split()[1]=='/models' and 'ro' in x.split()[3].split(',') for x in Path('/proc/mounts').read_text().splitlines())
import torch
torch.set_num_threads(2);torch.manual_seed(0)
assert not torch.cuda.is_available()
from kev.checkpoint import Checkpoint,LoadOptions,write_meta
request=json.loads(Path('/input.json').read_text())
if sys.argv[1]=='reload':
    for name,info in json.loads((OUT/'checkpoint-manifest.json').read_text()).items():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==info['sha256']
checkpoint=OUT/'checkpoint' if sys.argv[1]=='reload' else Path('/models/hub/models--jaredpalmer--kev-0.8b/snapshots/bf75a6a8848ea6960ff2ed108d9ed44c2941174f')
ck=Checkpoint(str(checkpoint))
assert ck.meta.base_revision=='dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68'
tok,model=ck.load('cpu',LoadOptions(dtype=torch.float32,merge=False,attn='eager',backend='torch',cuda_graphs=False,fused=False))
model.lm.config.use_cache=False
event('loaded',parameters=sum(p.numel() for p in model.parameters()),device='cpu',adapterMerged=False)

def encode(row):
    rec={'state':row['state'],'questions':[{'instr':row['instructions'],'options':list(row['criteria'].values()),'label':0}]}
    enc=model.encode(tok,rec,strict=True,max_state=384,max_branch=512)
    assert len(enc['ids'])<=512 and not enc['state_truncated']
    return enc

def evaluate(rows):
    model.eval();result=[]
    with torch.no_grad():
        for row in rows:
            enc=encode(row);logits=model(enc)[0]
            assert torch.isfinite(logits).all()
            probabilities=torch.softmax(logits.float(),-1).tolist();keys=list(row['criteria'])
            result.append({'taskId':row['taskId'],'choice':keys[int(logits.argmax())],
                           'probabilities':dict(zip(keys,probabilities)),'tokens':len(enc['ids'])})
    return result

if sys.argv[1]=='reload':
    result=evaluate(request['holdout'])
    expected=json.loads((OUT/'after.json').read_text())
    max_diff=max(abs(row['probabilities'][key]-old['probabilities'][key]) for row,old in zip(result,expected) for key in row['probabilities'])
    assert len(result)==len(expected) and max_diff<=1e-5
    event('reloaded',evaluations=result,maxProbabilityDifference=max_diff,checkpointReloaded=True)
    sys.exit(0)

def tensor_hash(named):
    h=hashlib.sha256()
    for name,p in named:
        h.update(name.encode());h.update(str(tuple(p.shape)).encode())
        h.update(memoryview(p.detach().contiguous().numpy()).cast('B'))
    return h.hexdigest()

for name,p in model.named_parameters():p.requires_grad_('lora_' in name or name.startswith('head.'))
trainable=[(n,p) for n,p in model.named_parameters() if p.requires_grad]
frozen=[(n,p) for n,p in model.named_parameters() if not p.requires_grad]
assert trainable and frozen and any(n.startswith('head.') for n,_ in trainable) and any('lora_' in n for n,_ in trainable)
base_hash=tensor_hash(frozen);before_hash=tensor_hash(trainable)
event('frozen',frozenParameters=sum(p.numel() for _,p in frozen),trainableParameters=sum(p.numel() for _,p in trainable),frozenSha256=base_hash,trainableBeforeSha256=before_hash)
before=evaluate([request['train'],*request['holdout']]);(OUT/'before.json').write_text(json.dumps(before))
event('evaluated-before',evaluations=before)
enc=encode(request['train']);model.train()
model.lm.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
logits=model(enc)[0];target=list(request['train']['criteria']).index(request['target'])
loss=torch.nn.functional.cross_entropy(logits[None],torch.tensor([target]))
assert torch.isfinite(loss)
event('forward',loss=loss.item(),tokens=len(enc['ids']))
loss.backward()
gradients=[p.grad for _,p in trainable if p.grad is not None]
assert gradients and all(torch.isfinite(g).all() for g in gradients)
assert all(p.grad is None for _,p in frozen)
norm=torch.nn.utils.clip_grad_norm_([p for _,p in trainable],1.0)
assert torch.isfinite(norm)
event('backward',gradientNorm=norm.item(),gradientTensors=len(gradients),frozenGradientsAbsent=True)
optimizer=torch.optim.AdamW([p for _,p in trainable],lr=2e-5,foreach=False)
optimizer.step();optimizer.zero_grad(set_to_none=True)
after_hash=tensor_hash(trainable);frozen_after=tensor_hash(frozen)
assert after_hash!=before_hash and frozen_after==base_hash and all(torch.isfinite(p).all() for _,p in trainable)
event('optimizer',updates=1,trainableAfterSha256=after_hash,frozenAfterSha256=frozen_after,frozenUnchanged=True)
model.lm.gradient_checkpointing_disable()
after=evaluate(request['holdout']);(OUT/'after.json').write_text(json.dumps(after))
event('evaluated-after',evaluations=after)
destination=OUT/'checkpoint';destination.mkdir()
model.lm.save_pretrained(destination,safe_serialization=True)
ck.meta.head=model.head.state_dict()
ck.meta.extra={**ck.meta.extra,'plunode':{'purpose':request['purpose'],'optimizerUpdates':1,'automaticAdoption':False}}
write_meta(str(destination),ck.meta);tok.save_pretrained(destination)
torch.save(optimizer.state_dict(),OUT/'optimizer.pt')
files={p.relative_to(OUT).as_posix():{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in OUT.rglob('*') if p.is_file() and p.suffix!='.jsonl'}
total=sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())
assert total<=256*2**20
(OUT/'checkpoint-manifest.json').write_text(json.dumps(files))
event('saved',checkpointBytes=total,files=files,checkpointSaved=True,optimizerUpdates=1)
