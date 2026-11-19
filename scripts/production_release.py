#!/usr/bin/env python3
"""Plan, stage and apply an approved release to the existing Plunode topology."""
import argparse
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
from urllib.parse import urlencode
from urllib.request import urlopen

from production_image_verification import atomic, digest, emit, patch_image, private
from production_release_bundle import build_images, load_images
from production_release_plan import (
    DATABASES, HEX, OPS_PINS, SERVICES, SHA, WORKERS, expected_ledgers, file_at, ledger_index,
    load_json, make_plan, migration_path, release_tags, require, validate_migration_sql, validate_plan,
)

ROOT = Path('/opt/graph-knowledge')
ORIGIN = 'https://plunode.net'
BETA_DATABASES = {'member': 'graph-knowledge-member-beta-postgres-1', 'knowledge': 'plunode-knowledge-beta-postgres'}
COMPATIBILITY = '/api/publication/compatibility'
TOOLS = ('production_release.py', 'production_release_plan.py', 'production_release_bundle.py',
         'production_image_verification.py', 'production-release-probe.cjs')
ENV_FILES = ('app.env', 'knowledge.env')
ADVISORY_LOCKS = {'member': 71900261, 'knowledge': 7500001}
SEAL = 'RELEASE-SHA256SUMS'


def write_json(path, payload):
    atomic(path, json.dumps(payload, ensure_ascii=False, indent=2) + '\n')


def stage_files(plan):
    return sorted([*TOOLS, 'plan.json', 'manifest.json', 'images.tar.gz',
                   *(migration_path(m['database'], m['name']) for m in plan['migrations'])])


def prepare(source_root, stage, plan):
    stage.mkdir(mode=0o700)
    for name in TOOLS:
        shutil.copyfile(Path(__file__).resolve().parent / name, stage / name)
    write_json(stage / 'plan.json', plan)
    for migration in plan['migrations']:
        name = migration_path(migration['database'], migration['name'])
        path = stage / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(file_at(source_root, plan['sourceCommit'], name))
        require(digest(path) == migration['checksum'], 'Migration bytes differ from the plan')
    manifest = build_images(source_root, stage, plan)
    write_json(stage / 'manifest.json', manifest)
    private(stage / SEAL, ''.join(f'{digest(stage / name)}  {name}\n' for name in stage_files(plan)))
    emit('prepared', stage=str(stage), sealSha256=digest(stage / SEAL), build=manifest['build'])


def verify_stage(stage, seal):
    require(HEX.fullmatch(seal) and digest(stage / SEAL) == seal, 'Release seal differs from approved seal')
    plan = validate_plan(load_json(stage / 'plan.json'))
    files = stage_files(plan)
    for name in [SEAL, *files]:
        path = stage / name
        require(path.resolve() == path and path.is_file() and path.stat().st_uid == os.geteuid()
                and not path.stat().st_mode & 0o022, 'Stage must contain regular root-controlled files')
    require((stage / SEAL).read_text() == ''.join(f'{digest(stage / name)}  {name}\n' for name in files),
            'Release files differ from the approved seal')
    manifest = load_json(stage / 'manifest.json')
    keys = {'sourceCommit', 'build', 'archiveSha256'}
    for key, selected in (('web', plan['web']), ('memberOps', plan['workers'])):
        if selected:
            keys.add(key)
    require(set(manifest) == keys and manifest['sourceCommit'] == plan['sourceCommit']
            and re.fullmatch(r'[A-Za-z0-9_-]{8,80}', manifest['build'])
            and (plan['web'] or manifest['build'] == plan['baseline']['build']), 'Image manifest differs from the plan')
    for key, tag in release_tags(plan).items():
        require(manifest[key]['tag'] == tag
                and re.fullmatch(r'sha256:[0-9a-f]{64}', manifest[key]['imageId']), 'Unexpected release image tag')
    for migration in plan['migrations']:
        path = stage / migration_path(migration['database'], migration['name'])
        require(digest(path) == migration['checksum'], 'Migration checksum differs')
        validate_migration_sql(path.read_bytes())
    return plan, manifest


def must_recover_forward(plan, applied, state):
    return (state['publicationStarted'] or state['workersStarted']
            or plan['recovery'] == 'forward' and (applied > 0 or state['webStarted']))


