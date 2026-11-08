#!/usr/bin/env python3
"""Activate the inspected R6 release; never restore an old DB or downgrade Web.

Run from a checksum-verified root-private stage. Preparation and the encrypted
backup must already have been verified on the development PC.
"""
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import tarfile
import time

ROOT = pathlib.Path('/opt/graph-knowledge')
RUNTIME_FILES = {
    'compose.yaml', 'knowledge.env', 'database.json', 'configuration-check.json',
    *('knowledge-runtime/' + name for name in (
        'deployment.json', 'review.json', 'gemini-api-key', 'collection.json',
        'collection-reader.json', 'missions.json', 'missions-token',
        'missions-client.json', 'import.json')),
}


def run(args, data=None, timeout=180, output=None):
    result = subprocess.run(args, input=data, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        # Arguments and stderr may contain credentials. Keep them out of output.
        private(pathlib.Path.cwd() / 'command-failure.json', json.dumps({
            'executable': args[0], 'returncode': result.returncode,
            'stderr': result.stderr.decode(errors='replace'),
        }))
        raise RuntimeError('Release command failed: ' + args[0])
    return result.stdout.decode().strip() if result.stdout is not None else ''


def digest(file):
    value = hashlib.sha256()
    with pathlib.Path(file).open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(part)
    return value.hexdigest()


def private(file, value):
    pathlib.Path(file).write_text(value)
    pathlib.Path(file).chmod(0o600)


def emit(event, **values):
    print(json.dumps({'event': event, **values}), flush=True)


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def extract_runtime(archive, target):
    with tarfile.open(archive) as source:
        members = source.getmembers()
        assert {item.name for item in members} == RUNTIME_FILES
        assert len(members) == len(RUNTIME_FILES)
        for item in members:
            assert item.isfile() and item.size <= 128000
            dest = target / item.name
            assert dest.resolve().is_relative_to(target.resolve())
            dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            dest.write_bytes(source.extractfile(item).read())
            dest.chmod(0o600)


def backup_encrypted(backup, stage):
    payload, key = backup / 'recovery.tar', backup / 'encryption-key'
    with tarfile.open(payload, 'w') as archive:
        for name in ['compose.yaml', 'app.env', 'manifest.json',
                     'member-before-r6.dump', 'member-before.json']:
            archive.add(backup / name, arcname=name)
    private(key, secrets.token_hex(48))
    encrypted, wrapped, verified = (backup / n for n in
                                   ['recovery.tar.enc', 'recovery-key.enc', 'verify.tar'])
    try:
        run(['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000',
             '-salt', '-in', str(payload), '-out', str(encrypted), '-pass', 'file:' + str(key)])
        run(['openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey',
             str(stage / 'recovery-public.pem'), '-in', str(key), '-out', str(wrapped),
             '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256'])
        run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000',
             '-in', str(encrypted), '-out', str(verified), '-pass', 'file:' + str(key)])
        assert digest(payload) == digest(verified)
    finally:
        for file in [payload, key, verified]:
            file.unlink(missing_ok=True)
    return {'encryptedBackupSha256': digest(encrypted), 'wrappedKeySha256': digest(wrapped)}


