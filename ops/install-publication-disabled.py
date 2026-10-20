#!/usr/bin/python3
"""One-time operator installer P33-INSTALL-20261021. Always leaves publication disabled.
Run ONLY from a root-owned, SHA256-verified staging directory after explicit approval.
Never invokes apply/restore, changes Compose/app.env, starts a daemon, or stops a Worker.
"""
import datetime as dt
import fcntl
import grp
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
from urllib.request import urlopen

SOURCE = '72338b7054b3f2eb2e9762b20859044f9b9e28ce'
IMAGE = 'sha256:af1216c98ef75ad0fdba1424d854fc26802af066f684c77af79f9bf6f6cf880f'
IMAGE_ARCHIVE_SHA256 = '1712fec50b1467a45e7ba1f01abb5ff6eb12d4fb6e6d75e43dfa0247efd2dbdd'
REVISION = '88437056-b74f-42ab-88c0-33ed435bdccc'
ROOT = Path('/var/lib/plunode-publication')
PROGRAMS = Path('/usr/local/lib/plunode-publication')
WRAPPER = Path('/usr/local/sbin/plunode-publication')
SSHD_FRAGMENT = Path('/etc/ssh/plunode-publication.conf')
SUDOERS = Path('/etc/sudoers.d/plunode-publication')
ACCOUNTS = ['plunode-publish', 'plunode-upload', 'plunode-audit']


def require(value, message):
    if not value: raise ValueError(message)


