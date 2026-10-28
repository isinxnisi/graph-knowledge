#!/usr/bin/env python3
"""Real published data, disposable DB/Web and fixed consumer images. No live writes."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = Path('/home/isinxnisi/.local/share/plunode-publication/preparation/candidates/13abfb93-ba2d-44f7-a56b-352aa7ab0ab0/release')


def run(args, check=True, cwd=None):
    result = subprocess.run(list(map(str, args)), cwd=cwd, capture_output=True, text=True, timeout=240)
    if check and result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-2500:])
    return result


def read(path): return json.loads(Path(path).read_bytes())
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save(path, value): Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def get(origin, path):
    with urllib.request.urlopen(origin + path, timeout=30) as response: return json.load(response)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', type=Path, required=True); ap.add_argument('--worker-root', type=Path, required=True)
    ap.add_argument('--operator', required=True); ap.add_argument('--web', required=True)
    ap.add_argument('--browser', action='store_true')
    ap.add_argument('--installed-web', default='sha256:1fc15f65573edec91346091c9fb4b99644099c0c6af731c576e7ab4d5850ba25')
    args = ap.parse_args(); output = args.output.resolve(); worker = args.worker_root.resolve()
    assert output.is_relative_to(ROOT / '.local') and not output.exists()
    for port in [3296, 3297]:
        with socket.socket() as sock: sock.bind(('127.0.0.1', port))
    output.mkdir(parents=True); output.chmod(0o755)
    data_pin, manifest_pin = sha(PUBLIC / 'data.json'), sha(PUBLIC / 'manifest.json')
    release = output / 'release'; release.mkdir(); shutil.copyfile(PUBLIC / 'data.json', release / 'data.json')
    manifest = read(PUBLIC / 'manifest.json'); manifest.update(release='isolated-bundle2-published-data', baseRelease='isolated-bundle2-base', reason='ISOLATED test of exact published data bytes; not a formal receipt or production publication')
    save(release / 'manifest.json', manifest)
    operator = json.loads(run(['docker', 'image', 'inspect', args.operator]).stdout)[0]['Id']
    web = json.loads(run(['docker', 'image', 'inspect', args.web]).stdout)[0]['Id']
    def probe(image, command, directory=release, check=True):
        return run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
                    '--security-opt=no-new-privileges', '--user=1000:1000', '--mount', 'type=bind,src=' + str(directory) + ',dst=/incoming,readonly',
                    '--entrypoint=node', image, *command], check)
    contract = json.loads(probe(operator, ['--import', 'tsx', 'scripts/publication-compatibility.ts', 'contract', '/incoming']).stdout)
    save(release / 'compatibility.json', contract)
    base = output / 'base'; base.mkdir()
    fixture = read(PUBLIC / 'data.json')
    save(base / 'fixture-input.json', {'schemaVersion': 4, 'entities': fixture['entities'][:1], 'claims': [], 'sources': [], 'citations': []})
    serialized = json.loads(probe(operator, ['--import', 'tsx', 'scripts/serialize-publication-fixture.ts', '/incoming/fixture-input.json'], base).stdout)
    (base / 'data.json').write_text(serialized['data'])
    save(base / 'manifest.json', {**manifest, 'release': 'isolated-bundle2-base', 'baseRelease': None, 'dataSha256': serialized['dataSha256'], 'claimOrigins': []})
    # Both the actual installed ops image and the new ops image parse exactly the same published data bytes.
    old_operator = 'sha256:2bf646a22e867e5aa5fce5a155db45c337c4134ad6c0f337b65617c5799912e9'
    old_valid = json.loads(probe(old_operator, ['--import', 'tsx', 'scripts/public-kg.ts', 'validate', '/incoming']).stdout)
    assert old_valid['valid']
    old_worker = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime')
    node = '/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/bin/node'
    env = {**os.environ, 'TSX_DISABLE_CACHE': '1'}
    fixed_worker = subprocess.run([node, '--import', 'tsx', 'scripts/public-kg.ts', 'validate', str(PUBLIC)], cwd=old_worker, env=env, capture_output=True, text=True, check=True, timeout=90)
    # Only the isolated Worker gets the proposed five-file overlay.
    overlay = ['lib/domain/contribution.ts', 'lib/i18n/contribution.ts', 'lib/generated/contribution-roles.ts', 'lib/server/publication-compatibility.ts', 'scripts/publication-compatibility.ts']
    for relative in overlay:
        target = worker / relative; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT / relative, target)
    op_proof = json.loads(probe(operator, ['--import', 'tsx', 'scripts/publication-compatibility.ts', 'verify', '/incoming']).stdout)
    web_proof = json.loads(probe(web, ['/app/publication-probe.cjs', 'verify', '/incoming']).stdout)
    worker_proof = json.loads(subprocess.run([node, '--import', 'tsx', 'scripts/publication-compatibility.ts', 'verify', str(release)], cwd=worker, env=env, capture_output=True, text=True, check=True, timeout=90).stdout)
    assert all(p['verified'] and p['contract'] == contract for p in [op_proof, web_proof, worker_proof])
    network = 'plunode-bundle2-' + uuid.uuid4().hex[:10]; ui_network = network + '-ui'; containers = []
    password = secrets.token_hex(24); public_env = output / 'isolated-kg.env'; neo_env = output / 'isolated-neo.env'
    public_env.write_text('NEO4J_URI=bolt://graph-neo4j:7687\nNEO4J_USER=neo4j\nNEO4J_PASSWORD=' + password + '\nNEO4J_DATABASE=neo4j\nGRAPH_DATASET=public-kg\nGRAPH_DEPLOYMENT=production\nMEMBER_STORAGE_ENABLED=0\n')
    neo_env.write_text('NEO4J_AUTH=neo4j/' + password + '\n'); public_env.chmod(0o600); neo_env.chmod(0o600)
    run(['docker', 'network', 'create', '--internal', network])
    run(['docker', 'network', 'create', ui_network])
    try:
        neo = run(['docker', 'run', '-d', '--name', network, '--network', network, '--network-alias', 'graph-neo4j', '--env-file', neo_env,
                   '--memory=1g', '--tmpfs', '/data:rw,uid=7474,gid=7474', '--tmpfs', '/logs:rw,uid=7474,gid=7474',
                   '-e', 'NEO4J_server_memory_heap_initial__size=128m', '-e', 'NEO4J_server_memory_heap_max__size=384m', '-e', 'NEO4J_server_memory_pagecache_size=128m', 'neo4j:5.26.31-community']).stdout.strip(); containers.append(neo)
        for _ in range(90):
            if run(['docker', 'exec', neo, 'cypher-shell', '-u', 'neo4j', '-p', password, 'RETURN 1'], False).returncode == 0: break
            time.sleep(1)
        else: raise RuntimeError('Private Neo4j startup timed out')
        def ops(command, check=True, directory=release):
            return run(['docker', 'run', '--rm', '--pull=never', '--network', network, '--read-only', '--cap-drop=ALL',
                        '--security-opt=no-new-privileges', '--user=1000:1000', '--env-file', public_env,
                        '--mount', 'type=bind,src=' + str(directory) + ',dst=/incoming,readonly', operator, *command], check)
        ops(['scripts/public-kg.ts', 'apply', '/incoming'], directory=base)
        before = json.loads(ops(['scripts/publication-runtime.ts', 'observe']).stdout)['payload']
        assert ops(['scripts/publication-runtime.ts', 'apply', 'wrong-revision'], False).returncode != 0
        applied = json.loads(ops(['scripts/publication-runtime.ts', 'apply', before['revision']]).stdout)
        verified = json.loads(ops(['scripts/publication-runtime.ts', 'verify']).stdout); assert verified['verified']
        assert ops(['scripts/publication-runtime.ts', 'apply', before['revision']], False).returncode != 0
        movie_ids = {row['formalClaimId'] for row in read(ROOT.parent / 'graph-knowledge-film-worker-manifest/docs/research/film-worker-pilot-20261028/RESEARCH_COVERAGE_CURRENT.json')['records'] if row['formalClaimId']}
        assert len(movie_ids) == 36
        web_checks = {}
        for image, port, kind in [(args.installed_web, 3297, 'installed'), (web, 3296, 'candidate')]:
            ident = run(['docker', 'run', '-d', '--name', network + '-' + kind, '--network', ui_network, '--env-file', public_env,
                         '-e', 'HOSTNAME=0.0.0.0', '-e', 'PORT=3000', '-p', '127.0.0.1:' + str(port) + ':3000', '--memory=768m', image]).stdout.strip(); containers.append(ident)
            run(['docker', 'network', 'connect', network, ident])
            origin = 'http://127.0.0.1:' + str(port)
            last_error = 'no response'
            for _ in range(60):
                try:
                    metadata = get(origin, '/api/dataset')
                    if metadata['revision'] == verified['revision']: break
                    last_error = 'revision differs: ' + str(metadata)
                except Exception as error: last_error = type(error).__name__ + ': ' + str(error)
                time.sleep(1)
            else: raise RuntimeError('Isolated Web startup failed: ' + kind + ': ' + last_error)
            for claim_id in sorted(movie_ids):
                response = get(origin, '/api/claims/' + claim_id)
                assert response['revision'] == verified['revision'] and response['claim']['id'] == claim_id and response['claim']['citations']
            web_checks[kind] = {'image': image, 'revision': metadata['revision'], 'filmClaimsReadWithEvidence': len(movie_ids)}
            if kind == 'candidate':
                live = get(origin, '/api/publication/compatibility'); assert live['capabilities'] == web_proof['capabilities'] and live['buildId']
                save(output / 'candidate-web-capabilities.json', live)
        spec = importlib.util.spec_from_file_location('real_consumer_check', ROOT / 'scripts/publication-compatibility.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        worker_files = {str(p.relative_to(worker)): sha(p) for directory in [worker / 'lib', worker / 'vocabulary/contribution-roles'] for p in directory.rglob('*') if p.is_file() and p.suffix in ['.ts', '.tsx', '.json']}
        worker_files.update({p: sha(worker / p) for p in ['lib/server/publication-compatibility.ts', 'scripts/publication-compatibility.ts']})
        policy = {'schemaVersion': 1, 'operator': {'image': operator, 'deploymentDigest': operator, 'nodeVersion': op_proof['capabilities']['nodeVersion'], 'capabilitiesSha256': module.digest(op_proof['capabilities'])},
                  'web': {'image': web, 'nodeVersion': web_proof['capabilities']['nodeVersion'], 'capabilitiesSha256': module.digest(web_proof['capabilities']), 'buildId': live['buildId'], 'url': 'https://plunode.net/api/publication/compatibility'},
                  'worker': {'root': str(worker), 'node': node, 'nodeSha256': sha(node), 'nodeVersion': worker_proof['capabilities']['nodeVersion'], 'capabilitiesSha256': module.digest(worker_proof['capabilities']), 'files': worker_files}}
        checker = module.Compatibility(policy, operator, fetch=lambda url: get('http://127.0.0.1:3296', '/api/publication/compatibility'))
        proof = checker.verify(release); assert checker.verify(release, reuse=proof) == proof
        save(output / 'compatibility-policy-isolated.json', policy); save(output / 'all-consumer-proof.json', proof)
        save(output / 'browser-target.json', {'baseURL': 'http://127.0.0.1:3296', 'revision': verified['revision']})
        # Run an optional existing browser command while this disposable Web is available.
        if args.browser: run(['/usr/bin/python3', ROOT / 'ops/run-publication-bundle2-browser.py', output / 'browser-target.json'], cwd=ROOT)
        assert (data_pin, manifest_pin) == (sha(PUBLIC / 'data.json'), sha(PUBLIC / 'manifest.json'))
        save(output / 'result.json', {'publishedDataSha256': data_pin, 'publishedManifestUnchanged': True,
             'sameDataBytesAcrossThreeConsumers': True, 'sameIsolatedManifestAcrossThreeConsumers': True,
             'installedOperator': {'image': old_operator, 'valid': old_valid}, 'installedWorker': json.loads(fixed_worker.stdout),
             'web': web_checks, 'candidateProofs': {'operator': op_proof, 'web': web_proof, 'worker': worker_proof},
             'privateGuardedApplyVerified': verified, 'staleRevisionRejected': True, 'duplicateApplyRejected': True,
             'productionTouched': False, 'memberDatabaseAccessed': False, 'resourcesRemovedOnExit': True})
        print(json.dumps({'output': str(output), 'filmClaims': 36, 'threeConsumers': 'passed', 'productionTouched': False}))
    except Exception:
        for index, ident in enumerate(containers):
            logs = run(['docker', 'logs', '--tail', '150', ident], False)
            (output / ('container-' + str(index) + '.log')).write_text((logs.stdout + logs.stderr).replace(password, '[isolated credential redacted]'))
        raise
    finally:
        for ident in reversed(containers): run(['docker', 'rm', '-f', ident], False)
        run(['docker', 'network', 'rm', network], False)
        run(['docker', 'network', 'rm', ui_network], False)


if __name__ == '__main__': main()
