#!/usr/bin/python3 -I
"""Approved P33 temporary real-machine fixtures. New private DB/network only; production disabled."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT=Path('/var/lib/plunode-publication/test')
NETWORK='plunode-publication-acceptance-20261021'
LABEL='plunode.publication-test=P33-20261021'
IMAGE='sha256:af1216c98ef75ad0fdba1424d854fc26802af066f684c77af79f9bf6f6cf880f'
CODE=Path('/usr/local/lib/plunode-publication')


def require(value,message):
    if not value:raise ValueError(message)


def run(argv):
    value=subprocess.run(argv,capture_output=True,timeout=240,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','HOME':'/root'})
    require(value.returncode==0,'Temporary fixture command failed: '+argv[0]);return value.stdout


def write(path,value,mode=0o600):
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as stream:stream.write(value.encode() if isinstance(value,str) else value);stream.flush();os.fsync(stream.fileno())
    path.chmod(mode)


def directory(path,mode):path.mkdir(mode=mode);path.chmod(mode)


def main():
    require(os.geteuid()==0 and len(sys.argv)==1,'Root fixed staging only');os.umask(0o077)
    stage=Path(__file__).resolve().parent
    for item in [stage,*stage.parents]:
        st=item.lstat();require(not item.is_symlink() and st.st_uid==0 and not st.st_mode&0o022,'Untrusted root staging')
    require(not ROOT.exists(),'Existing temporary test root; preserve it')
    production=ROOT.parent
    config=json.loads((production/'trusted/config.json').read_bytes())
    require(config['deploymentEnabled'] is False and config['operatorDigest']==IMAGE,'Production must remain disabled')
    audit=json.loads((production/'trusted/installation.json').read_bytes())
    require(audit['phase']=='installed-disabled','Disabled installation required')
    for target in ['/usr/local/sbin/plunode-publication-acceptance','/etc/sudoers.d/plunode-publication-acceptance',str(CODE/'publication-acceptance-ssh.py')]:
        require(not Path(target).exists(),'Existing temporary entry; preserve it')
    mem={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')}
    require(mem['MemAvailable']>=1400*1024,'Insufficient current memory margin')
    with socket.socket() as sock:sock.bind(('127.0.0.1',32740))
    # Exact name must be absent; no removal/reuse of an existing network.
    names=run(['/usr/bin/docker','network','ls','--format','{{.Name}}']).decode().splitlines()
    require(NETWORK not in names,'Test network exists')
    images={}
    for role,service in [('db','graph-neo4j'),('web','web')]:
        identifiers=run(['/usr/bin/docker','ps','--filter','label=com.docker.compose.project=graph-knowledge-production','--filter','label=com.docker.compose.service='+service,'--format','{{.ID}}']).decode().splitlines()
        require(len(identifiers)==1,'Current service identity unclear')
        info=json.loads(run(['/usr/bin/docker','inspect',identifiers[0]]))[0]
        images[role]=info['Image']
    for image in [*images.values(),IMAGE]:
        inspected=json.loads(run(['/usr/bin/docker','image','inspect',image]))[0]
        require(inspected['Id']==image and inspected['Os']=='linux' and inspected['Architecture']=='amd64','Image platform differs')
    keys=json.loads((stage/'test-public-keys.json').read_bytes())
    require(set(keys)=={'approver','attester','ssh'},'Test public key fields differ')
    require(re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,3}(?: [^\r\n]+)?\n?',keys['ssh']),'Test SSH key differs')
    for role in ['approver','attester']:
        result=subprocess.run(['/usr/bin/openssl','pkey','-pubin','-text','-noout'],input=keys[role].encode(),capture_output=True,timeout=10)
        require(result.returncode==0 and b'ED25519' in result.stdout,'Test Ed25519 key required')
    require(keys['approver']!=keys['attester'],'Separate test signing roles required')
    with urlopen('http://127.0.0.1:3200/api/dataset',timeout=15) as response:before=json.load(response)
    require(before['revision']==audit['observedRevision'],'Production revision changed')
    directory(ROOT,0o751)
    for name,mode in [('trusted',0o700),('jobs',0o700),('frozen',0o700),('outbox',0o755),('export',0o751)]:directory(ROOT/name,mode)
    directory(ROOT/'inbox',0o2770);upload=pwd.getpwnam('plunode-upload');os.chown(ROOT/'inbox',0,upload.pw_gid);(ROOT/'inbox').chmod(0o2770)
    for role in ['approver','attester']:write(ROOT/'trusted'/(role+'.pem'),keys[role],0o644)
    closure=ROOT/'trusted/exclusion-private.pem';run(['/usr/bin/openssl','genpkey','-algorithm','ED25519','-out',str(closure)]);closure.chmod(0o600)
    run(['/usr/bin/openssl','pkey','-in',str(closure),'-pubout','-out',str(ROOT/'trusted/exclusion.pem')]);(ROOT/'trusted/exclusion.pem').chmod(0o644)
    pins={role+'KeySha256':hashlib.sha256((ROOT/'trusted'/(role+'.pem')).read_bytes()).hexdigest() for role in ['approver','attester','exclusion']}
    test_config={'profile':'production','deploymentEnabled':True,'freezePolicy':'durable-pause-new-v1','operatorDigest':IMAGE,
        'network':NETWORK,'neo4jUri':'bolt://plunode-acceptance-neo4j:7687','neo4jDatabase':'neo4j','workerId':'isolated-worker','workerCodeCommit':'a'*40,**pins}
    write(ROOT/'trusted/config.json',json.dumps(test_config,indent=2)+'\n')
    import secrets
    password=secrets.token_hex(24)
    public_env='NEO4J_URI=bolt://plunode-acceptance-neo4j:7687\nNEO4J_USER=neo4j\nNEO4J_PASSWORD='+password+'\nNEO4J_DATABASE=neo4j\n'
    write(ROOT/'trusted/public-kg.env',public_env)
    write(ROOT/'trusted/neo4j.env','NEO4J_AUTH=neo4j/'+password+'\nNEO4J_server_memory_heap_initial__size=128m\nNEO4J_server_memory_heap_max__size=256m\nNEO4J_server_memory_pagecache_size=64m\n')
    write(ROOT/'trusted/web.env',public_env+'GRAPH_DATASET=public-kg\nGRAPH_DEPLOYMENT=production\nMEMBER_STORAGE_ENABLED=0\nPLUNODE_PUBLIC_ENABLED=1\n')
    write(ROOT/'trusted/program-manifest.json',(stage/'program-manifest.json').read_bytes())
    write(Path('/usr/local/sbin/plunode-publication-acceptance'),(stage/'publication-acceptance-entry.py').read_bytes(),0o755)
    write(CODE/'publication-acceptance-ssh.py',(stage/'publication-acceptance-ssh.py').read_bytes(),0o644)
    network=run(['/usr/bin/docker','network','create','--internal','--label',LABEL,NETWORK]).decode().strip()
    containers=[]
    try:
        db=run(['/usr/bin/docker','run','-d','--pull=never','--name',NETWORK+'-db','--network',NETWORK,'--network-alias','plunode-acceptance-neo4j','--label',LABEL,
            '--memory=768m','--pids-limit=256','--env-file',str(ROOT/'trusted/neo4j.env'),'--tmpfs','/data:rw,uid=7474,gid=7474','--tmpfs','/logs:rw,uid=7474,gid=7474',images['db']]).decode().strip();containers.append(db)
        # Wait without holding either production or WSL common locks.
        deadline=time.monotonic()+150
        while time.monotonic()<deadline:
            ready=subprocess.run(['/usr/bin/docker','exec',db,'wget','-q','-T','2','-O','/dev/null','http://127.0.0.1:7474/'],capture_output=True,timeout=5)
            if ready.returncode==0:break
            time.sleep(1)
        else:raise ValueError('Private Neo4j startup timed out')
        seed=stage/'seed';seed.chmod(0o755)
        for item in seed.iterdir():require(item.is_file() and not item.is_symlink(),'Unsafe synthetic fixture');item.chmod(0o644)
        def ops(args):return run(['/usr/bin/docker','run','--rm','--pull=never','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--label',LABEL,
            '--user=1000:1000','--memory=1g','--pids-limit=128','--network',NETWORK,'--env-file',str(ROOT/'trusted/public-kg.env'),
            '--mount','type=bind,src='+str(seed)+',dst=/incoming,readonly',IMAGE,*args])
        require(json.loads(ops(['scripts/public-kg.ts','validate','/incoming']))['valid'],'Synthetic fixture validation failed')
        ops(['scripts/public-kg.ts','apply','/incoming'])  # Bootstrap ONLY the brand-new private DB.
        backup=ops(['scripts/publication-runtime.ts','observe'])
        write(ROOT/'export/base-backup.json',backup);os.chown(ROOT/'export/base-backup.json',upload.pw_uid,upload.pw_gid)
        write(ROOT/'outbox/exclusion.pem',(ROOT/'trusted/exclusion.pem').read_bytes(),0o644)
        web=run(['/usr/bin/docker','run','-d','--pull=never','--name',NETWORK+'-web','--network',NETWORK,'--label',LABEL,'--memory=384m','--pids-limit=128',
            '--cap-drop=ALL','--security-opt=no-new-privileges','--env-file',str(ROOT/'trusted/web.env'),'-p','127.0.0.1:32740:3000',images['web']]).decode().strip();containers.append(web)
        expected=json.loads(backup)['payload']['revision']
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            try:
                with urlopen('http://127.0.0.1:32740/api/dataset',timeout=3) as response:current=json.load(response)
                if current=={'dataset':'public-kg','revision':expected}:break
            except Exception:pass
            time.sleep(1)
        else:raise ValueError('Private Web/API startup timed out')
        key_line='restrict,command="/usr/bin/python3 -I /usr/local/lib/plunode-publication/publication-acceptance-ssh.py" '+keys['ssh'].strip()
        auth=Path('/var/lib/plunode-publish-home/.ssh/authorized_keys');old=auth.read_bytes()
        write(ROOT/'trusted/authorized_keys.before',old)
        candidate=auth.with_name('authorized_keys.p33-test');write(candidate,old+key_line.encode()+b'\n',0o644);os.replace(candidate,auth)
        sudo='plunode-publish ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/plunode-publication-acceptance\n'
        sudo_candidate=ROOT/'trusted/sudoers-candidate';write(sudo_candidate,sudo,0o440);run(['/usr/sbin/visudo','-cf',str(sudo_candidate)])
        write(Path('/etc/sudoers.d/plunode-publication-acceptance'),sudo,0o440)
        resources={'networkId':network,'containerIds':containers,'allowedImageIds':[IMAGE,*images.values()],
            'temporaryAuthorizedKey':key_line,'sudoersSha256':hashlib.sha256(sudo.encode()).hexdigest(),'productionEnabled':False}
        write(ROOT/'trusted/resources.json',json.dumps(resources,indent=2)+'\n')
        result={'testOnly':True,'phase':'private-real-machine-fixtures-ready','productionEnabled':False,'productionRevision':before['revision'],
            'backupSha256':hashlib.sha256(backup).hexdigest(),'images':images,'pins':pins,'networkId':network}
        write(ROOT/'outbox/setup.json',json.dumps(result,indent=2)+'\n',0o644)
        with urlopen('http://127.0.0.1:3200/api/dataset',timeout=15) as response:require(json.load(response)==before,'Production revision changed')
        print(json.dumps(result))
    except BaseException:
        # Only IDs just created by this installer; never existing services or volumes.
        for container in reversed(containers):subprocess.run(['/usr/bin/docker','rm','-f',container],capture_output=True,timeout=60)
        subprocess.run(['/usr/bin/docker','network','rm',network],capture_output=True,timeout=60)
        raise

if __name__=='__main__':
    try:main()
    except Exception:
        print('{"error":"private-real-machine-setup-stopped","productionApplyCalls":0}');sys.exit(1)
