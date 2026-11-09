#!/usr/bin/env python3
"""Timeline prose translation targets. Update Web and schema-compatible knowledge Workers; no DB migration or OS change."""
import copy,datetime,fcntl,importlib.util,json,os,pathlib,pwd,shutil,time
ROOT=pathlib.Path('/opt/graph-knowledge')
SOURCE='a5b82aae26e9d9f200b8e6b311a4a949bc81d973'
def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-timeline-text-20261109-')
 spec=importlib.util.spec_from_file_location('image_checks',stage/'production_image_verification.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
 run,digest,private,atomic,emit=h.run,h.digest,h.private,h.atomic,h.emit
 lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 m=json.loads((stage/'manifest.json').read_text());assert m['sourceCommit']==SOURCE and m['additionalMigrations']==[]
 prev=m['previous'];image=m['web']
 assert prev['source']=='7e0030a6fb8cbfa8d8ccdaffda41717357428ba9'
 # Capture and preserve the live Compose; the predecessor image/build and both
 # private environment files are independently pinned before any update.
 compose_before=digest(ROOT/'compose.yaml')
 for name,value in prev['files'].items():assert digest(ROOT/name)==value,'Live configuration changed: '+name
 comp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
 cfg=json.loads(run(comp+['config','--format','json']))
 ids={s:run(comp+['ps','-q',s]) for s in ['web','graph-member-postgres','graph-neo4j','knowledge-review','knowledge-patrol','knowledge-publisher']}
 for service,cid in ids.items():
  value=json.loads(run(['docker','inspect',cid]))[0];assert value['State']['Running'],'Service not running: '+service
  if service=='web':
   assert value['Image'] in [prev['web']['configId'],prev['web']['manifestId']]
   assert value['Config']['Image']==prev['web']['tag']
  if service.startswith('knowledge-'):assert value['Image'] in [prev['ops']['configId'],prev['ops']['manifestId']]
 assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==prev['build']
 assert cfg['services']['web']['environment']['MEMBER_ORIGIN']=='https://plunode.net'
 def sql(q,db='graph_member'):
  return run(['docker','exec','-i',ids['graph-member-postgres'],'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
 def ledger():return [json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration')),json.loads(sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations','plunode_knowledge75_production'))]
 baseline=ledger();assert baseline==[m['memberMigrations'],m['knowledgeMigrations']]
 archive=stage/m['archive']['file'];assert digest(archive)==m['archive']['sha256']
 identities=h.archive_identities(archive,m);identity=identities['web'];run(['docker','load','--input',str(archive)])
 value=json.loads(run(['docker','image','inspect',image['tag']]))[0]
 loaded=h.verify_loaded_image(value,identity,json.loads(run(['docker','info','--format','{{json .DriverStatus}}'])),SOURCE)
 ops=m['memberOps'];ops_value=json.loads(run(['docker','image','inspect',ops['tag']]))[0]
 h.verify_loaded_image(ops_value,identities['memberOps'],json.loads(run(['docker','info','--format','{{json .DriverStatus}}'])),SOURCE)
 assert run(['docker','run','--rm','--entrypoint','cat',image['tag'],'/app/.next-public/BUILD_ID'])==m['build']
 artifact=run(comp+['exec','-T','web','sha256sum','/app/data/ai-lab/initial.json']).split()[0]
 assert artifact==prev['aiArtifactSha256']
 assert run(['docker','run','--rm','--entrypoint','sha256sum',image['tag'],'/app/data/ai-lab/initial.json']).split()[0]==artifact
 original=(ROOT/'compose.yaml').read_text();candidate=h.patch_image(original,'web',image['tag']);assert prev['ops']['tag'] in candidate;candidate=candidate.replace(prev['ops']['tag'],ops['tag'])
 cp=ROOT/'compose.timeline-text-candidate.yaml';private(cp,candidate)
 expected=copy.deepcopy(cfg);expected['services']['web']['image']=image['tag']
 changed_ops=[name for name,service in expected['services'].items() if service.get('image')==prev['ops']['tag']]
 assert set(changed_ops)=={'knowledge-ops','knowledge-review','knowledge-patrol','knowledge-publisher'}
 for name in changed_ops:expected['services'][name]['image']=ops['tag']
 ccomp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(cp),'--profile','member','--profile','ops']
 assert json.loads(run(ccomp+['config','--format','json']))==expected,'Change exceeds Web and knowledge Worker images'
 backup=ROOT/'backups'/('timeline-text-runtime-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
 for name in ['compose.yaml','app.env','knowledge.env']:
  shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
 shutil.copy2(stage/'manifest.json',backup/'manifest.json')
 assert digest(ROOT/'compose.yaml')==compose_before,'Compose changed during preflight'
 emit('preflight-ok',previousComposeSha256=compose_before,source=SOURCE,build=m['build'],webImage=loaded,additionalMigrations=[],backup=str(backup))
 try:
  run(comp+['stop','-t','60','web','knowledge-review','knowledge-patrol','knowledge-publisher'])
  atomic(ROOT/'compose.yaml',candidate)
  run(comp+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web','knowledge-review','knowledge-patrol','knowledge-publisher'])
  run(comp+['exec','-T','web','node','scripts/production-readiness.mjs'])
  assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  assert json.loads(run(comp+['config','--format','json']))==expected and ledger()==baseline
  for worker in ['knowledge-review','knowledge-patrol','knowledge-publisher']:
   cid=run(comp+['ps','-q',worker]);state=json.loads(run(['docker','inspect',cid]))[0]
   assert state['State']['Running'] and state['Config']['Image']==ops['tag']
  for s,cid in ids.items():
   if s not in ['web','knowledge-review','knowledge-patrol','knowledge-publisher']:assert run(comp+['ps','-q',s])==cid,'Unrelated service changed: '+s
  for name,sha in prev['files'].items():
   if name!='compose.yaml':assert digest(ROOT/name)==sha
  result={'source':SOURCE,'build':m['build'],'webImage':loaded,'backup':str(backup),'memberLedgerCount':len(baseline[0]),'knowledgeLedgerCount':len(baseline[1]),'migrationsUnchanged':True,'workerImage':ops['tag'],'workersUpdated':True,'settingsUnchanged':True,'kgUnchanged':True,'aiArtifactUnchanged':True,'databaseRestored':False,'formalBrowserAcceptancePending':True}
  private(backup/'activated.json',json.dumps(result,indent=2));emit('activated',**result)
  export=pathlib.Path('/home/develop/plunode-timeline-text-20261109')/('release-'+SOURCE[:8])/'activated.json'
  private(export,json.dumps(result,indent=2));owner=pwd.getpwnam('develop');os.chown(export,owner.pw_uid,owner.pw_gid)
 except BaseException:
  # New translation target JSON is durable. Do not downgrade to binaries that
  # cannot read it, or overwrite the live database with an older dump.
  run(comp+['up','-d','--no-deps','--pull','never','web','knowledge-review','knowledge-patrol','knowledge-publisher'])
  emit('forward-repair-required',databaseRestored=False,automaticOldWebDowngrade=False,backup=str(backup));raise
if __name__=='__main__':main()
