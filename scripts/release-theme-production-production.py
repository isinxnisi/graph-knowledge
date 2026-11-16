#!/usr/bin/env python3
"""Fixed-source production handoff release: additive 044, Web, no content import."""
import copy,datetime,fcntl,importlib.util,json,os,pathlib,pwd,shutil,subprocess
ROOT=pathlib.Path('/opt/graph-knowledge')
SOURCE='fa35377b65400d0d4111660454e94fdee028a09a'
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-theme-production-20261117-')
 h=module('image_checks',stage/'production_image_verification.py')
 legacy=module('legacy_release',stage/'release-accepted-beta-production.py')
 columns=module('columns',stage/'release-featured-themes-production.py')
 m=json.loads((stage/'manifest.json').read_text());prev=m['previous']
 assert m['sourceCommit']==SOURCE and m['additionalMigrations']==['044-theme-production.sql']
 class Release(legacy.Release):
  def __init__(self):
   self.stage=stage;self.h=h;self.f=columns;self.m=m;self.audit={}
   self.lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   self.dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
   self.config=json.loads(self.run(self.dc+['config','--format','json']));self.pg=self.run(self.dc+['ps','-q','graph-member-postgres']);self.h.run=self.run
  def preflight(self):
   prior=pathlib.Path(prev['composeDerivation']['backup'])
   assert prior==ROOT/'backups/theme-image-web-20261116T140807Z/compose.yaml'
   assert h.digest(prior)==prev['composeDerivation']['backupSha256']
   assert (ROOT/'compose.yaml').read_text()==h.patch_image(prior.read_text(),'web',prev['web']['tag']),'Unexpected Compose drift'
   for name,sha in prev['files'].items():
    if name!='compose.yaml':assert h.digest(ROOT/name)==sha,'Private configuration drift: '+name
   assert self.ledgers()==[m['previousMemberMigrations'],m['knowledgeMigrations']]
   assert self.run(self.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==prev['build']
   c=json.loads(self.run(self.dc+['config','--format','json']));assert c==self.config
   assert c['services']['web']['environment']['MEMBER_ORIGIN']=='https://plunode.net'
   assert c['services']['web']['environment']['KNOWLEDGE_RUNTIME']=='production'
   assert all(c['services']['web']['environment'].get(k)!='1' for k in ['PLUNODE_WINDOWS_HTTPS_TRANSPORT','PLUNODE_WINDOWS_GOOGLE_AUTH_TRANSPORT','PLUNODE_WINDOWS_GEMINI_TRANSPORT'])
   self.ids={s:self.run(self.dc+['ps','-q',s]) for s in ['web',*legacy.WORKERS,'graph-member-postgres','graph-neo4j']}
   for s,cid in self.ids.items():
    v=json.loads(self.run(['docker','inspect',cid]))[0];assert v['State']['Running'],s
    if s=='web':assert v['Image'] in [prev['web']['configId'],prev['web']['manifestId']] and v['Config']['Image']==prev['web']['tag']
   assert shutil.disk_usage(ROOT).free>6*1024**3
   self.audit={'memberMigrations':m['previousMemberMigrations'],'aiArtifactSha256':prev['aiArtifactSha256']}
  def migrate(self,network=None,envfile=None,compose=None):
   if network:
    args=['docker','run','--rm','--network',network,'--memory','384m','--env-file',str(envfile),'--entrypoint','node',m['memberOps']['tag'],'--import','tsx']
   else:
    candidate=ROOT/'compose.theme-production-candidate.yaml'
    cdc=[str(candidate) if a==str(ROOT/'compose.yaml') else a for a in self.dc]
    args=cdc+['run','--rm','--no-deps','--entrypoint','node','-e','NODE_OPTIONS=--max-old-space-size=256','member-ops','--import','tsx']
   self.run(args+['scripts/member-migrate.ts','--theme-production','--confirm-origin','https://plunode.net'])
  def rehearsal(self, folder, tables, before):
      network = 'plunode-beta-release-restore-'+legacy.secrets.token_hex(5)
      container = network+'-pg'
      created = False
      self.run(['docker', 'network', 'create', '--internal', network])
      try:
          self.run(['docker', 'run', '-d', '--name', container, '--network', network, '--network-alias', 'graph-member-postgres', '--memory', '384m', '--tmpfs', '/var/lib/postgresql/data:rw,size=805306368', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=restore_admin', '-e', 'POSTGRES_DB=postgres', self.config['services']['graph-member-postgres']['image']])
          created = True
          for _ in range(80):
              if subprocess.run(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'restore_admin'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                  break
              legacy.time.sleep(.25)
          else:
              raise RuntimeError('Isolated restore database not ready')
          sql = lambda query, database='graph_member': self.sql(query, database, container)
          existing = set(json.loads(sql('SELECT json_agg(rolname) FROM pg_roles', 'postgres')))
          roles = json.loads(self.sql("SELECT json_agg(rolname) FROM pg_roles WHERE rolname !~ '^pg_'", 'postgres'))
          for role in roles:
              if role not in existing:
                  sql('CREATE ROLE '+legacy.ident(role)+' NOLOGIN', 'postgres')
          sql('ALTER ROLE gk_member LOGIN', 'postgres')
          sql('CREATE DATABASE graph_member OWNER gk_member', 'postgres')
          with (folder/'member.dump').open('rb') as stream:
              result = subprocess.run(['docker', 'exec', '-i', container, 'pg_restore', '-h', '127.0.0.1', '-U', 'restore_admin', '-d', 'graph_member', '--exit-on-error'], stdin=stream, capture_output=True, timeout=300)
          assert result.returncode == 0, 'Isolated restore failed'
          assert self.f.columns(sql) == tables and legacy.fingerprints(sql, tables) == before
          envfile = folder/'isolated.env'
          self.h.private(envfile, '\n'.join(['GRAPH_DEPLOYMENT=production', 'MEMBER_STORAGE_ENABLED=1', 'MEMBER_ORIGIN=https://plunode.net', 'MEMBER_DATABASE_URL=postgresql://gk_member:isolated-rehearsal-only@graph-member-postgres:5432/graph_member', 'MEMBER_AUTH_SECRET='+legacy.secrets.token_hex(32), 'MEMBER_AUTH_PROVIDER=google', 'MEMBER_COOKIE_PREFIX=gk-member-production', 'MEMBER_GOOGLE_CLIENT_ID=isolated-rehearsal', 'MEMBER_GOOGLE_CLIENT_SECRET=isolated-rehearsal', 'NODE_OPTIONS=--max-old-space-size=256'])+'\n')
          try:
              self.migrate(network, envfile)
              assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration')) == self.m['memberMigrations']
              legacy.assert_old_columns(sql, tables, self.f.columns)
              assert legacy.fingerprints(sql, tables, self.audit['memberMigrations']) == before
              after_tables = self.f.columns(sql)
              after = legacy.fingerprints(sql, after_tables)
              self.migrate(network, envfile)
              assert legacy.fingerprints(sql, after_tables) == after
              assert sql('SELECT count(*) FROM theme_production.cases') == '0'
          finally:
              envfile.unlink(missing_ok=True)
          return {'oldTables': len(tables), 'tables': len(after_tables), 'ledgerCount': len(self.m['memberMigrations']), 'oldRowsAndOwnersPreserved': True, 'repeatedUnchanged': True, 'qualityGuideSeeded': False}
      finally:
          if created:
              self.run(['docker', 'rm', '-f', container])
          self.run(['docker', 'network', 'rm', network])

  def directory(self):
   folder=ROOT/'backups'/('theme-production-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));folder.mkdir(mode=0o700)
   for name in ['compose.yaml','app.env','knowledge.env']:
    shutil.copy2(ROOT/name,folder/name);(folder/name).chmod(0o600)
   for name in ['knowledge-runtime','knowledge-state']:
    if (ROOT/name).is_dir():shutil.copytree(ROOT/name,folder/name)
   shutil.copy2(stage/'manifest.json',folder/'manifest.json');return folder
  def export(self,folder,result):
   for p in [folder/'activated.json',stage/'activated.json']:h.private(p,json.dumps(result,indent=2))
   target=pathlib.Path(m['exportDirectory']);assert str(target).startswith('/home/develop/plunode-theme-production-20261117/')
   owner=pwd.getpwnam('develop')
   for name in ['activated.json','recovery.tar.enc','recovery-key.enc']:
    dst=target/name;shutil.copy2(folder/name,dst);dst.chmod(0o600);os.chown(dst,owner.pw_uid,owner.pw_gid)
 r=Release()
 if (stage/'activated.json').exists():
  result=json.loads((stage/'activated.json').read_text());assert result['source']==SOURCE
  assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  assert r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
  h.emit('already-activated',**result);return
 r.preflight();r.images(load=True)
 original=(ROOT/'compose.yaml').read_text();candidate=h.patch_image(original,'web',m['web']['tag'])
 # One-shot migration uses the new ops image. Resident ops/Worker image pins stay intact.
 migration_candidate=h.patch_image(candidate,'member-ops',m['memberOps']['tag'])
 path=ROOT/'compose.theme-production-candidate.yaml';h.private(path,migration_candidate)
 cdc=[str(path) if a==str(ROOT/'compose.yaml') else a for a in r.dc]
 expected=copy.deepcopy(r.config);expected['services']['web']['image']=m['web']['tag'];expected['services']['member-ops']['image']=m['memberOps']['tag']
 assert json.loads(r.run(cdc+['config','--format','json']))==expected
 folder=r.directory();tables,before=r.consistent_member_backup(folder)
 result=r.rehearsal(folder,tables,before);h.emit('isolated-migration-ok',**result)
 # Recheck exact predecessor immediately before stopping writers.
 r.preflight();stopped=False;migration_started=False;activated=False
 try:
  h.emit('preflight-ok',source=SOURCE,build=m['build'],backup=str(folder),additionalMigrations=m['additionalMigrations'])
  r.run(r.dc+['stop','-t','60','web',*legacy.WORKERS],timeout=150);stopped=True
  if (folder/'knowledge-state').exists():shutil.rmtree(folder/'knowledge-state')
  if (ROOT/'knowledge-state').exists():shutil.copytree(ROOT/'knowledge-state',folder/'knowledge-state')
  tables=r.f.columns(r.sql);before=legacy.fingerprints(r.sql,tables)
  ktables=r.f.columns(lambda q:r.sql(q,'plunode_knowledge75_production'))
  kbefore=legacy.fingerprints(lambda q:r.sql(q,'plunode_knowledge75_production'),[{**t,'columns':['ctid','xmin']}for t in ktables])
  r.dump(folder,'graph_member','member.dump');r.dump(folder,'plunode_knowledge75_production','knowledge.dump')
  h.private(folder/'preservation.json',json.dumps({'memberTables':tables,'memberRows':before,'knowledgeRows':kbefore}))
  with (folder/'previous-images.tar').open('wb') as f:r.run(['docker','save',prev['web']['tag']],output=f,timeout=600)
  encrypted=r.encrypt(folder);h.emit('final-backup-ok',backup=str(folder),**encrypted)
  migration_started=True;r.migrate()
  assert r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
  legacy.assert_old_columns(r.sql,tables,r.f.columns)
  assert legacy.fingerprints(r.sql,tables,m['previousMemberMigrations'])==before,'Existing member rows changed'
  assert legacy.fingerprints(lambda q:r.sql(q,'plunode_knowledge75_production'),[{**t,'columns':['ctid','xmin']}for t in ktables])==kbefore
  assert r.sql('SELECT count(*) FROM theme_production.cases')=='0'
  h.atomic(ROOT/'compose.yaml',candidate)
  r.run(r.dc+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web'],timeout=240)
  r.run(r.dc+['start',*legacy.WORKERS]);r.run(r.dc+['exec','-T','web','node','scripts/production-readiness.mjs'])
  assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  expected['services']['member-ops']['image']=r.config['services']['member-ops']['image']
  assert json.loads(r.run(r.dc+['config','--format','json']))==expected
  for s,cid in r.ids.items():
   if s!='web':assert r.run(r.dc+['ps','-q',s])==cid,'Unrelated container changed: '+s
  for name,sha in prev['files'].items():
   if name!='compose.yaml':assert h.digest(ROOT/name)==sha
  activated=True
  result={**result,**encrypted,'source':SOURCE,'build':m['build'],'backup':str(folder),'memberLedgerCount':45,'knowledgeLedgerCount':len(m['knowledgeMigrations']),'updatedServices':['web'],'oneShotMigrationImage':m['memberOps']['tag'],'workersUnchanged':True,'settingsPreserved':True,'existingRowsAndOwnersPreservedAtCutover':True,'knowledgeUnchangedAtCutover':True,'betaDataImported':False,'caseDataCreated':False,'qualityGuideChanged':False,'formalApiAcceptancePending':True}
  r.export(folder,result);h.emit('activated',**result)
 except BaseException:
  # No automatic DB restore or unguarded old Web downgrade after new case storage.
  if stopped and not migration_started:r.run(r.dc+['start','web',*legacy.WORKERS])
  elif stopped and not activated:r.run(r.dc+['stop','-t','30','web'],timeout=90);r.run(r.dc+['start',*legacy.WORKERS])
  h.emit('repair-required',backup=str(folder),migrationStarted=migration_started,oldDumpRestored=False,automaticOldWebDowngrade=False);raise
if __name__=='__main__':main()