class Production:
    def __init__(self, root, log):
        self.root = root
        self.log = log
        self.compose = root / 'compose.yaml'
        self.dc = ['docker', 'compose', '--project-directory', str(root), '--env-file', str(root / 'app.env'),
                   '-f', str(self.compose), '--profile', 'member', '--profile', 'ops', '--profile', 'knowledge']
        self.pg = self.run(self.dc + ['ps', '-q', 'graph-member-postgres'])
        require(self.pg, 'Production PostgreSQL is unavailable')

    def run(self, args, *, data=None, output=None, stdin=None, limit=100, label=None, before_exec=None):
        result = subprocess.run(args, input=data, stdin=stdin, stdout=output or subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=limit, preexec_fn=before_exec)
        if result.returncode:
            if self.log:
                private(self.log, result.stderr.decode(errors='replace')[-16000:])
            raise RuntimeError(f'Failed operation: {label or args[0]}')
        return result.stdout.decode().strip() if output is None else ''

    def dc_run(self, *args, **kwargs):
        return self.run(self.dc + list(args), **kwargs)

    def sql(self, db, query):
        return self.run(self.psql(db) + ['-c', query], label=f'{db} read')

    def psql(self, db):
        database = DATABASES[db][0]
        return ['docker', 'exec', '-i', self.pg, 'psql', '-X', '-qAt', '-U', 'postgres',
                '-d', database, '-v', 'ON_ERROR_STOP=1']

    def ledgers(self):
        return {db: json.loads(self.sql(db, f"SELECT coalesce(json_object_agg(name,checksum),'{{}}') FROM {ledger}"))
                for db, (_, ledger, _) in DATABASES.items()}

    def config(self, compose=None):
        command = [str(compose) if a == str(self.compose) and compose else a for a in self.dc]
        config = json.loads(self.run(command + ['config', '--format', 'json'], label='Compose validation'))
        require(config['services']['web']['environment']['MEMBER_ORIGIN'] == ORIGIN
                and all(config['services'][service]['environment']['KNOWLEDGE_RUNTIME'] == 'production'
                        for service in SERVICES), 'Production Compose profile differs')
        return config

    def inspect(self, service):
        cid = self.dc_run('ps', '-a', '-q', service, label=f'{service} container')
        if not cid:
            return None
        return json.loads(self.run(['docker', 'inspect', cid], label=f'{service} inspect'))[0]

    def service_present(self, service, image_id):
        item = self.inspect(service)
        require(item and item['Image'] == image_id and item['State']['Running'], f'{service} is not running the expected image')
        health = item['State'].get('Health')
        require(not health or health['Status'] == 'healthy', f'{service} is unhealthy')
        return item

    def env_fingerprints(self):
        return {name: digest(self.root / name) for name in ENV_FILES}

    def active_generation(self):
        return self.sql('knowledge', 'SELECT active_generation FROM knowledge75.publication_control WHERE singleton')

    def build(self):
        return self.dc_run('exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID', label='Web build ID')

    def audit(self):
        config = self.config()
        services = {}
        for name in SERVICES:
            item = self.inspect(name)
            require(item and item['State']['Running'] and config['services'][name]['image'] == item['Config']['Image'],
                    f'{name} is not running the configured image')
            services[name] = {'source': item['Config']['Labels']['org.opencontainers.image.revision'],
                              'imageId': item['Image']}
        return {'build': self.build(), 'services': services, 'composeSha256': digest(self.compose),
                'envSha256': self.env_fingerprints(), 'ledgers': self.ledgers()}

    def probe(self, source, before=None):
        return json.loads(self.dc_run('exec', '-T', 'web', 'node', '-e', source, json.dumps(before),
                                     label='Published search, cursor, Graph and fixed revision', limit=140))

    def candidate(self, old, pins):
        desired = copy.deepcopy(self.config(old))
        text = old.read_text()
        for service, tag in pins.items():
            desired['services'][service]['image'] = tag
            text = patch_image(text, service, tag)
        candidate = old.with_name('candidate.yaml')
        atomic(candidate, text)
        require(self.config(candidate) == desired, 'Compose change extends beyond approved image pins')
        return candidate

    def backup(self, folder, databases):
        if not databases:
            return
        import resource

        for db in sorted(databases):
            database, ledger, _ = DATABASES[db]
            path = folder / f'{db}.dump'
            partial = folder / f'{db}.dump.partial'
            allowance = shutil.disk_usage(folder).free - 1024**3
            require(allowance > 0, 'Insufficient free space for a database backup')

            def limit_dump():
                resource.setrlimit(resource.RLIMIT_FSIZE, (allowance, allowance))

            try:
                with partial.open('wb') as out:
                    self.run(['docker', 'exec', self.pg, 'pg_dump', '-U', 'postgres', '-d', database, '-Fc', '-Z1'],
                             output=out, label=f'{db} backup', limit=1800, before_exec=limit_dump)
                with partial.open('rb') as saved:
                    toc = self.run(['docker', 'exec', '-i', self.pg, 'pg_restore', '--list'],
                                   stdin=saved, label=f'{db} backup index', limit=120)
                schema, table = ledger.split('.')
                require(f'TABLE DATA {schema} {table} ' in toc, f'{db} backup lacks its migration ledger')
                partial.replace(path)
                write_json(folder / f'{db}-backup.json', {'sha256': digest(path), 'bytes': path.stat().st_size})
            finally:
                partial.unlink(missing_ok=True)

    def migrate(self, stage, migration, before):
        db, name, checksum = (migration[key] for key in ('database', 'name', 'checksum'))
        _, ledger, _ = DATABASES[db]
        owner = self.sql(db, f"SELECT quote_ident(pg_get_userbyid(relowner)) FROM pg_class WHERE oid='{ledger}'::regclass")
        require(re.fullmatch(r'(?:[a-z][a-z0-9_]*|"[A-Za-z0-9_-]+")', owner), 'Unexpected migration owner')
        sql = (stage / migration_path(db, name)).read_text()
        expected = json.dumps(before[db], sort_keys=True)
        # The accepted SQL is a transaction-safe migration. Match the ledger under the
        # same advisory lock as the application's migration entry point.
        statement = f"""SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '10min';
SELECT pg_advisory_xact_lock({ADVISORY_LOCKS[db]});
DO $release$ BEGIN
  IF (SELECT coalesce(jsonb_object_agg(name,checksum),'{{}}'::jsonb) FROM {ledger}) <> '{expected}'::jsonb THEN
    RAISE EXCEPTION 'Migration ledger changed';
  END IF;
END $release$;
SET LOCAL ROLE {owner};
{sql}
INSERT INTO {ledger}(name,checksum) VALUES ('{name}','{checksum}');
"""
        self.run(self.psql(db) + ['--single-transaction', '-f', '-'], data=statement.encode(),
                 label=f'Apply {db}/{name}', limit=660)

    def start(self, services):
        if services:
            self.dc_run('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180',
                        *services, label='Start selected services', limit=260)

    def stop(self, services):
        if services:
            self.dc_run('stop', '-t', '60', *services, label='Stop selected services', limit=200)


