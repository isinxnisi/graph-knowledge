#!/usr/bin/env python3
"""Read-only R6 preflight. No credentials, account rows, or configuration values are exported."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.parse

ROOT = Path('/opt/graph-knowledge')


def run(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if p.returncode:
        raise RuntimeError('Inspection failed: ' + args[0] + ' (details suppressed)')
    return p.stdout.strip()


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def main():
    if os.geteuid() != 0:
        raise SystemExit('Use the existing administrator sudo. Inspection does not change the server.')
    dc = ['docker', 'compose', '--env-file', str(ROOT/'app.env'), '-f', str(ROOT/'compose.yaml'), '--profile', 'member', '--profile', 'ops']
    cfg = json.loads(run(dc + ['config', '--format', 'json']))
    services = cfg['services']
    report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'project': cfg['name'], 'composeSha256': digest(ROOT/'compose.yaml'), 'envSha256': digest(ROOT/'app.env'), 'services': {}, 'containers': {}}
    for name, value in services.items():
        report['services'][name] = {k: value[k] for k in ['image', 'entrypoint', 'command', 'profiles', 'mem_limit', 'networks', 'ports', 'volumes'] if k in value}
        cid = run(dc + ['ps', '-a', '-q', name])
        if cid:
            d = json.loads(run(['docker', 'inspect', cid]))[0]
            report['containers'][name] = {'id': d['Id'], 'image': d['Image'], 'startedAt': d['State']['StartedAt'], 'status': d['State']['Status'], 'health': d['State'].get('Health', {}).get('Status')}
    env = services['web'].get('environment', {})
    allowed = ['MEMBER_ORIGIN', 'MEMBER_AUTH_PROVIDER', 'MEMBER_COOKIE_PREFIX', 'MEMBER_STORAGE_ENABLED', 'COMMUNITY_ENABLED', 'SITE_OPERATIONS_ENABLED', 'PUBLIC_PROFILES_ENABLED', 'AI_LAB_ENABLED', 'PLUNODE_PUBLIC_ENABLED', 'PLUNODE_ADS_ENABLED', 'GRAPH_DATASET', 'GRAPH_DEPLOYMENT', 'KNOWLEDGE_RUNTIME']
    report['flags'] = {k: env.get(k) for k in allowed}
    report['webEnvNames'] = sorted(env)
    report['secretPresent'] = {k: bool(env.get(k)) for k in ['MEMBER_AUTH_SECRET', 'MEMBER_DATABASE_URL', 'MEMBER_GOOGLE_CLIENT_ID', 'MEMBER_GOOGLE_CLIENT_SECRET', 'NEO4J_PASSWORD']}
    u = urllib.parse.urlsplit(env.get('MEMBER_DATABASE_URL', ''))
    report['memberDatabase'] = {'host': u.hostname, 'port': u.port or 5432, 'database': u.path.lstrip('/'), 'user': u.username}
    report['buildId'] = run(dc + ['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID'])
    report['dataset'] = json.loads(run(['curl', '-fsS', '--max-time', '30', '-H', 'Host: plunode.net', 'http://127.0.0.1:3200/api/dataset']))
    report['aiArtifactSha256'] = run(dc + ['exec', '-T', 'web', 'sha256sum', '/app/data/ai-lab/initial.json']).split()[0]
    pg = report['containers']['graph-member-postgres']['id']
    def sql(query, database='graph_member'):
        raw = run(['docker', 'exec', pg, 'psql', '-X', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'BEGIN READ ONLY; ' + query + '; COMMIT'])
        return [line for line in raw.splitlines() if line not in ['', 'BEGIN', 'COMMIT']]
    report['migrations'] = sql('SELECT name||\' \'||checksum FROM member_migration ORDER BY name')
    report['memberTables'] = sql("SELECT table_schema||'.'||table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN('pg_catalog','information_schema') ORDER BY 1")
    report['databases'] = sql('SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname', 'postgres')
    report['os'] = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    report['kernel'] = run(['uname', '-r'])
    report['dockerVersion'] = json.loads(run(['docker', 'version', '--format', '{{json .}}']))['Server']['Version']
    report['rebootRequired'] = Path('/var/run/reboot-required').exists()
    report['memory'] = run(['free', '-b'])
    report['disk'] = run(['df', '-B1', str(ROOT)])
    try:
        import apt
        cache = apt.Cache()
        report['upgradable'] = [{'name': p.name, 'installed': p.installed.version, 'candidate': p.candidate.version, 'origins': sorted(set(o.archive for o in p.candidate.origins))} for p in cache if p.is_upgradable and p.installed and p.candidate]
    except ImportError:
        report['upgradable'] = None
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
