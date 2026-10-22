"""Root updater in disposable files only; dummy programs, no real credentials or services."""
import contextlib,hashlib,importlib.util,io,json,os
from pathlib import Path
import tempfile,unittest
from unittest.mock import patch
P=Path(__file__).resolve().parents[1]
@unittest.skipUnless(os.geteuid()==0,'Explicit root disposable filesystem test')
class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='.channel-update-test-',dir='/root');self.addCleanup(self.temp.cleanup);base=Path(self.temp.name)
        self.stage=base/'stage';self.stage.mkdir();self.root=base/'production';self.root.mkdir();self.code=base/'code';self.code.mkdir()
        for home in [self.root,self.root/'readiness']:
            home.mkdir(exist_ok=True)
            for name in ['trusted','frozen','jobs','outbox']:(home/name).mkdir()
        self.sentinel=self.root/'readiness/frozen/immutable-artifact';self.sentinel.write_bytes(b'IMMUTABLE-FROZEN-ARTIFACT')
        spec=importlib.util.spec_from_file_location('disposable_channel_update',P/'ops/update-publication-channel-deadline.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.m.__file__=str(self.stage/'update-publication-channel-deadline.py');self.m.ROOT=self.root;self.m.CODE=self.code;self.m.COMMON=base/'common.lock';self.m.target=lambda n:self.code/Path(n).name
        # Real nonblocking flock in the dummy prior program; no Gate or DB implementation.
        oldcode=b'import os,fcntl,contextlib\n@contextlib.contextmanager\ndef locked(p):\n f=os.open(p,os.O_CREAT|os.O_RDWR,0o600)\n try:\n  fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);yield\n finally:os.close(f)\n'
        newcode=oldcode+b'\n# bounded wire deadline implementation fixture\n'
        (self.code/'publication-executor.py').write_bytes(oldcode);(self.code/'publication-policy.py').write_bytes(b'UNCHANGED-POLICY')
        files={'scripts/publication-executor.py':hashlib.sha256(oldcode).hexdigest(),'scripts/publication-policy.py':self.m.sha(self.code/'publication-policy.py')}
        self.old={'sourceCommit':self.m.PEER_SOURCE,'operatorSourceCommit':'f'*40,'operatorConfigId':'config','operatorManifestId':'manifest','configBindings':{'workerId':'fixed-worker'},'files':files}
        manifest=self.root/'trusted/program-manifest.json';manifest.write_text(json.dumps(self.old));self.m.OLD_MANIFEST=self.m.sha(manifest)
        self.config={'deploymentEnabled':False,'workerId':'fixed-worker','operatorDigest':'manifest'}
        for home in [self.root,self.root/'readiness']:(home/'trusted/config.json').write_text(json.dumps(self.config))
        (self.root/'readiness/exclusion.json').write_text(json.dumps({'active':self.m.NONCE,'tickets':{self.m.NONCE:{'phase':'open'}}}))
        new={**self.old,'files':{**files,'scripts/publication-executor.py':hashlib.sha256(newcode).hexdigest()},'sourceCommit':'c'*40,'peerSourceCommit':self.m.PEER_SOURCE}
        (self.stage/'new-program-manifest.json').write_text(json.dumps(new));(self.stage/'publication-executor.py').write_bytes(newcode)
        self.meta={'sourceCommit':'c'*40,'newManifestSha256':self.m.sha(self.stage/'new-program-manifest.json'),'newExecutorSha256':hashlib.sha256(newcode).hexdigest()};(self.stage/'update.json').write_text(json.dumps(self.meta))
    def invoke(self,*args):
        with patch.object(self.m.sys,'argv',['updater',*args]),contextlib.redirect_stdout(io.StringIO()):self.m.main()
    def test_update_and_partial_restore_preserve_ticket_artifacts_config_and_journals(self):
        before=self.m.state_hashes();self.invoke();self.assertEqual(self.m.state_hashes(),before);self.assertEqual(self.m.sha(self.root/'trusted/program-manifest.json'),self.meta['newManifestSha256'])
        # Simulate a prefix already restored, without state rewinds.
        (self.code/'publication-executor.py').write_bytes((self.stage/'previous-executor.py').read_bytes())
        self.invoke('--rollback');self.assertEqual(self.m.state_hashes(),before);self.assertEqual(self.m.sha(self.root/'trusted/program-manifest.json'),self.m.OLD_MANIFEST)
        self.assertEqual(self.sentinel.read_bytes(),b'IMMUTABLE-FROZEN-ARTIFACT')
    def test_conflicting_code_is_not_overwritten(self):
        path=self.code/'publication-policy.py';path.write_bytes(b'OTHER-OWNER-CHANGE')
        with self.assertRaises(ValueError):self.invoke()
        self.assertEqual(path.read_bytes(),b'OTHER-OWNER-CHANGE');self.assertFalse((self.stage/'previous-executor.py').exists())
if __name__=='__main__':unittest.main()