def release(runtime, stage, seal, plan, manifest):
    root = runtime.root
    before = plan['baseline']
    web, workers = plan['web'], plan['workers']
    changed = (('web',) if web else ()) + (WORKERS if workers else ())
    image_keys = {**({'web': 'web'} if web else {}), **(dict.fromkeys(OPS_PINS, 'memberOps') if workers else {})}
    probe = (stage / 'production-release-probe.cjs').read_text()
    folder = root / 'backups' / f'release-{plan["sourceCommit"][:12]}-{seal[:16]}'
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    saved = folder / 'compose.yaml'
    journal = folder / 'state.json'
    current = runtime.ledgers()
    applied = ledger_index(plan, current)
    require(runtime.env_fingerprints() == before['envSha256'], 'Environment changed since approval')
    require(not (folder / 'activated.json').exists(), 'This release has already completed')
    if journal.exists():
        state = load_json(journal)
        require(state['seal'] == seal and digest(saved) == before['composeSha256'], 'Recovery record differs')
        candidate_file = folder / 'candidate.yaml'
        known_compose = {before['composeSha256'], digest(candidate_file)}
        require(digest(runtime.compose) in known_compose, 'Live Compose is outside this release')
    else:
        require(runtime.audit() == before, 'Production changed since approval')
        require(applied == 0, 'A migration is present without a release recovery record')
        state = {'seal': seal, 'publicationStarted': False, 'workersStarted': False,
                 'webStarted': False, 'writersStopped': False, 'beforeProbe': runtime.probe(probe), 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
        atomic(saved, runtime.compose.read_text())

    for service in set(SERVICES) - set(changed):
        runtime.service_present(service, before['services'][service]['imageId'])
    # A restorable previous image must still be pinned locally before Docker load.
    prior_config = runtime.config(saved)
    pins = {service: manifest[key]['tag'] for service, key in image_keys.items()}
    for service in changed:
        tag = prior_config['services'][service]['image']
        inspected = runtime.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag], label='Previous image')
        require(inspected == before['services'][service]['imageId'] and tag != pins[service],
                'Previous image is unavailable or shares the candidate tag')
    images = load_images(stage, manifest)
    candidate = runtime.candidate(saved, pins)
    expected_images = {name: images[image_keys[name]] if name in changed else before['services'][name]['imageId']
                       for name in SERVICES}
    if not journal.exists():
        runtime.backup(folder, {m['database'] for m in plan['migrations']})
        write_json(journal, state)
        emit('release-prepared', backup=str(folder), services=list(changed), migrations=plan['migrations'])

    try:
        if workers:
            runtime.stop(WORKERS)
        if plan['migrations'] or plan['rebuildPublication']:
            if not state['writersStopped']:
                state['beforeProbe'] = runtime.probe(probe)
                state['writersStopped'] = True
                write_json(journal, state)
            runtime.stop(('web',))
        current = runtime.ledgers()
        applied = ledger_index(plan, current)
        if plan['rebuildPublication'] and not state['publicationStarted']:
            require(runtime.sql('knowledge', '''SELECT NOT EXISTS (
              SELECT 1 FROM knowledge75.changes c WHERE NOT EXISTS (
                SELECT 1 FROM knowledge75.publication_seen_changes s WHERE s.sequence=c.sequence))''') == 't',
                    'An ordinary publication is pending; finish it before a forced rebuild')
        for migration in plan['migrations'][applied:]:
            runtime.migrate(stage, migration, current)
            current = runtime.ledgers()
            applied = ledger_index(plan, current)
        require(current == expected_ledgers(plan), 'Final migration ledgers differ')
        atomic(runtime.compose, candidate.read_text())

        if plan['rebuildPublication'] and not state['workersStarted']:
            previous = state['beforeProbe']['generation']
            active = runtime.active_generation()
            if not state['publicationStarted']:
                require(active == previous, 'Active publication changed after the workers stopped')
                state['publicationStarted'] = True
                write_json(journal, state)
            if active == previous:
                runtime.dc_run('run', '--rm', '--no-deps', '--name', 'plunode-release-publisher-' + seal[:16],
                               'knowledge-publisher',
                               'scripts/knowledge-publication-worker.ts', '--once', '--force',
                               label='Rebuild public projection', limit=900)
                require(runtime.active_generation() != previous, 'Publisher did not activate a generation')
        if web:
            state['webStarted'] = True
            write_json(journal, state)
            runtime.start(('web',))
        require(runtime.build() == manifest['build'], 'Running Web build differs')
        result = runtime.probe(probe, state['beforeProbe'])
        if plan['rebuildPublication']:
            require(result['generation'] == runtime.active_generation()
                    and result['generation'] != state['beforeProbe']['generation'], 'Web is not reading the rebuilt generation')
        if workers:
            state['workersStarted'] = True
            write_json(journal, state)
            runtime.start(WORKERS)
            time.sleep(5)
        for service, image_id in expected_images.items():
            item = runtime.service_present(service, image_id)
            if service in changed and service != 'web':
                require(item['RestartCount'] == 0, f'{service} restarted during verification')
        require(runtime.ledgers() == expected_ledgers(plan) and runtime.env_fingerprints() == before['envSha256'],
                'Ledger or environment changed during cutover')
        summary = {'sourceCommit': plan['sourceCommit'], 'build': manifest['build'], 'services': list(changed),
                   'generation': result['generation'], 'backup': str(folder)}
        write_json(folder / 'activated.json', summary)
        emit('activated', **summary)
    except BaseException:
        try:
            applied = ledger_index(plan, runtime.ledgers())
            if must_recover_forward(plan, applied, state):
                emit('forward-recovery-required', backup=str(folder), applied=applied)
            else:
                atomic(runtime.compose, saved.read_text())
                runtime.start(changed)
                require(runtime.build() == before['build'], 'Previous Web build did not recover')
                for service in changed:
                    runtime.service_present(service, before['services'][service]['imageId'])
                runtime.probe(probe)
                state['webStarted'] = False
                state['writersStopped'] = False
                write_json(journal, state)
                emit('previous-services-restored', backup=str(folder), applied=applied)
        except Exception:
            emit('recovery-needs-operator', backup=str(folder))
            raise
        raise


