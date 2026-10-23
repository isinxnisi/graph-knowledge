#!/usr/bin/python3 -I
"""Add fixed operator/one-shot delivery code, DISABLED. No task registration or Worker edit."""
import hashlib,io,json,os,pwd,stat,subprocess,sys,tarfile,tempfile
from pathlib import Path
BASE=Path('/usr/local/lib/plunode-receipts')
ETC=Path('/etc/plunode-publication')
USER='isinxnisi'
OPERATOR=Path('/usr/local/sbin/plunode-publication-approve')

def require(v):
    if not v:raise ValueError('Fixed disabled delivery installation differs')
def trusted(p,uid=0):
    st=p.lstat();require(not p.is_symlink() and st.st_uid==uid and not st.st_mode&0o022)
    require(stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode) and st.st_nlink==1)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,data,mode):
    require(not p.exists() and not p.is_symlink());fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as f:f.write(data);os.fchmod(f.fileno(),mode);f.flush();os.fsync(f.fileno())
    fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def main():
    require(os.geteuid()==0 and len(sys.argv)==1);os.umask(0o077)
    stage=Path(__file__).resolve().parent
    for p in [stage,*stage.parents,BASE,*BASE.parents,ETC]:trusted(p)
    meta=json.loads((stage/'deployment.json').read_bytes());source=meta['sourceCommit']
    require(len(source)==40 and all(ch in '0123456789abcdef' for ch in source))
    archive=stage/'source.tar.gz';require(sha(archive)==meta['sourceArchiveSha256'])
    config_path=ETC/'delivery.json';co_path=ETC/'delivery-coordinator.json';pub_path=ETC/'approver-public.pem'
    require(all(not p.exists() and not p.is_symlink() for p in [BASE/source,config_path,co_path,pub_path,OPERATOR]))
    account=pwd.getpwnam(USER);require(account.pw_uid==1000)
    client=ETC/'client.json';trusted(client);require(sha(client)==meta['clientConfigSha256'])
    program=Path('/usr/local/bin/plunode-publication-client');trusted(program);require(sha(program)==meta['clientProgramSha256'])
    cfg=json.loads(client.read_bytes());require(cfg['uid']==1000 and cfg['host']=='153.115.17.82')
    home=Path(account.pw_dir)/'.local/share/plunode-publication';original=home/'coordinator.json'
    trusted(original,1000);require(sha(original)==meta['coordinatorConfigSha256']);co=json.loads(original.read_bytes())
    require(co['workerId']=='plunode-wsl' and co['codeCommit']=='973c7b0c599f79905a029b28b524f4924e169376'
        and co['branch']=='codex/collection-control' and co['remote']=='https://github.com/isinxnisi/graph-knowledge.git')
    require(co['workerHome']=='/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020'
        and co['commonLock']=='/home/isinxnisi/.local/share/graph-autopilot/autopilot.lock'
        and co['journalDir']==str(home/'coordination') and co['serverKey']==str(ETC/'exclusion.pem'))
    trusted(Path(co['serverKey']));require(sha(Path(co['serverKey']))==co['serverKeySha256']==meta['closureKeySha256'])
    key=Path('/root/plunode-publication-operator/approver.pem');trusted(key);require(stat.S_IMODE(key.stat().st_mode)==0o600)
    pub=subprocess.run(['/usr/bin/openssl','pkey','-in',str(key),'-pubout'],capture_output=True,timeout=15)
    require(pub.returncode==0 and hashlib.sha256(pub.stdout).hexdigest()==meta['approverKeySha256'])
    queue=home/'deliveries'
    # All writes under the user-owned home happen as that user, never with root.
    setup="from pathlib import Path;import os,stat;p=Path("+repr(str(queue))+");p.mkdir(mode=0o700,exist_ok=True);s=p.lstat();assert not p.is_symlink() and s.st_uid==1000 and stat.S_IMODE(s.st_mode)==0o700;assert not list(p.iterdir())"
    subprocess.run(['/usr/sbin/runuser','-u',USER,'--','/usr/bin/python3','-I','-c',setup],check=True,timeout=15)
    records=[]
    with tempfile.TemporaryDirectory(prefix='.delivery-',dir=BASE) as tmp:
        dest=Path(tmp);seen=set();total=0
        with tarfile.open(archive,'r:gz') as tar:
            for member in tar:
                rel=Path(member.name);require(not rel.is_absolute() and '..' not in rel.parts and member.name not in seen);seen.add(member.name)
                target=dest/rel
                if member.isdir():target.mkdir(mode=0o755,parents=True,exist_ok=True);target.chmod(0o755)
                else:
                    require(member.isfile() and member.size<=64*1024*1024);total+=member.size;require(total<=512*1024*1024 and len(seen)<=10000)
                    target.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
                    write(target,tar.extractfile(member).read(),0o755 if member.mode&0o111 else 0o644)
        dest.chmod(0o755)
        require(sha(dest/'ops/plunode-publication-approve')==meta['operatorProgramSha256'])
        # Every code dependency is root-owned, with a readable explicit mode despite umask077.
        for item in dest.rglob('*'):
            if item.is_dir():item.chmod(0o755)
            else:trusted(item)
        os.rename(dest,BASE/source)
    fd=os.open(BASE,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
    config={'sourceCommit':source,'deliveryEnabled':False,'uid':1000,'queueDir':str(queue),
        'client':'/usr/local/bin/plunode-publication-client','clientConfig':str(client),'coordinationConfig':str(co_path),
        'runtime':str(Path(co['workerHome'])/'runtime'),'attesterKey':str(home/'keys/attester.pem'),
        'approverPublicKey':str(pub_path),'approverKeySha256':meta['approverKeySha256']}
    for path,data,mode in [(co_path,original.read_bytes(),0o644),(pub_path,pub.stdout,0o644),
        (config_path,json.dumps(config,sort_keys=True).encode(),0o644),(OPERATOR,(BASE/source/'ops/plunode-publication-approve').read_bytes(),0o755)]:
        write(path,data,mode);records.append({'path':str(path),'sha256':sha(path)})
    result=subprocess.run([str(OPERATOR),'--self-check'],capture_output=True,text=True,timeout=45)
    require(result.returncode==0);check=json.loads(result.stdout);require(check['signed'] is False and check['applyCalls']==0 and check['deliveryEnabled'] is False)
    record={'phase':'delivery-installed-disabled','sourceCommit':source,'sourceArchiveSha256':meta['sourceArchiveSha256'],
        'rootOperatorHandoff':check,'files':records,'queueDir':str(queue),'scheduledTaskRegistered':False,
        'privateKeysChanged':False,'liveWorkerModified':False,'productionApplyCalls':0,'preserveStage':str(stage)}
    write(stage/'installation.json',json.dumps(record,indent=2).encode(),0o600)
    print(json.dumps(record))
if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':'disabled-delivery-installation-stopped','errorType':type(error).__name__,'stage':str(Path(__file__).resolve().parent),'applyCalls':0}));raise SystemExit(1)
