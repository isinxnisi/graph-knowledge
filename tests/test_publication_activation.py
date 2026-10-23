"""Disposable root FS activation tests. Docker/KG are stubs; no live path or key used."""
import contextlib,hashlib,importlib.util,io,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
FAKE=r'''import contextlib,fcntl,json,os
from pathlib import Path
base=Path(__file__).parent.parent
@contextlib.contextmanager
def locked(p):
 with p.open('a') as f:
  fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
 def_unused=None
def durable(p,v):
 if p.name=='activation-20261023.json' and (base/'fail-export').exists():raise OSError('isolated export failure')
 with p.open('w') as f:json.dump(v,f);f.flush();os.fsync(f.fileno())
class DockerBackend:
 def __init__(self,root,cfg):self.cfg=cfg
 def call(self,stage,payload):
  if stage=='image':return {'operatorDigest':self.cfg['operatorDigest']}
  if stage=='observe':return {'payload':{'revision':'88437056-b74f-42ab-88c0-33ed435bdccc','release':'manga-issue-25-utc-recovery-08-normal'}}
  raise AssertionError('No apply or other stage authorized')
'''
@unittest.skipUnless(os.geteuid()==0,'Disposable root FS test')
class ActivationTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='isolated-publication-activation-',dir='/root');self.addCleanup(self.temp.cleanup)
  self.base=Path(self.temp.name);self.root=self.base/'state';self.code=self.base/'code'
  for p in [self.root/'trusted',self.root/'export',self.root/'readiness/outbox',self.code]:p.mkdir(parents=True,exist_ok=True)
  sp=importlib.util.spec_from_file_location('activation_fixture',ROOT/'ops/activate-publication-vps.py');self.a=importlib.util.module_from_spec(sp);sp.loader.exec_module(self.a)
  self.a.ROOT=self.root;self.a.CODE=self.code;self.a.COMMON=self.base/'common.lock';self.a.STAGING=self.base
  (self.code/'publication-executor.py').write_text(FAKE)
  manifest={'files':{'scripts/publication-executor.py':hashlib.sha256(FAKE.encode()).hexdigest()},'configBindings':{'worker':'fixed'}}
  self.save('trusted/program-manifest.json',manifest);self.a.MANIFEST_SHA=self.a.sha(self.root/'trusted/program-manifest.json')
  self.cfg={'deploymentEnabled':False,'worker':'fixed','operatorDigest':self.a.IMAGE,'credentialCanary':'test-only-not-a-secret'}
  self.save('trusted/config.json',self.cfg);self.save('readiness/outbox/cleanup.json',{'temporarySudoRemoved':True})
  self.save('readiness/exclusion.json',{'active':None,'tickets':{'fixture':{'phase':'finished'}}})
 def save(self,p,v):
  target=self.root/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(v));target.chmod(0o600)
 def run_action(self,flags):
  with patch('sys.argv',['activation','--operator-approved',*flags]),contextlib.redirect_stdout(io.StringIO()) as out:self.a.main()
  return json.loads(out.getvalue())
 def test_activation_and_exact_hash_disable_preserve_all_other_values(self):
  result=self.run_action(['--custody-off-machine-confirmed']);current=self.a.read(self.root/'trusted/config.json')
  self.assertEqual(current,{**self.cfg,'deploymentEnabled':True});self.assertEqual(result['productionApplyCalls'],0)
  result=self.run_action(['--disable-expected-sha256',result['configSha256']]);self.assertEqual(self.a.read(self.root/'trusted/config.json'),self.cfg)
 def test_metadata_failure_rolls_back_only_boolean_under_lock(self):
  (self.base/'fail-export').touch()
  with self.assertRaises(OSError):self.run_action(['--custody-off-machine-confirmed'])
  self.assertEqual(self.a.read(self.root/'trusted/config.json'),self.cfg)
 def test_missing_custody_or_unfinished_ticket_refuses_activation(self):
  with self.assertRaises(ValueError):self.run_action([])
  self.save('readiness/exclusion.json',{'active':'pending','tickets':{'fixture':{'phase':'open'}}})
  with self.assertRaises(ValueError):self.run_action(['--custody-off-machine-confirmed'])
  self.assertEqual(self.a.read(self.root/'trusted/config.json'),self.cfg)
 def test_changed_program_or_config_refuses_activation(self):
  (self.code/'publication-executor.py').write_text(FAKE+'# changed')
  with self.assertRaises(ValueError):self.run_action(['--custody-off-machine-confirmed'])
  self.assertEqual(self.a.read(self.root/'trusted/config.json'),self.cfg)
if __name__=='__main__':unittest.main()
