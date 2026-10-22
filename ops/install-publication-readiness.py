#!/usr/bin/python3 -I
"""Operator-approved upgrade only. Never enables publication, runs Gate.execute, or changes live Worker."""
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import Request,urlopen

ROOT=Path('/var/lib/plunode-publication')
CODE=Path('/usr/local/lib/plunode-publication')
SBIN=Path('/usr/local/sbin')
LOCK=Path('/opt/graph-knowledge/.member-activation.lock')
AUDIT_HOME=Path('/var/lib/plunode-audit-home')
PROBE=ROOT/'readiness'
REVISION='88437056-b74f-42ab-88c0-33ed435bdccc'
RELEASE='manga-issue-25-utc-recovery-08-normal'
RECEIPTS='8a55413ee9fedf32fd64ce6fddebd28d1d636ff7de0fcc1fd063a5b15524d56d'
WORKER='973c7b0c599f79905a029b28b524f4924e169376'
SUDO_TEXT='plunode-publish ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/plunode-publication-readiness\n'
SUDO=Path('/etc/sudoers.d/plunode-publication-readiness')
PHASE='preflight'
CLEAN={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'}

def require(v,reason='Readiness deployment precondition differs'):
    if not v:raise ValueError(reason)
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as stream:
        while data:=stream.read(1024*1024):h.update(data)
    return h.hexdigest()
def read(p):return json.loads(p.read_bytes())
def trusted(p,directory=False):
    st=p.lstat();require(not p.is_symlink() and st.st_uid==0 and not st.st_mode&0o022
        and (stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode) and st.st_nlink==1),'Untrusted readiness path')
def run(argv,**kwargs):
    value=subprocess.run(argv,capture_output=True,env=CLEAN,timeout=240,**kwargs)
    require(value.returncode==0,'Fixed deployment command failed');return value.stdout

def write(p,data,mode=0o600,uid=0,gid=0):
    fd,name=tempfile.mkstemp(prefix='.readiness-',dir=p.parent)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(data.encode() if isinstance(data,str) else data);os.fchmod(stream.fileno(),mode);os.fchown(stream.fileno(),uid,gid);stream.flush();os.fsync(stream.fileno())
        os.replace(name,p)
        fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    finally:
        if os.path.exists(name):os.unlink(name)

def directory(p,mode,gid=0):
    p.mkdir(mode=mode,exist_ok=False);p.chmod(mode);os.chown(p,0,gid)
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def target(relative):return SBIN/Path(relative).name if relative.startswith('ops/plunode-') else CODE/Path(relative).name

def archive_identity(path,identity):
    require(sha(path)==identity['archiveSha256'],'Image archive differs')
    with tarfile.open(path) as archive:
        rows=json.load(archive.extractfile('manifest.json'));require(len(rows)==1 and rows[0].get('RepoTags') in [None,[]])
        ids=[identity['configId'],identity['manifestId']]
        values=[]
        for ident in ids:
            data=archive.extractfile('blobs/sha256/'+ident.split(':')[1]).read();require('sha256:'+hashlib.sha256(data).hexdigest()==ident);values.append(json.loads(data))
        config,manifest=values
        require(config['os']=='linux' and config['architecture']=='amd64' and manifest['config']['digest']==identity['configId'])
        layers=[row['digest'] for row in manifest['layers']];require(layers==config['rootfs']['diff_ids'] and rows[0]['Layers']==['blobs/sha256/'+s.split(':')[1] for s in layers])
        for ident in layers:
            h=hashlib.sha256()
            with archive.extractfile('blobs/sha256/'+ident.split(':')[1]) as stream:
                while data:=stream.read(1024*1024):h.update(data)
            require('sha256:'+h.hexdigest()==ident,'Image layer bytes differ')
    return identity

