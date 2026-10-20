#!/usr/bin/python3 -I
"""Temporary real-machine acceptance entry. Fixed disposable targets only; never production apply."""
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import time
from urllib.request import urlopen as real_urlopen

ROOT=Path('/var/lib/plunode-publication/test')
CODE=Path('/usr/local/lib/plunode-publication')
NETWORK='plunode-publication-acceptance-20261021'
URI='bolt://graph-neo4j:7687'


def main():
    if os.geteuid()!=0 or len(sys.argv)!=3:raise ValueError('Fixed temporary root entry required')
    command,nonce=sys.argv[1:]
    if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',nonce):raise ValueError('UUID v4 required')
    os.environ.clear();os.environ.update(PATH='/usr/bin:/bin',LANG='C.UTF-8',HOME='/nonexistent');os.umask(0o077)
    for parent in [CODE,*CODE.parents,ROOT,ROOT/'trusted']:
        st=parent.lstat()
        if parent.is_symlink() or st.st_uid!=0 or st.st_mode&0o022:raise ValueError('Untrusted test installation')
    manifest=json.loads((ROOT/'trusted/program-manifest.json').read_bytes())
    import hashlib
    for relative,checksum in manifest['files'].items():
        path=CODE/Path(relative).name if relative!='ops/plunode-publication' else Path('/usr/local/sbin/plunode-publication')
        if relative in ['scripts/publication-attest.py','scripts/publication-coordination.py']:continue
        st=path.lstat()
        if path.is_symlink() or st.st_uid!=0 or st.st_mode&0o022 or hashlib.sha256(path.read_bytes()).hexdigest()!=checksum:raise ValueError('Reviewed program differs')
    spec=importlib.util.spec_from_file_location('acceptance_executor',CODE/'publication-executor.py')
    e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
    production=e.read(ROOT.parent/'trusted/config.json')
    e.require(production['deploymentEnabled'] is False,'Production must remain disabled')
    config=e.read(ROOT/'trusted/config.json')
    e.require(config['operatorDigest']==production['operatorDigest'] and config['operatorDigest'] in [
        'sha256:af1216c98ef75ad0fdba1424d854fc26802af066f684c77af79f9bf6f6cf880f',
        'sha256:e48a540914d708a88a70b66ad399eb6a7769e98c76ff4ace50cdb7febdf04cf1'],'Test operator identity differs')
    e.require(config['network']==NETWORK and config['neo4jUri']==URI and config['neo4jDatabase']=='neo4j','Disposable target differs')
    e.require(config['workerId']=='isolated-worker' and config['workerCodeCommit']=='a'*40,'Shadow Worker required')
    # Keep the reviewed verification implementation; remap only its fixed API to the test loopback.
    def isolated_api(url,*args,**kwargs):
        e.require(url.startswith('http://127.0.0.1:3200/'),'Unexpected test API target')
        return real_urlopen(url.replace('http://127.0.0.1:3200/','http://127.0.0.1:32740/',1),*args,**kwargs)
    e.urlopen=isolated_api
    class Backend(e.DockerBackend):
        def call(self,stage,payload):
            if stage=='notify':return {'sent':False}  # Test never posts fixture claims to GitHub.
            if stage=='apply':
                path=ROOT/'jobs/apply-calls.json'
                calls=e.read(path) if path.exists() else []
                calls.append({'nonce':payload['nonce'],'revision':payload['revision']});e.durable(path,calls)
                result=super().call(stage,payload)
                fault=ROOT/'jobs'/('crash-after-commit-'+payload['nonce'])
                if fault.exists():
                    os.replace(fault,ROOT/'jobs'/('crash-consumed-'+payload['nonce']))
                    e.durable(ROOT/'jobs'/('commit-observed-'+payload['nonce']+'.json'),{'committed':True,'nonce':payload['nonce']})
                    os._exit(86)  # Only this temporary gate process, after the real test DB commit.
                return result
            return super().call(stage,payload)
    original_run=e.subprocess.run
    def labelled_run(argv,*args,**kwargs):
        if argv[:2]==['/usr/bin/docker','run']:
            e.require('--network' in argv and argv[argv.index('--network')+1]==NETWORK,'Test container network differs')
            argv=argv[:2]+['--label','plunode.publication-test=P33-20261021']+argv[2:]
        return original_run(argv,*args,**kwargs)
    e.subprocess.run=labelled_run
    gate=e.Gate(ROOT,False);gate.common=ROOT/'operation.lock';gate.backend=Backend(ROOT,config)
    if command=='cleanup':
        with e.locked(gate.common):
            resources=e.read(ROOT/'trusted/resources.json')
            def docker(*args):
                result=original_run(['/usr/bin/docker',*args],capture_output=True,env=e.CLEAN_ENV,timeout=120)
                e.require(result.returncode==0,'Test cleanup stopped');return result.stdout
            network=json.loads(docker('network','inspect',NETWORK))[0]
            e.require(network['Id']==resources['networkId'] and network['Labels'].get('plunode.publication-test')=='P33-20261021','Test network identity differs')
            identifiers=list(network.get('Containers',{}))
            for identifier in identifiers:
                info=json.loads(docker('inspect',identifier))[0]
                e.require(info['Config']['Labels'].get('plunode.publication-test')=='P33-20261021','Unknown network peer; preserve resources')
                e.require(info['Image'] in resources['allowedImageIds'],'Unexpected test image')
                e.require(set(info['NetworkSettings']['Networks'])=={NETWORK},'Test peer joined another network')
            for identifier in identifiers:docker('rm','-f',identifier)
            docker('network','rm',resources['networkId'])
            auth=Path('/var/lib/plunode-publish-home/.ssh/authorized_keys')
            content=auth.read_text();line=resources['temporaryAuthorizedKey']
            e.require(content.splitlines().count(line)==1,'Temporary SSH key changed')
            replacement=auth.with_name('authorized_keys.p33-cleanup')
            with replacement.open('x') as stream:stream.write(''.join(row+'\n' for row in content.splitlines() if row!=line));stream.flush();os.fsync(stream.fileno())
            replacement.chmod(0o644);os.replace(replacement,auth)
            sudo=Path('/etc/sudoers.d/plunode-publication-acceptance')
            e.require(e.sha(sudo)==resources['sudoersSha256'],'Temporary sudoers changed');sudo.unlink()
            result={'testOnly':True,'temporaryResourcesRemoved':True,'journalsPreserved':True,'productionEnabled':False}
            e.durable(ROOT/'jobs/cleanup.json',result)
    elif command=='crash-after-commit':
        with e.locked(gate.common):
            e.require(nonce not in gate.reservations()['nonces'],'Cannot arm a fault after reservation')
            e.durable(ROOT/'jobs'/('crash-after-commit-'+nonce),{'nonce':nonce})
        result={'faultArmed':True,'testOnly':True}
    elif command=='inventory':
        with e.locked(gate.common):
            result={'testOnly':True,'productionEnabled':False,'network':NETWORK,
                'applyCalls':e.read(ROOT/'jobs/apply-calls.json') if (ROOT/'jobs/apply-calls.json').exists() else [],
                'reservations':gate.reservations()}
    else:
        e.require(command in ['arm','preflight','execute','status','notify','close','cancel','finish'],'Fixed test mode required')
        result=gate.run(command,nonce,e.exchange_stdio)
    print(json.dumps({'result':result}),flush=True)

if __name__=='__main__':
    try:main()
    except Exception:
        print('{"error":"publication-acceptance-stopped","productionApplyAuthorized":false}',flush=True);sys.exit(1)
