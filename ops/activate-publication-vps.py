#!/usr/bin/python3 -I
"""Operator-only activation, never apply. Explicit approval and off-machine custody required.
Rollback disables new entries only; it never restores KG, resumes Worker or resets journals.
"""
import argparse,hashlib,importlib.util,json,os,stat,tempfile,uuid
from pathlib import Path
ROOT=Path('/var/lib/plunode-publication')
CODE=Path('/usr/local/lib/plunode-publication')
MANIFEST_SHA='68881f68812f22fbf8d99d242dc150680c4099d692a86ec38ffe1876ee1d8ad6'
REVISION='88437056-b74f-42ab-88c0-33ed435bdccc'
COMMON=Path('/opt/graph-knowledge/.member-activation.lock')
STAGING=Path('/root')
STAGE=None
IMAGE='sha256:367e9c36401f4f3c7f3a50e829c4c82bcaf83a9e0df72aba91ea03e4b856e528'

def require(v):
    if not v:raise ValueError('Fixed production activation condition differs')
def trusted(p):
    st=p.lstat();require(not p.is_symlink() and st.st_uid==0 and not st.st_mode&0o022
        and (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode) and st.st_nlink==1))
def read(p):trusted(p);return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    global STAGE
    require(os.geteuid()==0 and __debug__);os.umask(0o077)
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--operator-approved',action='store_true',required=True)
    cli.add_argument('--custody-off-machine-confirmed',action='store_true');cli.add_argument('--disable-expected-sha256')
    a=cli.parse_args()
    for p in [ROOT,*ROOT.parents,CODE,*CODE.parents,ROOT/'trusted']:trusted(p)
    path=ROOT/'trusted/program-manifest.json';require(sha(path)==MANIFEST_SHA);manifest=read(path)
    for name,checksum in manifest['files'].items():
        p=Path('/usr/local/sbin')/Path(name).name if name.startswith('ops/plunode-') else CODE/Path(name).name
        trusted(p);require(sha(p)==checksum)
    spec=importlib.util.spec_from_file_location('fixed_activation_executor',CODE/'publication-executor.py')
    e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
    cfg_path=ROOT/'trusted/config.json'
    with e.locked(COMMON):
        cfg=read(cfg_path);require(cfg['operatorDigest']==IMAGE and all(cfg[k]==v for k,v in manifest['configBindings'].items()))
        enabling=a.disable_expected_sha256 is None
        if enabling:
            require(a.custody_off_machine_confirmed and cfg['deploymentEnabled'] is False)
            require(not Path('/etc/sudoers.d/plunode-publication-readiness').exists())
            proof=read(ROOT/'readiness/outbox/cleanup.json');require(proof['temporarySudoRemoved'] is True)
            state=read(ROOT/'readiness/exclusion.json');require(state['active'] is None and all(t['phase']=='finished' for t in state['tickets'].values()))
            if (ROOT/'exclusion.json').exists():require(read(ROOT/'exclusion.json')['active'] is None)
            if (ROOT/'reservations.json').exists():
                reservations=read(ROOT/'reservations.json');require(not reservations['nonces'] and not reservations['releases'])
        else:require(cfg['deploymentEnabled'] is True and sha(cfg_path)==a.disable_expected_sha256)
        export=ROOT/'export'/('activation-20261023.json' if enabling else 'deactivation-20261023.json');require(not export.exists())
        stage=Path(tempfile.mkdtemp(prefix='plunode-publication-activation.',dir=STAGING));stage.chmod(0o700);STAGE=stage
        previous=cfg_path.read_bytes()
        fd=os.open(stage/'previous-config.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f:f.write(previous);f.flush();os.fsync(f.fileno())
        if enabling:
            backend=e.DockerBackend(ROOT,cfg);payload={'candidate':str(ROOT),'nonce':str(uuid.uuid4())}
            require(backend.call('image',payload)['operatorDigest']==IMAGE)
            observed=backend.call('observe',payload);require(observed['payload']['revision']==REVISION and observed['payload']['release']=='manga-issue-25-utc-recovery-08-normal')
            e.durable(stage/'read-only-backup.json',observed)
        # The JSON semantic difference is exactly one boolean; all credentials/pins stay fixed.
        changed={**cfg,'deploymentEnabled':enabling};require({k for k in cfg if cfg[k]!=changed[k]}=={'deploymentEnabled'})
        e.durable(stage/'previous.json',cfg)
        try:
            e.durable(cfg_path,changed)
            result={'phase':'publication-enabled-no-apply' if enabling else 'publication-disabled-no-restore',
                'deploymentEnabled':enabling,'programManifestSha256':MANIFEST_SHA,'operatorDigest':IMAGE,
                'previousConfigSha256':hashlib.sha256(previous).hexdigest(),'configSha256':sha(cfg_path),
                'productionApplyCalls':0,'preserveStage':str(stage),'workerOrKeysOrServicesChanged':False}
            e.durable(stage/'result.json',result);e.durable(export,result);export.chmod(0o644)
        except Exception:
            # Still under the common lock: failed local metadata never silently leaves
            # the flag enabled. This restores one config boolean, not KG or journals.
            if read(cfg_path)==changed:e.durable(cfg_path,cfg)
            raise
    print(json.dumps(result))
if __name__=='__main__':
    try:main()
    except Exception as error:
        current=read(ROOT/'trusted/config.json').get('deploymentEnabled') if (ROOT/'trusted/config.json').exists() else None
        print(json.dumps({'error':'publication-activation-stopped','errorType':type(error).__name__,'deploymentEnabled':current,'preserveStage':str(STAGE) if STAGE else None,'applyCalls':0}));raise SystemExit(1)