def main():
    global PHASE
    require(os.geteuid()==0 and len(sys.argv)==1);os.umask(0o077);stage=Path(__file__).resolve().parent
    for p in [stage,*stage.parents,CODE,*CODE.parents,ROOT,ROOT/'trusted']:trusted(p,True)
    deploy=read(stage/'deployment.json');manifest=read(stage/'program-manifest.json')
    require(sha(stage/'program-manifest.json')==deploy['programManifestSha256'] and manifest['sourceCommit']==deploy['sourceCommit'])
    for name,checksum in deploy['assets'].items():trusted(stage/name);require(sha(stage/name)==checksum,'Staged asset differs')
    require(not PROBE.exists() and not SUDO.exists() and not (ROOT/'trusted/program-manifest.json').exists(),'Already configured; inspect instead of rerunning')
    prior=read(stage/'prior-program-manifest.json');require(prior['sourceCommit']=='72338b7054b3f2eb2e9762b20859044f9b9e28ce')
    for name,checksum in prior['files'].items():
        if name in ['scripts/publication-attest.py','scripts/publication-coordination.py']:continue
        p=target(name);trusted(p);require(sha(p)==checksum,'Prior production code differs')
    config=read(ROOT/'trusted/config.json');require(config['deploymentEnabled'] is False and config['workerId']=='plunode-wsl' and config['workerCodeCommit']==WORKER)
    require(all(config[k]==v for k,v in manifest['configBindings'].items()),'Production pins/config drifted')
    for name in ['approver','attester','exclusion']:
        p=ROOT/'trusted'/(name+'.pem');trusted(p);require(sha(p)==config[name+'KeySha256'],'Public key pin differs')
    private=ROOT/'trusted/exclusion-private.pem';trusted(private);require(stat.S_IMODE(private.stat().st_mode)==0o600)
    require(hashlib.sha256(run(['/usr/bin/openssl','pkey','-in',str(private),'-pubout'])).hexdigest()==config['exclusionKeySha256'],'Closure private/public key pair differs')
    for name in ['reservations.json','exclusion.json']:
        p=ROOT/name
        if p.exists():
            value=read(p)
            require(not value.get('nonces') and not value.get('releases') and not value.get('active') and not value.get('tickets'),'Existing production operation; preserve state')
    require(not list((ROOT/'frozen').iterdir()) and not list((ROOT/'inbox').iterdir()),'Existing publication candidate; inspect')
    identity=archive_identity(stage/'publication-image.tar',deploy['image'])
    audit=pwd.getpwnam('plunode-audit');upload=pwd.getpwnam('plunode-upload');require(audit.pw_dir==str(AUDIT_HOME));trusted(AUDIT_HOME,True)
    require(not (Path(audit.pw_dir)/'.config').exists(),'Existing audit config; inspect before replacing')
    require(all(not (ROOT/'export'/name).exists() for name in ['readiness-public-backup.json','readiness-custody-vps.gpg']),'Existing readiness export; preserve it')
    tty=os.open('/dev/tty',os.O_RDWR|os.O_NOCTTY)
    try:require(os.isatty(tty),'Operator terminal required')
    finally:os.close(tty)
    PHASE='operator-audit-authentication'
    token=getpass.getpass('監査用GitHub fine-grained PAT（対象repoのIssues読書き・表示しません）: ').strip()
    require(16<=len(token)<=512 and not any(c.isspace() for c in token),'Audit token is missing/invalid')
    request=Request('https://api.github.com/repos/isinxnisi/graph-knowledge/issues/33',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'Plunode-readiness'})
    with urlopen(request,timeout=25) as response:require(json.load(response)['number']==33,'Audit read authentication failed')
    PHASE='operator-encrypted-custody'
    custody=load('approved_custody',stage/'publication-key-backup.py')
    entries={n:(ROOT/'trusted'/n).read_bytes() for n in ['exclusion-private.pem','exclusion.pem','approver.pem','attester.pem','config.json']};entries['audit-token']=token.encode()
    backup=custody.encrypted_archive(entries,stage/'custody-vps.gpg',custody.phrase())
    # No common lock during password/token input, encryption or network authentication.
    PHASE='load-pinned-image'
    run(['/usr/bin/docker','load','--input',str(stage/'publication-image.tar')])
    store=json.loads(run(['/usr/bin/docker','info','--format','{{json .DriverStatus}}']))
    drivers=[row[1] for row in store if row[0]=='driver-type'];require(drivers in [[],['io.containerd.snapshotter.v1']])
    image=identity['manifestId'] if drivers else identity['configId'];config={**config,'operatorDigest':image,'deploymentEnabled':False}
    PHASE='read-only-production-observation'
    e=load('upgraded_stage_executor',stage/'programs/publication-executor.py')
    with e.locked(LOCK):
        backend=e.DockerBackend(ROOT,config);payload={'candidate':str(stage),'nonce':'00000000-0000-4000-8000-000000000001'}
        require(backend.call('image',payload)['operatorDigest']==image)
        current=backend.call('observe',payload);require((current['payload']['release'],current['payload']['revision'])==(RELEASE,REVISION),'Public base/revision changed')
    # Snapshot every replacement before changing fixed files. No data receipt/state is replaced.
    PHASE='snapshot-programs-and-config'
    replacements={target(name):(stage/'programs'/Path(name).name).read_bytes() for name in manifest['files']}
    replacements[ROOT/'trusted/config.json']=json.dumps(config,sort_keys=True).encode()
    replacements[ROOT/'trusted/program-manifest.json']=(stage/'program-manifest.json').read_bytes()
    old=stage/'previous';old.mkdir(mode=0o700);records=[]
    for i,(path,data) in enumerate(replacements.items()):
        item={'path':str(path),'newSha256':hashlib.sha256(data).hexdigest(),'previousFile':None}
        if path.exists():
            trusted(path);saved=old/str(i);write(saved,path.read_bytes());item.update(previousFile=str(saved.relative_to(stage)),previousSha256=sha(saved),previousMode=stat.S_IMODE(path.stat().st_mode))
        records.append(item)
    write(stage/'rollback.json',json.dumps({'sourceCommit':manifest['sourceCommit'],'files':records},indent=2))
    with e.locked(LOCK):
        require(read(ROOT/'trusted/config.json')['deploymentEnabled'] is False)
        PHASE='install-reviewed-program-set'
        for path,data in replacements.items():write(path,data,0o755 if path.parent==SBIN or path.name=='gh' else 0o600 if path.parent==ROOT/'trusted' else 0o644)
        PHASE='configure-read-only-probe'
        directory(PROBE,0o751)
        for name,mode in [('trusted',0o700),('jobs',0o700),('frozen',0o700),('outbox',0o755)]:directory(PROBE/name,mode)
        directory(PROBE/'inbox',0o2770,upload.pw_gid)
        for name in ['public-kg.env','approver.pem','attester.pem']:write(PROBE/'trusted'/name,(ROOT/'trusted'/name).read_bytes(),0o600)
        run(['/usr/bin/openssl','genpkey','-algorithm','ED25519','-out',str(PROBE/'trusted/exclusion-private.pem')])
        write(PROBE/'trusted/exclusion.pem',run(['/usr/bin/openssl','pkey','-in',str(PROBE/'trusted/exclusion-private.pem'),'-pubout']),0o644)
        probe={**config,'deploymentEnabled':True,'readOnlyProbe':True,'workerId':'publication-readiness','exclusionKeySha256':sha(PROBE/'trusted/exclusion.pem')}
        write(PROBE/'trusted/config.json',json.dumps(probe,sort_keys=True))
        PHASE='configure-audit-credential'
        token_dir=Path(audit.pw_dir)/'.config';require(not token_dir.exists(),'Existing audit config; inspect before replacing')
        token_dir.mkdir(mode=0o700);os.chown(token_dir,audit.pw_uid,audit.pw_gid)
        token_dir=token_dir/'plunode-publication';token_dir.mkdir(mode=0o700);os.chown(token_dir,audit.pw_uid,audit.pw_gid)
        write(token_dir/'token',token,0o600,audit.pw_uid,audit.pw_gid)
        write(stage/'credential-rollback.json',json.dumps({'path':str(token_dir/'token'),'sha256':sha(token_dir/'token')}))
        PHASE='allow-temporary-readiness-command'
        candidate=stage/'readiness-sudoers';write(candidate,SUDO_TEXT,0o440);run(['/usr/sbin/visudo','-cf',str(candidate)]);write(SUDO,SUDO_TEXT,0o440)
        setup={'sourceCommit':manifest['sourceCommit'],'readOnly':True,'productionEnabled':False,'productionApplyCalls':0,'workerId':'publication-readiness','codeCommit':WORKER,'operatorDigest':image,'receiptSetSha256':RECEIPTS,'baseRelease':RELEASE,'baseRevision':REVISION,'exclusionKeySha256':probe['exclusionKeySha256'],'attesterKeySha256':probe['attesterKeySha256']}
        write(PROBE/'outbox/setup.json',json.dumps(setup),0o644);write(PROBE/'outbox/exclusion.pem',(PROBE/'trusted/exclusion.pem').read_bytes(),0o644)
        write(ROOT/'export/readiness-public-backup.json',json.dumps(current),0o600,upload.pw_uid,upload.pw_gid)
        write(ROOT/'export/readiness-custody-vps.gpg',(stage/'custody-vps.gpg').read_bytes(),0o600,upload.pw_uid,upload.pw_gid)
        write(ROOT/'trusted/readiness-installation.json',json.dumps({**setup,'phase':'readiness-installed-disabled','keyBackup':backup,'custodyOffMachineConfirmed':False,'previousStage':str(stage)}))
    version=run([str(CODE/'gh'),'--version']).decode().splitlines()[0]
    result={**setup,'phase':'readiness-installed-disabled','ghVersion':version,'keyBackup':backup,'custodyOffMachineConfirmed':False,'rollbackManifest':str(stage/'rollback.json')}
    write(PROBE/'outbox/installation.json',json.dumps(result),0o644)
    print(json.dumps(result),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:
        reason=str(error) if type(error) is ValueError and str(error) in {'Already configured; inspect instead of rerunning','Prior production code differs','Production pins/config drifted','Public key pin differs','Closure private/public key pair differs','Existing production operation; preserve state','Existing publication candidate; inspect','Existing audit config; inspect before replacing','Existing readiness export; preserve it','Audit token is missing/invalid','Audit read authentication failed','Public base/revision changed','Image archive differs','Image layer bytes differ','Staged asset differs','Untrusted readiness path','Operator terminal required','Fixed deployment command failed','Readiness deployment precondition differs'} else None
        print(json.dumps({'reason':reason,'error':'readiness-installation-stopped','operation':PHASE,'errorType':type(error).__name__,'httpStatus':getattr(error,'code',None),'applyCalls':0,'activationAuthorized':False,'preserveStage':str(Path(__file__).resolve().parent)}),flush=True);sys.exit(1)
