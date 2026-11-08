#!/usr/bin/env python3
"""Add the ChatGPT Theme intake to the already activated R6 runtime.

No seeding, private configuration import, common KG reset or old-dump rollback.
The old runtime is inspected before stopping; only Member migration 036 is new.
"""
import datetime,fcntl,hashlib,importlib.util,json,os,pathlib,pwd,re,secrets,shutil,subprocess,tarfile,time
ROOT=pathlib.Path('/opt/graph-knowledge')
def private(file,text):
 file=pathlib.Path(file);temporary=file.with_name(file.name+'.tmp-'+secrets.token_hex(4))
 try:
  temporary.write_text(text);temporary.chmod(0o600);os.replace(temporary,file)
 finally:temporary.unlink(missing_ok=True)
def run(args,data=None,timeout=180,output=None):
 p=subprocess.run(args,input=data,stdout=output or subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 if p.returncode:
  private(pathlib.Path.cwd()/'command-failure.json',json.dumps({'program':args[0],'exit':p.returncode,'stderr':p.stderr.decode(errors='replace')}))
  raise RuntimeError('Command failed; see private diagnostics: '+args[0])
 return p.stdout.decode().strip() if p.stdout is not None else ''
def digest(file):
 h=hashlib.sha256()
 with pathlib.Path(file).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def emit(event,**data):print(json.dumps({'event':event,**data}),flush=True)
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,file);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v);return v
def ident(v):return '"'+v.replace('"','""')+'"'
def columns(sql):
 return json.loads(sql("SELECT coalesce(json_agg(row_to_json(x)),'[]') FROM (SELECT c.table_schema AS schema,c.table_name AS name,t.tableowner AS owner,json_agg(c.column_name ORDER BY c.ordinal_position) AS columns FROM information_schema.columns c JOIN pg_tables t ON t.schemaname=c.table_schema AND t.tablename=c.table_name WHERE c.table_schema NOT IN('pg_catalog','information_schema') GROUP BY c.table_schema,c.table_name,t.tableowner ORDER BY c.table_schema,c.table_name)x"))
def fingerprints(sql,tables,old_ledger=False):
 # One database round trip retains the same per-table ordered row digest. This
 # matters on the development PC where docker exec otherwise repeats 80+ times.
 parts=[]
 for t in tables:
  where=" WHERE name<>'036-theme-registration.sql'" if old_ledger and t['schema']=='public' and t['name']=='member_migration' else ''
  key=(t['schema']+'.'+t['name']).replace("'","''")
  value="SELECT count(*)||':'||md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),'')) FROM (SELECT "+','.join(map(ident,t['columns']))+' FROM '+ident(t['schema'])+'.'+ident(t['name'])+where+')x'
  parts.append("SELECT '"+key+"' AS key,("+value+") AS value")
 return json.loads(sql("SELECT coalesce(json_object_agg(key,value),'{}'::json) FROM ("+' UNION ALL '.join(parts)+')checks')) if parts else {}

