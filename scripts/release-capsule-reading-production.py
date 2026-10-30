#!/usr/bin/env python3
"""Capsule reading refinement: fixed assets, additive 018/019, Web/member-ops only.

Run from the root-private, checksum-verified staging directory. Never imports KG,
changes runtime settings, resets production data, or rolls back a migrated DB.
"""
import copy, datetime, fcntl, hashlib, json, os, pathlib, pwd, re, shutil, subprocess, tarfile
ROOT = pathlib.Path('/opt/graph-knowledge')
EXPORT = pathlib.Path('/home/develop/capsule-comments-final-20261031')
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

def archive_identities(path, manifest):
    """Bind both store IDs to the exact config and layer bytes in one pass."""
    metadata = {}; seen = set()
    with tarfile.open(path, 'r|gz') as archive:
        for member in archive:
            if not member.isfile(): continue
            name = member.name
            assert name not in seen, 'Duplicate archive member'
            seen.add(name)
            if name.startswith('blobs/sha256/'):
                h = hashlib.sha256(); chunks = []
                stream = archive.extractfile(member)
                while data := stream.read(1024*1024):
                    h.update(data)
                    if member.size <= 65536: chunks.append(data)
                assert name == 'blobs/sha256/'+h.hexdigest(), 'Archive blob bytes differ'
                if chunks:
                    try: metadata[name] = json.loads(b''.join(chunks))
                    except (ValueError, UnicodeDecodeError): pass
            elif name in ('index.json', 'manifest.json'):
                metadata[name] = json.load(archive.extractfile(member))
    rows = metadata['manifest.json']; index = metadata['index.json']
    identities = {}
    for key in ('web', 'memberOps'):
        entry = manifest[key]
        matching = [r for r in rows if entry['tag'] in (r.get('RepoTags') or [])]
        descriptors = [d for d in index['manifests'] if d.get('annotations', {}).get('io.containerd.image.name') == 'docker.io/library/'+entry['tag']]
        assert len(matching) == len(descriptors) == 1, 'Ambiguous archive tag'
        row, descriptor = matching[0], descriptors[0]
        assert descriptor['mediaType'] == 'application/vnd.oci.image.manifest.v1+json'
        config_path = 'blobs/sha256/'+entry['imageId'].split(':')[1]
        config = metadata[config_path]
        image = metadata['blobs/sha256/'+descriptor['digest'].split(':')[1]]
        assert row['Config'] == config_path and image['config']['digest'] == entry['imageId'], 'Manifest/config binding differs'
        assert config['os'] == 'linux' and config['architecture'] == 'amd64'
        assert config['config']['Labels']['org.opencontainers.image.revision'] == manifest['sourceCommit']
        layers = [layer['digest'] for layer in image['layers']]
        assert all(layer['mediaType'] == 'application/vnd.oci.image.layer.v1.tar' for layer in image['layers'])
        assert layers == config['rootfs']['diff_ids'], 'Layer/config binding differs'
        assert row['Layers'] == ['blobs/sha256/'+v.split(':')[1] for v in layers]
        assert all(name in seen for name in row['Layers']), 'Missing archive layer'
        identities[key] = {'configId':entry['imageId'], 'manifestId':descriptor['digest'], 'diffIds':layers}
    return identities

def verify_loaded_image(image, identity, driver_status, source):
    drivers = [value for key, value in driver_status if key == 'driver-type']
    assert drivers in ([], ['io.containerd.snapshotter.v1']), 'Unknown image store'
    expected = identity['manifestId'] if drivers else identity['configId']
    assert image['Id'] == expected, 'Loaded image differs from verified archive'
    assert image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    assert image['RootFS']['Layers'] == identity['diffIds'], 'Loaded layers differ'
    assert image['Config']['Labels']['org.opencontainers.image.revision'] == source
    return expected