def beta_evidence(source, build):
    with urlopen('http://127.0.0.1:3200' + COMPATIBILITY, timeout=20) as response:
        require(json.load(response)['buildId'] == build, 'Loopback beta build differs from acceptance evidence')
    ledgers = {}
    for db, container in BETA_DATABASES.items():
        ledger = DATABASES[db][1]
        sql = f"SELECT coalesce(json_object_agg(name,checksum),'{{}}') FROM {ledger}"
        command = ['docker', 'exec', container, 'sh', '-ec',
                   'exec psql -XqAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$1"',
                   'psql', sql]
        ledgers[db] = json.loads(subprocess.check_output(command))
    with urlopen('http://127.0.0.1:3200' + COMPATIBILITY, timeout=20) as response:
        require(json.load(response)['buildId'] == build, 'Beta was updated during evidence collection')
    return {'sourceCommit': source, 'build': build, 'ledgers': ledgers}


def verify_public(build=None):
    def get(endpoint, *, as_json=True):
        url = ORIGIN + endpoint
        with urlopen(url, timeout=30) as response:
            require(response.status == 200 and response.url == url, 'Unexpected production HTTPS response')
            return json.load(response) if as_json else None

    get('/', as_json=False)
    require(get('/api/dataset')['dataset'] == 'public-kg', 'Unexpected public dataset')
    publication = '/api/knowledge/public?'
    generation = get(publication + 'mode=status')['active']['id']
    require(generation, 'Public HTTPS has no active generation')
    actual = get(COMPATIBILITY)['buildId']
    require(actual and (not build or actual == build), 'Public Web build differs')
    first = get(publication + 'mode=search&limit=2')
    require(first['nextCursor'], 'Public HTTPS search did not return a cursor')
    second = get(publication + urlencode({'mode': 'search', 'limit': 2, 'cursor': first['nextCursor']}))
    require(len(first['records']) == len(second['records']) == 2 and first['generation'] == second['generation'],
            'Public HTTPS pagination differs')
    emit('https-verified', generation=generation, build=actual)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('audit')
    beta = commands.add_parser('beta-evidence')
    for name in ('source', 'build', 'output'):
        beta.add_argument('--' + name, required=True)
    planning = commands.add_parser('plan')
    for name in ('source', 'baseline', 'beta-evidence', 'output'):
        planning.add_argument('--' + name, required=True)
    planning.add_argument('--migration', action='append', default=[])
    planning.add_argument('--rebuild-publication', action='store_true')
    planning.add_argument('--rollback-compatible', action='store_true')
    preparation = commands.add_parser('prepare')
    preparation.add_argument('--plan', required=True)
    preparation.add_argument('--stage', required=True, type=Path)
    application = commands.add_parser('apply')
    application.add_argument('--stage', required=True, type=Path)
    application.add_argument('--seal-sha256', required=True)
    public = commands.add_parser('verify-https')
    public.add_argument('--build')
    args = parser.parse_args()
    source_root = Path(__file__).resolve().parent.parent
    if args.command == 'plan':
        plan = make_plan(source_root, args.source, load_json(args.baseline), load_json(args.beta_evidence),
                         args.migration, args.rebuild_publication, args.rollback_compatible)
        write_json(Path(args.output), plan)
    elif args.command == 'beta-evidence':
        require(SHA.fullmatch(args.source), 'Provide the full accepted beta source SHA')
        write_json(Path(args.output), beta_evidence(args.source, args.build))
    elif args.command == 'prepare':
        prepare(source_root, args.stage.resolve(), validate_plan(load_json(args.plan)))
    elif args.command == 'verify-https':
        verify_public(args.build)
    else:
        import fcntl

        require(os.geteuid() == 0, 'Production audit and activation require administrator privileges')
        os.umask(0o077)
        with (ROOT / '.member-activation.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.command == 'audit':
                print(json.dumps(Production(ROOT, None).audit(), indent=2))
            else:
                stage = args.stage.resolve()
                require(stage.parent == Path('/root') and stage.stat().st_uid == 0
                        and not stage.stat().st_mode & 0o077, 'Stage must be a private directory under /root')
                plan, manifest = verify_stage(stage, args.seal_sha256)
                release(Production(ROOT, stage / 'command-failure.txt'), stage, args.seal_sha256, plan, manifest)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error)) from None