def run(argv, *, data=None):
    result = subprocess.run(argv, input=data, capture_output=True, timeout=240,
        env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','HOME':'/root'})
    require(result.returncode == 0, 'Operator command failed: ' + argv[0])
    return result.stdout


def write(path, data, mode=0o600):
    require(not path.exists() and not path.is_symlink(), 'Refuse overwrite: ' + str(path))
    fd=os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as stream:
        stream.write(data if isinstance(data,bytes) else data.encode());stream.flush();os.fsync(stream.fileno())
    os.chmod(path,mode)


def secure_tree(path):
    for item in [path,*path.parents]:
        st=item.lstat();require(st.st_uid==0 and not st.st_mode&0o022 and not item.is_symlink(),'Untrusted staging parent')


def main():
    require(os.geteuid()==0 and len(sys.argv)==1,'Fixed root installer only')
    os.umask(0o077); stage=Path(__file__).resolve().parent;secure_tree(stage)
    manifest=json.loads((stage/'program-manifest.json').read_bytes());require(manifest['sourceCommit']==SOURCE,'Source differs')
    expected={'ops/plunode-publication','ops/publication-ssh.py','scripts/publication-executor.py',
        'scripts/publication-exclusion.py','scripts/publication-policy.py','scripts/publication-cycle.py',
        'scripts/publication-sign.py','scripts/verify-publication.py','scripts/publication-notify.py',
        'scripts/publication-attest.py','scripts/publication-coordination.py'}
    require(set(manifest['files'])==expected,'Unexpected installed program set')
    for name,checksum in manifest['files'].items():
        path=stage/'reviewed-programs'/name
        require(not path.is_symlink() and path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==checksum,'Program hash differs')
    for path in [ROOT,PROGRAMS,WRAPPER,SSHD_FRAGMENT,SUDOERS,*[Path('/var/lib/'+a+'-home') for a in ACCOUNTS]]:
        require(not path.exists() and not path.is_symlink(),'Existing installation; stop for review: '+str(path))
    for account in ACCOUNTS:
        try:pwd.getpwnam(account)
        except KeyError:pass
        else:raise ValueError('Existing account; stop for review')
        try:grp.getgrnam(account)
        except KeyError:pass
        else:raise ValueError('Existing group; stop for review')
    active=Path('/opt/graph-knowledge/.member-activation.lock')
    fd=os.open(active,os.O_RDWR|os.O_NOFOLLOW)
    try:
        st=os.fstat(fd);require(st.st_uid==0 and stat.S_ISREG(st.st_mode) and st.st_nlink==1,'Wrong production lock')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    finally:os.close(fd)  # No lock across authentication/installation/image load.
    app=Path('/opt/graph-knowledge/app.env');compose=Path('/opt/graph-knowledge/compose.yaml')
    require(app.stat().st_uid==0 and stat.S_IMODE(app.stat().st_mode)==0o600,'Wrong private environment ownership')
    cfg=json.loads(run(['/usr/bin/docker','compose','--env-file',str(app),'-f',str(compose),'config','--format','json']))
    require(cfg['name']=='graph-knowledge-production','Wrong Compose project')
    env=cfg['services']['ops']['environment']; network=cfg['networks']['default']['name']
    require(env['NEO4J_URI']=='bolt://graph-neo4j:7687' and env['NEO4J_DATABASE']=='neo4j','Wrong public DB target')
    require(network=='graph-knowledge-production_default','Unexpected public network; no automatic adaptation')
    inspect=json.loads(run(['/usr/bin/docker','network','inspect',network]))[0]
    require(inspect['Labels'].get('com.docker.compose.project')==cfg['name'],'Wrong network owner')
    with urlopen('http://127.0.0.1:3200/api/dataset',timeout=15) as response: observed=json.load(response)
    require(observed.get('dataset')=='public-kg' and observed.get('revision')==REVISION,'Published revision changed; stop for review')
    inputs=json.loads((stage/'input-keys.json').read_text())
    require(set(inputs)=={'approverPublicPem','attesterPublicPem','executionSshPublicKey','uploadSshPublicKey'},'Wrong key input fields')
    for name in ['executionSshPublicKey','uploadSshPublicKey']:
        require(re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,3}(?: [^\r\n]+)?\n?',inputs[name]),'Ed25519 SSH key required')
    require(inputs['executionSshPublicKey'].split()[1]!=inputs['uploadSshPublicKey'].split()[1],'Separate SSH keys required')
    # Validate non-secret public PEMs without importing credentials or contacting a DB.
    for name in ['approverPublicPem','attesterPublicPem']:
        public=run(['/usr/bin/openssl','pkey','-pubin','-text','-noout'],data=inputs[name].encode())
        require(b'ED25519' in public,'Ed25519 public key required')
        inputs[name]=run(['/usr/bin/openssl','pkey','-pubin','-pubout'],data=inputs[name].encode()).decode()
    require(inputs['approverPublicPem']!=inputs['attesterPublicPem'],'Separate signing roles required')
    archive=stage/'publication-image.tar';checksum=(stage/'publication-image.sha256').read_text().strip()
    require(checksum==IMAGE_ARCHIVE_SHA256,'Reviewed image export checksum required')
    hasher=hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):hasher.update(block)
    require(hasher.hexdigest()==checksum,'Image transfer checksum differs')
    # Export must contain only the reviewed operator image, not a replacement Web/DB image.
    import tarfile
    with tarfile.open(archive) as tar:
        entries=json.load(tar.extractfile('manifest.json'))
        require(len(entries)==1 and entries[0].get('RepoTags') in [None,[]],'Untagged single-image export required')
    run(['/usr/bin/docker','load','--input',str(archive)])
    image=json.loads(run(['/usr/bin/docker','image','inspect',IMAGE]))[0]
    require(image['Id']==IMAGE and image['Os']=='linux' and image['Architecture']=='amd64','Image identity differs')
    audit={'scope':'P33-INSTALL-20261021','sourceCommit':SOURCE,'operatorDigest':IMAGE,
        'at':dt.datetime.now(dt.timezone.utc).isoformat(),'deploymentEnabled':False,'applyCalls':0,
        'oldSshConfigSha256':hashlib.sha256(Path('/etc/ssh/sshd_config').read_bytes()).hexdigest()}
    ROOT.mkdir(mode=0o751);(ROOT/'trusted').mkdir(mode=0o700)
    for name in ['frozen','jobs']: (ROOT/name).mkdir(mode=0o700)
    (ROOT/'outbox').mkdir(mode=0o755)
    # New users only; no existing group membership or passwords are changed.
    for account in ACCOUNTS:
        home=Path('/var/lib/'+account+'-home')
        require(not home.exists(),'Existing account home')
        shell='/usr/sbin/nologin' if account=='plunode-audit' else '/bin/sh'
        run(['/usr/sbin/useradd','--system','--user-group','--no-create-home','--password','!','--home-dir',str(home),'--shell',shell,account])
        home.mkdir(mode=0o755)
        if account!='plunode-audit':(home/'.ssh').mkdir(mode=0o755)
    inbox=ROOT/'inbox';inbox.mkdir(mode=0o2770);os.chown(inbox,0,pwd.getpwnam('plunode-upload').pw_gid);os.chmod(inbox,0o2770)
    PROGRAMS.mkdir(mode=0o755)
    for name in expected-{'ops/plunode-publication','scripts/publication-attest.py','scripts/publication-coordination.py'}:
        write(PROGRAMS/Path(name).name,(stage/'reviewed-programs'/name).read_bytes(),0o644)
    write(WRAPPER,(stage/'reviewed-programs/ops/plunode-publication').read_bytes(),0o755)
    for role,field in [('approver','approverPublicPem'),('attester','attesterPublicPem')]:
        write(ROOT/'trusted'/(role+'.pem'),inputs[field],0o644)
    key=ROOT/'trusted/exclusion-private.pem'
    run(['/usr/bin/openssl','genpkey','-algorithm','ED25519','-out',str(key)]);key.chmod(0o600)
    run(['/usr/bin/openssl','pkey','-in',str(key),'-pubout','-out',str(ROOT/'trusted/exclusion.pem')])
    (ROOT/'trusted/exclusion.pem').chmod(0o644)
    pins={role+'KeySha256':hashlib.sha256((ROOT/'trusted'/(role+'.pem')).read_bytes()).hexdigest() for role in ['approver','attester','exclusion']}
    configuration={'profile':'production','deploymentEnabled':False,'freezePolicy':'durable-pause-new-v1',
        'operatorDigest':IMAGE,'network':network,'neo4jUri':env['NEO4J_URI'],'neo4jDatabase':env['NEO4J_DATABASE'],
        'workerId':'plunode-wsl','workerCodeCommit':'973c7b0c599f79905a029b28b524f4924e169376',**pins}
    write(ROOT/'trusted/config.json',json.dumps(configuration,indent=2)+'\n')
    public_env=''.join(k+'='+str(env[k])+'\n' for k in ['NEO4J_URI','NEO4J_USER','NEO4J_PASSWORD','NEO4J_DATABASE'])
    require(all('\n' not in str(env[k]) and '\r' not in str(env[k]) for k in ['NEO4J_URI','NEO4J_USER','NEO4J_PASSWORD','NEO4J_DATABASE']),'Unsafe public-only credential encoding')
    write(ROOT/'trusted/public-kg.env',public_env)
    # Explicit read-only Docker calls, even while the publication gate is disabled.
    spec=importlib.util.spec_from_file_location('installed_publication_readonly',PROGRAMS/'publication-executor.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    backend=module.DockerBackend(ROOT,configuration)
    capabilities=backend.command(['scripts/publication-runtime.ts','capabilities'])
    require(capabilities=={'schemaVersion':1,'originalStory':True,'guardedApply':True},'Operator capabilities differ')
    with module.locked(active):
        backup=backend.command(['scripts/publication-runtime.ts','observe'])
        require(backup['payload']['revision']==REVISION and backup['payload']['release']=='manga-issue-25-utc-recovery-08-normal','Backup base differs')
        backup_data=json.dumps(backup,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
        write(ROOT/'jobs/install-readonly-backup.json',backup_data)
    export=ROOT/'export';export.mkdir(mode=0o751)
    transfer=export/'install-readonly-backup.json';write(transfer,backup_data)
    upload=pwd.getpwnam('plunode-upload');os.chown(transfer,upload.pw_uid,upload.pw_gid)
    audit['readOnlyBackup']={'sha256':hashlib.sha256(backup_data).hexdigest(),
        'rootPath':str(ROOT/'jobs/install-readonly-backup.json'),'sftpPath':'/export/install-readonly-backup.json'}
    command='restrict,command="/usr/bin/python3 -I /usr/local/lib/plunode-publication/publication-ssh.py" '
    write(Path('/var/lib/plunode-publish-home/.ssh/authorized_keys'),command+inputs['executionSshPublicKey'].strip()+'\n',0o644)
    write(Path('/var/lib/plunode-upload-home/.ssh/authorized_keys'),'restrict,command="internal-sftp -d /inbox" '+inputs['uploadSshPublicKey'].strip()+'\n',0o644)
    sudo='plunode-publish ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/plunode-publication\n'
    candidate=ROOT/'trusted/sudoers-candidate';write(candidate,sudo,0o440)
    run(['/usr/sbin/visudo','-cf',str(candidate)]);write(SUDOERS,sudo,0o440)
    fragment='Match User plunode-publish,plunode-upload\n    AuthenticationMethods publickey\n    PasswordAuthentication no\n    KbdInteractiveAuthentication no\n    PermitTTY no\n    AllowTcpForwarding no\n    AllowAgentForwarding no\n    X11Forwarding no\n    PermitTunnel no\n    PermitUserEnvironment no\nMatch User plunode-upload\n    ChrootDirectory /var/lib/plunode-publication\n    ForceCommand internal-sftp -d /inbox\nMatch all\n'
    write(SSHD_FRAGMENT,fragment,0o644)
    sshconfig=Path('/etc/ssh/sshd_config');old=sshconfig.read_bytes()
    write(ROOT/'trusted/sshd_config.before',old)
    tail=b'\n# P33-INSTALL-20261021 (additive account-only policy)\nInclude /etc/ssh/plunode-publication.conf\n'
    require(b'plunode-publication.conf' not in old,'Already included SSH policy')
    candidate=ROOT/'trusted/sshd_config.candidate';write(candidate,old+tail,0o644)
    run(['/usr/sbin/sshd','-t','-f',str(candidate)])
    # Preserve effective policy for the existing operator account.
    def effective(path):return run(['/usr/sbin/sshd','-T','-f',str(path),'-C','user=develop,host=localhost,addr=127.0.0.1'])
    require(effective(sshconfig)==effective(candidate),'Existing operator SSH policy would change')
    temp=Path('/etc/ssh/.plunode-sshd.candidate');write(temp,old+tail,0o644);os.replace(temp,sshconfig)
    try:run(['/usr/sbin/sshd','-t']);run(['/usr/bin/systemctl','reload','ssh'])
    except BaseException:
        restore=Path('/etc/ssh/.plunode-sshd.restore');write(restore,old,0o644);os.replace(restore,sshconfig)
        run(['/usr/sbin/sshd','-t']);run(['/usr/bin/systemctl','reload','ssh']);raise
    with urlopen('http://127.0.0.1:3200/api/dataset',timeout=15) as response: after=json.load(response)
    require(after==observed,'Published revision changed during installation; leave disabled')
    audit.update(pins=pins,network=network,phase='installed-disabled',accounts=ACCOUNTS,observedRevision=REVISION)
    write(ROOT/'trusted/installation.json',json.dumps(audit,indent=2)+'\n')
    # Only the public closure key and metadata leave trusted/. No env/private key output.
    write(ROOT/'outbox/exclusion.pem',(ROOT/'trusted/exclusion.pem').read_bytes(),0o644)
    write(ROOT/'outbox/installation.json',json.dumps(audit,indent=2)+'\n',0o644)
    print(json.dumps(audit))

if __name__=='__main__':
    try:main()
    except Exception:
        print('{"error":"publication-installation-stopped","deploymentEnabled":false,"applyCalls":0,"operatorInspectionRequired":true}')
        sys.exit(1)
