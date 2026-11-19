#!/usr/bin/env python3
"""Switch the verified production Web and knowledge workers to storage migration 012."""
import copy
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from production_image_verification import archive_identities, atomic, digest, emit, patch_image, private, verify_loaded_image

ROOT = Path('/opt/graph-knowledge')
SOURCE = '977903e7'
DB = 'plunode_knowledge75_production'
MIGRATION = '012-publication-storage.sql'
WORKERS = ('knowledge-publisher', 'knowledge-review', 'knowledge-patrol')
CHANGED = ('web', 'member-ops', 'knowledge-ops', *WORKERS)
RUNNING = ('web', *WORKERS)
BLOCKED_ENV = ('KNOWLEDGE_PUBLICATION_RETENTION_HOURS', 'KNOWLEDGE_INVENTORY_RETENTION_DAYS')
PROBE = r"""
const http=require('node:http'), crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const get=(path)=>new Promise((resolve,reject)=>{
 const r=http.get({host:'127.0.0.1',port:3000,path,headers:{host:'plunode.net'}},p=>{
  let body='';p.setEncoding('utf8');p.on('data',c=>body+=c);p.on('error',reject);p.on('end',()=>{
   try{if(p.statusCode!==200)throw Error(path.split('&')[0]+' HTTP '+p.statusCode);resolve(JSON.parse(body));}catch(e){reject(e);}
  });
 });
 r.setTimeout(25000,()=>r.destroy(Error('Public read timed out')));r.on('error',reject);
});
const pub=q=>get('/api/knowledge/public?'+new URLSearchParams(q));
(async()=>{
 const before=JSON.parse(process.argv[1]||'null');
 const dataset=await get('/api/dataset');
 const status=await pub({mode:'status'});
 const first=await pub({mode:'search',limit:2});
 const second=await pub({mode:'search',limit:2,cursor:first.nextCursor});
 const relation=[...first.records,...second.records].find(r=>r.record.content.kind==='relation');
 if(dataset.dataset!=='public-kg'||first.records.length!==2||second.records.length!==2||!relation||first.generation!==second.generation||status.active.id!==first.generation)throw Error('Representative published data unavailable');
 const {id,revision,content}=relation.record;
 const direct=await pub({mode:'record-version',recordId:id,revision});
 const near=await pub({mode:'neighbors',entityId:content.subjectId,limit:2,generation:first.generation});
 if(direct.record.record.id!==id||!direct.record.sources.length||!near.records.length)throw Error('Published version or neighbors unavailable');
 if(before){
   const old=await pub({mode:'search',limit:2,cursor:before.cursor});
   const fixed=await pub({mode:'record-version',recordId:before.recordId,revision:before.recordRevision});
   if(old.generation!==before.generation||hash(old.records)!==before.secondPageHash||hash(fixed)!==before.fixedHash)throw Error('Prior cursor or fixed version changed');
 }
 console.log(JSON.stringify({generation:first.generation,count:status.active.recordCount,cursor:first.nextCursor,
  secondPageHash:hash(second.records),recordId:id,recordRevision:revision,fixedHash:hash(direct),neighbors:near.records.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
"""


