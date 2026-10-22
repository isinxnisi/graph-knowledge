#!/usr/bin/python3 -I
"""Operator-only fixed WSL code plus encrypted key custody. No live Worker/control/state edits."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
import tarfile
import tempfile

BASE=Path('/usr/local/lib/plunode-receipts')
HOME=Path('/home/isinxnisi')
KEYS=HOME/'.local/share/plunode-publication/keys'
USER='isinxnisi'
APPROVER=Path('/root/plunode-publication-operator/approver.pem')
CLIENT_CONFIG=Path('/etc/plunode-publication/client.json')
CLOSURE_PUBLIC=Path('/etc/plunode-publication/exclusion.pem')
READINESS_CLIENT=Path('/usr/local/bin/plunode-publication-readiness-client')

def require(v):
    if not v:raise ValueError('Fixed WSL readiness installation differs')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def trusted(p,directory=False):
    st=p.lstat();require(not p.is_symlink() and st.st_uid==0 and not st.st_mode&0o022
        and (stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode)))
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def main():
    require(os.geteuid()==0 and len(sys.argv)==1);os.umask(0o077);stage=Path(__file__).resolve().parent
    for p in [stage,*stage.parents,BASE,*BASE.parents]:trusted(p,True)
    metadata=json.loads((stage/'deployment.json').read_bytes());commit=metadata['sourceCommit'];require(len(commit)==40 and all(c in '0123456789abcdef' for c in commit))
    archive=stage/'wsl-source.tar.gz';require(sha(archive)==metadata['wslArchiveSha256'])
    target=BASE/commit;require(not target.exists() and not READINESS_CLIENT.exists())
    uid=pwd.getpwnam(USER).pw_uid;gid=pwd.getpwnam(USER).pw_gid
    for name in ['approver','attester']:
        expected=metadata['configBindings'][name+'KeySha256']
        key=APPROVER if name=='approver' else KEYS/'attester.pem'
        st=key.lstat();require(not key.is_symlink() and stat.S_IMODE(st.st_mode)==0o600 and st.st_uid==(0 if name=='approver' else uid) and stat.S_ISREG(st.st_mode) and st.st_nlink==1)
        pub=subprocess.run(['/usr/bin/openssl','pkey','-in',str(key),'-pubout'],capture_output=True,timeout=10);require(pub.returncode==0 and hashlib.sha256(pub.stdout).hexdigest()==expected)
    entries={'approver.pem':APPROVER.read_bytes()}
    for name in ['attester.pem','execution-ed25519','upload-ed25519']:
        path=KEYS/name;st=path.lstat();require(not path.is_symlink() and stat.S_IMODE(st.st_mode)==0o600 and st.st_uid==uid and stat.S_ISREG(st.st_mode) and st.st_nlink==1);entries[name]=path.read_bytes()
    entries['client.json']=CLIENT_CONFIG.read_bytes();entries['exclusion.pem']=CLOSURE_PUBLIC.read_bytes()
    custody=load('operator_wsl_custody',stage/'publication-key-backup.py');backup=custody.encrypted_archive(entries,stage/'custody-wsl.gpg',custody.phrase())
    with tempfile.TemporaryDirectory(prefix='.readiness-',dir=BASE) as temp:
        root=Path(temp)
        with tarfile.open(archive) as source:
            seen=set()
            for member in source.getmembers():
                rel=Path(member.name);require(not rel.is_absolute() and '..' not in rel.parts and member.name not in seen);seen.add(member.name)
                path=root/rel
                if member.isdir():path.mkdir(parents=True,exist_ok=True);path.chmod(0o755)
                else:
                    require(member.isfile());path.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
                    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
                    with os.fdopen(fd,'wb') as stream:stream.write(source.extractfile(member).read());stream.flush();os.fsync(stream.fileno())
            root.chmod(0o755)
        require(sha(root/'ops/publication-readiness-client')==metadata['readinessClientSha256'])
        for p in [*reversed([p for p in root.rglob('*') if p.is_dir()]),root]:
            p.chmod(0o755)
            fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(fd)
            finally:os.close(fd)
        os.rename(root,target)
        fd=os.open(BASE,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
        # TemporaryDirectory tolerates the renamed private staging directory.
    client=READINESS_CLIENT;require(not client.exists())
    fd,name=tempfile.mkstemp(prefix='.readiness-client-',dir=client.parent)
    with os.fdopen(fd,'wb') as stream:stream.write((target/'ops/publication-readiness-client').read_bytes());os.fchmod(stream.fileno(),0o755);stream.flush();os.fsync(stream.fileno())
    os.replace(name,client)
    fd=os.open(client.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
    print(json.dumps({'phase':'wsl-readiness-fixed-code-installed','sourceCommit':commit,'fixedScripts':str(target/'scripts'),'keyBackup':backup,'encryptedBackupPath':str(stage/'custody-wsl.gpg'),'custodyOffMachineConfirmed':False,'liveWorkerModified':False,'productionEnabled':False}))

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':'wsl-readiness-installation-stopped','errorType':type(error).__name__,'preserveStage':str(Path(__file__).resolve().parent),'liveWorkerModified':False,'activationAuthorized':False}));sys.exit(1)
