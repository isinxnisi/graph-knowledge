#!/usr/bin/env python3
"""R6 preparation: inspect security updates and rehearse the actual member dump.

Does not stop Web, migrate a live DB, change OS packages, or activate an image.
Run only from checksum-verified root-private staging with the audited baseline.
"""
import datetime,fcntl,hashlib,importlib.util,json,os,pathlib,pwd,re,secrets,shutil,subprocess,tarfile,time

ROOT=pathlib.Path('/opt/graph-knowledge')
EXPORT=pathlib.Path('/home/develop/plunode-r6-20261108')

def run(args,data=None,output=None,timeout=180):
 p=subprocess.run(args,input=data,stdout=output or subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 if p.returncode:raise RuntimeError('Preparation command failed: '+args[0]+' (private log retained)')
 return p.stdout.decode().strip()if p.stdout is not None else ''

def digest(file):
 h=hashlib.sha256()
 with pathlib.Path(file).open('rb')as stream:
  for b in iter(lambda:stream.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def private(file,value):
 pathlib.Path(file).write_text(value);pathlib.Path(file).chmod(0o600)

def ident(value):return '"'+value.replace('"','""')+'"'

def emit(event,**values):print(json.dumps({'event':event,**values},ensure_ascii=False),flush=True)

def table_columns(sql):
 return json.loads(sql("SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM (SELECT c.table_schema AS schema,c.table_name AS name,t.tableowner AS owner,json_agg(c.column_name ORDER BY c.ordinal_position) AS columns FROM information_schema.columns c JOIN pg_tables t ON t.schemaname=c.table_schema AND t.tablename=c.table_name WHERE c.table_schema NOT IN('pg_catalog','information_schema') GROUP BY c.table_schema,c.table_name,t.tableowner ORDER BY c.table_schema,c.table_name)x"))

def fingerprints(sql,tables,old_ledger=False):
 out={}
 for table in tables:
  where=" WHERE name<'020'"if old_ledger and table['schema']=='public'and table['name']=='member_migration'else''
  query="SELECT count(*)||':'||md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),'')) FROM (SELECT "+','.join(map(ident,table['columns']))+' FROM '+ident(table['schema'])+'.'+ident(table['name'])+where+')x'
  out[table['schema']+'.'+table['name']]=sql(query)
 return out

def security_updates(backup):
 p=subprocess.run(['apt-get','-o','Acquire::Retries=2','-o','Acquire::http::Timeout=20','-o','Acquire::https::Timeout=20','update'],capture_output=True,text=True,timeout=240,env={**os.environ,'LC_ALL':'C'})
 private(backup/'apt-update.log',p.stdout+p.stderr)
 fresh=p.returncode==0 and not any(s in p.stdout+p.stderr for s in ['Failed to fetch','Some index files failed'])
 if not fresh:return {'metadataRefreshed':False,'packages':[],'packagesChanged':False}
 import apt,apt_pkg
 cache=apt.Cache();updates=[]
 for package in cache:
  if not package.installed:continue
  candidates=[v for v in package.versions if apt_pkg.version_compare(v.version,package.installed.version)>0 and any(o.origin=='Ubuntu'and o.archive.endswith('-security')for o in v.origins)]
  if candidates:
   version=candidates[0]
   for candidate in candidates[1:]:
    if apt_pkg.version_compare(candidate.version,version.version)>0:version=candidate
   updates.append({'name':package.name,'installed':package.installed.version,'securityVersion':version.version})
 updates.sort(key=lambda x:x['name'])
 if updates:
  simulation=subprocess.run(['apt-get','--simulate','--no-install-recommends','--only-upgrade','install',*[x['name']+'='+x['securityVersion']for x in updates]],capture_output=True,text=True,timeout=120,env={**os.environ,'LC_ALL':'C'})
  private(backup/'apt-security-simulation.log',simulation.stdout+simulation.stderr)
  return {'metadataRefreshed':True,'packages':updates,'simulationSucceeded':simulation.returncode==0,'packagesChanged':False}
 return {'metadataRefreshed':True,'packages':[],'simulationSucceeded':True,'packagesChanged':False}

def main():
 assert os.geteuid()==0,'Use the existing administrator sudo'
 os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-r6-prepare-'),'Root-private staging required'
 manifest=json.loads((stage/'preparation-manifest.json').read_text());baseline=json.loads((stage/'audit-result.json').read_text())
 assert digest(ROOT/'compose.yaml')==baseline['composeSha256']and digest(ROOT/'app.env')==baseline['envSha256'],'Live configuration changed since audit'
 gate=(ROOT/'.member-activation.lock').open('a');fcntl.flock(gate,fcntl.LOCK_EX|fcntl.LOCK_NB)
 dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
 current=json.loads(run(dc+['config','--format','json']))
 for name in ['web','graph-member-postgres','graph-neo4j']:
  cid=run(dc+['ps','-q',name]);assert cid==baseline['containers'][name]['id'],'Live container changed'
  info=json.loads(run(['docker','inspect',cid]))[0];assert info['Image']==baseline['containers'][name]['image']and info['State']['Running'],'Live image differs'
 assert run(dc+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==baseline['buildId']
 assert run(dc+['exec','-T','web','sha256sum','/app/data/ai-lab/initial.json']).split()[0]==baseline['aiArtifactSha256']
 assert shutil.disk_usage(ROOT).free>8*1024**3,'Insufficient backup/image space'
 pg=baseline['containers']['graph-member-postgres']['id']
 sql=lambda q:run(['docker','exec','-i',pg,'psql','-X','-qAt','-U','postgres','-d','graph_member','-v','ON_ERROR_STOP=1'],q.encode())
 old_ledger=dict(x.split()for x in baseline['migrations'])
 assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration;'))==old_ledger
 assert all(manifest['memberMigrations'].get(k)==v for k,v in old_ledger.items())
 images=manifest['images'];compat={'sourceCommit':manifest['source'],'web':images['web'],'memberOps':images['knowledge-ops']}
 spec=importlib.util.spec_from_file_location('archive_checks',stage/'archive-check.py');checks=importlib.util.module_from_spec(spec);spec.loader.exec_module(checks)
 archive=stage/'images-r6-12273b17.tar.gz';assert digest(archive)==manifest['archive']['sha256']
 identities=checks.archive_identities(archive,compat)
 run(['docker','load','--input',str(archive)],timeout=300)
 driver=json.loads(run(['docker','info','--format','{{json .DriverStatus}}']))
 for key,name in [('web','web'),('memberOps','knowledge-ops')]:
  info=json.loads(run(['docker','image','inspect',images[name]['tag']]))[0];checks.verify_loaded_image(info,identities[key],driver,manifest['source'])
 assert run(['docker','run','--rm','--network','none','--entrypoint','cat',images['web']['tag'],'/app/.next-public/BUILD_ID'])==images['web']['build']
 backup=ROOT/'backups'/('knowledge-r6-preparation-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700,exist_ok=False)
 for name in ['app.env','compose.yaml']:shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
 shutil.copy2(stage/'preparation-manifest.json',backup/'manifest.json')
 snapshot=subprocess.Popen(['docker','exec','-i',pg,'psql','-X','-qAt','-U','postgres','-d','graph_member','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  snapshot.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n');snapshot.stdin.flush();snapshot_id=snapshot.stdout.readline().strip();assert re.fullmatch('[A-F0-9-]+',snapshot_id),'Snapshot not established'
  read_snapshot=lambda q:sql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '"+snapshot_id+"'; "+q+'; COMMIT;')
  tables=table_columns(read_snapshot);before=fingerprints(read_snapshot,tables)
  dump=backup/'member-before-r6.dump'
  with dump.open('wb')as output:run(['docker','exec',pg,'pg_dump','-U','postgres','-d','graph_member','--snapshot='+snapshot_id,'-Fc'],output=output)
 finally:
  if snapshot.poll()is None:
   snapshot.stdin.write('ROLLBACK;\n');snapshot.stdin.close();snapshot.wait(timeout=15)
 private(backup/'member-before.json',json.dumps({'tables':tables,'fingerprints':before,'ledger':old_ledger}))
 emit('consistent-backup',tables=len(tables),dumpSha256=digest(dump),webStopped=False)
 suffix=secrets.token_hex(5);network='plunode-r6-restore-'+suffix;container=network+'-pg';created=False;network_created=False
 try:
  run(['docker','network','create','--internal','--label','plunode.task='+suffix,network]);network_created=True
  password=secrets.token_hex(24)
  run(['docker','run','-d','--name',container,'--network',network,'--network-alias','graph-member-postgres','--label','plunode.task='+suffix,'--memory','512m','--tmpfs','/var/lib/postgresql/data:rw,size=536870912','--env','POSTGRES_USER=r6_admin','--env','POSTGRES_DB=postgres','--env','POSTGRES_PASSWORD='+password,current['services']['graph-member-postgres']['image']]);created=True
  for _ in range(60):
   if subprocess.run(['docker','exec',container,'pg_isready','-U','r6_admin','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(.5)
  else:raise RuntimeError('Isolated restore PostgreSQL did not start')
  def restored(q,db='graph_member'):return run(['docker','exec','-i',container,'psql','-X','-qAt','-U','r6_admin','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
  for role in sorted({t['owner']for t in tables}|{'gk_member'}):
   if role!='r6_admin':restored('CREATE ROLE '+ident(role)+' NOLOGIN;',db='postgres')
  restored("ALTER ROLE gk_member LOGIN PASSWORD '"+password+"';",db='postgres');restored('CREATE DATABASE graph_member OWNER gk_member;',db='postgres')
  with dump.open('rb')as source:
   p=subprocess.run(['docker','exec','-i',container,'pg_restore','-U','r6_admin','-d','graph_member','--exit-on-error'],stdin=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180);assert p.returncode==0,'Separate restore failed'
  assert table_columns(restored)==tables and fingerprints(restored,tables)==before,'Restored ownership/rows differ'
  envfile=backup/'rehearsal.env';private(envfile,'\n'.join(['GRAPH_DEPLOYMENT=production','MEMBER_STORAGE_ENABLED=1','MEMBER_ORIGIN=https://plunode.net','MEMBER_DATABASE_URL=postgresql://gk_member:'+password+'@graph-member-postgres:5432/graph_member','MEMBER_AUTH_SECRET='+secrets.token_hex(32),'MEMBER_COOKIE_PREFIX=gk-member-production','MEMBER_AUTH_PROVIDER=google','MEMBER_GOOGLE_CLIENT_ID=isolated-migration-rehearsal','MEMBER_GOOGLE_CLIENT_SECRET='+secrets.token_hex(24),'NODE_OPTIONS=--max-old-space-size=256'])+'\n')
  migrate=['docker','run','--rm','--network',network,'--memory','384m','--env-file',str(envfile),images['knowledge-ops']['tag'],'scripts/member-migrate.ts','--mission-oauth','--confirm-origin','https://plunode.net']
  run(migrate);assert json.loads(restored('SELECT json_object_agg(name,checksum) FROM member_migration;'))==manifest['memberMigrations']
  assert fingerprints(restored,tables,old_ledger=True)==before,'Old member rows changed'
  migrated_tables=table_columns(restored);migrated_rows=fingerprints(restored,migrated_tables);run(migrate)
  assert fingerprints(restored,migrated_tables)==migrated_rows,'Repeated migration changed rows'
  rehearsal={'oldTables':len(tables),'migratedTables':len(migrated_tables),'memberMigrations':len(manifest['memberMigrations']),'oldRowsAndOwnersPreserved':True,'repeatedUnchanged':True,'dumpSha256':digest(dump)}
  private(backup/'restore.json',json.dumps(rehearsal));emit('member-restore-rehearsal-ok',**rehearsal)
 finally:
  if created:
   info=json.loads(run(['docker','inspect',container]))[0];assert info['Config']['Labels'].get('plunode.task')==suffix;run(['docker','rm','-f','-v',container])
  if network_created:
   info=json.loads(run(['docker','network','inspect',network]))[0];assert info['Labels'].get('plunode.task')==suffix and not info['Containers'];run(['docker','network','rm',network])
 security=security_updates(backup);private(backup/'security.json',json.dumps(security,indent=2));emit('security-metadata-checked',**security)
 payload=backup/'recovery.tar'
 with tarfile.open(payload,'w')as tar:
  for name in ['app.env','compose.yaml','manifest.json','member-before.json','member-before-r6.dump','restore.json','security.json']:tar.add(backup/name,arcname=name)
 key=backup/'encryption-key';private(key,secrets.token_hex(48));encrypted=backup/'recovery.tar.enc';wrapped=backup/'recovery-key.enc';verified=backup/'recovery.verify.tar'
 run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(payload),'-out',str(encrypted),'-pass','file:'+str(key)])
 run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(stage/'recovery-public.pem'),'-in',str(key),'-out',str(wrapped),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'])
 run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(encrypted),'-out',str(verified),'-pass','file:'+str(key)]);assert digest(payload)==digest(verified)
 for file in [payload,verified,key]:file.unlink()
 result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backup':str(backup),'source':manifest['source'],'build':images['web']['build'],'restore':rehearsal,'security':security,'liveDbMigrated':False,'webStopped':False,'osPackagesChanged':False,'activated':False,'encryptedBackupSha256':digest(encrypted),'wrappedKeySha256':digest(wrapped)}
 private(backup/'prepared.json',json.dumps(result,indent=2))
 export=EXPORT/backup.name;export.mkdir(mode=0o700,exist_ok=False);owner=pwd.getpwnam('develop')
 for file in [encrypted,wrapped,backup/'prepared.json']:
  dest=export/file.name;shutil.copy2(file,dest);dest.chmod(0o600);os.chown(dest,owner.pw_uid,owner.pw_gid)
 os.chown(export,owner.pw_uid,owner.pw_gid)
 assert digest(ROOT/'compose.yaml')==baseline['composeSha256']and digest(ROOT/'app.env')==baseline['envSha256']
 assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration;'))==old_ledger
 emit('preparation-complete',**result)

if __name__=='__main__':main()