class Release:
    def __init__(self, stage):
        self.stage = stage
        self.m = json.loads((stage / 'manifest.json').read_text())
        assert self.m['sourceCommit'].startswith(SOURCE) and len(self.m['sourceCommit']) == 40
        self.old = self.m['previous']
        self.path = ROOT / 'compose.yaml'
        self.dc = ['docker', 'compose', '--env-file', str(ROOT / 'app.env'), '-f', str(self.path),
                   '--profile', 'member', '--profile', 'ops', '--profile', 'knowledge']
        self.original = self.path.read_text()
        self.config = self.compose_json(self.dc)
        self.pg = self.run(self.dc + ['ps', '-q', 'graph-member-postgres'])

    def run(self, args, *, data=None, stdout=None, timeout=90):
        result = subprocess.run(args, input=data, stdout=stdout or subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout)
        if result.returncode:
            private(self.stage / 'command-failure.txt',
                    result.stderr.decode(errors='replace')[-16000:])
            raise RuntimeError('Command failed: ' + ' '.join(args[:3]))
        return result.stdout.decode().strip() if result.stdout is not None else ''

    def sql(self, query, database=DB):
        return self.run(['docker', 'exec', self.pg, 'psql', '-X', '-qAt', '-U', 'postgres',
                         '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', query])

    def compose_json(self, dc):
        return json.loads(self.run(dc + ['config', '--format', 'json']))

    def ledgers(self):
        return [json.loads(self.sql('SELECT json_object_agg(name,checksum) FROM member_migration', 'graph_member')),
                json.loads(self.sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations'))]

    def expected_ledgers(self):
        return [self.old['memberMigrations'], {**self.old['knowledgeMigrations'], MIGRATION:self.m['migrationHash']}]

    def build(self):
        return self.run(self.dc + ['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID'])

    def probe(self, before=None):
        value = self.run(self.dc + ['exec', '-T', 'web', 'node', '-e', PROBE,
                                   json.dumps(before)], timeout=120)
        return json.loads(value)

    def container(self, service):
        cid = self.run(self.dc + ['ps', '-q', service])
        assert cid, 'Service missing: ' + service
        return json.loads(self.run(['docker', 'inspect', cid]))[0]

    def preflight(self):
        assert self.build() == self.old['build'], 'Running Web differs from the verified predecessor'
        allowed = [self.old['memberMigrations'], self.old['knowledgeMigrations']]
        assert self.ledgers() in [allowed, self.expected_ledgers()], 'Migration ledger differs from the verified state'
        for service in RUNNING:
            previous = self.old['web'] if service == 'web' else self.old['memberOps']
            container = self.container(service)
            assert container['State']['Running'] and container['Config']['Image'] == previous['tag']
            assert container['Image'] in (previous['configId'], previous['manifestId'])
        for service in CHANGED:
            config = self.config['services'][service]
            env = config.get('environment', {})
            assert all(key not in env for key in BLOCKED_ENV), 'A retention setting is present'
            if service in RUNNING:
                assert env.get('KNOWLEDGE_RUNTIME') == 'production', 'Deployment profile differs'
        assert self.config['services']['web']['environment']['MEMBER_ORIGIN'] == 'https://plunode.net'
        for service in WORKERS:
            live_env = self.container(service)['Config']['Env']
            assert not any(item.partition('=')[0] in BLOCKED_ENV for item in live_env)
        assert shutil.disk_usage(ROOT).free > 6 * 1024**3
        return self.probe()

    def load_images(self):
        archive = self.stage / 'images.tar.gz'
        assert archive.stat().st_size == self.m['archive']['bytes'] and digest(archive) == self.m['archive']['sha256']
        ids = archive_identities(archive, self.m)
        self.run(['docker', 'load', '-i', str(archive)], timeout=360)
        drivers = json.loads(self.run(['docker', 'info', '--format', '{{json .DriverStatus}}']))
        for name, identity in ids.items():
            tag = self.m[name]['tag']
            metadata = json.loads(self.run(['docker', 'image', 'inspect', tag]))[0]
            verify_loaded_image(metadata, identity, drivers, self.m['sourceCommit'])

    def candidate(self, text):
        config = copy.deepcopy(self.config)
        for service in CHANGED:
            image = self.m['web' if service == 'web' else 'memberOps']['tag']
            text = patch_image(text, service, image)
            config['services'][service]['image'] = image
        path = ROOT / 'compose.publication-storage-candidate.yaml'
        private(path, text)
        try:
            actual = self.compose_json([str(path) if a == str(self.path) else a for a in self.dc])
            assert actual == config, 'Compose change extends beyond the approved image pins'
        finally:
            path.unlink()
        return text, config

    def knowledge_checkpoint(self):
        return json.loads(self.sql("""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
            SELECT json_build_object(
              'rawRevisions', (SELECT count(*) FROM knowledge75.revisions),
              'revisionHash',(SELECT md5(string_agg(to_jsonb(v)::text,',' ORDER BY kind,id,revision)) FROM knowledge75.revisions v),
              'rawObjects', (SELECT count(*) FROM knowledge75.objects),
              'objectHash',(SELECT md5(string_agg(to_jsonb(o)::text,',' ORDER BY kind,id)) FROM knowledge75.objects o),
              'duplicateIndexBytes',coalesce(pg_relation_size(to_regclass('knowledge75.target_inventory_page')),0),
              'active', (SELECT active_generation FROM knowledge75.publication_control WHERE singleton));
            COMMIT"""))

    def backup(self, folder):
        for name in ('compose.yaml', 'app.env', 'knowledge.env'):
            shutil.copyfile(ROOT / name, folder / name)
        with (folder / 'knowledge.dump').open('wb') as f:
            self.run(['docker', 'exec', self.pg, 'pg_dump', '-U', 'postgres', '-d', DB, '-Fc', '-Z1'],
                     stdout=f, timeout=900)
        dump = folder / 'knowledge.dump'
        with dump.open('rb') as f:
            # Inspect the archive's table of contents without a live database connection.
            result = subprocess.run(['docker', 'exec', '-i', self.pg, 'pg_restore', '--list'],
                                    stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
        assert result.returncode == 0 and b'knowledge75 publication_records' in result.stdout
        private(folder / 'backup.json', json.dumps({'bytes':dump.stat().st_size,'sha256':digest(dump)}))

    def migrate(self):
        file = self.stage / MIGRATION
        expected = self.m['migrationHash']
        assert digest(file) == expected and re.fullmatch('[0-9a-f]{64}', expected)
        current = self.sql("SELECT checksum FROM knowledge75.migrations WHERE name='" + MIGRATION + "'")
        if current:
            assert current == expected
            return
        owner = self.sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='knowledge75.migrations'::regclass")
        assert re.fullmatch('[A-Za-z0-9_-]+', owner)
        self.sql('BEGIN; SELECT pg_advisory_xact_lock(7500001); SET LOCAL ROLE "' + owner + '";\n' +
                 file.read_text() + "\nINSERT INTO knowledge75.migrations(name,checksum) VALUES ('" +
                 MIGRATION + "','" + expected + "'); COMMIT")

    def start(self, services):
        self.run(self.dc + ['up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180',
                            *services], timeout=280)
        for name in services:
            assert self.container(name)['State']['Running']

    def rollback_before_workers(self, previous, new_active):
        if new_active and new_active != previous:
            for item in (previous, new_active):
                assert re.fullmatch(r'k75-[0-9a-f]{32}', item)
            result = self.sql(f"""BEGIN;
              UPDATE knowledge75.publication_control c SET active_generation='{previous}'
              WHERE c.singleton AND c.active_generation='{new_active}'
                AND EXISTS(SELECT 1 FROM knowledge75.publication_generations g
                           WHERE g.id='{previous}' AND g.state='ready' AND g.content_digest IS NULL AND g.expired_at IS NULL)
              RETURNING active_generation;
              COMMIT""")
            assert result == previous, 'Previous active generation could not be restored'
        atomic(self.path, self.original)
        self.start(RUNNING)
        assert self.build() == self.old['build']


def main(stage):
    assert os.geteuid() == 0
    assert str(stage).startswith('/root/plunode-publication-storage-')
    os.umask(0o077)
    with (ROOT / '.member-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        release = Release(stage)
        before = release.preflight()
        release.load_images()
        candidate, candidate_config = release.candidate(release.original)
        folder = ROOT / 'backups' / ('publication-storage-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
        folder.mkdir(mode=0o700)
        emit('backup-start', generation=before['generation'], folder=str(folder))
        release.backup(folder)
        emit('backup-verified', folder=str(folder))
        restarting_workers = False
        force_started = False
        try:
            release.run(release.dc + ['stop', '-t', '60', *WORKERS], timeout=180)
            before = release.probe()
            release.run(release.dc + ['stop', '-t', '60', 'web'], timeout=85)
            original = release.knowledge_checkpoint()
            assert original['active'] == before['generation'], 'Publication advanced during backup'
            assert release.sql('SELECT EXISTS(SELECT 1 FROM knowledge75.changes c WHERE NOT EXISTS ('
                               'SELECT 1 FROM knowledge75.publication_seen_changes s WHERE s.sequence=c.sequence))') == 'f', (
                                   'An ordinary publication is pending. Let the current publisher finish and retry.')
            expected = release.expected_ledgers()
            release.migrate()
            assert release.ledgers() == expected
            release.migrate()
            migrated = release.knowledge_checkpoint()
            assert migrated['duplicateIndexBytes'] == 0
            assert {k:v for k,v in original.items() if k!='duplicateIndexBytes'} == {
                k:v for k,v in migrated.items() if k!='duplicateIndexBytes'}
            atomic(release.path, candidate)
            assert release.compose_json(release.dc) == candidate_config
            release.start(('web',))
            assert release.build() == release.m['build']
            assert release.probe(before)['generation'] == before['generation']
            force_started = True
            release.run(release.dc + ['run', '--rm', '--no-deps', 'knowledge-publisher',
                                       'scripts/knowledge-publication-worker.ts','--once','--force'],timeout=150)
            new = release.probe(before)
            assert new['generation'] != before['generation'] and new['count'] == before['count']
            assert release.sql("""SELECT count(*) FROM knowledge75.publication_generations g
               JOIN knowledge75.publication_control c ON g.id=c.active_generation
               WHERE g.content_digest IS NOT NULL AND g.state='ready'""") == '1'
            after = release.knowledge_checkpoint()
            assert all(after[k] == original[k] for k in ('rawRevisions','revisionHash','rawObjects','objectHash'))
            assert release.ledgers() == expected
            for name in ('app.env', 'knowledge.env'):
                assert digest(ROOT/name) == digest(folder/name)
            restarting_workers = True
            release.start(WORKERS)
            summary = {'source':release.m['sourceCommit'],'build':release.m['build'],
                       'backup':str(folder),'previousGeneration':before['generation'],'activeGeneration':new['generation'],
                       'recordCount':new['count'],'originalRevisionCount':after['rawRevisions'],
                       'duplicateIndexBytes':original['duplicateIndexBytes'],
                       'memberLedgerCount':len(expected[0]),'knowledgeLedgerCount':len(expected[1]),
                       'originalsPreserved':True,'oldCursorPreserved':True,'fixedRecordPreserved':True,
                       'retentionEnabled':False,'services':list(RUNNING)}
            private(folder / 'activated.json', json.dumps(summary, indent=2))
            emit('activated', **summary)
        except BaseException:
            if not restarting_workers:
                current = (release.sql("SELECT active_generation FROM knowledge75.publication_control WHERE singleton")
                           if force_started else None)
                release.rollback_before_workers(before['generation'], current)
                emit('prior-web-restored', generation=before['generation'], backup=str(folder))
            else:
                release.start(RUNNING)
                emit('candidate-services-running', backup=str(folder))
            raise


if __name__ == '__main__':
    main(Path.cwd().resolve())
