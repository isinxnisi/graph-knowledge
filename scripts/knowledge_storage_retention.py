#!/usr/bin/env python3
"""Inspect and, after approval, switch each existing production retention worker."""
import argparse
import copy
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import runpy
import shutil
import statistics
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

from production_image_verification import atomic, digest, emit
from production_release import Production, ROOT, ORIGIN, write_json
from production_release_plan import SHA, require

POLICIES = {
    'publication': ('knowledge-publisher', 'KNOWLEDGE_PUBLICATION_RETENTION_HOURS', '72'),
    'inventory': ('knowledge-patrol', 'KNOWLEDGE_INVENTORY_RETENTION_DAYS', '7'),
}
DATABASE_SERVICES = ('graph-member-postgres', 'graph-neo4j')
RUNTIME_SERVICES = ('web', 'knowledge-review', *(policy[0] for policy in POLICIES.values()))
MIGRATION = '012-publication-storage.sql'
MIGRATION_SHA256 = '652d22be827f6fba2d49d87b4be1af0d8c09baa1e9160183dd1a1c65f117374a'
MODULES = Path(__file__).resolve().parent
RETENTION_STATUS = runpy.run_path(str(MODULES / 'database-capacity-report.py'))['retention_status']


def replace_setting(original, key, value, enabled):
    pattern = re.compile(r'^[ \t]*(?:export[ \t]+)?' + re.escape(key) + r'[ \t]*=.*(?:\n|$)', re.M)
    matches = list(pattern.finditer(original))
    require(len(matches) <= 1, f'Multiple definitions of {key}')
    if enabled:
        require(not matches, f'{key} is already in knowledge.env')
        newline = '' if not original or original.endswith('\n') else '\n'
        return original + newline + f'{key}={value}\n'
    require(matches, f'{key} is not managed by knowledge.env')
    return pattern.sub('', original)


def environment_without(config, key):
    result = copy.deepcopy(config)
    for service in result['services'].values():
        service.get('environment', {}).pop(key, None)
    return result


def container_env(value, key):
    for line in value['Config']['Env']:
        name, _, argument = line.partition('=')
        if name == key:
            return argument
    return None