def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-theme-release-')
 gate=(ROOT/'.member-activation.lock').open('a');fcntl.flock(gate,fcntl.LOCK_EX|fcntl.LOCK_NB)
 m=json.loads((stage/'manifest.json').read_text());previous=m['previous'];images=m['images']
 assert m['source'] and set(m['additionalMemberMigrations'])=={'036-theme-registration.sql'}
 for name,value in previous['files'].items():assert digest(ROOT/name)==value,'Live setting changed: '+name
 assert shutil.disk_usage(ROOT).free>4*1024**3
 comp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
 ids={s:run(comp+['ps','-q',s]) for s in ['web','graph-member-postgres','graph-neo4j','knowledge-review','knowledge-patrol','knowledge-publisher']}
 for s,cid in ids.items():
  value=json.loads(run(['docker','inspect',cid]))[0];assert value['State']['Running'],'Service is not running: '+s
  if s=='web':assert value['Image'] in [previous['images']['web']['manifestId'],previous['images']['web']['configId']]
  if s.startswith('knowledge-'):assert value['Image'] in [previous['images']['knowledge-ops']['manifestId'],previous['images']['knowledge-ops']['configId']]
 assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==previous['build']
 artifact=run(comp+['exec','-T','web','sha256sum','/app/data/ai-lab/initial.json']).split()[0];assert artifact==previous['aiArtifactSha256']
 pg=ids['graph-member-postgres']
 def sql(q,db='graph_member'):
  return run(['docker','exec','-i',pg,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
 old_ledger=json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration'))
 assert old_ledger==previous['memberMigrations'],'Member migration baseline changed'
 assert all(m['memberMigrations'][k]==v for k,v in old_ledger.items())
 knowledge_ledger=sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations','plunode_knowledge75_production')
 assert json.loads(knowledge_ledger)==m['knowledgeMigrations']
 checks=module('archive_checks',stage/'archive-check.py');archive=stage/m['archive']['file'];assert digest(archive)==m['archive']['sha256']
 identities=checks.archive_identities(archive,{'sourceCommit':m['source'],'web':images['web'],'memberOps':images['knowledge-ops']})
 run(['docker','load','--input',str(archive)],timeout=300)
 driver=json.loads(run(['docker','info','--format','{{json .DriverStatus}}']))
 for key,name in [('web','web'),('memberOps','knowledge-ops')]:checks.verify_loaded_image(json.loads(run(['docker','image','inspect',images[name]['tag']]))[0],identities[key],driver,m['source'])
 assert run(['docker','run','--rm','--network','none','--entrypoint','cat',images['web']['tag'],'/app/.next-public/BUILD_ID'])==images['web']['build']
 compose=(ROOT/'compose.yaml').read_text()
 for name in ['web','knowledge-ops']:
  assert previous['images'][name]['tag'] in compose
  compose=compose.replace(previous['images'][name]['tag'],images[name]['tag'])
 env=(ROOT/'knowledge.env').read_text();assert not re.search(r'^KNOWLEDGE_THEME_REGISTRATION_ENABLED=',env,re.M)
 candidate_env=env.rstrip()+'\nKNOWLEDGE_THEME_REGISTRATION_ENABLED=1\n'
 backup=ROOT/'backups'/('theme-api-release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
 for name in ['app.env','knowledge.env','compose.yaml']:shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
 shutil.copytree(ROOT/'knowledge-runtime',backup/'knowledge-runtime');shutil.copy2(stage/'manifest.json',backup/'manifest.json')
 changed=False;stopped=False
 emit('preflight-ok',source=m['source'],build=images['web']['build'],additionalMemberMigrations=m['additionalMemberMigrations'],backup=str(backup))
 try:
  run(comp+['stop','-t','60','web','knowledge-review','knowledge-patrol','knowledge-publisher'],timeout=120);stopped=True
  tables=columns(sql);before=fingerprints(sql,tables)
  for db,name in [('graph_member','member.dump'),('plunode_knowledge75_production','knowledge.dump')]:
   with (backup/name).open('wb') as f:run(['docker','exec',pg,'pg_dump','-U','postgres','-d',db,'-Fc'],output=f)
  assert fingerprints(sql,tables)==before
  private(backup/'member-before.json',json.dumps({'tables':tables,'fingerprints':before,'ledger':old_ledger}))
  suffix=secrets.token_hex(5);network='plunode-theme-restore-'+suffix;container=network+'-pg';net=False;created=False
  try:
   run(['docker','network','create','--internal',network]);net=True
   run(['docker','run','-d','--name',container,'--network',network,'--network-alias','graph-member-postgres','--memory','256m','--tmpfs','/var/lib/postgresql/data:rw,size=512m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=restore_admin','-e','POSTGRES_DB=postgres',m['postgresImage']]);created=True
   for _ in range(50):
    if subprocess.run(['docker','exec',container,'pg_isready','-U','restore_admin'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
    time.sleep(.2)
   else:raise RuntimeError('Restore database not ready')
   def restored(q,db='graph_member'):
    return run(['docker','exec','-i',container,'psql','-X','-qAt','-U','restore_admin','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
   roles=json.loads(sql('SELECT json_agg(rolname) FROM pg_roles WHERE rolname !~ \'^pg_\'' ,'postgres'))
   for role in roles:
    if role!='restore_admin':restored('CREATE ROLE '+ident(role)+' NOLOGIN','postgres')
   restored("ALTER ROLE gk_member LOGIN PASSWORD 'isolated-rehearsal-only'",'postgres');restored('CREATE DATABASE graph_member OWNER gk_member','postgres')
   with (backup/'member.dump').open('rb') as f:
    p=subprocess.run(['docker','exec','-i',container,'pg_restore','-U','restore_admin','-d','graph_member','--exit-on-error'],stdin=f,stdout=subprocess.PIPE,stderr=subprocess.PIPE);assert p.returncode==0,'Separate restore failed'
   assert columns(restored)==tables and fingerprints(restored,tables)==before
   rehearsal=backup/'rehearsal.env';private(rehearsal,'\n'.join(['GRAPH_DEPLOYMENT=production','MEMBER_STORAGE_ENABLED=1','MEMBER_ORIGIN=https://plunode.net','MEMBER_DATABASE_URL=postgresql://gk_member:isolated-rehearsal-only@graph-member-postgres:5432/graph_member','MEMBER_AUTH_SECRET='+secrets.token_hex(32),'MEMBER_COOKIE_PREFIX=gk-member-production','MEMBER_AUTH_PROVIDER=google','MEMBER_GOOGLE_CLIENT_ID=isolated-migration','MEMBER_GOOGLE_CLIENT_SECRET='+secrets.token_hex(24),'NODE_OPTIONS=--max-old-space-size=256'])+'\n')
   migrate=['docker','run','--rm','--network',network,'--memory','384m','--env-file',str(rehearsal),images['knowledge-ops']['tag'],'scripts/member-migrate.ts','--theme-registration','--confirm-origin','https://plunode.net']
   run(migrate);assert json.loads(restored('SELECT json_object_agg(name,checksum) FROM member_migration'))==m['memberMigrations'];assert fingerprints(restored,tables,True)==before
   all_tables=columns(restored);all_rows=fingerprints(restored,all_tables);run(migrate);assert fingerprints(restored,all_tables)==all_rows
   emit('backup-restore-rehearsal-ok',oldTables=len(tables),tables=len(all_tables),ledgerCount=len(m['memberMigrations']),oldRowsAndOwnersPreserved=True,repeatedUnchanged=True,memberDumpSha256=digest(backup/'member.dump'),knowledgeDumpSha256=digest(backup/'knowledge.dump'))
  finally:
   if created:run(['docker','rm','-f',container])
   if net:run(['docker','network','rm',network])
  payload=backup/'recovery.tar';key=backup/'encryption-key';verified=backup/'verify.tar'
  with tarfile.open(payload,'w') as tar:
   for item in backup.iterdir():
    if item.name not in ['recovery.tar','rehearsal.env']:tar.add(item,arcname=item.name)
  private(key,secrets.token_hex(48));encrypted=backup/'recovery.tar.enc';wrapped=backup/'recovery-key.enc'
  try:
   run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(payload),'-out',str(encrypted),'-pass','file:'+str(key)])
   run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(stage/'recovery-public.pem'),'-in',str(key),'-out',str(wrapped),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'])
   run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(encrypted),'-out',str(verified),'-pass','file:'+str(key)]);assert digest(payload)==digest(verified)
  finally:
   for file in [payload,key,verified]:file.unlink(missing_ok=True)
  private(ROOT/'compose.yaml',compose);private(ROOT/'knowledge.env',candidate_env);changed=True
  run(comp+['run','--rm','--no-deps','knowledge-ops','scripts/member-migrate.ts','--theme-registration','--confirm-origin','https://plunode.net'])
  assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration'))==m['memberMigrations'];assert fingerprints(sql,tables,True)==before
  assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations','plunode_knowledge75_production'))==json.loads(knowledge_ledger)
  emit('migration-ok',ledgerCount=len(m['memberMigrations']),oldRowsAndOwnersPreserved=True,knowledgeMigrationsUnchanged=True)
  run(comp+['up','-d','--no-deps','web','knowledge-review','knowledge-patrol','knowledge-publisher'],timeout=180)
  for _ in range(60):
   p=subprocess.run(['curl','--fail','--silent','--max-time','5','http://127.0.0.1:3200/api/dataset'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   if p.returncode==0:break
   time.sleep(1)
  else:raise RuntimeError('New Web readiness not reached')
  assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==images['web']['build']
  assert run(comp+['exec','-T','web','sha256sum','/app/data/ai-lab/initial.json']).split()[0]==artifact
  for s in ['graph-neo4j','graph-member-postgres']:assert run(comp+['ps','-q',s])==ids[s]
  result={'source':m['source'],'build':images['web']['build'],'webImage':images['web']['manifestId'],'memberLedgerCount':len(m['memberMigrations']),'knowledgeLedgerUnchanged':True,'backup':str(backup),'memberDumpSha256':digest(backup/'member.dump'),'knowledgeDumpSha256':digest(backup/'knowledge.dump'),'encryptedBackupSha256':digest(encrypted),'wrappedKeySha256':digest(wrapped),'settingsPreservedExceptThemeFlag':True,'oldRowsAndOwnersPreserved':True,'kgContainerUnchanged':True,'aiArtifactUnchanged':True,'themeAuthoringEnabled':True,'formalChatGPTAcceptancePending':True}
  private(backup/'activated.json',json.dumps(result,indent=2));emit('activated',**result)
  export=pathlib.Path('/home/develop/plunode-theme-20261108')/backup.name;export.mkdir(mode=0o700,parents=True,exist_ok=False);owner=pwd.getpwnam('develop');os.chown(export,owner.pw_uid,owner.pw_gid)
  for file in [encrypted,wrapped,backup/'activated.json']:
   dest=export/file.name;shutil.copy2(file,dest);os.chown(dest,owner.pw_uid,owner.pw_gid);dest.chmod(0o600)
 except BaseException:
  if stopped:
   # Before a runtime change, resume the same services. After a change, keep the
   # new compatible app/schema and retained data for repair; never restore dumps.
   run(comp+['up','-d','--no-deps','web','knowledge-review','knowledge-patrol','knowledge-publisher'],timeout=180)
  emit('stopped-for-repair',runtimeChanged=changed,oldDumpRestored=False,automaticOldWebDowngrade=False,backup=str(backup));raise
if __name__=='__main__':main()
