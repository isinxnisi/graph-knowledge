#!/usr/bin/env python3
"""Fixed-source private Theme release. Additive member045/knowledge010 only.
No content rewrite, common-knowledge withdrawal, guide/schedule/OS change.
Never downgrade to an old Web after applying the new publication boundary.
"""
import copy,datetime,fcntl,hashlib,importlib.util,json,os,pathlib,pwd,re,shutil,subprocess,time
ROOT=pathlib.Path('/opt/graph-knowledge')
SOURCE='52aeced622e3bbd3b6655c4000098047c36c0d23'
DQ='theme:1ab040a3a68b1e5666de0ba354fa484891d56e95d5e6bda3'
DATABASES=['graph_member','plunode_knowledge75_production']
WORKERS=['knowledge-review','knowledge-patrol','knowledge-publisher']
IMAGE_SERVICES=['member-ops','knowledge-ops',*WORKERS]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-theme-private-20261118-')
 h=module('image_checks',stage/'production_image_verification.py')
 legacy=module('legacy_release',stage/'release-accepted-beta-production.py')
 columns=module('columns',stage/'release-featured-themes-production.py')
 m=json.loads((stage/'manifest.json').read_text());prev=m['previous']
 assert m['sourceCommit']==SOURCE
 assert set(m['additions'])=={'045-theme-publication.sql','010-theme-publication.sql'}
 for key,name in [('memberMigrations','045-theme-publication.sql'),('knowledgeMigrations','010-theme-publication.sql')]:
  assert set(m[key])==set(prev[key])|{name} and all(m[key][k]==v for k,v in prev[key].items())
 class Release(legacy.Release):
  def __init__(self):
   self.stage=stage;self.h=h;self.f=columns;self.m=m
   self.audit={'aiArtifactSha256':prev['aiArtifactSha256']}
   self.lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   self.dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
   self.config=json.loads(self.run(self.dc+['config','--format','json']));self.pg=self.run(self.dc+['ps','-q','graph-member-postgres']);self.h.run=self.run
  def preflight(self):
   anchor=ROOT/'backups/webb-locale-web-20261116T233125Z/compose.yaml'
   assert h.digest(anchor)==prev['composeBackupSha256'],'Verified predecessor backup changed'
   assert (ROOT/'compose.yaml').read_text()==h.patch_image(anchor.read_text(),'web',prev['web']['tag']),'Unexpected Compose drift'
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
   for s in ['web',*WORKERS]:
    env=self.config['services'][s]['environment'];assert env['KNOWLEDGE_RUNTIME']=='production'
    assert not any(env.get(k)=='1' for k in ['PLUNODE_WINDOWS_HTTPS_TRANSPORT','PLUNODE_WINDOWS_GOOGLE_AUTH_TRANSPORT','PLUNODE_WINDOWS_GEMINI_TRANSPORT'])
   assert self.config['services']['web']['environment']['MEMBER_ORIGIN']=='https://plunode.net'
   assert shutil.disk_usage(ROOT).free>6*1024**3
  def fingerprints(self,sql,tables,old_member=None,old_knowledge=None):
   # Existing ledgers append rows; compare their old rows, not new entries.
   def query(text):
    if old_knowledge is not None:
     names=','.join("'"+k+"'" for k in sorted(old_knowledge));assert all(re.fullmatch(r'[a-z0-9._-]+',k) for k in old_knowledge)
     text=text.replace('FROM "knowledge75"."migrations"','FROM "knowledge75"."migrations" WHERE name IN ('+names+')')
    return sql(text)
   return legacy.fingerprints(query,[{**t,'columns':t.get('fingerprintColumns',t['columns'])} for t in tables],old_member)
  def backup(self,folder,database,filename,fast=False):
   # pg_dump and row/owner baselines use the exact same exported snapshot.
   connection=subprocess.Popen(['docker','exec','-i',self.pg,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   try:
    connection.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n');connection.stdin.flush();snapshot=connection.stdout.readline().strip();assert re.fullmatch(r'[A-F0-9-]+',snapshot)
    sql=lambda q:self.sql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '"+snapshot+"'; "+q+'; COMMIT',database)
    tables=columns.columns(sql)
    if fast and database==DATABASES[1]:tables=[{**t,'fingerprintColumns':['ctid','xmin']} for t in tables]
    before=self.fingerprints(sql,tables)
    self.dump(folder,database,filename,snapshot);return tables,before
   finally:
    if connection.poll() is None:connection.stdin.write('ROLLBACK;\n');connection.stdin.close();connection.wait(timeout=20)
  def dump(self,folder,database,filename,snapshot=None):
   args=['docker','exec',self.pg,'pg_dump','-U','postgres','-d',database,'-Fc','-Z1']
   if snapshot:args.append('--snapshot='+snapshot)
   with (folder/filename).open('wb') as stream:self.run(args,output=stream,timeout=1200)
  def migrate(self,pg=None):
   # Execute each fixed, checksummed additive SQL as the CURRENT ledger owner.
   # This preserves the existing runtime ownership/default grants.
   for db,filename,ledger in [('graph_member','045-theme-publication.sql','member_migration'),('plunode_knowledge75_production','010-theme-publication.sql','knowledge75.migrations')]:
    sql=lambda q:self.sql(q,db,pg);checksum=m['additions'][filename];payload=(stage/filename).read_text();assert hashlib.sha256(payload.encode()).hexdigest()==checksum
    old=sql("SELECT checksum FROM "+ledger+" WHERE name='"+filename+"'")
    if old:assert old==checksum;continue
    owner=sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='"+ledger+"'::regclass");assert re.fullmatch(r'[a-zA-Z0-9_-]+',owner)
    sql('BEGIN;SELECT pg_advisory_xact_lock(7500001);SET LOCAL ROLE '+legacy.ident(owner)+';'+payload+"\nINSERT INTO "+ledger+"(name,checksum) VALUES('"+filename+"','"+checksum+"');COMMIT")
  def verify_migrated(self,sqls,baselines):
   for db in DATABASES:
    sql=sqls[db];tables,before=baselines[db];legacy.assert_old_columns(sql,tables,columns.columns)
    assert self.fingerprints(sql,tables,prev['memberMigrations'] if db=='graph_member' else None,prev['knowledgeMigrations'] if db!='graph_member' else None)==before,'Existing rows/owners changed: '+db
   k=sqls[DATABASES[1]]
   assert k("SELECT count(*) FROM knowledge75.objects o LEFT JOIN knowledge75.theme_publications h ON h.theme_id=o.id WHERE o.kind='theme' AND h.theme_id IS NULL")=='0'
   assert k("SELECT count(*) FROM knowledge75.theme_publications WHERE theme_id='"+DQ+"' AND published_revision IS NOT NULL")=='0'
   assert k("SELECT count(*) FROM knowledge75.theme_releases WHERE theme_id='"+DQ+"'")=='0'
   assert json.loads(sqls[DATABASES[0]]('SELECT json_object_agg(name,checksum) FROM member_migration'))==m['memberMigrations']
   assert json.loads(k('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations'))==m['knowledgeMigrations']
  def rehearsal(self,folder,baselines):
   name='plunode-private-theme-rehearsal-'+legacy.secrets.token_hex(5);created=False;volume=False
   self.run(['docker','network','create','--internal',name])
   try:
    self.run(['docker','volume','create','--label','plunode.private-rehearsal=true',name]);volume=True
    self.run(['docker','run','-d','--name',name,'--network',name,'--memory','512m','--mount','type=volume,src='+name+',dst=/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=restore_admin','-e','POSTGRES_DB=postgres',self.config['services']['graph-member-postgres']['image']]);created=True
    for _ in range(120):
     if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','restore_admin'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
     time.sleep(.25)
    else:raise RuntimeError('Restore database not ready')
    sql=lambda q,db='postgres':self.sql(q,db,name)
    roles=json.loads(self.sql("SELECT json_agg(rolname) FROM pg_roles WHERE rolname !~ '^pg_'",'postgres'));existing=set(json.loads(sql('SELECT json_agg(rolname) FROM pg_roles')))
    for role in roles:
     if role not in existing:sql('CREATE ROLE '+legacy.ident(role)+' NOLOGIN')
    for db,filename in zip(DATABASES,['member.dump','knowledge.dump']):
     owner=self.sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='"+db+"'",'postgres');sql('CREATE DATABASE '+legacy.ident(db)+' OWNER '+legacy.ident(owner))
     with (folder/filename).open('rb') as stream:
      p=subprocess.run(['docker','exec','-i',name,'pg_restore','-h','127.0.0.1','-U','restore_admin','-d',db,'--exit-on-error'],stdin=stream,capture_output=True,timeout=600)
     assert p.returncode==0,'Isolated restore failed'
    sqls={db:(lambda q,db=db:sql(q,db)) for db in DATABASES}
    for db in DATABASES:assert self.fingerprints(sqls[db],baselines[db][0])==baselines[db][1],'Restored baseline differs'
    self.migrate(name);self.verify_migrated(sqls,baselines)
    after={db:self.fingerprints(sqls[db],columns.columns(sqls[db])) for db in DATABASES}
    self.migrate(name)
    assert all(self.fingerprints(sqls[db],columns.columns(sqls[db]))==after[db] for db in DATABASES),'Migration replay changed data'
    return {'restoredBothDatabases':True,'oldRowsAndOwnersPreserved':True,'repeatedUnchanged':True,'dragonQuestWithheld':True,'commonKnowledgeUnchanged':True}
   finally:
    if created:self.run(['docker','rm','-f',name])
    if volume:
     info=json.loads(self.run(['docker','volume','inspect',name]))[0];assert info['Labels'].get('plunode.private-rehearsal')=='true' and info['Name']==name;self.run(['docker','volume','rm',name])
    self.run(['docker','network','rm',name])
  def directory(self):
   folder=ROOT/'backups'/('theme-private-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));folder.mkdir(mode=0o700)
   for name in ['compose.yaml','app.env','knowledge.env']:shutil.copy2(ROOT/name,folder/name);(folder/name).chmod(0o600)
   for name in ['knowledge-runtime','knowledge-state']:
    if (ROOT/name).is_dir():shutil.copytree(ROOT/name,folder/name)
   shutil.copy2(stage/'manifest.json',folder/'manifest.json');return folder
  def export(self,folder,result):
   for path in [folder/'activated.json',stage/'activated.json']:h.private(path,json.dumps(result,indent=2))
   target=pathlib.Path(m['exportDirectory']);assert str(target).startswith('/home/develop/plunode-theme-private-20261118/')
   user=pwd.getpwnam('develop')
   for name in ['activated.json','recovery.tar.enc','recovery-key.enc']:
    dst=target/name;shutil.copy2(folder/name,dst);dst.chmod(0o600);os.chown(dst,user.pw_uid,user.pw_gid)
 r=Release()
 if (stage/'activated.json').is_file():
  result=json.loads((stage/'activated.json').read_text());assert result['source']==SOURCE and r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
  assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build'];h.emit('already-activated',**result);return
 r.preflight();r.images(load=True)
 original=(ROOT/'compose.yaml').read_text();candidate=h.patch_image(original,'web',m['web']['tag']);expected=copy.deepcopy(r.config);expected['services']['web']['image']=m['web']['tag']
 for name in IMAGE_SERVICES:candidate=h.patch_image(candidate,name,m['memberOps']['tag']);expected['services'][name]['image']=m['memberOps']['tag']
 path=ROOT/'compose.theme-private-candidate.yaml';h.private(path,candidate);cdc=[str(path) if x==str(ROOT/'compose.yaml') else x for x in r.dc]
 assert json.loads(r.run(cdc+['config','--format','json']))==expected,'Change exceeds selected image pins'
 folder=r.directory();baselines={db:r.backup(folder,db,filename) for db,filename in zip(DATABASES,['member.dump','knowledge.dump'])}
 rehearsal=r.rehearsal(folder,baselines);h.emit('isolated-migration-ok',**rehearsal)
 r.preflight();stopped=False;migration_started=False;activated=False
 try:
  h.emit('preflight-ok',source=SOURCE,build=m['build'],backup=str(folder),additionalMigrations=list(m['additions']))
  r.run(r.dc+['stop','-t','60','web',*WORKERS],timeout=180);stopped=True
  if (folder/'knowledge-state').exists():shutil.rmtree(folder/'knowledge-state')
  if (ROOT/'knowledge-state').exists():shutil.copytree(ROOT/'knowledge-state',folder/'knowledge-state')
  baselines={db:r.backup(folder,db,filename,fast=True) for db,filename in zip(DATABASES,['member.dump','knowledge.dump'])}
  h.private(folder/'preservation.json',json.dumps(baselines))
  old_tags=sorted({r.config['services'][s]['image'] for s in ['web',*IMAGE_SERVICES]})
  with (folder/'previous-images.tar').open('wb') as stream:r.run(['docker','save',*old_tags],output=stream,timeout=600)
  encrypted=r.encrypt(folder);h.emit('final-backup-ok',**encrypted)
  migration_started=True;r.migrate();r.verify_migrated({db:(lambda q,db=db:r.sql(q,db)) for db in DATABASES},baselines)
  h.atomic(ROOT/'compose.yaml',candidate)
  r.run(r.dc+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web',*WORKERS],timeout=300)
  r.run(r.dc+['exec','-T','web','node','scripts/production-readiness.mjs'])
  assert r.run(r.dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  assert json.loads(r.run(r.dc+['config','--format','json']))==expected
  assert r.ledgers()==[m['memberMigrations'],m['knowledgeMigrations']]
  for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha
  for s in ['graph-member-postgres','graph-neo4j']:assert r.run(r.dc+['ps','-q',s])==r.ids[s]
  activated=True
  result={**rehearsal,**encrypted,'source':SOURCE,'build':m['build'],'backup':str(folder),'memberLedgerCount':len(m['memberMigrations']),'knowledgeLedgerCount':len(m['knowledgeMigrations']),'updatedServices':['web',*WORKERS],'settingsPreserved':True,'existingDataPreserved':True,'betaDataImported':False,'guideChanged':False,'schedulesChanged':False,'formalAcceptancePending':True,'automaticOldWebDowngrade':False}
  r.export(folder,result);h.emit('activated',**result)
 except BaseException:
  if stopped and not migration_started:r.run(r.dc+['start','web',*WORKERS])
  elif stopped and not activated:r.run(r.dc+['stop','-t','30','web',*WORKERS],timeout=150)
  h.emit('repair-required',backup=str(folder),migrationStarted=migration_started,databaseRestored=False,automaticOldWebDowngrade=False);raise
if __name__=='__main__':main()
