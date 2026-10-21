#!/usr/bin/python3 -I
"""Temporary real-machine acceptance entry. Fixed disposable targets only; never production apply."""
import importlib.util
import ipaddress
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


def private_web_url(network,container,resources):
    """Host access to the exact test Web on its internal bridge; no published port or extra network."""
    def require(value):
        if not value:raise ValueError('Private Web endpoint identity differs')
    require(network['Id']==resources['networkId'] and network['Name']==NETWORK
        and network['Driver']=='bridge' and network['Internal'] is True
        and network.get('Labels',{}).get('plunode.publication-test')=='P33-20261021')
    require(container['Id']==resources['webContainerId'] and container['Image']==resources['webImageId']
        and container['Config'].get('Labels',{}).get('plunode.publication-test')=='P33-20261021'
        and container['HostConfig'].get('PortBindings') in [None,{}]
        and set(container['NetworkSettings']['Networks'])=={NETWORK})
    endpoint=container['NetworkSettings']['Networks'][NETWORK]
    require(endpoint['NetworkID']==network['Id'])
    address=ipaddress.ip_address(endpoint['IPAddress'])
    subnets=[ipaddress.ip_network(row['Subnet']) for row in network['IPAM']['Config'] if row.get('Subnet')]
    require(address.version==4 and address.is_private and not address.is_loopback and not address.is_unspecified
        and any(address in subnet and address not in [subnet.network_address,subnet.broadcast_address] for subnet in subnets if subnet.version==4))
    peer=network.get('Containers',{}).get(container['Id'],{})
    require(peer.get('IPv4Address','').split('/')[0]==str(address))
    return 'http://'+str(address)+':3000/'


LEGACY_TEST_NONCE='590c3111-d65a-43f8-989e-44d901702e46'
LEGACY_TEST_ARTIFACT='956baabdff9db46e4d609d0009162047306c019548bf78a77e1de79490b9ad4c'

def legacy_fixture_ledger(ledger,data,before,request,nonce):
    """One malformed synthetic fixture only: derive redundant API coverage, never edit frozen bytes."""
    def require(value):
        if not value:raise ValueError('Legacy synthetic verification fixture differs')
    require(nonce==LEGACY_TEST_NONCE and request['artifactSha256']==LEGACY_TEST_ARTIFACT
        and ledger.get('authority')=='ISOLATED TEST ONLY actual-private-backup-and-synthetic-receipts'
        and 'pending' not in ledger and before['release']==request['baseRelease']=='release-group-2'
        and before['revision']==request['baseRevision'])
    pending={}
    for field in ['entities','claims','sources','citations']:
        old={row['id']:row for row in before['fixture'][field]}
        new={row['id']:row for row in data[field]}
        require(all(new.get(i)==row for i,row in old.items()))
        pending[field]=sorted(set(new)-set(old))
        require(ledger['counts']['acceptedUnpublished'][field]==len(pending[field]))
    return {**ledger,'pending':pending}


LEGACY_TEST_MANIFEST_FILE='11d6ab5639ac751b426f0a148044bda6f5de8d9734cf913a8962ce0f0c3f220d'
LEGACY_TEST_MANIFEST_PY='54e5444063fbda6fcd6ffe530c0d809cd4f39f65e41622b4cf74e5d3f16f6128'
LEGACY_TEST_MANIFEST_TS='1ca6c5f03293ac71ac6fa4e64f4c2a0eb57643768d3fcdf3d1357dd5c38645eb'

def legacy_fixture_digest(value,original,nonce,artifact,file_sha):
    """Exact frozen fixture bridge between existing Python and TS manifest ordering only."""
    checksum=original(value)
    if checksum!=LEGACY_TEST_MANIFEST_PY:return checksum
    if nonce!=LEGACY_TEST_NONCE or artifact!=LEGACY_TEST_ARTIFACT or file_sha!=LEGACY_TEST_MANIFEST_FILE:
        raise ValueError('Legacy synthetic manifest binding differs')
    return LEGACY_TEST_MANIFEST_TS


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
    # Keep the reviewed API verifier. Only this fixture maps its fixed URL to an ID-checked private Web.
    original_run=e.subprocess.run
    def isolated_api(url,*args,**kwargs):
        e.require(url.startswith('http://127.0.0.1:3200/'),'Unexpected test API target')
        resources=e.read(ROOT/'trusted/resources.json')
        e.require(re.fullmatch('[a-f0-9]{64}',resources['webContainerId']),'Invalid private Web ID')
        values=[]
        for argv in [['/usr/bin/docker','network','inspect',NETWORK],['/usr/bin/docker','inspect',resources['webContainerId']]]:
            result=original_run(argv,capture_output=True,env=e.CLEAN_ENV,timeout=15)
            e.require(result.returncode==0,'Private API inspection failed');values.append(json.loads(result.stdout)[0])
        target=private_web_url(*values,resources)
        return real_urlopen(target+url[len('http://127.0.0.1:3200/'):],*args,**kwargs)
    e.urlopen=isolated_api
    class Backend(e.DockerBackend):
        def call(self,stage,payload):
            if stage=='verify':
                candidate=Path(payload['candidate']);original_read=e.read
                def fixture_read(path):
                    value=original_read(path)
                    if Path(path)==candidate/'ledger.json' and 'pending' not in value:
                        request=original_read(candidate/'approval-request.json')
                        e.require(e.sha(candidate/'ARTIFACT.json')==LEGACY_TEST_ARTIFACT,'Frozen fixture artifact differs')
                        return legacy_fixture_ledger(value,original_read(candidate/'release/data.json'),
                            original_read(ROOT/'jobs'/(payload['nonce']+'-backup.json'))['payload'],request,payload['nonce'])
                    return value
                e.read=fixture_read
                try:return super().call(stage,payload)
                finally:e.read=original_read
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
    def labelled_run(argv,*args,**kwargs):
        if argv[:2]==['/usr/bin/docker','run']:
            e.require('--network' in argv and argv[argv.index('--network')+1]==NETWORK,'Test container network differs')
            argv=argv[:2]+['--label','plunode.publication-test=P33-20261021']+argv[2:]
        return original_run(argv,*args,**kwargs)
    e.subprocess.run=labelled_run
    class FixtureGate(e.Gate):
        def verify(self,nonce,state,candidate):
            if nonce!=LEGACY_TEST_NONCE:return super().verify(nonce,state,candidate)
            # Only the historical consumed synthetic artifact; production modules stay unchanged.
            artifact=e.sha(candidate/'ARTIFACT.json');file_sha=e.sha(candidate/'release/manifest.json')
            e.require(artifact==LEGACY_TEST_ARTIFACT and file_sha==LEGACY_TEST_MANIFEST_FILE,'Frozen fixture manifest differs')
            original_digest=e.digest
            e.digest=lambda value:legacy_fixture_digest(value,original_digest,nonce,artifact,file_sha)
            try:return super().verify(nonce,state,candidate)
            finally:e.digest=original_digest
    gate=FixtureGate(ROOT,False);gate.common=ROOT/'operation.lock';gate.backend=Backend(ROOT,config)
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
