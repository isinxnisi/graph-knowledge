#!/usr/bin/env python3
"""Separate system intake from personal attribution, preserving all knowledge."""
import copy,datetime,fcntl,hashlib,importlib.util,json,os,pathlib,pwd,secrets,shutil,subprocess,tarfile,time
ROOT=pathlib.Path('/opt/graph-knowledge')

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,file);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def repair_command(run,image,network,environment,apply=False):
 output=run(['docker','run','--rm','--network',network,'--memory','384m','--env-file',str(environment),image,'scripts/repair-operator-intake-privacy.ts','--apply' if apply else '--plan'])
 return json.loads(output)

def rehearsal(h,f,sql,backup,tables,before,image,postgres,flags):
 run=h.run;name='plunode-intake-restore-'+secrets.token_hex(5);created=False;net=False
 try:
  run(['docker','network','create','--internal',name]);net=True
  run(['docker','run','-d','--name',name+'-pg','--network',name,'--network-alias','graph-member-postgres','--memory','256m','--tmpfs','/var/lib/postgresql/data:rw,size=512m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=restore_admin','-e','POSTGRES_DB=postgres',postgres]);created=True
  for _ in range(60):
   if subprocess.run(['docker','exec',name+'-pg','pg_isready','-h','127.0.0.1','-U','restore_admin','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(.25)
  else:raise RuntimeError('Restore PostgreSQL not ready')
  def restored(q,db='graph_member'):
   return run(['docker','exec','-i',name+'-pg','psql','-h','127.0.0.1','-X','-qAt','-U','restore_admin','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
  roles=json.loads(sql("SELECT json_agg(rolname) FROM pg_roles WHERE rolname !~ '^pg_'",'postgres'));existing=set(json.loads(restored('SELECT json_agg(rolname) FROM pg_roles','postgres')))
  for role in roles:
   if role not in existing:restored('CREATE ROLE '+f.ident(role)+' NOLOGIN','postgres')
  restored('ALTER ROLE gk_member LOGIN','postgres');restored('CREATE DATABASE graph_member OWNER gk_member','postgres')
  with (backup/'member.dump').open('rb') as stream:
   result=subprocess.run(['docker','exec','-i',name+'-pg','pg_restore','-h','127.0.0.1','-U','restore_admin','-d','graph_member','--exit-on-error'],stdin=stream,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  assert result.returncode==0,'Separate database restore failed'
  assert f.columns(restored)==tables and f.fingerprints(restored,tables)==before,'Restored member data differs'
  env=backup/'rehearsal.env';h.private(env,'\n'.join([*(k+'='+v for k,v in flags.items()),'MEMBER_DATABASE_URL=postgresql://gk_member@graph-member-postgres:5432/graph_member','NODE_OPTIONS=--max-old-space-size=256'])+'\n')
  plan=repair_command(run,image,name,env);applied=repair_command(run,image,name,env,True);again=repair_command(run,image,name,env,True)
  assert plan['submissionIds']==applied['submissionIds']==again['submissionIds'] and plan['originalDigest']==applied['originalDigest']==again['originalDigest']
  assert again['personalCredits']==again['publicationCredits']==0
  after=f.fingerprints(restored,tables)
  assert all(after[k]==v for k,v in before.items() if k not in ['member_knowledge.submission_revisions','member_knowledge.publication_contributors']),'Unrelated restored rows changed'
  assert f.columns(restored)==tables
  return plan
 finally:
  if created:run(['docker','rm','-f',name+'-pg'])
  if net:run(['docker','network','rm',name])

def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve();assert str(stage).startswith('/root/plunode-operator-intake-20261109-')
 h=module('image_checks',stage/'production_image_verification.py');f=module('fingerprints',stage/'release-featured-themes-production.py');run=h.run
 lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 m=json.loads((stage/'manifest.json').read_text());prev=m['previous'];assert prev['source']=='a5b82aae26e9d9f200b8e6b311a4a949bc81d973' and m['additionalMigrations']==[]
 for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha,'Private runtime setting changed'
 comp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops'];cfg=json.loads(run(comp+['config','--format','json']));compose_sha=h.digest(ROOT/'compose.yaml')
 workers=['knowledge-review','knowledge-patrol','knowledge-publisher'];ids={s:run(comp+['ps','-q',s]) for s in ['web','graph-member-postgres','graph-neo4j',*workers]}
 for s,cid in ids.items():
  state=json.loads(run(['docker','inspect',cid]))[0];assert state['State']['Running'],'Service stopped before release: '+s
  if s=='web':assert state['Image'] in [prev['web']['configId'],prev['web']['manifestId']] and state['Config']['Image']==prev['web']['tag']
  if s in workers:assert state['Image'] in [prev['ops']['configId'],prev['ops']['manifestId']]
 assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==prev['build']
 pg=ids['graph-member-postgres']
 def sql(q,db='graph_member'):return run(['docker','exec','-i',pg,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
 def ledger():return [json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration')),json.loads(sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations','plunode_knowledge75_production'))]
 baseline=ledger();assert baseline==[m['memberMigrations'],m['knowledgeMigrations']]
 archive=stage/m['archive']['file'];assert h.digest(archive)==m['archive']['sha256'];identities=h.archive_identities(archive,m);run(['docker','load','--input',str(archive)])
 driver=json.loads(run(['docker','info','--format','{{json .DriverStatus}}']))
 for key in ['web','memberOps']:h.verify_loaded_image(json.loads(run(['docker','image','inspect',m[key]['tag']]))[0],identities[key],driver,m['sourceCommit'])
 assert run(['docker','run','--rm','--entrypoint','cat',m['web']['tag'],'/app/.next-public/BUILD_ID'])==m['build']
 artifact=run(comp+['exec','-T','web','sha256sum','/app/data/ai-lab/initial.json']).split()[0]
 assert artifact==prev['aiArtifactSha256'] and run(['docker','run','--rm','--entrypoint','sha256sum',m['web']['tag'],'/app/data/ai-lab/initial.json']).split()[0]==artifact
 expected=copy.deepcopy(cfg);expected['services']['web']['image']=m['web']['tag'];candidate=h.patch_image((ROOT/'compose.yaml').read_text(),'web',m['web']['tag'])
 targets={name for name,v in cfg['services'].items() if v.get('image')==prev['ops']['tag']};assert targets=={'member-ops','knowledge-ops',*workers},'Unexpected operator aliases'
 for name in sorted(targets):expected['services'][name]['image']=m['memberOps']['tag'];candidate=h.patch_image(candidate,name,m['memberOps']['tag'])
 cp=ROOT/'compose.operator-intake-candidate.yaml';h.private(cp,candidate);ccomp=[*comp];ccomp[ccomp.index(str(ROOT/'compose.yaml'))]=str(cp)
 assert json.loads(run(ccomp+['config','--format','json']))==expected,'Unexpected setting or service change'
 flags={k:cfg['services']['knowledge-review']['environment'][k] for k in ['COMMUNITY_ENABLED','SITE_OPERATIONS_ENABLED','SITE_OPERATOR_USER_IDS']};assert flags['COMMUNITY_ENABLED']==flags['SITE_OPERATIONS_ENABLED']=='1'
 backup=ROOT/'backups'/('operator-intake-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
 for name in ['compose.yaml','app.env','knowledge.env']:shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
 shutil.copy2(stage/'manifest.json',backup/'manifest.json');stopped=False;repair_started=False
 try:
  assert h.digest(ROOT/'compose.yaml')==compose_sha
  run(comp+['stop','-t','60','web',*workers]);stopped=True
  tables=f.columns(sql);before=f.fingerprints(sql,tables);ktables=f.columns(lambda q:sql(q,'plunode_knowledge75_production'));kbefore=f.fingerprints(lambda q:sql(q,'plunode_knowledge75_production'),ktables)
  for db,name in [('graph_member','member.dump'),('plunode_knowledge75_production','knowledge.dump')]:
   with (backup/name).open('wb') as stream:run(['docker','exec',pg,'pg_dump','-U','postgres','-d',db,'-Fc'],output=stream)
  assert f.fingerprints(sql,tables)==before
  plan=rehearsal(h,f,sql,backup,tables,before,m['memberOps']['tag'],cfg['services']['graph-member-postgres']['image'],flags)
  # Every known API request must be classified by the historical capture check.
  owners=flags['SITE_OPERATOR_USER_IDS'].split(',')
  for request in m['knownTranslationRequests']:
   found=False
   for owner in owners:
    key=list(hashlib.sha256(json.dumps(['chat-theme-translation-v1',owner.strip(),request,'submission'],separators=(',',':')).encode()).hexdigest()[:32]);key[12]='4';key[16]='8';s=''.join(key);id=s[:8]+'-'+s[8:12]+'-'+s[12:16]+'-'+s[16:20]+'-'+s[20:]
    found|=id in plan['submissionIds']
   assert found,'A known operator API receipt was not matched'
  h.private(backup/'repair-plan.json',json.dumps(plan));h.emit('backup-restore-rehearsal-ok',tables=len(tables),systemIntakes=plan['systemIntakes'],publicCredits=plan['publicationCredits'],originalsPreserved=True,repeatedUnchanged=True)
  payload=backup/'recovery.tar';key=backup/'encryption-key';verified=backup/'verify.tar';encrypted=backup/'recovery.tar.enc';wrapped=backup/'recovery-key.enc'
  with tarfile.open(payload,'w') as tar:
   for file in backup.iterdir():
    if file.name not in ['recovery.tar','rehearsal.env']:tar.add(file,arcname=file.name)
  h.private(key,secrets.token_hex(48))
  try:
   run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(payload),'-out',str(encrypted),'-pass','file:'+str(key)])
   run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(stage/'recovery-public.pem'),'-in',str(key),'-out',str(wrapped),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'])
   run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(encrypted),'-out',str(verified),'-pass','file:'+str(key)]);assert h.digest(verified)==h.digest(payload)
  finally:
   for file in [payload,key,verified]:file.unlink(missing_ok=True)
  live_plan=json.loads(run(ccomp+['run','--rm','--no-deps','knowledge-review','scripts/repair-operator-intake-privacy.ts','--plan']));assert live_plan==plan,'Live repair plan differs from restored rehearsal'
  repair_started=True;result=json.loads(run(ccomp+['run','--rm','--no-deps','knowledge-review','scripts/repair-operator-intake-privacy.ts','--apply']));assert result['submissionIds']==plan['submissionIds'] and result['originalDigest']==plan['originalDigest']
  after=f.fingerprints(sql,tables);assert all(after[k]==v for k,v in before.items() if k not in ['member_knowledge.submission_revisions','member_knowledge.publication_contributors'])
  assert f.columns(sql)==tables and ledger()==baseline and f.fingerprints(lambda q:sql(q,'plunode_knowledge75_production'),ktables)==kbefore
  h.atomic(ROOT/'compose.yaml',candidate)
  run(comp+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web',*workers]);run(comp+['exec','-T','web','node','scripts/production-readiness.mjs'])
  assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  for name,sha in prev['files'].items():assert h.digest(ROOT/name)==sha
  for name in ['graph-member-postgres','graph-neo4j']:assert run(comp+['ps','-q',name])==ids[name]
  final={'source':m['sourceCommit'],'build':m['build'],'webImage':identities['web']['manifestId'],'workerImage':m['memberOps']['tag'],'systemIntakes':plan['systemIntakes'],'wrongPublicCreditsRemoved':plan['publicationCredits'],'privateOwnersPreserved':True,'originalsAndKnowledgeUnchanged':True,'migrationsUnchanged':True,'settingsUnchanged':True,'kgUnchanged':True,'aiArtifactUnchanged':True,'backup':str(backup),'encryptedBackupSha256':h.digest(encrypted),'wrappedKeySha256':h.digest(wrapped),'formalBrowserAcceptancePending':True}
  h.private(backup/'activated.json',json.dumps(final,indent=2));h.emit('activated',**final)
  export=pathlib.Path(m['exportDirectory']);export.mkdir(mode=0o700,parents=True,exist_ok=False);owner=pwd.getpwnam('develop');os.chown(export,owner.pw_uid,owner.pw_gid)
  for file in [backup/'activated.json',backup/'repair-plan.json',encrypted,wrapped]:dest=export/file.name;shutil.copy2(file,dest);dest.chmod(0o600);os.chown(dest,owner.pw_uid,owner.pw_gid)
 except BaseException:
  if stopped:
   if repair_started:h.atomic(ROOT/'compose.yaml',candidate)
   run(comp+['up','-d','--no-deps','--pull','never','web',*workers])
  h.emit('repair-required',dataRepairStarted=repair_started,oldDumpRestored=False,automaticOldWebDowngrade=False,backup=str(backup));raise

if __name__=='__main__':main()
