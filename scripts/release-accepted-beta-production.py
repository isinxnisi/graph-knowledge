#!/usr/bin/env python3
"""Incremental formal release. No beta content, seed, OS update or AI calls.

prepare: consistent member backup, isolated migration rehearsal, image validation.
activate: fresh stopped-writer backup, explicit migrations, verified image switch.
"""
import argparse
import copy
import datetime
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import subprocess
import tarfile
import time

ROOT = Path('/opt/graph-knowledge')
WORKERS = ['knowledge-review', 'knowledge-patrol', 'knowledge-publisher']
IMAGE_SERVICES = {'member-ops', 'knowledge-ops', *WORKERS}
ADDITIONS = {'039-product-assets.sql', '040-theme-editorial-assets.sql', '041-theme-quality-guide.sql', '042-theme-item-amendments.sql', '043-theme-item-retries.sql'}


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def validate_plan(manifest, baseline):
    assert re.fullmatch(r'[0-9a-f]{40}', manifest['sourceCommit'])
    assert set(manifest['additionalMigrations']) == ADDITIONS
    before, after = baseline['memberMigrations'], manifest['memberMigrations']
    assert set(after) == set(before) | ADDITIONS
    assert not (set(before) & ADDITIONS), 'Audited migration plan is stale'
    assert all(after.get(k) == v for k, v in before.items()), 'Applied checksum changed'
    assert manifest['knowledgeMigrations'] == baseline['knowledgeMigrations']
    assert set(manifest['imageServices']) == IMAGE_SERVICES
    assert manifest['contentMigration'] is False and manifest['qualityGuideSeed'] is False


def ident(value):
    return '"'+value.replace('"', '""')+'"'


def fingerprints(sql, tables, old_migrations=None):
    """Hash bounded per-row digests, not repeated large projection documents."""
    statements = []
    for table in tables:
        query = 'SELECT '+','.join(map(ident, table['columns']))+' FROM '+ident(table['schema'])+'.'+ident(table['name'])
        if old_migrations is not None and table['schema'] == 'public' and table['name'] == 'member_migration':
            assert all(re.fullmatch(r'[a-zA-Z0-9._-]+', name) for name in old_migrations)
            query += ' WHERE name IN ('+','.join("'"+name+"'" for name in sorted(old_migrations))+')'
        statements.append("WITH hashes AS MATERIALIZED (SELECT encode(sha256(convert_to(row_to_json(x)::text,'UTF8')),'hex') h FROM ("+query+")x) SELECT count(*)||':'||encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') FROM hashes")
    if not statements:
        return {}
    rows = sql('SET jit=off; SET max_parallel_workers_per_gather=0; '+';'.join(statements)).splitlines()
    assert len(rows) == len(tables) and all(re.fullmatch(r'\d+:[a-f0-9]{64}', row) for row in rows)
    return {t['schema']+'.'+t['name']: row for t, row in zip(tables, rows)}


def assert_old_columns(sql, tables, columns):
    current = {t['schema']+'.'+t['name']: t for t in columns(sql)}
    for old in tables:
        found = current[old['schema']+'.'+old['name']]
        assert found['owner'] == old['owner'] and set(old['columns']) <= set(found['columns'])


