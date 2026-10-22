#!/usr/bin/python3 -I
"""Pinned channel-only update; no enablement, key/DB/image/Worker changes, or ticket reset."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

ROOT=Path('/var/lib/plunode-publication')
CODE=Path('/usr/local/lib/plunode-publication')
COMMON=Path('/opt/graph-knowledge/.member-activation.lock')
OLD_MANIFEST='a7b5a171a76a2fc9beb162cc021e5c9a5435da14e32f25736b99f09aff03434d'
PEER_SOURCE='9b59669f282f811a22c7f276ecae61ca16ec499e'
NONCE='82da68d6-c3a1-4ff7-85d3-24ab2df1b16d'
PHASE='preflight'

def require(value):
    if not value:raise ValueError('Pinned channel update condition differs; preserve stage')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_bytes())
def trusted(path,directory=False):
    s=path.lstat();require(not path.is_symlink() and s.st_uid==0 and not s.st_mode&0o022
        and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink==1))
def target(name):return Path('/usr/local/sbin')/Path(name).name if name.startswith('ops/plunode-') else CODE/Path(name).name
def durable(path,data,mode):
    fd,name=tempfile.mkstemp(prefix='.channel-update-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);os.fchmod(f.fileno(),mode);f.flush();os.fsync(f.fileno())
        os.replace(name,path);fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    finally:
        if os.path.exists(name):os.unlink(name)
def state_hashes():
    result={}
    for home in [ROOT,ROOT/'readiness']:
        for name in ['frozen','jobs']:
            for path in sorted((home/name).rglob('*')):
                trusted(path,path.is_dir())
                if path.is_file():result[str(path)]=sha(path)
        for name in ['trusted/config.json','reservations.json','exclusion.json']:
            path=home/name
            if path.exists():trusted(path);result[str(path)]=sha(path)
    return result

def rollback(stage,meta):
    trusted(stage/'previous-executor.py');trusted(stage/'previous-manifest.json')
    require(sha(stage/'previous-manifest.json')==OLD_MANIFEST)
    old=read(stage/'previous-manifest.json');require(sha(stage/'previous-executor.py')==old['files']['scripts/publication-executor.py'])
    require(read(ROOT/'trusted/config.json')['deploymentEnabled'] is False)
    manifest_path=ROOT/'trusted/program-manifest.json';require(sha(manifest_path) in [OLD_MANIFEST,meta['newManifestSha256']])
    for name,checksum in old['files'].items():
        path=target(name);trusted(path)
        require(sha(path) in ([checksum,meta['newExecutorSha256']] if name=='scripts/publication-executor.py' else [checksum]))
    spec=importlib.util.spec_from_file_location('rollback_channel_executor',CODE/'publication-executor.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
    with e.locked(COMMON):
        with e.locked(ROOT/'readiness/operation.lock'):
            before=state_hashes()
            durable(CODE/'publication-executor.py',(stage/'previous-executor.py').read_bytes(),0o644)
            durable(manifest_path,(stage/'previous-manifest.json').read_bytes(),0o600)
            require(state_hashes()==before)
    print(json.dumps({'phase':'publication-channel-rolled-back-disabled','productionEnabled':False,'applyCalls':0,'allStatePreserved':True,'ticketReset':False}),flush=True)


def main():
    global PHASE
    require(os.geteuid()==0 and (len(sys.argv)==1 or sys.argv[1:]==['--rollback']));os.umask(0o077);stage=Path(__file__).resolve().parent
    for p in [stage,*stage.parents,CODE,*CODE.parents,ROOT,ROOT/'trusted',ROOT/'readiness',ROOT/'readiness/trusted']:trusted(p,True)
    meta=read(stage/'update.json');new=read(stage/'new-program-manifest.json')
    require(sha(stage/'new-program-manifest.json')==meta['newManifestSha256'] and sha(stage/'publication-executor.py')==meta['newExecutorSha256'])
    require(new['sourceCommit']==meta['sourceCommit'] and new['peerSourceCommit']==PEER_SOURCE)
    compile((stage/'publication-executor.py').read_bytes(),'reviewed-channel-executor.py','exec')
    if sys.argv[1:]==['--rollback']:return rollback(stage,meta)
    manifest_path=ROOT/'trusted/program-manifest.json';trusted(manifest_path);require(sha(manifest_path)==OLD_MANIFEST)
    old=read(manifest_path);require(old['sourceCommit']==PEER_SOURCE)
    require(set(new['files'])==set(old['files']) and all(new[k]==old[k] for k in ['operatorSourceCommit','operatorConfigId','operatorManifestId','configBindings']))
    changed={k for k in old['files'] if old['files'][k]!=new['files'][k]};require(changed=={'scripts/publication-executor.py'})
    require(new['files']['scripts/publication-executor.py']==meta['newExecutorSha256'])
    for name,checksum in old['files'].items():p=target(name);trusted(p);require(sha(p)==checksum)
    config=read(ROOT/'trusted/config.json');require(config['deploymentEnabled'] is False and all(config[k]==v for k,v in old['configBindings'].items()))
    spec=importlib.util.spec_from_file_location('old_channel_update_executor',CODE/'publication-executor.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
    with e.locked(COMMON):
        with e.locked(ROOT/'readiness/operation.lock'):
            PHASE='locked-state-validation'
            require(sha(manifest_path)==OLD_MANIFEST and read(ROOT/'trusted/config.json')['deploymentEnabled'] is False)
            state=read(ROOT/'readiness/exclusion.json');require(state['active']==NONCE and state['tickets'][NONCE]['phase']=='open')
            for name in ['reservations.json','exclusion.json']:
                path=ROOT/name
                if path.exists():
                    v=read(path);require(not v.get('nonces') and not v.get('releases') and not v.get('active') and not v.get('tickets'))
            before=state_hashes();executor=CODE/'publication-executor.py'
            durable(stage/'previous-executor.py',executor.read_bytes(),0o600);durable(stage/'previous-manifest.json',manifest_path.read_bytes(),0o600)
            durable(stage/'state-before.json',json.dumps(before,sort_keys=True).encode(),0o600)
            PHASE='replace-executor-and-trust'
            durable(executor,(stage/'publication-executor.py').read_bytes(),0o644)
            durable(manifest_path,(stage/'new-program-manifest.json').read_bytes(),0o600)
            require(sha(executor)==meta['newExecutorSha256'] and sha(manifest_path)==meta['newManifestSha256'])
            PHASE='verify-state-invariance';require(state_hashes()==before)
            result={'phase':'publication-channel-updated-disabled','sourceCommit':meta['sourceCommit'],'peerSourceCommit':PEER_SOURCE,'operatorDigest':config['operatorDigest'],'programManifestSha256':meta['newManifestSha256'],'ticketNonce':NONCE,'frozenJobsConfigAndReservationsUnchanged':True,'challengeLifetimeSeconds':60,'productionEnabled':False,'applyCalls':0,'keyOrImageOrWorkerChanged':False,'preserveStage':str(stage)}
            durable(ROOT/'readiness/outbox/channel-update.json',json.dumps(result).encode(),0o644)
            durable(stage/'completed.json',json.dumps(result).encode(),0o600)
    print(json.dumps(result),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':'channel-update-stopped','operation':PHASE,'errorType':type(error).__name__,'productionEnabled':False,'applyCalls':0,'preserveStage':str(Path(__file__).resolve().parent)}),flush=True);sys.exit(1)
