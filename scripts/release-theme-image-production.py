#!/usr/bin/env python3
"""Web-only accepted theme image enlargement. No DB writes, migration or Worker/OS update."""
import copy,datetime,fcntl,importlib.util,json,os,pathlib,pwd,shutil,time
ROOT=pathlib.Path('/opt/graph-knowledge')
SOURCE='4675179e34de79b9ea5c24b68962ea869a7913bb'
def main():
 assert os.geteuid()==0;os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-theme-image-20261116-')
 spec=importlib.util.spec_from_file_location('image_checks',stage/'production_image_verification.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
 run,digest,private,atomic,emit=h.run,h.digest,h.private,h.atomic,h.emit
 lock=(ROOT/'.member-activation.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 m=json.loads((stage/'manifest.json').read_text());assert m['sourceCommit']==SOURCE and m['additionalMigrations']==[]
 prev=m['previous'];image=m['web']
 assert prev['source']=='29e2d1aac8f70e0bfbb460283b8e88a0ca4b6d05'
 comp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
 if (stage/'activated.json').is_file():
  completed=json.loads((stage/'activated.json').read_text())
  assert completed['source']==SOURCE and completed['build']==m['build']
  assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  assert json.loads(run(comp+['config','--format','json']))['services']['web']['image']==image['tag']
  emit('already-activated',**completed);return
 # Verify exact live predecessor and private settings before any mutation.
 compose_before=digest(ROOT/'compose.yaml')
 derivation=prev['composeDerivation'];prior=pathlib.Path(derivation['backup'])
 assert prior==ROOT/'backups/graph-caption-web-20261115T154718Z/compose.yaml'
 assert digest(prior)==derivation['backupSha256']==prev['files']['compose.yaml']
 assert derivation['webTag']==prev['web']['tag']
 assert (ROOT/'compose.yaml').read_text()==h.patch_image(prior.read_text(),'web',prev['web']['tag']),'Live Compose differs from the verified previous release'
 for name,value in prev['files'].items():
  if name!='compose.yaml':assert digest(ROOT/name)==value,'Live configuration changed: '+name
 comp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
 cfg=json.loads(run(comp+['config','--format','json']))
 ids={s:run(comp+['ps','-q',s]) for s in ['web','graph-member-postgres','graph-neo4j','knowledge-review','knowledge-patrol','knowledge-publisher']}
 for service,cid in ids.items():
  value=json.loads(run(['docker','inspect',cid]))[0];assert value['State']['Running'],'Service not running: '+service
  if service=='web':
   assert value['Image'] in [prev['web']['configId'],prev['web']['manifestId']]
   assert value['Config']['Image']==prev['web']['tag']
 assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==prev['build']
 assert cfg['services']['web']['environment']['MEMBER_ORIGIN']=='https://plunode.net'
 def sql(q,db='graph_member'):
  return run(['docker','exec','-i',ids['graph-member-postgres'],'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
 def ledger():return [json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration')),json.loads(sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations','plunode_knowledge75_production'))]
 baseline=ledger();assert baseline==[m['memberMigrations'],m['knowledgeMigrations']]
 translations=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'checksum',md5(row_to_json(t)::text))),'[]'::jsonb) FROM knowledge75.text_translation_revisions t",'plunode_knowledge75_production'))
 def translations_preserved():
  literal=json.dumps(translations).replace("'","''")
  return sql("SELECT coalesce(bool_and(t.id IS NOT NULL AND md5(row_to_json(t)::text)=b.checksum),true) FROM jsonb_to_recordset('"+literal+"'::jsonb) AS b(id text,revision integer,checksum text) LEFT JOIN knowledge75.text_translation_revisions t USING(id,revision)",'plunode_knowledge75_production')=='t'
 archive=stage/m['archive']['file'];assert digest(archive)==m['archive']['sha256']
 identity=h.archive_identities(archive,m)['web'];run(['docker','load','--input',str(archive)])
 value=json.loads(run(['docker','image','inspect',image['tag']]))[0]
 loaded=h.verify_loaded_image(value,identity,json.loads(run(['docker','info','--format','{{json .DriverStatus}}'])),SOURCE)
 assert run(['docker','run','--rm','--entrypoint','cat',image['tag'],'/app/.next-public/BUILD_ID'])==m['build']
 artifact=run(comp+['exec','-T','web','sha256sum','/app/data/ai-lab/initial.json']).split()[0]
 assert artifact==prev['aiArtifactSha256']
 assert run(['docker','run','--rm','--entrypoint','sha256sum',image['tag'],'/app/data/ai-lab/initial.json']).split()[0]==artifact
 original=(ROOT/'compose.yaml').read_text();candidate=h.patch_image(original,'web',image['tag'])
 cp=ROOT/'compose.theme-image-candidate.yaml';private(cp,candidate)
 expected=copy.deepcopy(cfg);expected['services']['web']['image']=image['tag']
 ccomp=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(cp),'--profile','member','--profile','ops']
 assert json.loads(run(ccomp+['config','--format','json']))==expected,'Change exceeds Web image'
 backup=ROOT/'backups'/('theme-image-web-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
 for name in ['compose.yaml','app.env','knowledge.env']:
  shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
 shutil.copy2(stage/'manifest.json',backup/'manifest.json')
 assert digest(ROOT/'compose.yaml')==compose_before,'Compose changed during preflight'
 emit('preflight-ok',previousComposeSha256=compose_before,source=SOURCE,build=m['build'],webImage=loaded,additionalMigrations=[],backup=str(backup))
 try:
  atomic(ROOT/'compose.yaml',candidate)
  run(comp+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web'])
  run(comp+['exec','-T','web','node','scripts/production-readiness.mjs'])
  assert run(comp+['exec','-T','web','cat','/app/.next-public/BUILD_ID'])==m['build']
  assert json.loads(run(comp+['config','--format','json']))==expected and ledger()==baseline
  assert translations_preserved(),'Existing translation revision changed; inspect before completing'
  for s,cid in ids.items():
   if s!='web':assert run(comp+['ps','-q',s])==cid,'Unrelated service changed: '+s
  for name,sha in prev['files'].items():
   if name!='compose.yaml':assert digest(ROOT/name)==sha
  result={'source':SOURCE,'build':m['build'],'webImage':loaded,'backup':str(backup),'memberLedgerCount':len(baseline[0]),'knowledgeLedgerCount':len(baseline[1]),'migrationsUnchanged':True,'workersUnchanged':True,'settingsUnchanged':True,'kgUnchanged':True,'aiArtifactUnchanged':True,'databaseRestored':False,'existingTranslationRevisionsPreserved':len(translations), 'formalBrowserAcceptancePending':True}
  private(backup/'activated.json',json.dumps(result,indent=2));private(stage/'activated.json',json.dumps(result,indent=2));emit('activated',**result)
  export=pathlib.Path('/home/develop/plunode-theme-image-20261116')/('release-'+SOURCE[:8])/'activated.json'
  private(export,json.dumps(result,indent=2));owner=pwd.getpwnam('develop');os.chown(export,owner.pw_uid,owner.pw_gid)
 except BaseException:
  # This update changes only theme image presentation. Restore only
  # the compatible predecessor Web, never a DB dump or unrelated service.
  assert ledger()==baseline,'Inspect schema before recovery'
  atomic(ROOT/'compose.yaml',original);run(comp+['up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web'])
  emit('compatible-web-restored',databaseRestored=False,backup=str(backup));raise
if __name__=='__main__':main()
