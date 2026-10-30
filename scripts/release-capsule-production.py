#!/usr/bin/env python3
"""Issue 63: fixed assets + inspected baseline, existing Web/member-ops only.

Run from the root-private, checksum-verified staging directory. Never imports KG,
changes runtime settings, resets production data, or rolls back a migrated DB.
"""
import copy, datetime, fcntl, hashlib, json, os, pathlib, pwd, re, shutil, subprocess, tarfile
ROOT = pathlib.Path('/opt/graph-knowledge')
EXPORT = pathlib.Path('/home/develop/capsule-production-20261030')
ORIGIN = 'https://plunode.net'

def run(args, data=None, output=None):
    p = subprocess.run(args, input=data, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode: raise RuntimeError('Protected command failed: ' + args[0])
    return p.stdout.decode().strip() if p.stdout is not None else ''

def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()

def emit(event, **values):
    print(json.dumps({'event':event, **values}, ensure_ascii=False), flush=True)

def private(p, value):
    with open(p, 'w') as f: f.write(value)
    p.chmod(0o600)

def atomic(p, value):
    t = p.with_name(p.name+'.capsule.tmp'); private(t, value); os.replace(t,p)

def patch_image(text, service, image):
    if not re.fullmatch(r'[a-zA-Z0-9:._/-]+', image): raise ValueError('Invalid image reference')
    m = re.search(r'^  '+re.escape(service)+r':\s*\n',text,re.M)
    assert m, 'Expected service missing'
    end = re.search(r'^(?:  [\w-]+:|[^\s#])',text[m.end():],re.M)
    stop = m.end()+end.start() if end else len(text)
    block, n = re.subn(r'^    image:.*$', '    image: "'+image+'"', text[m.start():stop], flags=re.M)
    assert n==1, 'Expected one image per service'
    return text[:m.start()]+block+text[stop:]

def main():
    assert os.geteuid()==0, 'Use the existing administrator sudo'
    os.umask(0o077)
    stage=pathlib.Path.cwd().resolve()
    assert str(stage).startswith('/root/capsule-production-'), 'Root-private staging required'
    manifest=json.loads((stage/'manifest.json').read_text()); baseline=json.loads((stage/'audit-result.json').read_text())
    assert manifest['sourceCommit']=='20e5c84a99dd1e1bfa8fb69779729e68a914bb14'
    assert digest(stage/'images.tar.gz')==manifest['archive']['sha256'], 'Archive differs'
    lock=open(ROOT/'.member-activation.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    assert digest(ROOT/'compose.yaml')==baseline['composeSha256'] and digest(ROOT/'app.env')==baseline['envSha256'], 'Configuration changed since inspection'
    dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
    def compose(*args):return run(dc+list(args))
    def inspect(service):
        cid=compose('ps','-q',service);assert cid, 'Expected running service missing'
        return json.loads(run(['docker','inspect',cid]))[0]
    web=inspect('web'); pg=inspect('graph-member-postgres'); neo=inspect('graph-neo4j')
    for name,d in [('web',web),('graph-member-postgres',pg),('graph-neo4j',neo)]:
        assert d['Id']==baseline['containers'][name]['id'] and d['Image']==baseline['containers'][name]['image'], 'Container changed since inspection'
    assert run(['docker','exec',web['Id'],'cat','/app/.next-public/BUILD_ID'])==baseline['buildId']
    cfg=json.loads(compose('config','--format','json'))
    assert {k:v.get('image') for k,v in cfg['services'].items()}==baseline['images']
    env=cfg['services']['web']['environment']
    assert env['MEMBER_ORIGIN']==ORIGIN and env['MEMBER_AUTH_PROVIDER']=='google' and env['MEMBER_STORAGE_ENABLED']=='1'
    assert env['GRAPH_DATASET']=='public-kg' and env['GRAPH_DEPLOYMENT']=='production'
    assert not env.get('MEMBER_FIXTURE_ENABLED') or env['MEMBER_FIXTURE_ENABLED']=='0'
    def sql(q,db='graph_member'):
        return run(['docker','exec','-i',pg['Id'],'psql','-X','-At','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],q.encode())
    def ledger(db='graph_member'):return json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration',db))
    old_ledger={x['name']:x['checksum'] for x in baseline['migrations']}
    assert ledger()==old_ledger
    assert old_ledger=={k:v for k,v in manifest['migrations'].items() if k<'011'}, 'Unexpected migration baseline'
    def columns(db='graph_member'):
        return json.loads(sql("SELECT json_object_agg(table_name,cols) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t",db))
    def ident(s):return '"'+s.replace('"','""')+'"'
    def fingerprints(schema,db='graph_member',old=False):
        result={}
        for table,fields in schema.items():
            where=" WHERE name<'011'" if old and table=='member_migration' else ''
            q="SELECT count(*)||':'||md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),'')) FROM (SELECT "+','.join(map(ident,fields))+' FROM '+ident(table)+where+') x'
            result[table]=sql(q,db)
        return result
    def public(path):return run(['curl','--fail','--silent','--show-error','--max-time','30','http://127.0.0.1:3200'+path])
    assert json.loads(public('/api/dataset'))==baseline['dataset']
    lab_before=public('/api/ai-lab')
    assert shutil.disk_usage(ROOT).free>5*1024**3, 'Insufficient backup/image space'
    assert not any('member-ops' in n for n in run(['docker','ps','--format','{{.Names}}']).splitlines()), 'Another member operator is active'
    original=(ROOT/'compose.yaml').read_text()
    candidate=patch_image(patch_image(original,'web',manifest['web']['tag']),'member-ops',manifest['memberOps']['tag'])
    candidate_path=ROOT/'compose.capsule-candidate.yaml';private(candidate_path,candidate)
    cdc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(candidate_path),'--profile','member','--profile','ops']
    expected=copy.deepcopy(cfg)
    expected['services']['web']['image']=manifest['web']['tag'];expected['services']['member-ops']['image']=manifest['memberOps']['tag']
    assert json.loads(run(cdc+['config','--format','json']))==expected, 'Patch exceeds image-only scope'
    run(['docker','load','--input',str(stage/'images.tar.gz')])
    for entry in [manifest['web'],manifest['memberOps']]:
        image=json.loads(run(['docker','image','inspect',entry['tag']]))[0]
        assert image['Id']==entry['imageId'] and image['Os']=='linux' and image['Architecture']=='amd64', 'Loaded image differs'
        assert image['Config']['Labels']['org.opencontainers.image.revision']==manifest['sourceCommit']
    assert run(['docker','run','--rm','--entrypoint','cat',manifest['web']['tag'],'/app/.next-public/BUILD_ID'])==manifest['build']
    # The current deployment has no artifact mount. Do not replace its fallback
    # public artifact with a different source copy or an experimental beta file.
    assert not env.get('AI_LAB_ARTIFACT_DIRECTORY'), 'Inspect the active artifact mount before continuing'
    artifact=run(['docker','exec',web['Id'],'sha256sum','/app/data/ai-lab/initial.json']).split()[0]
    assert run(['docker','run','--rm','--entrypoint','sha256sum',manifest['web']['tag'],'/app/data/ai-lab/initial.json']).split()[0]==artifact, 'Existing AI artifact differs; preserve before switching'
    emit('preflight-ok',source=manifest['sourceCommit'],build=manifest['build'],additionalMigrations=[k for k in manifest['migrations'] if k not in old_ledger])
    backup=ROOT/'backups'/('capsule-release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700,parents=True,exist_ok=False)
    for name in ['app.env','compose.yaml']:shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
    shutil.copy2(stage/'manifest.json',backup/'manifest.json')
    stopped=False;attempted=False
    try:
        compose('stop','-t','30','web');stopped=True
        schema=columns();before=fingerprints(schema)
        private(backup/'before.json',json.dumps({'schema':schema,'fingerprints':before,'ledger':old_ledger}))
        dump=backup/'member-before-capsule.dump'
        with dump.open('wb') as f:run(['docker','exec',pg['Id'],'pg_dump','-U','postgres','-d','graph_member','-Fc','--no-owner','--no-acl'],output=f)
        restore='graph_member_restore_capsule_'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
        sql('CREATE DATABASE '+ident(restore)+' OWNER gk_member TEMPLATE template0; REVOKE CONNECT ON DATABASE '+ident(restore)+' FROM PUBLIC;')
        run(['docker','exec','-i',pg['Id'],'pg_restore','-U','postgres','-d',restore,'--no-owner','--role=gk_member','--no-acl','--exit-on-error'],dump.read_bytes())
        assert columns(restore)==schema and fingerprints(schema,restore)==before and ledger(restore)==old_ledger, 'Separate restore differs'
        # Exercise the same migration function against the restored DB only.
        js="import pg from 'pg';import {migrateMemberDatabase} from './lib/server/member/migrate.ts';const u=new URL(process.env.MEMBER_DATABASE_URL);u.pathname='/"+restore+"';const p=new pg.Pool({connectionString:u.href});try{await migrateMemberDatabase(p,true,true,true,true,true,true,true,true);}finally{await p.end();}"
        rehearsal=cdc+['run','--rm','--no-deps','--entrypoint','node','member-ops','--import','tsx','--input-type=module','-e',js]
        run(rehearsal);assert ledger(restore)==manifest['migrations'] and fingerprints(schema,restore,True)==before
        migrated_schema=columns(restore);migrated_rows=fingerprints(migrated_schema,restore);run(rehearsal)
        assert fingerprints(migrated_schema,restore)==migrated_rows, 'Repeat changed restored rows'
        sql('DROP DATABASE '+ident(restore))
        private(backup/'restore.json',json.dumps({'allOldRowsEqual':True,'tables':len(schema),'migrations':len(manifest['migrations']),'repeatedUnchanged':True,'dumpSha256':digest(dump),'separateDatabase':restore}))
        # Encrypted export; recovery private key remains on the development PC.
        payload=backup/'recovery.tar'
        with tarfile.open(payload,'w') as tar:
            for name in ['app.env','compose.yaml','manifest.json','before.json','restore.json','member-before-capsule.dump']:tar.add(backup/name,arcname=name)
        key=backup/'encryption-key';private(key,os.urandom(48).hex())
        encrypted=backup/'recovery.tar.enc';wrapped=backup/'recovery-key.enc';verified=backup/'recovery.verify.tar'
        run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(payload),'-out',str(encrypted),'-pass','file:'+str(key)])
        run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(stage/'recovery-public.pem'),'-in',str(key),'-out',str(wrapped),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'])
        run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(encrypted),'-out',str(verified),'-pass','file:'+str(key)])
        assert digest(payload)==digest(verified)
        for file in [payload,verified,key]:file.unlink()
        export=EXPORT/'backup-export';export.mkdir(mode=0o700,exist_ok=False);owner=pwd.getpwnam('develop');os.chown(export,owner.pw_uid,owner.pw_gid)
        for f in [encrypted,wrapped]:
            target=export/f.name;shutil.copy2(f,target);target.chmod(0o600);os.chown(target,owner.pw_uid,owner.pw_gid)
        emit('backup-restore-rehearsal-ok',directory=str(backup),tables=len(schema),dumpSha256=digest(dump))
        migration=cdc+['run','--rm','--no-deps','--entrypoint','node','member-ops','--import','tsx','scripts/member-migrate.ts','--communities','--site-operations','--public-profiles','--capsule-documents','--community-capsules','--capsule-comments','--capsule-share-recovery','--capsule-publications','--confirm-origin',ORIGIN]
        attempted=True;run(migration)
        assert ledger()==manifest['migrations'] and fingerprints(schema,old=True)==before, 'Migration changed old records'
        current_schema=columns();current_rows=fingerprints(current_schema);run(migration)
        assert fingerprints(current_schema)==current_rows, 'Live repeat changed rows'
        emit('migration-ok',ledgerCount=len(manifest['migrations']),oldRowsPreserved=True,repeatedUnchanged=True)
        atomic(ROOT/'compose.yaml',candidate)
        compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web');stopped=False
        now=inspect('web');assert now['Image']==manifest['web']['imageId']
        assert run(['docker','exec',now['Id'],'cat','/app/.next-public/BUILD_ID'])==manifest['build']
        compose('exec','-T','web','node','scripts/production-readiness.mjs')
        assert digest(ROOT/'app.env')==baseline['envSha256']
        assert json.loads(compose('config','--format','json'))==expected
        for name,d in [('graph-member-postgres',pg),('graph-neo4j',neo)]:
            after=inspect(name);assert after['Id']==d['Id'] and after['State']['StartedAt']==d['State']['StartedAt'], 'Database runtime changed'
        assert json.loads(public('/api/dataset'))==baseline['dataset'] and public('/api/ai-lab')==lab_before
        emit('activated',source=manifest['sourceCommit'],build=manifest['build'],webImage=now['Image'],memberOpsImage=manifest['memberOps']['imageId'],kgUnchanged=True,aiArtifactUnchanged=True,settingsUnchanged=True)
    except Exception:
        if stopped and not attempted:
            compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web')
            emit('aborted-before-live-migration',originalWebRestored=True)
        else:emit('inspect-before-recovery',migrationAttempted=attempted,webStopped=stopped,databaseRestored=False)
        raise

if __name__=='__main__': main()
