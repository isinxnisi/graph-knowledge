"""Plan the ordinary Plunode application release from fixed Git and ledger evidence."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

WORKERS = ('knowledge-publisher', 'knowledge-review', 'knowledge-patrol')
SERVICES = ('web', *WORKERS)
OPS_PINS = ('member-ops', 'knowledge-ops', *WORKERS)
DATABASES = {
    'member': ('graph_member', 'public.member_migration', 'db/member'),
    'knowledge': ('plunode_knowledge75_production', 'knowledge75.migrations', 'migrations/knowledge-foundation'),
}
WEB_FILES = {
    'Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'proxy.ts',
    'scripts/public-kg.ts', 'scripts/production-readiness.mjs', 'scripts/build-publication-probe.mjs',
    'scripts/publication-compatibility.ts', 'scripts/knowledge-mission-client.ts',
    'scripts/generate-contribution-roles.ts', 'docs/research/phase-13-relation-model/v2/ledger.json',
}
WEB_PREFIXES = ('app/', 'components/', 'lib/', 'public/', 'db/member/', 'migrations/knowledge-foundation/',
                'vocabulary/', 'neo4j/', 'datasets/', 'data/')
OPS_FILES = {
    'Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'tsconfig.json',
    'scripts/production-readiness.mjs', 'scripts/member-migrate.ts', 'scripts/member-ops.ts',
    'scripts/community-safety.ts', 'scripts/community-recovery.ts', 'scripts/ai-identity-ops.ts',
    'scripts/official-profile-ops.ts', 'scripts/repair-webb-collection-publication.ts',
}
OPS_PREFIXES = ('lib/', 'db/member/', 'migrations/knowledge-foundation/', 'vocabulary/', 'neo4j/',
                'datasets/', 'data/', 'fixtures/')
HEX = re.compile(r'^[0-9a-f]{64}$')
SHA = re.compile(r'^[0-9a-f]{40}$')
MIGRATION_NAME = re.compile(r'^\d{3}-[a-z0-9][a-z0-9-]*\.sql$')
PROJECTION_MIGRATION = '012-publication-storage.sql'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def release_tags(plan):
    suffix = plan['sourceCommit'] + '-' + checksum(json.dumps(plan, sort_keys=True).encode())[:12]
    tags = {}
    if plan['web']:
        tags['web'] = 'plunode-web:release-' + suffix
    if plan['workers']:
        tags['memberOps'] = 'plunode-knowledge-ops:release-' + suffix
    return tags


def file_at(root, source, path):
    return git(root, 'show', f'{source}:{path}')


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def relevant_web(path):
    return path in WEB_FILES or path.startswith(WEB_PREFIXES)


def relevant_workers(path):
    return (path in OPS_FILES or path.startswith(OPS_PREFIXES)
            or path.startswith('scripts/knowledge-') and path.endswith('.ts'))


def changes_since(root, old, source, *options):
    require(SHA.fullmatch(old), 'The running image has no fixed source SHA')
    check = subprocess.run(['git', '-C', str(root), 'merge-base', '--is-ancestor', old, source])
    require(check.returncode == 0, 'The candidate does not descend from the running source')
    return set(git(root, 'diff', '--name-only', '--no-renames', '-z', *options, old, source).decode().rstrip('\0').split('\0')) - {''}


def migration_path(db, name):
    require(db in DATABASES and MIGRATION_NAME.fullmatch(name), 'Invalid migration identifier')
    return f'{DATABASES[db][2]}/{name}'


def validate_migration_sql(data):
    # Skip quoted function bodies and literals before spotting top-level transaction commands.
    quoted = re.compile(
        rb"--[^\r\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\""
        rb"|(?P<block>\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$)[\s\S]*?(?P=block)"
    )
    statements = quoted.sub(b' ', data)
    boundary = rb'(?i)(?:^|;)\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT)(?:\s|;|$)'
    require(b'\\' not in statements and not re.search(boundary, statements),
            'Migration contains a transaction boundary or psql command')


def validate_ledgers(ledgers):
    require(set(ledgers) == set(DATABASES), 'Both database ledgers are required')
    for rows in ledgers.values():
        require(isinstance(rows, dict) and all(MIGRATION_NAME.fullmatch(name) and HEX.fullmatch(value)
                                               for name, value in rows.items()), 'Malformed migration ledger')


def expected_ledgers(plan):
    rows = {db: dict(ledger) for db, ledger in plan['baseline']['ledgers'].items()}
    for item in plan['migrations']:
        rows[item['database']][item['name']] = item['checksum']
    return rows


def ledger_index(plan, current):
    """Return the exact approved prefix still present after a failed attempt."""
    rows = {db: dict(ledger) for db, ledger in plan['baseline']['ledgers'].items()}
    for index in range(len(plan['migrations']) + 1):
        if rows == current:
            return index
        if index < len(plan['migrations']):
            item = plan['migrations'][index]
            rows[item['database']][item['name']] = item['checksum']
    raise ValueError('Live migration ledgers differ from the approved release sequence')


def validate_plan(plan):
    require(plan['version'] == 1 and SHA.fullmatch(plan['sourceCommit']), 'Invalid release plan version or source')
    baseline = plan['baseline']
    validate_ledgers(baseline['ledgers'])
    require(set(baseline['services']) == set(SERVICES), 'Incomplete running service evidence')
    for service in baseline['services'].values():
        require(SHA.fullmatch(service['source']) and re.fullmatch(r'sha256:[0-9a-f]{64}', service['imageId']),
                'Incomplete running image identity')
    require(re.fullmatch(r'[A-Za-z0-9_-]{8,80}', baseline['build']), 'Invalid previous Web build')
    require(HEX.fullmatch(baseline['composeSha256']), 'Invalid Compose fingerprint')
    require(set(baseline['envSha256']) == {'app.env', 'knowledge.env'}
            and all(HEX.fullmatch(v) for v in baseline['envSha256'].values()), 'Invalid environment fingerprints')
    require(type(plan['web']) is bool and type(plan['workers']) is bool and (plan['web'] or plan['workers']),
            'The release contains no runtime changes')
    require(type(plan['rebuildPublication']) is bool and (not plan['rebuildPublication'] or plan['web'] and plan['workers']),
            'Rebuilding the publication requires switching Web and Workers')
    require(plan['recovery'] in ('rollback-compatible', 'forward'), 'Invalid recovery policy')
    seen = set()
    for item in plan['migrations']:
        db, name = item['database'], item['name']
        migration_path(db, name)
        key = (db, name)
        require(key not in seen and name not in baseline['ledgers'][db], 'Duplicate or already applied migration')
        require(HEX.fullmatch(item['checksum']), 'Invalid migration checksum')
        seen.add(key)
    require(list((m['database'], m['name']) for m in plan['migrations']) ==
            sorted(seen, key=lambda item: (list(DATABASES).index(item[0]), item[1])), 'Migration order differs')
    require(not seen or plan['web'] and plan['workers'], 'A schema release requires Web and Worker updates')
    return plan


def make_plan(root, source, baseline, beta, extra_migrations=(),
              rebuild_publication=False, rollback_compatible=False):
    source = git(root, 'rev-parse', '--verify', '--end-of-options', source + '^{commit}').decode().strip()
    validate_ledgers(baseline['ledgers'])
    require(beta['sourceCommit'] == source, 'Beta evidence is for a different source')
    beta_ledgers = beta['ledgers']
    validate_ledgers(beta_ledgers)
    web_paths = changes_since(root, baseline['services']['web']['source'], source)
    worker_paths = set().union(*(changes_since(root, baseline['services'][name]['source'], source) for name in WORKERS))
    require('compose.production.yaml' not in web_paths | worker_paths
            and 'db/member/production-init.sql' not in web_paths | worker_paths,
            'Infrastructure changes require their own reviewed release steps')
    sources = {entry["source"] for entry in baseline["services"].values()}
    added = set().union(*(changes_since(root, old, source, "--diff-filter=A") for old in sources))
    requested = set()
    for item in extra_migrations:
        db, name = item.split('/', 1)
        migration_path(db, name)
        require(name not in baseline['ledgers'][db], 'An explicitly requested migration is already applied')
        requested.add((db, name))
    migrations = []
    for db, (_, _, directory) in DATABASES.items():
        applied = baseline['ledgers'][db]
        for name, value in applied.items():
            data = file_at(root, source, migration_path(db, name))
            require(checksum(data) == value, f'Applied checksum differs: {db}/{name}')
        # Installed files and new filenames are distinct. Dormant older migrations
        # require explicit selection, including when beta runs a different profile.
        names = {path.split('/')[-1] for path in added
                 if Path(path).parent.as_posix() == directory and MIGRATION_NAME.fullmatch(Path(path).name)}
        names.update(name for group, name in requested if group == db)
        approved = beta_ledgers[db]
        for name in sorted(names - applied.keys()):
            data = file_at(root, source, migration_path(db, name))
            validate_migration_sql(data)
            value = checksum(data)
            require(approved.get(name) == value, f'No matching beta migration evidence: {db}/{name}')
            migrations.append({'database': db, 'name': name, 'checksum': value})

    has_schema_change = bool(migrations)
    rebuild_publication = rebuild_publication or any(m['database'] == 'knowledge'
                                                     and m['name'] == PROJECTION_MIGRATION for m in migrations)
    web = has_schema_change or rebuild_publication or any(map(relevant_web, web_paths))
    workers = has_schema_change or rebuild_publication or any(map(relevant_workers, worker_paths))
    return validate_plan({'version': 1, 'sourceCommit': source, 'baseline': baseline, 'web': web, 'workers': workers,
                          'migrations': migrations, 'rebuildPublication': rebuild_publication,
                          'recovery': 'rollback-compatible' if rollback_compatible or not (workers or migrations) else 'forward'})


def load_json(path):
    return json.loads(Path(path).read_text())
