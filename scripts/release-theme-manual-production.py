#!/usr/bin/env python3
"""Scoped member046 + Web update; keep privacy-aware Worker images and all content.
No cleanup, knowledge migration, guide/schedule/OS change or old-Web downgrade.
"""
import copy,datetime,fcntl,hashlib,importlib.util,json,os,pathlib,pwd,re,shutil,subprocess,time
ROOT=pathlib.Path('/opt/graph-knowledge')
SOURCE='2f2dbfaf28abb80d5cf0d1808d539fcc99dd9c29'
WORKERS=['knowledge-review','knowledge-patrol','knowledge-publisher']
DATABASES=['graph_member','plunode_knowledge75_production']
MIGRATION='046-theme-production-workflows.sql'
PUBLIC_PROBE="const http=require('node:http');const request=http.get('http://127.0.0.1:3000/api/knowledge/public?mode=themes',{headers:{host:'plunode.net'}},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('end',()=>{try{if(response.statusCode!==200)throw Error('Catalogue readiness failed: '+response.statusCode);JSON.parse(text)}catch(e){console.error(e.message);process.exitCode=1}});response.on('error',e=>{console.error(e.message);process.exitCode=1})});request.setTimeout(15000,()=>request.destroy(Error('Catalogue readiness timed out')));request.on('error',e=>{console.error(e.message);process.exitCode=1});"
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-theme-manual-20261118-')
 h=module('image_checks',stage/'production_image_verification.py')
 legacy=module('legacy_release',stage/'release-accepted-beta-production.py')
 columns=module('columns',stage/'release-featured-themes-production.py')
 auditor=module('capacity',stage/'database-capacity-report.py')
 m=json.loads((stage/'manifest.json').read_text());prev=m['previous']
 assert m['sourceCommit']==SOURCE and set(m['additions'])=={MIGRATION}
 assert m['knowledgeMigrations']==prev['knowledgeMigrations']
 assert set(m['memberMigrations'])==set(prev['memberMigrations'])|{MIGRATION}
 assert all(m['memberMigrations'][k]==v for k,v in prev['memberMigrations'].items())
 class Release(legacy.Release):
  def __init__(self):
   self.stage=stage;self.h=h;self.f=columns;self.m=m
   self.audit={'aiArtifactSha256':prev['aiArtifactSha256']}
   self.lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   self.dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
   self.config=json.loads(self.run(self.dc+['config','--format','json']));self.pg=self.run(self.dc+['ps','-q','graph-member-postgres'])
  def preflight(self):
   anchor=ROOT/'backups/webb-locale-web-20261116T233125Z/compose.yaml'
   assert h.digest(anchor)==prev['composeAnchorSha256']
   prior=ROOT/'backups/theme-private-20261117T162943Z/compose.yaml'
   assert prior.read_text()==h.patch_image(anchor.read_text(),'web','plunode-web:webb-locale-5e9794ea')
   verified=h.patch_image(prior.read_text(),'web',prev['web']['tag'])
   for s in ['member-ops','knowledge-ops',*WORKERS]:verified=h.patch_image(verified,s,prev['worker']['tag'])
   assert (ROOT/'compose.yaml').read_text()==verified,'Unexpected Compose drift'
   for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha,'Private setting drift: '+name
   assert self.config==json.loads(self.run(self.dc+['config','--format','json']))
   assert self.ledgers()==[prev['memberMigrations'],prev['knowledgeMigrations']]
   assert self.run(self.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==prev['build']
   self.ids={s:self.run(self.dc+['ps','-q',s]) for s in ['web',*WORKERS,'graph-member-postgres','graph-neo4j']}
   for s,cid in self.ids.items():
    v=json.loads(self.run(['docker','inspect',cid]))[0];assert v['State']['Running'],s
    if s in ['web',*WORKERS]:
     expected=prev['web'] if s=='web' else prev['worker']
     assert v['Image'] in [expected['configId'],expected['manifestId']] and v['Config']['Image']==expected['tag'],'Running image drift: '+s
   assert self.config['services']['web']['environment']['MEMBER_ORIGIN']=='https://plunode.net'
   assert shutil.disk_usage(ROOT).free>6*1024**3
   # Validate the exact public-host probe on the current healthy Web BEFORE stopping writers.
   self.run(self.dc+['exec','-T','web','node','-e',PUBLIC_PROBE])
  def images(self,load):
   archive=stage/m['archive']['file'];assert h.digest(archive)==m['archive']['sha256']
   identity=h.archive_identities(archive,m)['web']
   if load:self.run(['docker','load','--input',str(archive)],timeout=600)
   image=json.loads(self.run(['docker','image','inspect',m['web']['tag']]))[0]
   h.verify_loaded_image(image,identity,json.loads(self.run(['docker','info','--format','{{json .DriverStatus}}'])),SOURCE)
   assert self.run(['docker','run','--rm','--network','none','--entrypoint','cat',m['web']['tag'],'/app/.next-public/BUILD_ID'])==m['build']
   assert self.run(['docker','run','--rm','--network','none','--entrypoint','sha256sum',m['web']['tag'],'/app/data/ai-lab/initial.json']).split()[0]==prev['aiArtifactSha256']
  def migrate(self,pg=None):
   sql=lambda q:self.sql(q,'graph_member',pg);payload=(stage/MIGRATION).read_text();checksum=m['additions'][MIGRATION]
   assert hashlib.sha256(payload.encode()).hexdigest()==checksum
   old=sql("SELECT checksum FROM member_migration WHERE name='"+MIGRATION+"'")
   if old:assert old==checksum;return
   owner=sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='member_migration'::regclass")
   assert re.fullmatch(r'[a-zA-Z0-9_-]+',owner)
   sql('BEGIN;SET LOCAL lock_timeout=\'10s\';SELECT pg_advisory_xact_lock(71900261);SET LOCAL ROLE '+legacy.ident(owner)+';'+payload+"\nINSERT INTO member_migration(name,checksum) VALUES('"+MIGRATION+"','"+checksum+"');COMMIT")
  def preserved(self,sql,tables,before):
   legacy.assert_old_columns(sql,tables,columns.columns)
   assert legacy.fingerprints(sql,tables,prev['memberMigrations'])==before,'Existing member rows or owners changed'
   assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration'))==m['memberMigrations']
   assert sql("SELECT count(*) FROM theme_production.cases WHERE workflow<>'scheduled'")=='0','Existing cases changed workflow'
  def rehearsal(self,folder,tables,before):
   name='plunode-manual-rehearsal-'+legacy.secrets.token_hex(5);created=False
   self.run(['docker','network','create','--internal',name])
   try:
    self.run(['docker','run','-d','--name',name,'--network',name,'--memory','384m','--tmpfs','/var/lib/postgresql/data:rw,size=805306368','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=restore_admin','-e','POSTGRES_DB=postgres',self.config['services']['graph-member-postgres']['image']]);created=True
    for _ in range(120):
     if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','restore_admin'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
     time.sleep(.25)
    else:raise RuntimeError('Restore database not ready')
    sql=lambda q,db='graph_member':self.sql(q,db,name)
    roles=json.loads(self.sql("SELECT json_agg(rolname) FROM pg_roles WHERE rolname !~ '^pg_'",'postgres'));existing=set(json.loads(sql('SELECT json_agg(rolname) FROM pg_roles','postgres')))
    for role in roles:
     if role not in existing:sql('CREATE ROLE '+legacy.ident(role)+' NOLOGIN','postgres')
    owner=self.sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='graph_member'",'postgres')
    sql('CREATE DATABASE graph_member OWNER '+legacy.ident(owner),'postgres')
    with (folder/'member.dump').open('rb') as stream:
     p=subprocess.run(['docker','exec','-i',name,'pg_restore','-h','127.0.0.1','-U','restore_admin','-d','graph_member','--exit-on-error'],stdin=stream,capture_output=True,timeout=300)
    assert p.returncode==0,'Isolated restore failed'
    assert columns.columns(sql)==tables and legacy.fingerprints(sql,tables)==before
    self.migrate(name);self.preserved(sql,tables,before)
    after=legacy.fingerprints(sql,columns.columns(sql));self.migrate(name)
    assert legacy.fingerprints(sql,columns.columns(sql))==after,'Migration replay changed data'
    return {'memberBackupRestored':True,'oldRowsAndOwnersPreserved':True,'repeatedUnchanged':True,'existingCasesRemainScheduled':True}
   finally:
    if created:self.run(['docker','rm','-f',name])
    self.run(['docker','network','rm',name])
  def directory(self):
   folder=ROOT/'backups'/('theme-manual-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));folder.mkdir(mode=0o700)
   for name in ['compose.yaml','app.env','knowledge.env']:shutil.copy2(ROOT/name,folder/name);(folder/name).chmod(0o600)
   for name in ['knowledge-runtime','knowledge-state']:
    if (ROOT/name).is_dir():shutil.copytree(ROOT/name,folder/name)
   shutil.copy2(stage/'manifest.json',folder/'manifest.json');return folder
  def export_file(self,folder,name):
   target=pathlib.Path(m['exportDirectory']);assert str(target).startswith('/home/develop/plunode-theme-manual-20261118/')
   dst=target/name;shutil.copy2(folder/name,dst);dst.chmod(0o600);user=pwd.getpwnam('develop');os.chown(dst,user.pw_uid,user.pw_gid)
  def export(self,folder,result):
   for path in [folder/'activated.json',stage/'activated.json']:h.private(path,json.dumps(result,indent=2))
   for name in ['activated.json','capacity-report.json','recovery.tar.enc','recovery-key.enc']:self.export_file(folder,name)
 r=Release()
 if (stage/'activated.json').is_file():
  result=json.loads((stage/'activated.json').read_text());assert result['source']==SOURCE and r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
  assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build'];h.emit('already-activated',**result);return
 r.preflight();r.images(True)
 original=(ROOT/'compose.yaml').read_text();candidate=h.patch_image(original,'web',m['web']['tag']);expected=copy.deepcopy(r.config);expected['services']['web']['image']=m['web']['tag']
 path=ROOT/'compose.theme-manual-candidate.yaml';h.private(path,candidate);cdc=[str(path) if x==str(ROOT/'compose.yaml') else x for x in r.dc]
 assert json.loads(r.run(cdc+['config','--format','json']))==expected,'Change exceeds Web image pin'
 folder=r.directory()
 capacity={db:auditor.report(lambda q,db=db:r.sql(q,db)) for db in DATABASES}
 capacity['disk']={'total':shutil.disk_usage(ROOT).total,'used':shutil.disk_usage(ROOT).used,'free':shutil.disk_usage(ROOT).free}
 capacity['walBytes']=r.sql('SELECT coalesce(sum(size),0) FROM pg_ls_waldir()','postgres')
 capacity['backupDirectory']=r.run(['du','-sb',str(ROOT/'backups')]).split()[0]
 h.private(folder/'capacity-report.json',json.dumps(capacity,indent=2));r.export_file(folder,'capacity-report.json')
 tables,before=r.consistent_member_backup(folder);rehearsal=r.rehearsal(folder,tables,before);h.emit('isolated-migration-ok',**rehearsal)
 r.preflight();stopped=False;migration_started=False;activated=False
 try:
  h.emit('preflight-ok',source=SOURCE,build=m['build'],backup=str(folder),additionalMigrations=[MIGRATION])
  r.run(r.dc+['stop','-t','60','web',*WORKERS],timeout=180);stopped=True
  if (folder/'knowledge-state').exists():shutil.rmtree(folder/'knowledge-state')
  if (ROOT/'knowledge-state').exists():shutil.copytree(ROOT/'knowledge-state',folder/'knowledge-state')
  tables=columns.columns(r.sql);before=legacy.fingerprints(r.sql,tables)
  ksql=lambda q:r.sql(q,DATABASES[1]);ktables=[{**t,'columns':['ctid','xmin']} for t in columns.columns(ksql)];kbefore=legacy.fingerprints(ksql,ktables)
  r.dump(folder,'graph_member','member.dump');r.dump(folder,DATABASES[1],'knowledge.dump')
  h.private(folder/'preservation.json',json.dumps({'memberTables':tables,'memberRows':before,'knowledgeRows':kbefore}))
  with (folder/'previous-images.tar').open('wb') as stream:r.run(['docker','save',prev['web']['tag'],prev['worker']['tag']],output=stream,timeout=600)
  encrypted=r.encrypt(folder);h.emit('final-backup-ok',**encrypted)
  migration_started=True;r.migrate();r.preserved(r.sql,tables,before)
  assert legacy.fingerprints(ksql,ktables)==kbefore,'Common knowledge or publication rows changed'
  assert r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
  h.atomic(ROOT/'compose.yaml',candidate)
  r.run(r.dc+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web',*WORKERS],timeout=300)
  r.run(r.dc+['exec','-T','web','node','scripts/production-readiness.mjs'])
  r.run(r.dc+['exec','-T','web','node','-e',PUBLIC_PROBE])
  assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  assert json.loads(r.run(r.dc+['config','--format','json']))==expected
  for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha
  for s in ['graph-member-postgres','graph-neo4j']:assert r.run(r.dc+['ps','-q',s])==r.ids[s]
  for s in WORKERS:
   v=json.loads(r.run(['docker','inspect',r.run(r.dc+['ps','-q',s])]))[0];assert v['Config']['Image']==prev['worker']['tag'] and v['Image'] in [prev['worker']['configId'],prev['worker']['manifestId']]
  activated=True
  result={**rehearsal,**encrypted,'source':SOURCE,'build':m['build'],'backup':str(folder),'memberLedgerCount':len(m['memberMigrations']),'knowledgeLedgerCount':len(m['knowledgeMigrations']),'updatedServices':['web'],'workersRestartedWithSameImages':True,'settingsPreserved':True,'existingDataPreservedAtCutover':True,'knowledgeUnchangedAtCutover':True,'betaDataImported':False,'guideChanged':False,'schedulesChanged':False,'capacityAuditReadOnly':True,'formalAcceptancePending':True,'automaticOldWebDowngrade':False}
  r.export(folder,result);h.emit('activated',**result)
 except BaseException:
  if stopped and not migration_started:r.run(r.dc+['start','web',*WORKERS])
  elif stopped and not activated:r.run(r.dc+['stop','-t','30','web',*WORKERS],timeout=150)
  h.emit('repair-required',backup=str(folder),migrationStarted=migration_started,databaseRestored=False,automaticOldWebDowngrade=False);raise
if __name__=='__main__':main()
