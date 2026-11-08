#!/usr/bin/env python3
"""Align only the review worker's existing operator flags with the live Web.

No database mutation, image replacement, Web restart, or permission grant.
Run from a checksum-verified, root-private release stage.
"""
import copy
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path('/opt/graph-knowledge')
FLAGS = ('COMMUNITY_ENABLED', 'SITE_OPERATIONS_ENABLED', 'SITE_OPERATOR_USER_IDS')


def repaired(document):
    result = copy.deepcopy(document)
    web = result['services']['web']['environment']
    worker = result['services']['knowledge-review'].setdefault('environment', {})
    for key in FLAGS:
        if not web.get(key):
            raise ValueError('Existing Web operator setting is missing: ' + key)
        worker[key] = web[key]
    return result


def digest(file):
    return hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()


def private(file, value):
    file.write_text(value)
    file.chmod(0o600)


def run(args):
    value = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if value.returncode:
        # No command arguments or stderr: they can contain configuration values.
        raise RuntimeError('Worker repair command failed: ' + args[0])
    return value.stdout.strip()


def main():
    assert os.geteuid() == 0
    os.umask(0o077)
    stage = pathlib.Path.cwd().resolve()
    assert str(stage).startswith('/root/plunode-theme-worker-')
    lock = (ROOT / '.member-activation.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    manifest = json.loads((stage / 'manifest.json').read_text())
    for name, expected in manifest['files'].items():
        assert digest(ROOT / name) == expected, 'Live setting changed: ' + name
    base = ['docker', 'compose', '--env-file', str(ROOT / 'app.env')]
    profiles = ['--profile', 'member', '--profile', 'ops']
    comp = base + ['-f', str(ROOT / 'compose.yaml')] + profiles
    services = ['web', 'knowledge-review', 'graph-member-postgres', 'graph-neo4j']
    before = {s: run(comp + ['ps', '-q', s]) for s in services}
    assert all(before.values())
    for name in ['web', 'knowledge-review']:
        value = json.loads(run(['docker', 'inspect', before[name]]))[0]
        assert value['State']['Running'] and value['Image'] in manifest['images'][name]
    assert run(comp + ['exec', '-T', 'web', 'cat', '/app/.next-public/BUILD_ID']) == manifest['build']
    original = json.loads(run(comp + ['config', '--format', 'json']))
    web = original['services']['web']['environment']
    assert web['COMMUNITY_ENABLED'] == web['SITE_OPERATIONS_ENABLED'] == '1'
    assert web['SITE_OPERATOR_USER_IDS']
    candidate = ROOT / '.compose-theme-worker-candidate.yaml'
    # Prepared from the pinned live YAML without expanding its ${...} values.
    # Compose's canonical unresolved JSON can misclassify interpolated bind paths.
    private(candidate, (stage / 'candidate-compose.yaml').read_text())
    try:
        candidate_comp = base + ['-f', str(candidate)] + profiles
        actual = json.loads(run(candidate_comp + ['config', '--format', 'json']))
        assert actual == repaired(original), 'Changes exceed the three existing operator settings'
        target = actual['services']['knowledge-review']['environment']
        assert all(target[k] == web[k] for k in FLAGS)
        backup = ROOT / 'backups' / ('theme-worker-flags-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
        backup.mkdir(mode=0o700)
        shutil.copy2(ROOT / 'compose.yaml', backup / 'compose.yaml')
        (backup / 'compose.yaml').chmod(0o600)
        os.replace(candidate, ROOT / 'compose.yaml')
        run(comp + ['up', '-d', '--no-deps', 'knowledge-review'])
        probe = '''import {isSiteOperator} from './lib/server/member/site-operations.ts';
import {knowledgeCapability} from './lib/server/knowledge-deployment.ts';
import {memberConfig} from './lib/server/member/config.ts';
import {Pool} from 'pg';
process.loadEnvFile('.env.public');
const ids=(process.env.SITE_OPERATOR_USER_IDS??'').split(',').filter(Boolean);
const pool=new Pool({connectionString:memberConfig().databaseUrl,max:1});
try{const active=(await pool.query('SELECT count(*)::int n FROM "user" WHERE id=ANY($1::uuid[]) AND active',[ids])).rows[0].n;
console.log(JSON.stringify({operator:ids.length>0&&ids.every(isSiteOperator),active:active===ids.length,capabilities:knowledgeCapability('operator')&&knowledgeCapability('missions')}));}finally{await pool.end();}'''
        status = json.loads(run(comp + ['exec', '-T', 'knowledge-review', 'node', '--import', 'tsx', '--input-type=module', '-e', probe]))
        assert all(status.values()), 'Worker operator check is not ready'
        for name in ['web', 'graph-member-postgres', 'graph-neo4j']:
            assert run(comp + ['ps', '-q', name]) == before[name], 'Unrelated container changed'
        for name, expected in manifest['files'].items():
            if name != 'compose.yaml':
                assert digest(ROOT / name) == expected
        result = {'event': 'worker-operator-flags-repaired', 'source': manifest['source'], 'build': manifest['build'], 'backup': str(backup), 'composeSha256': digest(ROOT / 'compose.yaml'), 'workerReady': status, 'webRestarted': False, 'databaseChanged': False, 'imagesChanged': False, 'oldCancelledRequestReopened': False}
        private(backup / 'result.json', json.dumps(result, indent=2))
        private(stage / 'result.json', json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)
    finally:
        candidate.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
