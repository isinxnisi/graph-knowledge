"""Root filesystem integration in a disposable /root test tree. No VPS, KG, Worker or real keys."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

REPO=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

@unittest.skipUnless(os.geteuid()==0,'Run explicitly as root in disposable fixture; normal suite skips')
class FixedWslInstallationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='.publication-readiness-test-',dir='/root');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.stage=self.root/'stage';self.stage.mkdir(mode=0o700)
        self.base=self.root/'fixed';self.base.mkdir(mode=0o755)
        self.home=self.root/'home';self.home.mkdir()
        self.keys=self.home/'.local/share/plunode-publication/keys';self.keys.mkdir(parents=True)
        self.client=self.root/'bin/readiness-client';self.client.parent.mkdir()
        self.approver=self.root/'approver.pem';self.attester=self.keys/'attester.pem';pins={}
        for name,path in [('approver',self.approver),('attester',self.attester)]:
            subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(path)],capture_output=True,check=True);path.chmod(0o600)
            if name=='attester':os.chown(path,1000,1000)
            public=subprocess.check_output(['openssl','pkey','-in',str(path),'-pubout']);pins[name+'KeySha256']=hashlib.sha256(public).hexdigest()
        for name in ['execution-ed25519','upload-ed25519']:
            path=self.keys/name;path.write_bytes(b'DUMMY-ISOLATED-SSH-KEY-ONLY');path.chmod(0o600);os.chown(path,1000,1000)
        self.config=self.root/'client.json';self.config.write_text('{}');self.closure=self.root/'closure.pem';self.closure.write_bytes(b'DUMMY-PUBLIC-CLOSURE')
        self.sentinel=self.home/'.local/share/plunode-collection-worker-phase-b-20261020/config.json';self.sentinel.parent.mkdir();self.sentinel.write_bytes(b'LIVE-WORKER-SENTINEL-UNCHANGED')
        self.commit='b'*40;client=(REPO/'ops/publication-readiness-client').read_bytes()
        archive=self.stage/'wsl-source.tar.gz'
        with tarfile.open(archive,'w:gz') as out:
            for name,data in {'ops/publication-readiness-client':client,'scripts/publication-attest.py':(REPO/'scripts/publication-attest.py').read_bytes()}.items():
                info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;out.addfile(info,io.BytesIO(data))
        self.metadata={'sourceCommit':self.commit,'wslArchiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'readinessClientSha256':hashlib.sha256(client).hexdigest(),'configBindings':pins}
        (self.stage/'deployment.json').write_text(json.dumps(self.metadata))
        self.module=load('isolated_wsl_install',REPO/'ops/install-publication-readiness-wsl.py')
        self.module.__file__=str(self.stage/'install-publication-readiness-wsl.py')
        for name,value in {'BASE':self.base,'HOME':self.home,'KEYS':self.keys,'APPROVER':self.approver,'CLIENT_CONFIG':self.config,'CLOSURE_PUBLIC':self.closure,'READINESS_CLIENT':self.client}.items():setattr(self.module,name,value)
        self.custody=load('isolated_custody',REPO/'ops/publication-key-backup.py');self.custody.phrase=lambda:'isolated-operator-password-not-a-real-secret'

    def invoke(self):
        with patch.object(self.module.sys,'argv',['installer']),patch.object(self.module.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=1000,pw_gid=1000)),patch.object(self.module,'load',return_value=self.custody):self.module.main()

    def test_fixed_code_and_encrypted_backup_use_real_root_permissions_without_worker_changes(self):
        before=self.sentinel.read_bytes();self.invoke();target=self.base/self.commit
        self.assertEqual((target/'ops/publication-readiness-client').stat().st_uid,0)
        self.assertEqual(stat.S_IMODE((target/'ops').stat().st_mode),0o755)
        self.assertEqual(stat.S_IMODE((target/'scripts').stat().st_mode),0o755)
        self.assertEqual(stat.S_IMODE(self.client.stat().st_mode),0o755)
        self.assertEqual(self.sentinel.read_bytes(),before)
        backup=self.stage/'custody-wsl.gpg'
        self.assertEqual(backup.stat().st_uid,0);self.assertEqual(stat.S_IMODE(backup.stat().st_mode),0o600)
        self.assertNotIn(b'DUMMY-ISOLATED-SSH-KEY-ONLY',backup.read_bytes())
        with self.assertRaises(ValueError):self.invoke()
        self.assertEqual(self.sentinel.read_bytes(),before)

    def test_wrong_key_pin_stops_before_backup_or_fixed_file_creation(self):
        self.metadata['configBindings']['attesterKeySha256']='0'*64;(self.stage/'deployment.json').write_text(json.dumps(self.metadata))
        with self.assertRaises(ValueError):self.invoke()
        self.assertFalse((self.base/self.commit).exists());self.assertFalse(self.client.exists());self.assertFalse((self.stage/'custody-wsl.gpg').exists())

@unittest.skipUnless(os.geteuid()==0,'Run explicitly as root in disposable fixture')
class VpsUpgradeFilesystemTests(FixedWslInstallationTests):
    # Reuse only disposable dummy key creation; no real VPS or public KG connection.
    def test_fixed_code_and_encrypted_backup_use_real_root_permissions_without_worker_changes(self):
        self.exercise_upgrade_and_rollback()
    test_wrong_key_pin_stops_before_backup_or_fixed_file_creation=None

    def exercise_upgrade_and_rollback(self):
        import contextlib
        from unittest.mock import Mock
        extra=tempfile.TemporaryDirectory(prefix='plunode-publication-readiness.test-',dir='/root');self.addCleanup(extra.cleanup);stage=Path(extra.name)
        root=self.root/'production';root.mkdir(mode=0o751)
        for name in ['trusted','jobs','inbox','frozen','export']:(root/name).mkdir(mode=0o700)
        sentinel=root/'jobs/install-readonly-backup.json';sentinel.write_bytes(b'ORIGINAL-PUBLIC-BACKUP-UNCHANGED')
        code=self.root/'code';code.mkdir();sbin=self.root/'sbin';sbin.mkdir();audit=self.root/'audit';audit.mkdir()
        m=load('root_fs_upgrade',REPO/'ops/install-publication-readiness.py');m.__file__=str(stage/'install-publication-readiness.py')
        for name,value in {'ROOT':root,'CODE':code,'SBIN':sbin,'LOCK':self.root/'common.lock','AUDIT_HOME':audit,'PROBE':root/'readiness','SUDO':self.root/'temporary-sudoers'}.items():setattr(m,name,value)
        entry=load('dummy_root_entry',REPO/'ops/install-publication-readiness.py')
        names={'ops/plunode-publication','ops/publication-ssh.py','scripts/publication-executor.py','scripts/publication-exclusion.py','scripts/publication-policy.py','scripts/publication-cycle.py','scripts/publication-sign.py','scripts/verify-publication.py','scripts/publication-notify.py','ops/plunode-publication-readiness','vendor/gh'}
        prior={};new={};programs=stage/'programs';programs.mkdir()
        for name in names:
            payload=('NEW:'+name).encode();(programs/Path(name).name).write_bytes(payload);new[name]=hashlib.sha256(payload).hexdigest()
            if name not in ['ops/plunode-publication-readiness','vendor/gh']:
                path=m.target(name);path.write_bytes(('OLD:'+name).encode());path.chmod(0o755 if path.parent==sbin else 0o644);prior[name]=m.sha(path)
        pins={}
        for name,key in [('approver',self.approver),('attester',self.attester)]:
            public=subprocess.check_output(['openssl','pkey','-in',str(key),'-pubout']);(root/'trusted'/(name+'.pem')).write_bytes(public);pins[name+'KeySha256']=hashlib.sha256(public).hexdigest()
        private=root/'trusted/exclusion-private.pem';subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(private)],capture_output=True,check=True);private.chmod(0o600)
        public=subprocess.check_output(['openssl','pkey','-in',str(private),'-pubout']);(root/'trusted/exclusion.pem').write_bytes(public);pins['exclusionKeySha256']=hashlib.sha256(public).hexdigest()
        bindings={'profile':'production','workerId':'plunode-wsl','workerCodeCommit':m.WORKER,'network':'production-network','neo4jUri':'bolt://graph-neo4j:7687','neo4jDatabase':'neo4j','freezePolicy':'durable-pause-new-v1',**pins}
        config={**bindings,'deploymentEnabled':False,'operatorDigest':'sha256:'+'a'*64};(root/'trusted/config.json').write_text(json.dumps(config));(root/'trusted/config.json').chmod(0o600)
        (root/'trusted/public-kg.env').write_text('NEO4J_URI=bolt://graph-neo4j:7687\nNEO4J_USER=dummy\nNEO4J_PASSWORD=ISOLATED_ONLY\nNEO4J_DATABASE=neo4j\n')
        manifest={'sourceCommit':'c'*40,'files':new,'operatorConfigId':'sha256:'+'b'*64,'operatorManifestId':'sha256:'+'d'*64,'configBindings':bindings};(stage/'program-manifest.json').write_text(json.dumps(manifest))
        (stage/'prior-program-manifest.json').write_text(json.dumps({'sourceCommit':'72338b7054b3f2eb2e9762b20859044f9b9e28ce','files':prior}))
        deploy={'sourceCommit':'c'*40,'programManifestSha256':m.sha(stage/'program-manifest.json'),'assets':{str(path.relative_to(stage)):m.sha(path) for path in programs.iterdir()},'image':{'configId':manifest['operatorConfigId'],'manifestId':manifest['operatorManifestId']}}
        (stage/'deployment.json').write_text(json.dumps(deploy))
        executor=load('disposable_root_executor',REPO/'scripts/publication-executor.py');backend_calls=[]
        class Backend:
            def __init__(self,*args):pass
            def call(self,stage,payload):
                backend_calls.append(stage)
                if stage=='image':return {'operatorDigest':manifest['operatorManifestId']}
                if stage=='observe':return {'payload':{'release':m.RELEASE,'revision':m.REVISION}}
                raise AssertionError('No DB write or other stage permitted')
        original_run=m.run
        def run(args,**kwargs):
            if args[:3]==['/usr/bin/docker','info','--format']:return b'[["driver-type","io.containerd.snapshotter.v1"]]'
            if args[:2]==['/usr/bin/docker','load'] or args[0]=='/usr/sbin/visudo':return b'ok'
            if args[0]==str(code/'gh'):return b'gh version 2.45.0\n'
            if args[0]=='/usr/bin/openssl':return original_run(args,**kwargs)
            raise AssertionError('Unexpected system command')
        m.run=run
        m.load=lambda name,path:self.custody if name=='approved_custody' else executor
        def account(name):return SimpleNamespace(pw_dir=str(audit),pw_uid=1000,pw_gid=1000)
        response=io.BytesIO(b'{"number":33}')
        with patch.object(m.sys,'argv',['installer']),patch.object(m,'archive_identity',side_effect=lambda path,value:value),patch.object(m.pwd,'getpwnam',side_effect=account),patch.object(m.getpass,'getpass',return_value='DUMMY_ISOLATED_AUDIT_TOKEN'),patch.object(m,'urlopen',return_value=response),patch.object(executor,'DockerBackend',Backend),contextlib.redirect_stdout(io.StringIO()):m.main()
        self.assertEqual(backend_calls,['image','observe']);self.assertFalse(json.loads((root/'trusted/config.json').read_bytes())['deploymentEnabled'])
        self.assertTrue((root/'readiness/trusted/config.json').exists());self.assertEqual((audit/'.config/plunode-publication/token').stat().st_uid,1000)
        self.assertEqual(sentinel.read_bytes(),b'ORIGINAL-PUBLIC-BACKUP-UNCHANGED')
        records=json.loads((stage/'rollback.json').read_bytes())['files']
        first=next(row for row in records if row['previousFile'] is not None)
        Path(first['path']).write_bytes((stage/first['previousFile']).read_bytes())  # Already-restored prefix after interruption.
        rollback=load('disposable_root_rollback',REPO/'ops/rollback-publication-readiness.py');rollback.ROOT=root;rollback.CODE=code;rollback.SUDO=m.SUDO;rollback.AUDIT_TOKEN=audit/'.config/plunode-publication/token'
        with patch.object(rollback.sys,'argv',['rollback',str(stage)]),patch.object(rollback,'load_helpers',return_value=m),contextlib.redirect_stdout(io.StringIO()):rollback.main()
        for name,checksum in prior.items():self.assertEqual(m.sha(m.target(name)),checksum)
        self.assertEqual(json.loads((root/'trusted/config.json').read_bytes()),config)
        self.assertFalse((root/'trusted/program-manifest.json').exists());self.assertFalse(m.SUDO.exists())
        self.assertEqual(sentinel.read_bytes(),b'ORIGINAL-PUBLIC-BACKUP-UNCHANGED');self.assertTrue((root/'readiness/trusted/config.json').exists())

if __name__=='__main__':unittest.main()
