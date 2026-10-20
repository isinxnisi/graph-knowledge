#!/usr/bin/python3 -I
"""One-time approved test-only recovery after P33 v2. Preserve the failed seed; never reinstall production."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import uuid
from urllib.request import urlopen

ROOT=Path('/var/lib/plunode-publication/test')
CODE=Path('/usr/local/lib/plunode-publication')
ENTRY=Path('/usr/local/sbin/plunode-publication-acceptance')
PARSER=CODE/'publication-acceptance-ssh.py'
NETWORK='plunode-publication-acceptance-20261021'
OLD_PROGRAMS={ENTRY:'7bf09d4e6b5f1b8e5f5d9db9a59dbc14c82497468c0c230996fb8a269a777b78',
 PARSER:'1ed5368acb9683ddebd87cd7e5ac20bee433d22ab094004b23d7911786309a98'}
OLD_BACKUP='1a239fffc0d083992c66fe679c08f71228696e3d67983c6104237df2dbbb6ac4'
REVISION='88437056-b74f-42ab-88c0-33ed435bdccc'


def require(value,reason):
 if not value:raise ValueError(reason)


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_bytes())


def empty_attempt(root):
 """A partial fixture is never recoverable by resetting publication state."""
 for name in ['reservations.json','exclusion.json','trusted/resources.json','outbox/setup.json']:
  require(not (root/name).exists() and not (root/name).is_symlink(),'Existing test journal or completed setup; preserve it')
 for name in ['jobs','frozen','inbox']:
  path=root/name
  require(path.is_dir() and not path.is_symlink() and not list(path.iterdir()),'Existing test work; preserve it')


def trusted(path,owner=0):
 st=path.lstat()
 require(not path.is_symlink() and st.st_uid==owner and not st.st_mode&0o022
  and (not stat.S_ISREG(st.st_mode) or st.st_nlink==1),'Untrusted recovery file')
 return st


def docker(*args):
 result=subprocess.run(['/usr/bin/docker',*args],capture_output=True,text=True,timeout=30,
  env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','HOME':'/root'})
 require(result.returncode==0,'Test recovery inspection failed: '+args[0]);return result.stdout


def main():
 require(os.geteuid()==0 and len(sys.argv)==1,'Fixed root staging required');os.umask(0o077)
 stage=Path(__file__).resolve().parent
 for parent in [stage,*stage.parents]:trusted(parent)
 package=read(stage/'PACKAGE.json')
 for name,checksum in package['files'].items():
  target=stage/name;require(not Path(name).is_absolute() and '..' not in Path(name).parts,'Unsafe recovery package')
  trusted(target);require(sha(target)==checksum,'Recovery package differs')
 lock=Path('/run/lock/plunode-publication-test-setup.lock')
 fd=os.open(lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 require(os.fstat(fd).st_uid==0 and os.fstat(fd).st_nlink==1 and not os.fstat(fd).st_mode&0o022,'Untrusted test setup lock')
 try:
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  production=ROOT.parent
  trusted(production);trusted(production/'trusted')
  config=read(production/'trusted/config.json');audit=read(production/'trusted/installation.json')
  require(config['deploymentEnabled'] is False and audit['phase']=='installed-disabled'
   and audit['sourceCommit']=='72338b7054b3f2eb2e9762b20859044f9b9e28ce'
   and audit['observedRevision']==REVISION,'Disabled reviewed production installation required')
  for name in ['reservations.json','exclusion.json']:
   require(not (production/name).exists(),'Production coordination exists; preserve it')
  original={name:sha(production/'trusted'/name) for name in ['config.json','installation.json','public-kg.env','approver.pem','attester.pem','exclusion.pem']}
  with urlopen('http://127.0.0.1:3200/api/dataset',timeout=15) as response:before=json.load(response)
  require(before=={'dataset':'public-kg','revision':REVISION},'Production revision differs')
  trusted(ROOT);trusted(ROOT/'trusted');empty_attempt(ROOT)
  require(not Path('/etc/sudoers.d/plunode-publication-acceptance').exists(),'Temporary sudo already enabled')
  keys=read(stage/'test-public-keys.json');old_config=read(ROOT/'trusted/config.json')
  for role in ['approver','attester']:
   expected=hashlib.sha256(keys[role].encode()).hexdigest()
   require(sha(ROOT/'trusted'/(role+'.pem'))==expected==old_config[role+'KeySha256'],'Previous test key differs')
  require(old_config['network']==NETWORK and old_config['workerId']=='isolated-worker'
   and old_config['workerCodeCommit']=='a'*40 and old_config['operatorDigest']==config['operatorDigest'],'Previous test target differs')
  key=keys['ssh'].split()[1]
  require(key not in Path('/var/lib/plunode-publish-home/.ssh/authorized_keys').read_text(),'Test SSH key already active')
  require(sha(ROOT/'export/base-backup.json')==OLD_BACKUP,'Previous test backup differs')
  require(read(ROOT/'export/base-backup.json')['payload']['fixture']==read(stage/'seed/data.json'),'Previous synthetic seed differs')
  allowed={'trusted/approver.pem','trusted/attester.pem','trusted/exclusion-private.pem','trusted/exclusion.pem',
   'trusted/config.json','trusted/public-kg.env','trusted/neo4j.env','trusted/web.env','trusted/program-manifest.json',
   'outbox/exclusion.pem','export/base-backup.json'}
  files={str(f.relative_to(ROOT)) for f in ROOT.rglob('*') if not f.is_dir()}
  require(files==allowed and not any(f.is_symlink() for f in ROOT.rglob('*')),'Unexpected previous test files; preserve them')
  manifest=read(stage/'program-manifest.json')
  require(read(ROOT/'trusted/program-manifest.json')==manifest,'Previous core manifest differs')
  for name,checksum in manifest['files'].items():
   if name in ['scripts/publication-attest.py','scripts/publication-coordination.py']:continue
   target=Path('/usr/local/sbin/plunode-publication') if name=='ops/plunode-publication' else CODE/Path(name).name
   trusted(target);require(sha(target)==checksum,'Installed production code differs')
  for target,checksum in OLD_PROGRAMS.items():trusted(target);require(sha(target)==checksum,'Previous temporary program differs')
  names=docker('ps','-a','--format','{{.Names}}').splitlines()
  require(not {NETWORK+'-db',NETWORK+'-web'}.intersection(names),'Old test container exists; preserve it')
  require(not docker('ps','-aq','--filter','label=plunode.publication-test=P33-20261021').strip(),'Old labelled test process exists; preserve it')
  require(NETWORK not in docker('network','ls','--format','{{.Name}}').splitlines(),'Old test network exists; preserve it')
  spec=importlib.util.spec_from_file_location('fixed_test_preparer',stage/'provision-publication-acceptance.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  archives=production/'test-attempts'
  if not archives.exists():archives.mkdir(mode=0o700)
  trusted(archives);require(stat.S_IMODE(archives.stat().st_mode)==0o700,'Private archive mode required')
  archive=archives/str(uuid.uuid4());archive.mkdir(mode=0o700)
  module.write(archive/'provenance.json',json.dumps({'scope':'P33-approved-test-only-recovery','oldBackupSha256':OLD_BACKUP,
   'files':{name:sha(ROOT/name) for name in sorted(files)},'productionEnabled':False},indent=2)+'\n')
  print('旧試験保全先: '+str(archive),flush=True)
  os.rename(ROOT,archive/'test')
  os.rename(ENTRY,archive/'publication-acceptance-entry.py')
  os.rename(PARSER,archive/'publication-acceptance-ssh.py')
  try:module.main()
  except Exception as error:
   report=module.record_failure(error)
   print(json.dumps({'error':'private-test-recovery-setup-stopped','failureReport':report,'previousAttemptPreserved':True,
    'productionEnabled':False,'productionApplyCalls':0}),flush=True)
   raise
  require(all(sha(production/'trusted'/name)==checksum for name,checksum in original.items()),'Production trust changed')
 finally:os.close(fd)

if __name__=='__main__':
 try:main()
 except Exception as error:
  print(json.dumps({'error':'private-test-recovery-stopped','reason':str(error)[:200],
   'productionEnabled':False,'productionApplyCalls':0}),flush=True);sys.exit(1)
