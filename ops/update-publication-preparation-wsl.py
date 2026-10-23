#!/usr/bin/python3 -I
"""Pinned WSL-only update. No key/Worker/task/VPS/DB writes or publication execution.
Run from an operator-verified root-private stage containing deployment.json/source.tar.gz.
The shared lock and Ready task boundary are provided by the deployment operator.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tarfile
import tempfile

BASE=Path('/usr/local/lib/plunode-receipts')
CONFIG=Path('/etc/plunode-publication/delivery.json')
USER='isinxnisi'
def require(value):
    if not value:raise ValueError('Fixed preparation deployment differs; preserve stage')
def trusted(path):
    for item in [path,*path.parents]:
        st=item.lstat();require(not item.is_symlink() and st.st_uid==0 and not st.st_mode&0o022)
        require(stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode) and st.st_nlink==1)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def sync(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def write(path,body,mode):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as out:out.write(body);os.fchmod(out.fileno(),mode);out.flush();os.fsync(out.fileno())
    sync(path.parent)
def main():
    require(os.geteuid()==0);os.umask(0o077);stage=Path(__file__).resolve().parent
    trusted(stage);trusted(CONFIG);trusted(BASE)
    meta=json.loads((stage/'deployment.json').read_bytes());source=meta['sourceCommit'];archive=stage/'source.tar.gz'
    require(re.fullmatch('[a-f0-9]{40}',source) and re.fullmatch('sha256:[a-f0-9]{64}',meta['nodeImage']))
    require(sha(archive)==meta['sourceArchiveSha256'] and sha(CONFIG)==meta['previousConfigSha256'])
    old=json.loads(CONFIG.read_bytes());require(old['uid']==1000 and old['deliveryEnabled'] is True and not old.get('preparation'))
    operator=Path('/usr/local/sbin/plunode-publication-approve');trusted(operator);operator_sha=sha(operator)
    co=json.loads(Path(old['coordinationConfig']).read_bytes());home=Path(old['attesterKey']).parent.parent
    require(home==Path('/home/isinxnisi/.local/share/plunode-publication'))
    require(old['runtime']==str(Path(co['workerHome'])/'runtime') and co['workerId']=='plunode-wsl')
    preparation=home/'preparation';target=BASE/source;require(not target.exists() and not target.is_symlink())
    # Copy only source-controlled ordinary entries, never archive links/devices/owners.
    with tempfile.TemporaryDirectory(prefix='.preparation-',dir=BASE) as temp:
        dest=Path(temp);seen=set();total=0
        with tarfile.open(archive,'r:gz') as tar:
            for entry in tar:
                rel=Path(entry.name);require(not rel.is_absolute() and '..' not in rel.parts and entry.name not in seen)
                seen.add(entry.name);require(len(seen)<=15000);path=dest/rel
                if entry.isdir():path.mkdir(parents=True,exist_ok=True,mode=0o755);path.chmod(0o755)
                else:
                    require(entry.isfile() and entry.size<=64*1024*1024);total+=entry.size;require(total<=512*1024*1024)
                    path.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
                    write(path,tar.extractfile(entry).read(),0o755 if entry.mode&0o111 else 0o644)
        for path in dest.rglob('*'):
            if path.is_dir():path.chmod(0o755)
        dest.chmod(0o755)
        for name in ['scripts/publication-preparation.py','scripts/publication-delivery.py','scripts/publication-artifact-plan.ts']:
            require((dest/name).is_file())
        os.rename(dest,target);sync(BASE)
    decision=meta['humanDecision'];require(decision['actorType']=='human' and all(isinstance(decision[k],str) and decision[k] for k in ['reviewer','decidedAt','statement']))
    setup="from pathlib import Path;import os,stat;p=Path("+repr(str(preparation))+");p.mkdir(mode=0o700,exist_ok=True);s=p.lstat();assert not p.is_symlink() and s.st_uid==1000 and stat.S_IMODE(s.st_mode)==0o700;assert not list(p.iterdir())"
    subprocess.run(['/usr/sbin/runuser','-u',USER,'--','/usr/bin/python3','-I','-c',setup],check=True,timeout=20)
    # No signature may be waiting for delivery during the fixed code switch.
    check="import runpy;from pathlib import Path;m=runpy.run_path("+repr(str(target/'scripts/publication-delivery.py'))+");assert m['pending'](Path("+repr(old['queueDir'])+")) is None"
    subprocess.run(['/usr/sbin/runuser','-u',USER,'--','/usr/bin/python3','-I','-c',check],check=True,timeout=20)
    new={**old,'sourceCommit':source,'preparation':{'enabled':True,'home':str(preparation),'nodeImage':meta['nodeImage'],'humanDecision':decision}}
    write(stage/'delivery.before.json',CONFIG.read_bytes(),0o600)
    temporary=CONFIG.with_name('.delivery-preparation-'+source+'.json')
    write(temporary,(json.dumps(new,sort_keys=True,ensure_ascii=False)+'\n').encode(),0o644)
    os.replace(temporary,CONFIG);sync(CONFIG.parent)
    result=subprocess.run([str(operator),'--self-check'],capture_output=True,text=True,timeout=60)
    require(result.returncode==0);checked=json.loads(result.stdout);require(checked['signed'] is False and checked['applyCalls']==0)
    require(sha(operator)==operator_sha)
    record={'phase':'automatic-preparation-installed','sourceCommit':source,'sourceArchiveSha256':sha(archive),
        'previousConfigSha256':meta['previousConfigSha256'],'configSha256':sha(CONFIG),'preparation':new['preparation'],
        'operatorUnchanged':True,'workerChanged':False,'vpsChanged':False,'productionApplyCalls':0,
        'preserveStage':str(stage),'rollback':'Restore delivery.before.json and the delivery task old source Action at Ready; retain candidates/jobs/journals/receipts.'}
    write(stage/'installation.json',(json.dumps(record,ensure_ascii=False,indent=2)+'\n').encode(),0o600)
    print(json.dumps(record,ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':'automatic-preparation-update-stopped','errorType':type(error).__name__,'productionApplyCalls':0,'stage':str(Path(__file__).resolve().parent)}));raise SystemExit(1)
