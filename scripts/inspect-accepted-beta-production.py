#!/usr/bin/env python3
"""Read-only release inventory; never exports credentials or application rows."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path('/opt/graph-knowledge')


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Read-only inspection failed: ' + args[0])
    return result.stdout.strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if os.geteuid() != 0:
        raise SystemExit('Existing administrator sudo is required; inspection is read-only.')
    dc = ['docker', 'compose', '--env-file', str(ROOT/'app.env'), '-f', str(ROOT/'compose.yaml'), '--profile', 'member', '--profile', 'ops']
    config = json.loads(run(dc + ['config', '--format', 'json']))
    report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'project': config['name'], 'files': {}, 'services': {}, 'containers': {}, 'images': {}}
    safe_flags = {'MEMBER_ORIGIN', 'MEMBER_AUTH_PROVIDER', 'MEMBER_COOKIE_PREFIX', 'MEMBER_STORAGE_ENABLED', 'COMMUNITY_ENABLED', 'SITE_OPERATIONS_ENABLED', 'PUBLIC_PROFILES_ENABLED', 'AI_LAB_ENABLED', 'PLUNODE_PUBLIC_ENABLED', 'PLUNODE_ADS_ENABLED', 'GRAPH_DATASET', 'GRAPH_DEPLOYMENT', 'KNOWLEDGE_RUNTIME', 'KNOWLEDGE_THEME_AUTHORING_ENABLED'}
    for name, service in config['services'].items():
        env = service.get('environment', {})
        report['services'][name] = {key: service[key] for key in ['image', 'entrypoint', 'command', 'profiles', 'mem_limit', 'networks', 'ports', 'volumes', 'user', 'read_only'] if key in service}
        report['services'][name]['envNames'] = sorted(env)
        report['services'][name]['flags'] = {key: env[key] for key in safe_flags if key in env}
        cid = run(dc + ['ps', '-a', '-q', name])
        if cid:
            value = json.loads(run(['docker', 'inspect', cid]))[0]
            report['containers'][name] = {'id': value['Id'], 'image': value['Image'], 'configuredImage': value['Config']['Image'], 'status': value['State']['Status'], 'startedAt': value['State']['StartedAt'], 'health': value['State'].get('Health', {}).get('Status')}
            if value['Image'] not in report['images']:
                image = json.loads(run(['docker', 'image', 'inspect', value['Image']]))[0]
                report['images'][value['Image']] = {key: image.get(key) for key in ['Id', 'RepoTags', 'RepoDigests', 'Created', 'Architecture', 'Os']}
                report['images'][value['Image']]['labels'] = {key: val for key, val in (image['Config'].get('Labels') or {}).items() if key.startswith('org.opencontainers.image.')}
    for name in ['compose.yaml', 'app.env', 'knowledge.env']:
        path = ROOT/name
        if path.is_file():
            report['files'][name] = digest(path)
    report['runtimeFiles'] = {}
    for folder in ['knowledge-runtime', 'knowledge-state']:
        if (ROOT/folder).is_dir():
            for path in sorted((ROOT/folder).rglob('*')):
                if path.is_file() and not path.is_symlink():
                    stat = path.stat()
                    report['runtimeFiles'][str(path.relative_to(ROOT))] = {'sha256': digest(path), 'bytes': stat.st_size, 'mode': oct(stat.st_mode & 0o777), 'uid': stat.st_uid, 'gid': stat.st_gid}
    report['buildId'] = run(dc + ['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID'])
    report['dataset'] = json.loads(run(['curl', '-fsS', '--max-time', '30', '-H', 'Host: plunode.net', 'http://127.0.0.1:3200/api/dataset']))
    report['aiArtifactSha256'] = run(dc + ['exec', '-T', 'web', 'sha256sum', '/app/data/ai-lab/initial.json']).split()[0]
    pg = report['containers']['graph-member-postgres']['id']

    def sql(query, database='graph_member'):
        raw = run(['docker', 'exec', '-i', pg, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', 'BEGIN READ ONLY; '+query+'; COMMIT'])
        return '\n'.join(line for line in raw.splitlines() if line not in ['', 'BEGIN', 'COMMIT'])

    report['memberMigrations'] = json.loads(sql("SELECT coalesce(json_object_agg(name,checksum),'{}'::json) FROM member_migration"))
    report['knowledgeMigrations'] = json.loads(sql("SELECT coalesce(json_object_agg(name,checksum),'{}'::json) FROM knowledge75.migrations", 'plunode_knowledge75_production'))
    report['tables'] = {}
    for database in ['graph_member', 'plunode_knowledge75_production']:
        report['tables'][database] = json.loads(sql("SELECT coalesce(json_agg(table_schema||'.'||table_name ORDER BY table_schema,table_name),'[]'::json) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')", database))
    if 'public.site_editorial_guide_version' in report['tables']['graph_member']:
        report['qualityGuide'] = json.loads(sql("SELECT json_build_object('versions',count(*),'currentRevision',max(revision)) FROM site_editorial_guide_version WHERE guide_id='theme-authoring-quality'"))
    else:
        report['qualityGuide'] = {'versions': 0, 'currentRevision': None, 'tablePresent': False}
    report['kernel'] = run(['uname', '-r'])
    report['memory'] = run(['free', '-b'])
    report['disk'] = run(['df', '-B1', str(ROOT)])
    report['dockerVersion'] = run(['docker', 'version', '--format', '{{.Server.Version}}'])
    report['rebootRequired'] = Path('/var/run/reboot-required').exists()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
