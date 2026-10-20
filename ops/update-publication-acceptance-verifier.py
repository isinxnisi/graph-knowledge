#!/usr/bin/python3 -I
"""One approved fixture-only verifier update. Keeps the consumed nonce, artifact, data and production trust."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

ROOT=Path('/var/lib/plunode-publication/test')
CODE=Path('/usr/local/lib/plunode-publication')
ENTRY=Path('/usr/local/sbin/plunode-publication-acceptance')
NONCE='590c3111-d65a-43f8-989e-44d901702e46'
ARTIFACT='956baabdff9db46e4d609d0009162047306c019548bf78a77e1de79490b9ad4c'
OLD='7cf9a5f0d53a2751fc9e9a6ba4e8897acba20c753c76fb81ef787aa06bb07642'
NEW='37030d0c91640f1841f6b618f0cafef4ab731dbb0a0da73a91efaffe407603d4'

def require(value,reason):
 if not value:raise ValueError(reason)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_bytes())
def trusted(path,directory=False):
 st=path.lstat();require(not path.is_symlink() and st.st_uid==0 and not st.st_mode&0o022
  and (stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode) and st.st_nlink==1),'Untrusted fixture update path')
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def main():
 require(os.geteuid()==0 and len(sys.argv)==1,'Fixed root fixture staging only');os.umask(0o077)
 stage=Path(__file__).resolve().parent
 for parent in [stage,*stage.parents,CODE,*CODE.parents,ROOT,ROOT/'trusted']:trusted(parent,True)
 trusted(stage/'candidate-entry.py');require(sha(stage/'candidate-entry.py')==NEW,'Fixture code differs')
 manifest=read(stage/'program-manifest.json');require(manifest==read(ROOT/'trusted/program-manifest.json'),'Reviewed core manifest differs')
 for name,checksum in manifest['files'].items():
  if name in ['scripts/publication-attest.py','scripts/publication-coordination.py']:continue
  target=Path('/usr/local/sbin/plunode-publication') if name=='ops/plunode-publication' else CODE/Path(name).name
  trusted(target);require(sha(target)==checksum,'Production core differs')
 e=load('fixed_fixture_update_executor',CODE/'publication-executor.py')
 with e.locked(ROOT/'operation.lock'):
  production=ROOT.parent
  require(read(production/'trusted/config.json')['deploymentEnabled'] is False,'Production must stay disabled')
  protected=[production/'trusted'/name for name in ['config.json','installation.json','public-kg.env','approver.pem','attester.pem','exclusion.pem']]
  protected+=[ROOT/'inbox'/NONCE/'approval.json',*[ROOT/'trusted'/name for name in ['config.json','approver.pem','attester.pem','exclusion.pem']],ROOT/'reservations.json',ROOT/'jobs/apply-calls.json',ROOT/'jobs'/(NONCE+'.json'),ROOT/'jobs'/(NONCE+'-backup.json')]
  frozen=ROOT/'frozen'/NONCE;protected+=sorted(p for p in frozen.rglob('*') if p.is_file())
  before={str(p):sha(p) for p in protected}
  request=e.cycle.verify_prepared_artifact(frozen);require(request['artifactSha256']==ARTIFACT,'Frozen fixture binding differs')
  reservation=read(ROOT/'reservations.json');require(set(reservation['nonces'])=={NONCE}
   and reservation['releases']=={'isolated-publication-next':NONCE}
   and reservation['nonces'][NONCE]['artifactSha256']==ARTIFACT,'Consumed fixture identity differs')
  state=read(ROOT/'jobs'/(NONCE+'.json'));require(state['phase']=='applying'
   and all(state['request'][key]==value for key,value in request.items() if key!='planSha256')
   and state['request']['planSha256']==e.digest(e.plan_projection(read(frozen/'offline-plan.json'))),'Unexpected fixture recovery state')
  calls=read(ROOT/'jobs/apply-calls.json');require(len(calls)==1 and calls[0]['nonce']==NONCE,'Private apply count differs')
  new=load('fixed_fixture_update_candidate',stage/'candidate-entry.py')
  ledger=new.legacy_fixture_ledger(read(frozen/'ledger.json'),read(frozen/'release/data.json'),
   read(ROOT/'jobs'/(NONCE+'-backup.json'))['payload'],request,NONCE)
  require({f:len(ids) for f,ids in ledger['pending'].items()}=={'entities':1,'claims':1,'sources':1,'citations':1},'Fixture coverage differs')
  trusted(ENTRY);require(sha(ENTRY)==OLD,'Temporary wrapper already changed; preserve it')
  backup=ROOT/'trusted'/('verifier-before-'+OLD[:12]+'.py')
  fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb') as stream:stream.write(ENTRY.read_bytes());stream.flush();os.fsync(stream.fileno())
  directory=os.open(backup.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(directory)
  finally:os.close(directory)
  fd,name=tempfile.mkstemp(prefix='.p33-fixture-verifier-',dir=ENTRY.parent)
  try:
   with os.fdopen(fd,'wb') as stream:stream.write((stage/'candidate-entry.py').read_bytes());stream.flush();os.fchmod(stream.fileno(),0o755);os.fsync(stream.fileno())
   os.replace(name,ENTRY)
   directory=os.open(ENTRY.parent,os.O_RDONLY|os.O_DIRECTORY)
   try:os.fsync(directory)
   finally:os.close(directory)
  finally:
   if os.path.exists(name):os.unlink(name)
  require(all(sha(Path(path))==checksum for path,checksum in before.items()),'Protected bytes changed; inspect preserved state')
  result={'testOnly':True,'phase':'private-fixture-verifier-updated','nonce':NONCE,'artifactSha256':ARTIFACT,
   'oldWrapperSha256':OLD,'newWrapperSha256':NEW,'frozenAndJournalBytesUnchanged':True,'privateApplyCalls':1,'productionEnabled':False,'productionApplyCalls':0}
  out=ROOT/'outbox/fixture-verifier-update.json';e.durable(out,result);out.chmod(0o644)
  print('旧試験verifier保全先: '+str(backup),flush=True);print(json.dumps(result),flush=True)

if __name__=='__main__':
 try:main()
 except Exception as error:
  print(json.dumps({'error':'private-fixture-verifier-update-stopped','reason':str(error)[:200],
   'productionEnabled':False,'productionApplyCalls':0}),flush=True);sys.exit(1)