def main():
    assert os.geteuid()==0, 'Use the existing administrator sudo'
    os.umask(0o077)
    stage=pathlib.Path.cwd().resolve()
    assert str(stage)== '/root/capsule-comments-final-20261031', 'Root-private staging required'
    manifest=json.loads((stage/'manifest.json').read_text())
    previous=json.loads((stage/'predecessor-audit.json').read_text())
    baseline=json.loads(run(['python3','-I',str(stage/'audit.py')]))
    expected_images=dict(previous['images'])
    expected_images.update({'web':'graph-knowledge-web:google-official-5ed458cc','member-ops':'graph-knowledge-ops:google-official-5ed458cc'})
    assert baseline['images']==expected_images and baseline['envSha256']==previous['envSha256'], 'Predecessor configuration changed'
    assert baseline['buildId']=='2ot-o4qNUifoDe2J2Pk_s', 'Unexpected predecessor build'
    assert baseline['containers']['web']['image']=='sha256:8eb1703208fe5451ea517ccdd66a134f97cb5955152fd9c46343ed86336a1917'
    assert baseline['dataset']==previous['dataset']
    for name in ('graph-member-postgres','graph-neo4j'):
        assert baseline['containers'][name]==previous['containers'][name], 'Database container changed'
    private(stage/'audit-result.json',json.dumps(baseline))
    assert manifest['sourceCommit']=='d1330ea8d5917f8c31d239fe7058c2380c554a2d'
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
    assert old_ledger=={k:v for k,v in manifest['migrations'].items() if k<'018'}, 'Unexpected migration baseline'
    def columns(db='graph_member'):
        return json.loads(sql("SELECT json_object_agg(table_name,cols) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t",db))
    def ident(s):return '"'+s.replace('"','""')+'"'
    def fingerprints(schema,db='graph_member',old=False):
        result={}
        for table,fields in schema.items():
            where=" WHERE name<'018'" if old and table=='member_migration' else ''
            q="SELECT count(*)||':'||md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),'')) FROM (SELECT "+','.join(map(ident,fields))+' FROM '+ident(table)+where+') x'
            result[table]=sql(q,db)
        return result
    def preserved(schema,db='graph_member'):
        return fingerprints(schema,db,True)
    def public(path):return run(['curl','--fail','--silent','--show-error','--max-time','30','http://127.0.0.1:3200'+path])
    assert json.loads(public('/api/dataset'))==baseline['dataset']
    lab_before=public('/api/ai-lab')
    assert shutil.disk_usage(ROOT).free>5*1024**3, 'Insufficient backup/image space'
    assert not any('member-ops' in n for n in run(['docker','ps','--format','{{.Names}}']).splitlines()), 'Another member operator is active'
    original=(ROOT/'compose.yaml').read_text()
    candidate=patch_image(patch_image(original,'web',manifest['web']['tag']),'member-ops',manifest['memberOps']['tag'])
    candidate_path=ROOT/'compose.capsule-reading-candidate.yaml';private(candidate_path,candidate)
    cdc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(candidate_path),'--profile','member','--profile','ops']
    expected=copy.deepcopy(cfg)
    expected['services']['web']['image']=manifest['web']['tag'];expected['services']['member-ops']['image']=manifest['memberOps']['tag']
    assert json.loads(run(cdc+['config','--format','json']))==expected, 'Patch exceeds image-only scope'
    identities=archive_identities(stage/'images.tar.gz',manifest)
    run(['docker','load','--input',str(stage/'images.tar.gz')])
    driver_status=json.loads(run(['docker','info','--format','{{json .DriverStatus}}']))
    loaded={}
    for key in ('web','memberOps'):
        image=json.loads(run(['docker','image','inspect',manifest[key]['tag']]))[0]
        emit('image-identity',kind=key,observed=image['Id'],configId=identities[key]['configId'],manifestId=identities[key]['manifestId'])
        loaded[key]=verify_loaded_image(image,identities[key],driver_status,manifest['sourceCommit'])
    assert run(['docker','run','--rm','--entrypoint','cat',manifest['web']['tag'],'/app/.next-public/BUILD_ID'])==manifest['build']
    # The current deployment has no artifact mount. Do not replace its fallback
    # public artifact with a different source copy or an experimental beta file.
    assert not env.get('AI_LAB_ARTIFACT_DIRECTORY'), 'Inspect the active artifact mount before continuing'
    artifact=run(['docker','exec',web['Id'],'sha256sum','/app/data/ai-lab/initial.json']).split()[0]
    assert run(['docker','run','--rm','--entrypoint','sha256sum',manifest['web']['tag'],'/app/data/ai-lab/initial.json']).split()[0]==artifact, 'Existing AI artifact differs; preserve before switching'
    emit('preflight-ok',source=manifest['sourceCommit'],build=manifest['build'],additionalMigrations=[k for k in manifest['migrations'] if k not in old_ledger])
    backup=ROOT/'backups'/('capsule-reading-release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700,parents=True,exist_ok=False)
    for name in ['app.env','compose.yaml']:shutil.copy2(ROOT/name,backup/name);(backup/name).chmod(0o600)
    shutil.copy2(stage/'manifest.json',backup/'manifest.json')
    stopped=False;attempted=False
    try:
        compose('stop','-t','30','web');stopped=True
        schema=columns();before=fingerprints(schema)
        preserved_before=before
        private(backup/'before.json',json.dumps({'schema':schema,'fingerprints':before,'ledger':old_ledger}))
        dump=backup/'member-before018.dump'
        with dump.open('wb') as f:run(['docker','exec',pg['Id'],'pg_dump','-U','postgres','-d','graph_member','-Fc','--no-owner','--no-acl'],output=f)
        restore='graph_member_restore_capsule_reading_'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
        sql('CREATE DATABASE '+ident(restore)+' OWNER gk_member TEMPLATE template0; REVOKE CONNECT ON DATABASE '+ident(restore)+' FROM PUBLIC;')
        run(['docker','exec','-i',pg['Id'],'pg_restore','-U','postgres','-d',restore,'--no-owner','--role=gk_member','--no-acl','--exit-on-error'],dump.read_bytes())
        assert columns(restore)==schema and fingerprints(schema,restore)==before and ledger(restore)==old_ledger, 'Separate restore differs'
        # Exercise the same migration function against the restored DB only.
        js="import pg from 'pg';import {migrateMemberDatabase} from './lib/server/member/migrate.ts';const u=new URL(process.env.MEMBER_DATABASE_URL);u.pathname='/"+restore+"';const p=new pg.Pool({connectionString:u.href});try{await migrateMemberDatabase(p,true,true,true,true,true,true,true,true,true,true,true,true);}finally{await p.end();}"
        rehearsal=cdc+['run','--rm','--no-deps','--entrypoint','node','member-ops','--import','tsx','--input-type=module','-e',js]
        run(rehearsal);assert ledger(restore)==manifest['migrations'] and preserved(schema,restore)==preserved_before
        migrated_schema=columns(restore);migrated_rows=fingerprints(migrated_schema,restore);run(rehearsal)
        assert fingerprints(migrated_schema,restore)==migrated_rows, 'Repeat changed restored rows'
        assert sql('SELECT count(*) FROM member_capsule WHERE trashed_at IS NOT NULL',restore)=='0'
        sql('DROP DATABASE '+ident(restore))
        private(backup/'restore.json',json.dumps({'allOldRowsEqual':True,'tables':len(schema),'migrations':len(manifest['migrations']),'repeatedUnchanged':True,'dumpSha256':digest(dump),'separateDatabase':restore}))
        # Encrypted export; recovery private key remains on the development PC.
        payload=backup/'recovery.tar'
        with tarfile.open(payload,'w') as tar:
            for name in ['app.env','compose.yaml','manifest.json','before.json','restore.json','member-before018.dump']:tar.add(backup/name,arcname=name)
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
        migration=cdc+['run','--rm','--no-deps','--entrypoint','node','member-ops','--import','tsx','scripts/member-migrate.ts','--communities','--site-operations','--public-profiles','--capsule-documents','--community-capsules','--capsule-comments','--capsule-share-recovery','--capsule-publications','--google-profile-images','--official-profiles','--capsule-trash','--capsule-post-reports','--confirm-origin',ORIGIN]
        attempted=True;run(migration)
        assert ledger()==manifest['migrations'] and preserved(schema)==preserved_before, 'Migration changed old records'
        current_schema=columns();current_rows=fingerprints(current_schema);run(migration)
        assert fingerprints(current_schema)==current_rows, 'Live repeat changed rows'
        emit('migration-ok',ledgerCount=len(manifest['migrations']),oldRowsPreserved=True,repeatedUnchanged=True)
        assert sql('SELECT count(*) FROM member_capsule WHERE trashed_at IS NOT NULL')=='0'
        atomic(ROOT/'compose.yaml',candidate)
        compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web');stopped=False
        now=inspect('web');assert now['Image']==loaded['web']
        assert run(['docker','exec',now['Id'],'cat','/app/.next-public/BUILD_ID'])==manifest['build']
        compose('exec','-T','web','node','scripts/production-readiness.mjs')
        assert digest(ROOT/'app.env')==baseline['envSha256']
        assert json.loads(compose('config','--format','json'))==expected
        for name,d in [('graph-member-postgres',pg),('graph-neo4j',neo)]:
            after=inspect(name);assert after['Id']==d['Id'] and after['State']['StartedAt']==d['State']['StartedAt'], 'Database runtime changed'
        assert json.loads(public('/api/dataset'))==baseline['dataset'] and public('/api/ai-lab')==lab_before
        emit('activated',source=manifest['sourceCommit'],build=manifest['build'],webImage=now['Image'],memberOpsImage=loaded['memberOps'],kgUnchanged=True,aiArtifactUnchanged=True,settingsUnchanged=True)
    except Exception:
        if stopped and not attempted:
            compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','web')
            emit('aborted-before-live-migration',originalWebRestored=True)
        else:emit('inspect-before-recovery',migrationAttempted=attempted,webStopped=stopped,databaseRestored=False)
        raise

if __name__=='__main__': main()