def inspect(runtime):
    result = RETENTION_STATUS(lambda query: runtime.sql('knowledge', query))
    result['captured_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    disk = shutil.disk_usage(runtime.root)
    result['disk'] = {'bytes': disk.total, 'used_bytes': disk.used, 'free_bytes': disk.free}
    result['build'] = runtime.build()
    result['settings'] = {}
    result['workers'] = {}
    canonical = runtime.config()['services']
    for domain, (service, key, _) in POLICIES.items():
        target = runtime.inspect(service)
        result['settings'][domain] = {'declared': canonical[service]['environment'].get(key),
                                      'running': container_env(target, key) if target else None}
        result['workers'][domain] = {'running': bool(target and target['State']['Running']),
                                     'restart_count': target['RestartCount'] if target else None,
                                     'source': target['Config'].get('Labels', {}).get('org.opencontainers.image.revision')
                                     if target else None}
        if target:
            logs = subprocess.run(['docker', 'logs', '--since', '30m', '--tail', '400', target['Id']],
                                  capture_output=True, text=True, timeout=20)
            require(logs.returncode == 0, f'{service} log summary unavailable')
            event = 'publication-retention' if domain == 'publication' else 'knowledge-inventory-retention'
            combined = logs.stdout + logs.stderr
            result['workers'][domain]['batches_last_30m'] = combined.count(f'"event":"{event}"')
            result['workers'][domain]['retries_last_30m'] = combined.count(f'"event":"{event}-retry"')
    neo = runtime.dc_run('exec', '-T', 'graph-neo4j', 'du', '-sk', '/data/databases/neo4j',
                         label='Neo4j store size')
    result['physical']['neo4j_database_bytes'] = int(neo.split()[0]) * 1024
    return result


def switch(runtime, domain, enabled, source=None, build=None):
    service, key, value = POLICIES[domain]
    env = runtime.root / 'knowledge.env'
    old = env.read_text()
    candidate = replace_setting(old, key, value, enabled)
    old_config = runtime.config()
    old_values = old_config['services']
    selected = runtime.inspect(service)
    require(selected is not None, 'Selected worker container is unavailable')
    protected = tuple(name for name in (*RUNTIME_SERVICES, *DATABASE_SERVICES) if name != service)
    containers = {name: runtime.inspect(name) for name in protected}
    require(all(containers.values()), 'A protected service is missing')
    config_value = old_values[service]['environment'].get(key)
    if not enabled:
        require(config_value == value, 'The selected retention setting differs from the managed policy')

    timestamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    folder = runtime.root / 'backups' / f'knowledge-retention-{domain}-{timestamp}'
    folder.mkdir(mode=0o700)
    atomic(folder / 'knowledge.env', old)
    atomic(folder / 'compose.yaml', runtime.compose.read_text())
    probe_code = (MODULES / 'production-release-probe.cjs').read_text()
    if enabled:
        require(runtime.build() == build, 'Running Web build differs from the verified build')
        require(selected['State']['Running']
                and selected['Config']['Labels']['org.opencontainers.image.revision'] == source,
                'Running Worker differs from the verified source')
        require(config_value is None and container_env(selected, key) is None,
                'Retention is already configured outside this change')
        require(runtime.ledgers()['knowledge'].get(MIGRATION) == MIGRATION_SHA256, 'Knowledge 012 differs')
        before = inspect(runtime)
        active = before['active']
        require(active and active['state'] == 'ready' and not active['expired_at'] and active['compact'],
                'An active compact publication is required')
        sample = runtime.probe(probe_code)
        write_json(folder / 'before.json', before)
        runtime.backup(folder, {'knowledge'})
        emit('backup-verified', backup=str(folder), scope=domain, sha256=digest(folder / 'knowledge.dump'))
        require(env.read_text() == old, 'Knowledge environment changed during backup')

    expected = value if enabled else None
    atomic(env, candidate)
    try:
        rendered = runtime.config()
        require(environment_without(old_config, key) == environment_without(rendered, key)
                and rendered['services'][service]['environment'].get(key) == expected,
                'Compose changed beyond the selected retention setting')
        runtime.start((service,))
        if enabled:
            time.sleep(6)
        current = runtime.service_present(service, selected['Image'])
        require(container_env(current, key) == expected and (not enabled or current['RestartCount'] == 0),
                'Worker retention setting or startup differs')
        for name, item in containers.items():
            live = runtime.inspect(name)
            require(live and live['Id'] == item['Id'], f'{name} was recreated')
        if enabled:
            runtime.probe(probe_code, sample)
    except BaseException:
        if enabled:
            atomic(env, old)
            runtime.start((service,))
            emit('retention-setting-restored', scope=domain, backup=str(folder))
        else:
            # Keep the disabled setting on disk and fence the old process.
            runtime.stop((service,))
            emit('retention-worker-stopped', scope=domain, backup=str(folder))
        raise
    emit('retention-enabled' if enabled else 'retention-disabled', scope=domain, retention=expected,
         service=service, backup=str(folder))


def https_sample(origin, attempts, previous=None, old_generation=None):
    """Representative production reads from the same client before and after cleanup."""
    def fetch(path, *, allow_expired=False):
        started = time.perf_counter()
        try:
            with urlopen(origin + path, timeout=20) as response:
                require(response.status == 200, 'Unexpected HTTPS response')
                value = json.load(response)
                status = response.status
        except HTTPError as error:
            if not allow_expired or error.code != 410:
                raise
            with error:
                value, status = json.load(error), error.code
            require(value.get('code') == 'GENERATION_EXPIRED', 'Unexpected expiry response')
        return value, round((time.perf_counter() - started) * 1000), status

    def publication(mode, **query):
        return '/api/knowledge/public?' + urlencode({'mode': mode, **query})

    def summary(values):
        return {'samples': len(values), 'p50_ms': round(statistics.median(values)),
                'p95_ms': sorted(values)[math.ceil(len(values) * 0.95) - 1]}

    dataset = fetch('/api/dataset')[0]
    require(dataset['dataset'] == 'public-kg', 'Unexpected dataset')
    build = fetch('/api/publication/compatibility')[0]['buildId']
    initial = fetch(publication('status'))[0]
    search, page, neighbors = [], [], []
    sample_record = None
    for _ in range(attempts):
        first, elapsed, _ = fetch(publication('search', limit=2))
        require(first.get('nextCursor') and len(first['records']) == 2, 'Current search failed')
        search.append(elapsed)
        second, elapsed, _ = fetch(publication('search', limit=2, cursor=first['nextCursor']))
        require(second['generation'] == first['generation'] and len(second['records']) == 2, 'Pagination differs')
        page.append(elapsed)
        sample_record = next((row['record'] for row in first['records'] + second['records']
                              if row['record']['content']['kind'] == 'relation'), None)
        require(sample_record, 'Representative relation is missing')
        adjacent, elapsed, _ = fetch(publication('neighbors', generation=first['generation'],
                                                entityId=sample_record['content']['subjectId'], limit=2))
        require(adjacent['records'], 'Representative neighbors missing')
        neighbors.append(elapsed)
        time.sleep(0.2)
    result = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'origin': origin, 'build': build,
              'active': initial['active'], 'search': summary(search), 'pagination': summary(page),
              'neighbors': summary(neighbors)}
    fixed = previous['fixed'] if previous else {'id': sample_record['id'], 'revision': sample_record['revision']}
    actual, _, _ = fetch(publication('record-version', recordId=fixed['id'], revision=fixed['revision']))
    published = actual['record']
    require(published['record']['id'] == fixed['id'] and published['sources'], 'Fixed Record version or evidence differs')
    fixed_hash = hashlib.sha256(json.dumps(published, sort_keys=True).encode()).hexdigest()
    require(not previous or fixed_hash == previous.get('fixed_sha256'), 'Fixed Record content or evidence changed')
    result.update(fixed=fixed, fixed_sha256=fixed_hash)
    if previous and previous.get('old_cursor'):
        result['old_cursor'] = previous['old_cursor']
    elif old_generation:
        old, _, _ = fetch(publication('search', generation=old_generation, limit=2))
        require(old['generation'] == old_generation and old.get('nextCursor'), 'Old generation cursor missing')
        result['old_cursor'] = {'generation': old_generation, 'value': old['nextCursor']}
    if result.get('old_cursor'):
        cursor = result['old_cursor']
        response, _, status = fetch(publication('search', limit=2, cursor=cursor['value']), allow_expired=bool(previous))
        require(status == 410 or response['generation'] == cursor['generation'], 'Old cursor generation differs')
        result['old_cursor_status'] = status
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('audit')
    sample = commands.add_parser('sample-https')
    sample.add_argument('--beta', action='store_true')
    sample.add_argument('--samples', type=int, default=12)
    sample.add_argument('--old-generation')
    sample.add_argument('--compare', type=Path)
    enable = commands.add_parser('enable')
    enable.add_argument('scope', choices=POLICIES)
    enable.add_argument('--expect-source', required=True)
    enable.add_argument('--expect-build', required=True)
    commands.add_parser('disable').add_argument('scope', choices=POLICIES)
    args = parser.parse_args()
    if args.command == 'sample-https':
        require(1 <= args.samples <= 50, 'Use 1 to 50 samples')
        origin = 'https://graph-beta.isinxnisi.com' if args.beta else ORIGIN
        previous = json.loads(args.compare.read_text()) if args.compare else None
        require(not previous or previous['origin'] == origin, 'Comparison must be from the same origin')
        print(json.dumps(https_sample(origin, args.samples, previous, args.old_generation), indent=2))
        return

    import fcntl

    require(os.geteuid() == 0, 'Retention operations require the production administrator')
    os.umask(0o077)
    with (ROOT / '.member-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runtime = Production(ROOT, None if args.command == 'audit' else Path.cwd() / 'retention-failure.txt')
        if args.command == 'audit':
            print(json.dumps(inspect(runtime), indent=2))
        elif args.command == 'enable':
            require(SHA.fullmatch(args.expect_source), 'Provide the full proven Worker SHA')
            switch(runtime, args.scope, True, args.expect_source, args.expect_build)
        else:
            switch(runtime, args.scope, False)


if __name__ == '__main__':
    try:
        main()
    except (KeyError, ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error)) from None