class Release:
    def __init__(self):
        assert os.geteuid() == 0
        os.umask(0o077)
        self.stage = Path.cwd().resolve()
        assert str(self.stage).startswith('/root/plunode-accepted-beta-20261114-')
        self.h = module('image_checks', self.stage/'production_image_verification.py')
        self.f = module('columns', self.stage/'release-featured-themes-production.py')
        self.m = json.loads((self.stage/'manifest.json').read_text())
        self.audit = json.loads((self.stage/'audit-result.json').read_text())
        validate_plan(self.m, self.audit)
        self.lock = (ROOT/'.member-activation.lock').open('a')
        fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.dc = ['docker', 'compose', '--env-file', str(ROOT/'app.env'), '-f', str(ROOT/'compose.yaml'), '--profile', 'member', '--profile', 'ops']
        self.config = json.loads(self.run(self.dc+['config', '--format', 'json']))
        self.pg = self.run(self.dc+['ps', '-q', 'graph-member-postgres'])
        self.h.run = self.run

    def run(self, args, data=None, output=None, timeout=300):
        result = subprocess.run(args, input=data, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        if result.returncode:
            self.h.private(self.stage/'command-failure.json', json.dumps({'program': args[0], 'exit': result.returncode, 'stderr': result.stderr.decode(errors='replace')}))
            raise RuntimeError('Protected command failed; see root-private command-failure.json: '+args[0])
        return result.stdout.decode().strip() if result.stdout is not None else ''

    def sql(self, query, database='graph_member', pg=None):
        return self.run(['docker', 'exec', '-i', pg or self.pg, 'psql', *(['-h', '127.0.0.1'] if pg else []), '-X', '-qAt', '-U', 'restore_admin' if pg else 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], query.encode())

    def ledgers(self):
        return [json.loads(self.sql('SELECT json_object_agg(name,checksum) FROM member_migration')), json.loads(self.sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations', 'plunode_knowledge75_production'))]

    def preflight(self):
        for name, checksum in self.audit['files'].items():
            assert self.h.digest(ROOT/name) == checksum, 'Unplanned configuration difference: '+name
        for name, value in self.audit['runtimeFiles'].items():
            if name.startswith('knowledge-runtime/'):
                assert self.h.digest(ROOT/name) == value['sha256'], 'Private profile changed: '+name
        assert self.ledgers() == [self.audit['memberMigrations'], self.audit['knowledgeMigrations']]
        for service in ['web', *WORKERS, 'graph-member-postgres', 'graph-neo4j']:
            cid = self.run(self.dc+['ps', '-q', service])
            value = json.loads(self.run(['docker', 'inspect', cid]))[0]
            assert value['State']['Running'] and value['Image'] == self.audit['containers'][service]['image'], 'Running baseline changed: '+service
        assert self.run(self.dc+['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID']) == self.audit['buildId']
        assert self.run(self.dc+['exec', '-T', 'web', 'sha256sum', '/app/data/ai-lab/initial.json']).split()[0] == self.audit['aiArtifactSha256']
        assert shutil.disk_usage(ROOT).free > 8*1024**3
        for service in ['web', 'knowledge-review']:
            env = self.config['services'][service]['environment']
            for flag in ['COMMUNITY_ENABLED', 'SITE_OPERATIONS_ENABLED', 'KNOWLEDGE_THEME_REGISTRATION_ENABLED']:
                assert env.get(flag) == '1', 'Required operator capability is not enabled: '+flag
            assert env.get('KNOWLEDGE_RUNTIME') == 'production'
            assert env.get('KNOWLEDGE_PUBLIC_ORIGIN') == 'https://plunode.net'
            assert not any(env.get(k) == '1' for k in ['PLUNODE_WINDOWS_HTTPS_TRANSPORT', 'PLUNODE_WINDOWS_GOOGLE_AUTH_TRANSPORT', 'PLUNODE_WINDOWS_GEMINI_TRANSPORT'])

    def images(self, load):
        archive = self.stage/self.m['archive']['file']
        assert self.h.digest(archive) == self.m['archive']['sha256']
        identities = self.h.archive_identities(archive, self.m)
        if load:
            self.run(['docker', 'load', '--input', str(archive)], timeout=600)
        driver = json.loads(self.run(['docker', 'info', '--format', '{{json .DriverStatus}}']))
        for key in ['web', 'memberOps']:
            value = json.loads(self.run(['docker', 'image', 'inspect', self.m[key]['tag']]))[0]
            self.h.verify_loaded_image(value, identities[key], driver, self.m['sourceCommit'])
        assert self.run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat', self.m['web']['tag'], '/app/.next-public/BUILD_ID']) == self.m['build']
        assert self.run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'sha256sum', self.m['web']['tag'], '/app/data/ai-lab/initial.json']).split()[0] == self.audit['aiArtifactSha256']
        return identities

    def candidate(self):
        text = (ROOT/'compose.yaml').read_text()
        expected = copy.deepcopy(self.config)
        text = self.h.patch_image(text, 'web', self.m['web']['tag'])
        expected['services']['web']['image'] = self.m['web']['tag']
        old_ops = self.audit['services']['knowledge-review']['image']
        targets = {k for k, v in self.config['services'].items() if v.get('image') == old_ops}
        assert targets == IMAGE_SERVICES, 'Unexpected worker aliases'
        for name in sorted(targets):
            text = self.h.patch_image(text, name, self.m['memberOps']['tag'])
            expected['services'][name]['image'] = self.m['memberOps']['tag']
        path = ROOT/'compose.accepted-beta-candidate.yaml'
        self.h.private(path, text)
        command = [str(path) if x == str(ROOT/'compose.yaml') else x for x in self.dc]
        assert json.loads(self.run(command+['config', '--format', 'json'])) == expected, 'Unplanned setting change'
        return text, command

    def directory(self, phase):
        path = ROOT/'backups'/('accepted-beta-'+phase+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
        path.mkdir(mode=0o700, exist_ok=False)
        for name in ['compose.yaml', 'app.env', 'knowledge.env']:
            shutil.copy2(ROOT/name, path/name)
            (path/name).chmod(0o600)
        for name in ['knowledge-runtime', 'knowledge-state']:
            if (ROOT/name).is_dir():
                shutil.copytree(ROOT/name, path/name)
        for name in ['manifest.json', 'audit-result.json']:
            shutil.copy2(self.stage/name, path/name)
        return path

    def dump(self, folder, database, filename, snapshot=None):
        args = ['docker', 'exec', self.pg, 'pg_dump', '-U', 'postgres', '-d', database, '-Fc']
        if snapshot:
            args.append('--snapshot='+snapshot)
        with (folder/filename).open('wb') as stream:
            self.run(args, output=stream, timeout=600)

    def consistent_member_backup(self, folder):
        connection = subprocess.Popen(['docker', 'exec', '-i', self.pg, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'graph_member', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            connection.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n')
            connection.stdin.flush()
            snapshot = connection.stdout.readline().strip()
            assert re.fullmatch(r'[A-F0-9-]+', snapshot)
            sql = lambda query: self.sql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '"+snapshot+"'; "+query+'; COMMIT')
            tables = self.f.columns(sql)
            before = fingerprints(sql, tables)
            self.dump(folder, 'graph_member', 'member.dump', snapshot)
        finally:
            if connection.poll() is None:
                connection.stdin.write('ROLLBACK;\n')
                connection.stdin.close()
                connection.wait(timeout=20)
        self.h.private(folder/'member-baseline.json', json.dumps({'tables': tables, 'fingerprints': before}))
        return tables, before

    def migrate(self, network=None, envfile=None, compose=None):
        if network:
            command = ['docker', 'run', '--rm', '--network', network, '--memory', '384m', '--env-file', str(envfile), self.m['memberOps']['tag']]
        else:
            # Override the service entrypoint explicitly rather than nesting node.
            command = compose+['run', '--rm', '--no-deps', '--entrypoint', 'node', '-e', 'NODE_OPTIONS=--max-old-space-size=256', 'member-ops', '--import', 'tsx']
        self.run(command+['scripts/member-migrate.ts', '--theme-item-retries', '--confirm-origin', 'https://plunode.net'])

    def rehearsal(self, folder, tables, before):
        network = 'plunode-beta-release-restore-'+secrets.token_hex(5)
        container = network+'-pg'
        created = False
        self.run(['docker', 'network', 'create', '--internal', network])
        try:
            self.run(['docker', 'run', '-d', '--name', container, '--network', network, '--network-alias', 'graph-member-postgres', '--memory', '384m', '--tmpfs', '/var/lib/postgresql/data:rw,size=805306368', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=restore_admin', '-e', 'POSTGRES_DB=postgres', self.config['services']['graph-member-postgres']['image']])
            created = True
            for _ in range(80):
                if subprocess.run(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'restore_admin'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                    break
                time.sleep(.25)
            else:
                raise RuntimeError('Isolated restore database not ready')
            sql = lambda query, database='graph_member': self.sql(query, database, container)
            existing = set(json.loads(sql('SELECT json_agg(rolname) FROM pg_roles', 'postgres')))
            roles = json.loads(self.sql("SELECT json_agg(rolname) FROM pg_roles WHERE rolname !~ '^pg_'", 'postgres'))
            for role in roles:
                if role not in existing:
                    sql('CREATE ROLE '+ident(role)+' NOLOGIN', 'postgres')
            sql('ALTER ROLE gk_member LOGIN', 'postgres')
            sql('CREATE DATABASE graph_member OWNER gk_member', 'postgres')
            with (folder/'member.dump').open('rb') as stream:
                result = subprocess.run(['docker', 'exec', '-i', container, 'pg_restore', '-h', '127.0.0.1', '-U', 'restore_admin', '-d', 'graph_member', '--exit-on-error'], stdin=stream, capture_output=True, timeout=300)
            assert result.returncode == 0, 'Isolated restore failed'
            assert self.f.columns(sql) == tables and fingerprints(sql, tables) == before
            envfile = folder/'isolated.env'
            self.h.private(envfile, '\n'.join(['GRAPH_DEPLOYMENT=production', 'MEMBER_STORAGE_ENABLED=1', 'MEMBER_ORIGIN=https://plunode.net', 'MEMBER_DATABASE_URL=postgresql://gk_member@graph-member-postgres:5432/graph_member', 'MEMBER_AUTH_SECRET='+secrets.token_hex(32), 'MEMBER_AUTH_PROVIDER=google', 'MEMBER_COOKIE_PREFIX=gk-member-production', 'MEMBER_GOOGLE_CLIENT_ID=isolated-rehearsal', 'MEMBER_GOOGLE_CLIENT_SECRET=isolated-rehearsal', 'NODE_OPTIONS=--max-old-space-size=256'])+'\n')
            try:
                self.migrate(network, envfile)
                assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration')) == self.m['memberMigrations']
                assert_old_columns(sql, tables, self.f.columns)
                assert fingerprints(sql, tables, self.audit['memberMigrations']) == before
                after_tables = self.f.columns(sql)
                after = fingerprints(sql, after_tables)
                self.migrate(network, envfile)
                assert fingerprints(sql, after_tables) == after
                assert sql('SELECT count(*) FROM site_editorial_guide_version') == '0'
            finally:
                envfile.unlink(missing_ok=True)
            return {'oldTables': len(tables), 'tables': len(after_tables), 'ledgerCount': len(self.m['memberMigrations']), 'oldRowsAndOwnersPreserved': True, 'repeatedUnchanged': True, 'qualityGuideSeeded': False}
        finally:
            if created:
                self.run(['docker', 'rm', '-f', container])
            self.run(['docker', 'network', 'rm', network])

    def encrypt(self, folder):
        payload, key, verify = (folder/name for name in ['recovery.tar', 'encryption-key', 'verify.tar'])
        encrypted, wrapped = folder/'recovery.tar.enc', folder/'recovery-key.enc'
        with tarfile.open(payload, 'w') as archive:
            for path in list(folder.iterdir()):
                if path not in [payload, key, verify, encrypted, wrapped] and path.name != 'previous-images.tar':
                    archive.add(path, arcname=path.name)
        self.h.private(key, secrets.token_hex(48))
        try:
            self.run(['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', str(payload), '-out', str(encrypted), '-pass', 'file:'+str(key)])
            self.run(['openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', str(self.stage/'recovery-public.pem'), '-in', str(key), '-out', str(wrapped), '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256'])
            self.run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', str(encrypted), '-out', str(verify), '-pass', 'file:'+str(key)])
            assert self.h.digest(payload) == self.h.digest(verify)
        finally:
            for path in [payload, key, verify]:
                path.unlink(missing_ok=True)
        return {'encryptedBackupSha256': self.h.digest(encrypted), 'wrappedKeySha256': self.h.digest(wrapped)}

    def export(self, folder, phase, result):
        self.h.private(folder/(phase+'.json'), json.dumps(result, indent=2))
        target = Path(self.m['exportDirectory'])/phase
        assert str(target).startswith('/home/develop/plunode-accepted-beta-20261114/')
        target.mkdir(mode=0o700, parents=True, exist_ok=False)
        owner = pwd.getpwnam('develop')
        os.chown(target, owner.pw_uid, owner.pw_gid)
        # The parent may have been created by root; the existing stage is user owned.
        for name in [phase+'.json', 'recovery.tar.enc', 'recovery-key.enc']:
            dest = target/name
            shutil.copy2(folder/name, dest)
            dest.chmod(0o600)
            os.chown(dest, owner.pw_uid, owner.pw_gid)

    def prepare(self):
        self.preflight()
        self.images(load=True)
        self.candidate()
        folder = self.directory('preparation')
        tables, before = self.consistent_member_backup(folder)
        self.h.emit('consistent-member-backup', tables=len(tables), webStopped=False)
        result = self.rehearsal(folder, tables, before)
        self.h.emit('migration-rehearsal-ok', **result)
        old = sorted({self.audit['containers'][name]['configuredImage'] for name in ['web', 'knowledge-review']})
        with (folder/'previous-images.tar').open('wb') as stream:
            self.run(['docker', 'save', *old], output=stream, timeout=600)
        image_backup = {'file': 'previous-images.tar', 'sha256': self.h.digest(folder/'previous-images.tar'), 'images': {key: val for key, val in self.audit['images'].items() if key in [self.audit['containers'][name]['image'] for name in ['web', 'knowledge-review']]}}
        self.h.private(folder/'previous-images.json', json.dumps(image_backup))
        self.dump(folder, 'plunode_knowledge75_production', 'knowledge.dump')
        encrypted = self.encrypt(folder)
        result = {**result, **encrypted, 'source': self.m['sourceCommit'], 'build': self.m['build'], 'backup': str(folder), 'previousImagesSha256': image_backup['sha256'], 'liveDbMigrated': False, 'webStopped': False, 'activated': False}
        self.export(folder, 'prepared', result)
        self.h.private(self.stage/'prepared.json', json.dumps(result))
        self.h.emit('preparation-complete', **result)

    def activate(self):
        prepared = json.loads((self.stage/'prepared.json').read_text())
        assert prepared['source'] == self.m['sourceCommit'] and prepared['build'] == self.m['build']
        self.preflight()
        self.images(load=False)
        candidate, dc = self.candidate()
        folder = self.directory('release')
        stopped = False
        migrated = False
        migration_started = False
        try:
            self.h.emit('preflight-ok', source=self.m['sourceCommit'], build=self.m['build'], additionalMigrations=self.m['additionalMigrations'], backup=str(folder))
            self.run(self.dc+['stop', '-t', '60', 'web', *WORKERS], timeout=150)
            stopped = True
            # Read checkpoint files again only after all Web writers have stopped.
            if (folder/'knowledge-state').exists():
                shutil.rmtree(folder/'knowledge-state')
            if (ROOT/'knowledge-state').exists():
                shutil.copytree(ROOT/'knowledge-state', folder/'knowledge-state')
            tables = self.f.columns(self.sql)
            before = fingerprints(self.sql, tables)
            ktables = self.f.columns(lambda q: self.sql(q, 'plunode_knowledge75_production'))
            kbefore = fingerprints(lambda q: self.sql(q, 'plunode_knowledge75_production'), [{**t, 'columns': ['ctid', 'xmin']} for t in ktables])
            self.dump(folder, 'graph_member', 'member.dump')
            self.dump(folder, 'plunode_knowledge75_production', 'knowledge.dump')
            self.h.private(folder/'preservation.json', json.dumps({'memberTables': tables, 'memberRows': before, 'knowledgeRows': kbefore}))
            encrypted = self.encrypt(folder)
            self.h.emit('final-backup-ok', backup=str(folder), **encrypted)
            migration_started = True
            self.migrate(compose=dc)
            migrated = True
            assert self.ledgers() == [self.m['memberMigrations'], self.m['knowledgeMigrations']]
            assert_old_columns(self.sql, tables, self.f.columns)
            assert fingerprints(self.sql, tables, self.audit['memberMigrations']) == before
            assert fingerprints(lambda q: self.sql(q, 'plunode_knowledge75_production'), [{**t, 'columns': ['ctid', 'xmin']} for t in ktables]) == kbefore
            assert self.sql('SELECT count(*) FROM site_editorial_guide_version') == '0'
            self.h.emit('migration-ok', ledgerCount=len(self.m['memberMigrations']), oldRowsAndOwnersPreserved=True, knowledgeUnchanged=True, qualityGuideSeeded=False)
            self.h.atomic(ROOT/'compose.yaml', candidate)
            self.run(self.dc+['up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180', 'web', *WORKERS], timeout=240)
            self.run(self.dc+['exec', '-T', 'web', 'node', 'scripts/production-readiness.mjs'])
            assert self.run(self.dc+['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID']) == self.m['build']
            for name, checksum in self.audit['files'].items():
                if name != 'compose.yaml':
                    assert self.h.digest(ROOT/name) == checksum
            for name in ['graph-member-postgres', 'graph-neo4j']:
                assert self.run(self.dc+['ps', '-q', name]) == self.audit['containers'][name]['id']
            result = {'source': self.m['sourceCommit'], 'build': self.m['build'], 'backup': str(folder), 'preparationBackup': prepared['backup'], 'memberLedgerCount': len(self.m['memberMigrations']), 'knowledgeLedgerCount': len(self.m['knowledgeMigrations']), 'settingsPreserved': True, 'oldRowsAndOwnersPreserved': True, 'knowledgeUnchangedAtCutover': True, 'qualityGuideSeeded': False, 'betaDataImported': False, 'osPackagesChanged': False, 'updatedServices': ['web', *sorted(IMAGE_SERVICES)], 'formalAcceptancePending': True, **encrypted}
            self.export(folder, 'activated', result)
            self.h.emit('activated', **result)
        except BaseException:
            # A migration command may have committed before its client failed.
            # Never assume a failed command means the DB is safe for old Web.
            if stopped and not migration_started:
                self.run(self.dc+['up', '-d', '--no-deps', '--pull', 'never', 'web', *WORKERS])
            elif stopped:
                self.run(self.dc+['stop', '-t', '30', 'web', *WORKERS], timeout=90)
            self.h.emit('repair-required', backup=str(folder), migrationStarted=migration_started, migrationCompleted=migrated, oldDumpRestored=False, automaticOldWebDowngrade=False)
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepare', 'activate'])
    getattr(Release(), parser.parse_args().phase)()
