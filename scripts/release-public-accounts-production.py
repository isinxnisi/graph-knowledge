#!/usr/bin/env python3
"""Issue #39 pinned release. Explicit sudo, private backup and real restore first.

Only Web/member-ops images, two existing application switches and additive
009/010 change. Never imports KG, changes credentials or restores the live DB.
"""
import argparse, copy, datetime, fcntl, hashlib, json, os, pathlib, pwd, re
import shutil, subprocess, tarfile, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser

ROOT = pathlib.Path('/opt/graph-knowledge')
FLAGS = ('PUBLIC_PROFILES_ENABLED', 'AI_LAB_ENABLED')
OLD_BUILD = 'nLR2kDd65nabsE7jj4-EW'
OLD_IMAGES = {
    'sha256:8b073b3a5f63b66a836a46f672e1503f99c5d287f518d958cfc3cbf2c6c61bc7',
    'sha256:9ce61a97918975e9193b67143f165bb14d22fedef4d393ebc73d284a2fba7fa2',
}
KG_REV = 'b74a4b00-9454-412f-af5d-1317713a543c'
MEMBER_VOLUME = 'graph-knowledge-production_member_data'


def run(args, input=None, output=None):
    r = subprocess.run(args, input=input, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode:
        raise RuntimeError('Protected command failed: ' + args[0])
    return r.stdout.decode().strip() if r.stdout is not None else ''


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def emit(event, **values):
    print(json.dumps({'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      'event': event, **values}, ensure_ascii=False), flush=True)


def private_write(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(value)
    os.chmod(path, 0o600)


def atomic(path, value):
    temp = path.with_suffix(path.suffix + '.accounts-release.tmp')
    private_write(temp, value)
    os.replace(temp, path)


def switches(text, enabled):
    for key in FLAGS:
        line = key + '=' + ('1' if enabled else '0')
        pattern = r'^' + key + r'=.*$'
        assert len(re.findall(pattern, text, re.M)) <= 1, 'Duplicate switch'
        text = re.sub(pattern, line, text, flags=re.M) if re.search(pattern, text, re.M) else text.rstrip() + '\n' + line + '\n'
    return text


def service_patch(text, service, image):
    m = re.search(r'^  ' + re.escape(service) + r':\s*\n', text, re.M)
    assert m, 'Expected service missing'
    end = re.search(r'^(?:  [\w-]+:|[^\s#])', text[m.end():], re.M)
    stop = m.end() + end.start() if end else len(text)
    block = text[m.start():stop]
    block, count = re.subn(r'^    image:.*$', '    image: "' + image + '"', block, count=1, flags=re.M)
    assert count == 1
    if service == 'web':
        assert re.search(r'^    environment:\s*$', block, re.M)
        for key in FLAGS:
            line = '      ' + key + ': "${' + key + ':-0}"'
            pattern = r'^      ' + key + r':.*$'
            if re.search(pattern, block, re.M):
                block = re.sub(pattern, line, block, flags=re.M)
            else:
                block = re.sub(r'^(    environment:\s*\n)', r'\g<1>' + line + '\n', block, count=1, flags=re.M)
    return text[:m.start()] + block + text[stop:]


def http(path, base='http://127.0.0.1:3200'):
    try:
        with urllib.request.urlopen(urllib.request.Request(base + path, headers={'Cache-Control': 'no-cache'}), timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class Visible(HTMLParser):
    def __init__(self):
        super().__init__(); self.hidden = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def kg(base):
    status, body = http('/api/dataset', base)
    assert status == 200 and json.loads(body) == {'dataset': 'public-kg', 'revision': KG_REV}, 'KG revision differs'
    status, body = http('/', base)
    assert status == 200
    visible = Visible(); visible.feed(body.decode())
    match = re.search(r'([\d,]+)\s*の対象[^\d]*([\d,]+)\s*の関係', ''.join(visible.parts))
    assert match and [int(v.replace(',', '')) for v in match.groups()] == [2175, 1895], 'KG counts differ'
    return {'revision': KG_REV, 'entities': 2175, 'claims': 1895}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--directory', type=pathlib.Path, required=True)
    p.add_argument('--apply', action='store_true')
    p.add_argument('--disable', action='store_true')
    args = p.parse_args()
    assert os.geteuid() == 0, 'Run in the administrator terminal with sudo'
    os.umask(0o077)
    directory = args.directory.resolve()
    manifest = json.loads((directory / 'manifest.json').read_text())
    assert re.fullmatch(r'[a-f0-9]{40}', manifest['sourceCommit'])
    for name, checksum in manifest['releaseFiles'].items():
        assert name in ('release-public-accounts-production.py', 'recovery-public.pem')
        assert digest(directory / name) == checksum, 'Release file differs'
    assert digest(directory / manifest['archive']['file']) == manifest['archive']['sha256'], 'Image archive differs'
    lock = open(ROOT / '.member-activation.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    dc = ['docker', 'compose', '--env-file', str(ROOT / 'app.env'), '-f', str(ROOT / 'compose.yaml'), '--profile', 'member', '--profile', 'ops']
    def compose(*command): return run(dc + list(command))
    def inspect(service):
        cid = compose('ps', '-q', service)
        assert cid, 'Expected running service missing: ' + service
        return json.loads(run(['docker', 'inspect', cid]))[0]
    pg = inspect('graph-member-postgres'); web = inspect('web')
    def sql(query, database='graph_member'):
        return run(['docker', 'exec', '-i', pg['Id'], 'psql', '-X', '-At', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], input=query.encode())
    def ledger(database='graph_member'):
        return dict(line.split(' ', 1) for line in sql("SELECT name||' '||checksum FROM member_migration ORDER BY name", database).splitlines())
    def columns(database='graph_member'):
        return json.loads(sql("SELECT json_object_agg(table_name,cols) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t", database))
    def ident(value): return '"' + value.replace('"', '""') + '"'
    def fingerprints(schema, database='graph_member', legacy=False):
        result = {}
        for table, fields in schema.items():
            # The only intentional legacy value change is the unified User.name.
            selected = [v for v in fields if not (legacy and table == 'user' and v == 'name')]
            where = " WHERE name<'009'" if legacy and table == 'member_migration' else ''
            query = 'SELECT count(*)||\' \'||md5(coalesce(string_agg(row_to_json(x)::text,\',\' ORDER BY row_to_json(x)::text),\'\')) FROM (SELECT ' + ','.join(map(ident, selected)) + ' FROM ' + ident(table) + where + ') x'
            result[table] = sql(query, database)
        return result
    environment = dict(v.split('=', 1) for v in web['Config']['Env'] if '=' in v)
    assert environment['MEMBER_ORIGIN'] == 'https://plunode.net' and environment['MEMBER_COOKIE_PREFIX'] == 'gk-member-production'
    assert environment['MEMBER_AUTH_PROVIDER'] == 'google' and environment['MEMBER_STORAGE_ENABLED'] == '1'
    assert environment['GRAPH_DEPLOYMENT'] == 'production' and environment['GRAPH_DATASET'] == 'public-kg'
    assert environment.get('MEMBER_FIXTURE_ENABLED', '0') in ('', '0')
    db = urllib.parse.urlsplit(environment['MEMBER_DATABASE_URL'])
    assert (db.hostname, db.port, db.path, db.username) == ('graph-member-postgres', 5432, '/graph_member', 'gk_member')
    assert any(v.get('Name') == MEMBER_VOLUME for v in pg['Mounts'])
    if args.disable:
        assert web['Image'] in manifest['web']['allowedImageIds'] and ledger() == manifest['migrations']
        atomic(ROOT / 'app.env', switches((ROOT / 'app.env').read_text(), False))
        compose('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'web')
        assert http('/api/accounts/profiles/plunode-official-ai')[0] == 404 and http('/api/ai-lab')[0] == 404
        emit('same-build-disabled',dataDropped=False); return
    assert web['Image'] in OLD_IMAGES and run(['docker', 'exec', web['Id'], 'cat', '/app/.next-public/BUILD_ID']) == OLD_BUILD, 'Production changed; inspect before proceeding'
    assert ledger() == {k: v for k, v in manifest['migrations'].items() if k < '009'}, 'Existing ledger/checksum differs'
    assert environment.get('COMMUNITY_ENABLED') == '1' and environment.get('SITE_OPERATIONS_ENABLED') == '1'
    assert environment.get('SITE_OPERATOR_USER_IDS') and environment.get('MEMBER_GOOGLE_CLIENT_ID') and environment.get('MEMBER_GOOGLE_CLIENT_SECRET')
    runtime = {name: inspect(name) for name in ('graph-member-postgres', 'graph-neo4j')}
    live = kg('https://plunode.net'); assert live == kg('http://127.0.0.1:3200')
    assert shutil.disk_usage(ROOT).free > 8 * 1024**3
    assert not any('member-ops' in line for line in run(['docker', 'ps', '--format', '{{.Names}}']).splitlines()), 'Another member operator is running'
    original_compose = (ROOT / 'compose.yaml').read_text(); original_env = (ROOT / 'app.env').read_text()
    configured = json.loads(compose('config', '--format', 'json'))
    candidate = service_patch(service_patch(original_compose, 'web', manifest['web']['tag']), 'member-ops', manifest['memberOps']['tag'])
    stage = ROOT / 'compose.accounts-release-check.yaml'; private_write(stage, candidate)
    try:
        staged = json.loads(run(['docker', 'compose', '--env-file', str(ROOT / 'app.env'), '-f', str(stage), '--profile', 'member', '--profile', 'ops', 'config', '--format', 'json']))
        expected = copy.deepcopy(configured)
        expected['services']['web']['image'] = manifest['web']['tag']; expected['services']['member-ops']['image'] = manifest['memberOps']['tag']
        for key in FLAGS: expected['services']['web']['environment'][key] = environment.get(key, '0')
        assert staged == expected, 'Compose patch exceeds the authorized scope'
    finally: stage.unlink(missing_ok=True)
    emit('preflight-ok', source=manifest['sourceCommit'], build=manifest['build'], ledgerCount=9, kg=live, existingTables=len(columns()))
    if not args.apply: return
    run(['docker', 'load', '--input', str(directory / manifest['archive']['file'])])
    for item in (manifest['web'], manifest['memberOps']):
        image = json.loads(run(['docker', 'image', 'inspect', item['tag']]))[0]
        assert image['Id'] in item['allowedImageIds'] and (image['Os'], image['Architecture']) == ('linux', 'amd64')
        assert image['Config']['Labels']['org.opencontainers.image.revision'] == manifest['sourceCommit']
    backup = ROOT / 'backups' / ('accounts-release-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, value in [('compose.yaml', original_compose), ('app.env', original_env), ('manifest.json', json.dumps(manifest)), ('runtime.json', json.dumps({k: {'id': v['Id'], 'started': v['State']['StartedAt']} for k, v in runtime.items()}))]:
        private_write(backup / name, value)
    stopped = False; migration_attempted = False
    def unchanged_runtime():
        for name, before in runtime.items():
            current = inspect(name)
            assert current['Id'] == before['Id'] and current['State']['StartedAt'] == before['State']['StartedAt'], 'Non-Web runtime changed'
    def health():
        current = inspect('web')
        assert current['Image'] in manifest['web']['allowedImageIds'] and current['State'].get('Health', {}).get('Status') == 'healthy'
        assert run(['docker', 'exec', current['Id'], 'cat', '/app/.next-public/BUILD_ID']) == manifest['build']
        for key, value in environment.items():
            if key not in FLAGS:
                actual = dict(v.split('=', 1) for v in current['Config']['Env'] if '=' in v)
                assert actual.get(key) == value, 'Existing runtime setting changed: ' + key
        unchanged_runtime()
        assert kg('http://127.0.0.1:3200') == live
        return current
    try:
        compose('stop', '-t', '30', 'web'); stopped = True; emit('web-stopped')
        schema = columns(); before = fingerprints(schema); legacy = fingerprints(schema, legacy=True)
        users = json.loads(sql('SELECT coalesce(json_agg(row_to_json(u)),\'[]\') FROM (SELECT id,name,email FROM "user" ORDER BY id) u'))
        private_write(backup / 'before.json', json.dumps({'schema': schema, 'fingerprints': before, 'users': users}))
        dump = backup / 'member-before-accounts.dump'
        with dump.open('wb') as f:
            run(['docker', 'exec', pg['Id'], 'pg_dump', '-U', 'postgres', '-d', 'graph_member', '-Fc', '--no-owner', '--no-acl'], output=f)
        assert dump.stat().st_size > 0
        restore_db = 'graph_member_restore_issue39_' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
        assert re.fullmatch(r'graph_member_restore_issue39_[0-9]{14}', restore_db)
        sql('CREATE DATABASE ' + ident(restore_db) + ' TEMPLATE template0; REVOKE CONNECT ON DATABASE ' + ident(restore_db) + ' FROM PUBLIC;')
        run(['docker', 'exec', '-i', pg['Id'], 'pg_restore', '-U', 'postgres', '-d', restore_db, '--no-owner', '--no-acl', '--exit-on-error'], input=dump.read_bytes())
        assert columns(restore_db) == schema and fingerprints(schema, restore_db) == before and ledger(restore_db) == ledger(), 'Separate DB restore differs'
        private_write(backup / 'restore.json', json.dumps({'database': restore_db, 'tables': len(schema), 'allRowsEqual': True, 'dumpSha256': digest(dump)}))
        sql('DROP DATABASE ' + ident(restore_db))
        # Encrypt only after a real restore. The recovery private key stays local.
        payload = backup / 'recovery.tar'
        with tarfile.open(payload, 'w') as tar:
            for name in ('member-before-accounts.dump', 'compose.yaml', 'app.env', 'manifest.json', 'runtime.json', 'before.json', 'restore.json'):
                tar.add(backup / name, arcname=name)
        key = backup / 'encryption-key'; private_write(key, os.urandom(48).hex())
        encrypted = backup / 'recovery.tar.enc'; wrapped = backup / 'recovery-key.enc'
        run(['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', str(payload), '-out', str(encrypted), '-pass', 'file:' + str(key)])
        run(['openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', str(directory / 'recovery-public.pem'), '-in', str(key), '-out', str(wrapped), '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256'])
        verified = backup / 'recovery.verify.tar'
        run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', str(encrypted), '-out', str(verified), '-pass', 'file:' + str(key)])
        assert digest(payload) == digest(verified)
        for path in (payload, verified, key): path.unlink()
        export = directory / 'backup-export'; export.mkdir(mode=0o700, exist_ok=False)
        owner = pwd.getpwnam('develop'); os.chown(export, owner.pw_uid, owner.pw_gid)
        for path in (encrypted, wrapped):
            target = export / path.name; shutil.copy2(path, target); os.chown(target, owner.pw_uid, owner.pw_gid)
        emit('backup-restored-verified', directory=str(backup), sha256=digest(dump), tables=len(schema), allRowsEqual=True, separateDatabase=restore_db, encryptedExport=str(export))
        atomic(ROOT / 'compose.yaml', candidate); atomic(ROOT / 'app.env', switches(original_env, False))
        migration_attempted = True
        migration = ('run', '--rm', '--no-deps', 'member-ops', 'scripts/member-migrate.ts', '--public-profiles', '--confirm-origin', 'https://plunode.net')
        compose(*migration)
        assert ledger() == manifest['migrations'] and fingerprints(schema, legacy=True) == legacy, 'Migration changed legacy records'
        assert sql('SELECT count(*) FROM "user" u LEFT JOIN public_profile p ON p.user_id=u.id WHERE p.id IS NULL OR p.display_name IS DISTINCT FROM u.name') == '0'
        assert sql("SELECT string_agg(id::text,',' ORDER BY id) FROM ai_identity") == '501350be-a89f-4bde-9a06-d94631b47be5,fe93a431-85cf-4fae-8b84-127e8bf866a7'
        assert sql('SELECT (SELECT count(*) FROM community WHERE activity_public)+(SELECT count(*) FROM community_thread WHERE activity_public)+(SELECT count(*) FROM community_post WHERE activity_public)') == '0'
        names = json.loads(sql('SELECT coalesce(json_object_agg(id,name),\'{}\') FROM "user"'))
        for user in users:
            name = user['name']; valid = name is not None and 1 <= len(name.strip()) <= 80 and not re.search(r'[\x00-\x1f\x7f]', name) and not re.fullmatch(r'[^\s@]+@[^\s@]+', name) and name.strip().lower() != user['email'].lower()
            assert names[user['id']] == name.strip() if valid else re.fullmatch(r'Explorer [a-f0-9]{12}', names[user['id']]), 'Unexpected name migration'
        after_schema = columns(); after = fingerprints(after_schema)
        compose(*migration)
        assert fingerprints(after_schema) == after, 'Migration retry is not idempotent'
        private_write(backup / 'migration.json', json.dumps({'ledger': ledger(), 'fingerprints': after, 'legacyRowsEqualExceptUnifiedName': True, 'idempotent': True}))
        emit('migration-verified', ledgerCount=11, profilesMissing=0, stableAiIdentities=2, legacyPreserved=True, idempotent=True)
        compose('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'web'); health()
        assert http('/api/accounts/profiles/plunode-official-ai')[0] == 404 and http('/api/member/profile')[0] == 401
        atomic(ROOT / 'app.env', switches(original_env, True))
        compose('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'web'); current = health()
        for path, status in [('/api/member/status', 200), ('/api/member/profile', 401), ('/api/communities', 200), ('/api/site-operations/summary', 401), ('/api/accounts/profiles/plunode-official-ai', 200), ('/api/accounts/profiles/explorer-apprentice', 200), ('/api/ai-lab', 200), ('/ai/official-profile.png', 200), ('/ai/official-small.png', 200), ('/ai-lab/apprentice-profile.png', 200)]:
            assert http(path)[0] == status, 'Release HTTP check failed: ' + path
        assert kg('https://plunode.net') == live
        result = {'sourceCommit': manifest['sourceCommit'], 'build': manifest['build'], 'webImageId': current['Image'], 'ledgerCount': 11, 'legacyPreserved': True, 'runtimePreserved': True, 'kg': live, 'backup': str(backup)}
        private_write(backup / 'result.json', json.dumps(result, indent=2)); emit('release-complete', **result)
    except Exception:
        if stopped:
            try:
                atomic(ROOT / 'compose.yaml', candidate if migration_attempted else original_compose)
                atomic(ROOT / 'app.env', switches(original_env, False) if migration_attempted else original_env)
                compose('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'web')
                emit('safety-recovery', mode='new-build-switches-off' if migration_attempted else 'unchanged-old-web', dataDropped=False, backup=str(backup))
            except Exception:
                emit('manual-recovery-needed', backup=str(backup), dataDropped=False)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('release-stopped', errorType=type(error).__name__, reason=str(error) if isinstance(error, AssertionError) else 'Review protected state; no live DB restore or destructive recovery was performed.')
        raise SystemExit(1)
