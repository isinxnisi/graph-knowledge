#!/usr/bin/env python3
"""Read-only VPS inventory for bundle 2. No secrets, signing, apply or configuration writes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=90).stdout


def main():
    if os.geteuid() != 0:
        raise SystemExit('sudo is needed only to read the installed protected manifest')
    root = Path('/var/lib/plunode-publication/trusted')
    manifest = json.loads((root / 'program-manifest.json').read_bytes())
    config = json.loads((root / 'config.json').read_bytes())
    files = {}
    for relative, expected in manifest['files'].items():
        path = (Path('/usr/local/sbin') if relative.startswith('ops/plunode-') else
                Path('/usr/local/lib/plunode-publication')) / Path(relative).name
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError('Installed gate program differs: ' + relative)
        files[relative] = actual
    image = json.loads(run(['docker', 'image', 'inspect', config['operatorDigest']]))[0]
    containers = run(['docker', 'ps', '--filter', 'label=com.docker.compose.service=web', '--format', '{{.ID}}']).splitlines()
    web = []
    for ident in containers:
        item = json.loads(run(['docker', 'inspect', ident]))[0]
        ports = [binding for bindings in item['NetworkSettings']['Ports'].values() for binding in (bindings or [])]
        if not any(binding['HostPort'] == '3200' for binding in ports):
            continue
        web.append({'container': item['Name'], 'image': item['Image'],
                    'imageReference': item['Config']['Image'], 'startedAt': item['State']['StartedAt'],
                    'nodeVersion': run(['docker', 'exec', ident, 'node', '--version']).strip()})
    allowed = ['profile', 'deploymentEnabled', 'operatorDigest', 'freezePolicy', 'workerId', 'workerCodeCommit']
    with urllib.request.urlopen('http://127.0.0.1:3200/api/dataset', timeout=20) as response:
        dataset = json.load(response)
    print(json.dumps({'authority': 'read-only-installed-vps-inventory', 'programManifest': manifest,
                      'programFilesVerified': files, 'config': {key: config[key] for key in allowed},
                      'configSha256': hashlib.sha256((root / 'config.json').read_bytes()).hexdigest(),
                      'operatorImage': {key: image[key] for key in ['Id', 'Os', 'Architecture', 'RepoDigests']},
                      'operatorNodeVersion': run(['docker', 'run', '--rm', '--pull=never', '--network=none',
                                                '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
                                                '--user=1000:1000', '--entrypoint=node', config['operatorDigest'], '--version']).strip(),
                      'web': web, 'dataset': dataset, 'signed': False, 'applyCalls': 0}, ensure_ascii=False))


if __name__ == '__main__':
    main()
