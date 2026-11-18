#!/usr/bin/env python3
"""Resume the verified new Web after the incorrectly hosted public-read probe.
No migration, DB restore, content/config change, new image or old-Web downgrade.
"""
import fcntl,importlib.util,json,os,pathlib,pwd,shutil
ROOT=pathlib.Path('/opt/graph-knowledge')
SOURCE='2f2dbfaf28abb80d5cf0d1808d539fcc99dd9c29'
BACKUP=ROOT/'backups/theme-manual-20261118T125110Z'
WORKERS=['knowledge-review','knowledge-patrol','knowledge-publisher']
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-theme-manual-repair-20261118-')
 release=module('fixed_release',stage/'release-theme-manual-production.py')
 h=module('image_checks',stage/'production_image_verification.py');legacy=module('legacy',stage/'release-accepted-beta-production.py')
 m=json.loads((stage/'manifest.json').read_text());prev=m['previous'];assert m['sourceCommit']==SOURCE
 lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 class Runner(legacy.Release):
  def __init__(self):
   self.stage=stage;self.h=h;self.m=m
   self.dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
   self.pg=self.run(self.dc+['ps','-q','graph-member-postgres'])
 r=Runner();cfg=json.loads(r.run(r.dc+['config','--format','json']))
 assert json.loads((BACKUP/'manifest.json').read_text())==m
 anchor=ROOT/'backups/webb-locale-web-20261116T233125Z/compose.yaml'
 assert h.digest(anchor)==prev['composeAnchorSha256']
 prior=ROOT/'backups/theme-private-20261117T162943Z/compose.yaml'
 assert prior.read_text()==h.patch_image(anchor.read_text(),'web','plunode-web:webb-locale-5e9794ea')
 original=h.patch_image(prior.read_text(),'web',prev['web']['tag'])
 for service in ['member-ops','knowledge-ops',*WORKERS]:original=h.patch_image(original,service,prev['worker']['tag'])
 assert (BACKUP/'compose.yaml').read_text()==original
 assert (ROOT/'compose.yaml').read_text()==h.patch_image(original,'web',m['web']['tag'])
 for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha
 assert r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
 assert h.digest(stage/m['archive']['file'])==m['archive']['sha256']
 identities=h.archive_identities(stage/m['archive']['file'],m)
 image=json.loads(r.run(['docker','image','inspect',m['web']['tag']]))[0]
 h.verify_loaded_image(image,identities['web'],json.loads(r.run(['docker','info','--format','{{json .DriverStatus}}'])),SOURCE)
 assert r.run(['docker','run','--rm','--network','none','--entrypoint','cat',m['web']['tag'],'/app/.next-public/BUILD_ID'])==m['build']
 assert h.digest(BACKUP/'recovery.tar.enc')=='c0892b7fefb294a9fe8a3dfdc6328519cf1ff6d4b225e4b92c02018ace7c2c7a'
 assert h.digest(BACKUP/'recovery-key.enc')=='dc0fc66e58815b8c86ed86baeaffe6c666f2ebb6044487aca505eb5337187219'
 # The original activation reached its final HTTP check only after migration,
 # row/owner preservation and knowledge fingerprint verification succeeded.
 log=pathlib.Path('/root/plunode-theme-manual-20261118-2f2dbfaf/command-failure.json')
 f=json.loads(log.read_text());assert f['program']=='docker' and f['exit']==1
 h.emit('repair-preflight-ok',source=SOURCE,build=m['build'],memberLedgerCount=len(m['memberMigrations']),knowledgeLedgerCount=len(m['knowledgeMigrations']),databaseRestored=False)
 r.run(r.dc+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web',*WORKERS],timeout=300)
 # Preserve the restored services if a subsequent read-only acceptance check
 # fails. This fixed source already enforces the approved publication boundary.
 r.run(r.dc+['exec','-T','web','node','scripts/production-readiness.mjs'])
 probe=release.PUBLIC_PROBE
 r.run(r.dc+['exec','-T','web','node','-e',probe])
 assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
 assert r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
 for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha
 for service in WORKERS:
  cid=r.run(r.dc+['ps','-q',service]);v=json.loads(r.run(['docker','inspect',cid]))[0]
  assert v['State']['Running'] and v['Config']['Image']==prev['worker']['tag'] and v['Image'] in [prev['worker']['configId'],prev['worker']['manifestId']]
 result={'source':SOURCE,'build':m['build'],'backup':str(BACKUP),'memberLedgerCount':len(m['memberMigrations']),'knowledgeLedgerCount':len(m['knowledgeMigrations']),'servicesResumed':['web',*WORKERS],'workersRestartedWithSameImages':True,'settingsPreserved':True,'databaseRestored':False,'additionalMigrationsDuringRepair':[],'contentChangedDuringRepair':False,'formalAcceptancePending':True,'oldRowsAndOwnersPreservedAtCutover':True,'knowledgeUnchangedAtCutover':True,'encryptedBackupSha256':h.digest(BACKUP/'recovery.tar.enc'),'wrappedKeySha256':h.digest(BACKUP/'recovery-key.enc')}
 target=pathlib.Path(m['exportDirectory']);assert str(target).startswith('/home/develop/plunode-theme-manual-20261118/')
 for path in [BACKUP/'activated.json',stage/'activated.json',pathlib.Path('/root/plunode-theme-manual-20261118-2f2dbfaf/activated.json')]:h.private(path,json.dumps(result,indent=2))
 user=pwd.getpwnam('develop')
 for name in ['activated.json','capacity-report.json','recovery.tar.enc','recovery-key.enc']:
  dest=target/name;shutil.copy2(BACKUP/name,dest);dest.chmod(0o600);os.chown(dest,user.pw_uid,user.pw_gid)
 h.emit('services-restored',**result)
if __name__=='__main__':main()