def main():
    assert os.geteuid() == 0, 'Use the existing administrator sudo'
    os.umask(0o077)
    stage = pathlib.Path.cwd().resolve()
    assert str(stage).startswith('/root/plunode-r6-release-')
    gate = (ROOT / '.member-activation.lock').open('a')
    fcntl.flock(gate, fcntl.LOCK_EX | fcntl.LOCK_NB)
    manifest = json.loads((stage / 'manifest.json').read_text())
    baseline = json.loads((stage / 'audit-result.json').read_text())
    assert manifest['prepared']['pcDecryptionVerified']
    prepared = json.loads((pathlib.Path(manifest['prepared']['backup']) / 'prepared.json').read_text())
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(prepared['at'])
    assert datetime.timedelta(0) <= age <= datetime.timedelta(days=1), 'Refresh preparation before a later release'
    assert prepared['restore']['dumpSha256'] == manifest['prepared']['dumpSha256']
    assert prepared['restore']['oldRowsAndOwnersPreserved'] and prepared['restore']['repeatedUnchanged']
    assert prepared['security']['metadataRefreshed'] and not prepared['security']['packages']
    assert digest(ROOT / 'compose.yaml') == baseline['composeSha256']
    assert digest(ROOT / 'app.env') == baseline['envSha256']
    assert shutil.disk_usage(ROOT).free > 6 * 1024 ** 3
    old = ['docker', 'compose', '--env-file', str(ROOT / 'app.env'), '-f',
           str(ROOT / 'compose.yaml'), '--profile', 'member', '--profile', 'ops']
    for name in ['web', 'graph-member-postgres', 'graph-neo4j']:
        cid = run(old + ['ps', '-q', name])
        assert cid == baseline['containers'][name]['id'], 'Live container changed'
        value = json.loads(run(['docker', 'inspect', cid]))[0]
        assert value['State']['Running'] and value['Image'] == baseline['containers'][name]['image']
    assert run(old + ['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID']) == baseline['buildId']
    assert run(old + ['exec', '-T', 'web', 'sha256sum', '/app/data/ai-lab/initial.json']).split()[0] == baseline['aiArtifactSha256']
    pg = baseline['containers']['graph-member-postgres']['id']

    def sql(query, database='graph_member'):
        return run(['docker', 'exec', '-i', pg, 'psql', '-X', '-qAt', '-U',
                    'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], query.encode())

    ledger = dict(row.split() for row in baseline['migrations'])
    assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration;')) == ledger
    assert all(manifest['memberMigrations'].get(k) == v for k, v in ledger.items())
    helpers = module('preparation_helpers', stage / 'prepare-checks.py')
    checks = module('image_checks', stage / 'archive-check.py')
    images = manifest['images']
    archive = stage / manifest['archive']['file']
    assert digest(archive) == manifest['archive']['sha256']
    compat = {'sourceCommit': manifest['source'], 'web': images['web'], 'memberOps': images['knowledge-ops']}
    identities = checks.archive_identities(archive, compat)
    run(['docker', 'load', '--input', str(archive)], timeout=300)
    driver = json.loads(run(['docker', 'info', '--format', '{{json .DriverStatus}}']))
    for key, name in [('web', 'web'), ('memberOps', 'knowledge-ops')]:
        value = json.loads(run(['docker', 'image', 'inspect', images[name]['tag']]))[0]
        checks.verify_loaded_image(value, identities[key], driver, manifest['source'])
    assert run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat',
                images['web']['tag'], '/app/.next-public/BUILD_ID']) == images['web']['build']
    assert digest(stage / 'runtime-assets.tar') == manifest['runtimeArchive']['sha256']
    candidate = stage / 'candidate'
    candidate.mkdir(mode=0o700, exist_ok=False)
    extract_runtime(stage / 'runtime-assets.tar', candidate)
    db = json.loads((candidate / 'database.json').read_text())
    assert db['database'] == 'plunode_knowledge75_production' and db['user'] == 'gk_knowledge'
    assert re.fullmatch('[a-f0-9]{64}', db['password'])
    assert sql("SELECT count(*) FROM pg_database WHERE datname='" + db['database'] + "';", 'postgres') == '0'
    assert sql("SELECT count(*) FROM pg_roles WHERE rolname='" + db['user'] + "';", 'postgres') == '0'
    profile = json.loads((candidate / 'knowledge-runtime/deployment.json').read_text())
    review = json.loads((candidate / 'knowledge-runtime/review.json').read_text())
    assert profile['environment'] == 'production' and profile['origin'] == 'https://plunode.net'
    assert review['requestsPerDay'] == 300 and review['allowedUsers'] is None
    assert not (ROOT / 'knowledge-runtime').exists() and not (ROOT / 'knowledge.env').exists()
    backup = ROOT / 'backups' / ('knowledge-r6-release-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700, exist_ok=False)
    for name in ['compose.yaml', 'app.env']:
        shutil.copy2(ROOT / name, backup / name)
    shutil.copy2(stage / 'manifest.json', backup / 'manifest.json')
    neo = baseline['containers']['graph-neo4j']['id']
    legacy_query = 'MATCH (n:Entity) RETURN count(n) AS entities;'

    def legacy_count():
        return run(['docker', 'exec', neo, 'sh', '-c',
                    'exec cypher-shell -u neo4j -p "${NEO4J_AUTH#neo4j/}" --format plain "$1"', 'sh', legacy_query])

    legacy_before = legacy_count()
    emit('preflight-ok', source=manifest['source'], build=images['web']['build'],
         additionalMemberMigrations=sorted(set(manifest['memberMigrations']) - set(ledger)),
         knowledgeMigrations=len(manifest['knowledgeMigrations']), backup=str(backup))
    stopped, migrated = False, False
    try:
        run(old + ['stop', '-t', '40', 'web'])
        stopped = True
        tables = helpers.table_columns(sql)
        before = helpers.fingerprints(sql, tables)
        with (backup / 'member-before-r6.dump').open('wb') as output:
            run(['docker', 'exec', pg, 'pg_dump', '-U', 'postgres', '-d', 'graph_member', '-Fc'], output=output)
        assert helpers.fingerprints(sql, tables) == before, 'Member data changed during stopped backup'
        private(backup / 'member-before.json', json.dumps({'tables': tables, 'fingerprints': before, 'ledger': ledger}))
        encrypted = backup_encrypted(backup, stage)
        emit('final-backup-ok', dumpSha256=digest(backup / 'member-before-r6.dump'), **encrypted)
        for name in ['compose.yaml', 'knowledge.env']:
            temp = ROOT / (name + '.r6-new')
            shutil.copy2(candidate / name, temp)
            temp.chmod(0o600)
            temp.replace(ROOT / name)
        shutil.copytree(candidate / 'knowledge-runtime', ROOT / 'knowledge-runtime')
        for file in [ROOT / 'knowledge-runtime', *(ROOT / 'knowledge-runtime').iterdir()]:
            os.chown(file, 1000, 1000)
            file.chmod(0o700 if file.is_dir() else 0o600)
        (ROOT / 'knowledge-state').mkdir(mode=0o700, exist_ok=False)
        os.chown(ROOT / 'knowledge-state', 1000, 1000)
        current = ['docker', 'compose', '--env-file', str(ROOT / 'app.env'), '-f',
                   str(ROOT / 'compose.yaml'), '--profile', 'member', '--profile', 'ops']
        run(current + ['config', '--quiet'])
        run(current + ['up', '-d', '--no-deps', 'graph-member-postgres'])
        pg = run(current + ['ps', '-q', 'graph-member-postgres'])
        for _ in range(60):
            value = json.loads(run(['docker', 'inspect', pg]))[0]
            if value['State'].get('Health', {}).get('Status') == 'healthy':
                break
            time.sleep(1)
        else:
            raise RuntimeError('PostgreSQL did not become healthy')
        assert sql('SHOW max_connections;', 'postgres') == '60'
        assert helpers.fingerprints(sql, tables) == before
        sql("CREATE ROLE gk_knowledge NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION LOGIN PASSWORD '" + db['password'] + "';", 'postgres')
        sql('CREATE DATABASE plunode_knowledge75_production OWNER gk_knowledge;', 'postgres')
        migrated = True
        run(current + ['run', '--rm', '--no-deps', 'member-ops', 'scripts/member-migrate.ts',
                       '--mission-oauth', '--confirm-origin', 'https://plunode.net'])
        assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM member_migration;')) == manifest['memberMigrations']
        assert helpers.fingerprints(sql, tables, old_ledger=True) == before
        original_names = {(t['schema'], t['name']) for t in tables}
        assert [t for t in helpers.table_columns(sql)
                if (t['schema'], t['name']) in original_names] == tables
        run(current + ['run', '--rm', '--no-deps', 'knowledge-ops', 'scripts/knowledge-migrate.ts',
                       '--confirm-origin', 'https://plunode.net', '--confirm-database', db['database']])
        assert json.loads(sql('SELECT json_object_agg(name,checksum) FROM knowledge75.migrations;', db['database'])) == manifest['knowledgeMigrations']
        assert sql('SELECT count(*) FROM knowledge75.objects;', db['database']) == '0'
        run(current + ['run', '--rm', '--no-deps', 'knowledge-ops',
                       'scripts/knowledge-publication-worker.ts', '--once', '--force'])
        assert legacy_count() == legacy_before
        emit('migration-ok', memberLedgerCount=len(manifest['memberMigrations']),
             knowledgeLedgerCount=len(manifest['knowledgeMigrations']), oldRowsAndOwnersPreserved=True,
             legacyEntityCountUnchanged=True, seededObjects=0)
        run(current + ['up', '-d', '--no-deps', 'web'])
        web = run(current + ['ps', '-q', 'web'])
        for _ in range(90):
            value = json.loads(run(['docker', 'inspect', web]))[0]
            if value['State'].get('Health', {}).get('Status') == 'healthy':
                break
            time.sleep(1)
        else:
            raise RuntimeError('New Web did not become healthy; preserve the current DB and repair this release')
        assert run(current + ['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID']) == images['web']['build']
        assert run(current + ['exec', '-T', 'web', 'sha256sum', '/app/data/ai-lab/initial.json']).split()[0] == baseline['aiArtifactSha256']
        run(current + ['up', '-d', '--no-deps', 'knowledge-publisher', 'knowledge-review', 'knowledge-patrol'])
        assert digest(ROOT / 'app.env') == baseline['envSha256']
        result = {'source': manifest['source'], 'build': images['web']['build'],
                  'webImage': json.loads(run(['docker', 'inspect', web]))[0]['Image'],
                  'memberMigrations': len(manifest['memberMigrations']), 'knowledgeMigrations': len(manifest['knowledgeMigrations']),
                  'backup': str(backup), 'dumpSha256': digest(backup / 'member-before-r6.dump'),
                  **encrypted, 'memberSettingsUnchanged': True, 'kgUnchanged': True,
                  'aiArtifactUnchanged': True, 'betaDataImported': False, 'osPackagesChanged': False,
                  'formalUserAcceptancePending': True}
        private(backup / 'activated.json', json.dumps(result, indent=2))
        export = pathlib.Path('/home/develop/plunode-r6-20261108') / backup.name
        export.mkdir(mode=0o700, exist_ok=False)
        import pwd
        owner = pwd.getpwnam('develop')
        for name in ['activated.json', 'recovery.tar.enc', 'recovery-key.enc']:
            shutil.copy2(backup / name, export / name)
            os.chown(export / name, owner.pw_uid, owner.pw_gid)
        os.chown(export, owner.pw_uid, owner.pw_gid)
        emit('activated', **result)
    except BaseException:
        if stopped and not migrated:
            # No new data format exists yet. The audited old config is safe to resume.
            shutil.copy2(backup / 'compose.yaml', ROOT / 'compose.yaml')
            run(old + ['up', '-d', '--no-deps', 'web'])
        elif migrated:
            emit('repair-required', databaseRetained=True, automaticDatabaseRestore=False,
                 automaticOldWebDowngrade=False, backup=str(backup))
        raise


if __name__ == '__main__':
    main()
