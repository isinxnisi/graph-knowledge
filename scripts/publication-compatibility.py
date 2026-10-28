"""Candidate-bound pre-sign compatibility checks. Never accepts, signs or applies."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request


def require(value, reason):
    if not value:
        raise ValueError(reason)


def read(path): return json.loads(Path(path).read_bytes())
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def run(argv, cwd=None):
    result = subprocess.run(argv, cwd=cwd, capture_output=True, timeout=180,
                            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TSX_DISABLE_CACHE': '1'})
    require(result.returncode == 0, 'Consumer probe failed: ' + Path(argv[0]).name)
    return json.loads(result.stdout)


def get(url):
    require(url == 'https://plunode.net/api/publication/compatibility', 'Fixed public compatibility endpoint required')
    with urllib.request.urlopen(url, timeout=20) as response:
        require(response.url == url, 'Compatibility endpoint redirected')
        return json.load(response)


def check_contract(contract, caps):
    require(contract['schemaVersion'] == 1 and contract['fixtureSchemaVersion'] in caps['fixtureSchemaVersions'], 'Fixture schema unsupported')
    require(contract['serialization'] in caps['serialization'], 'Serialization unsupported')
    require(caps['catalogValid'] and all(contract[key] == caps[key] for key in ['catalogSha256', 'reviewsSha256', 'codegenSha256', 'labelsSha256']), 'Consumer catalog/reviews/labels differ')
    for role, definition in contract['requiredRoleHashes'].items():
        require(role in caps['recognizedRoleIds'], 'Consumer does not recognize Role ' + role)
        require(caps['adoptedDefinitionHashes'].get(role) == definition, 'Role is not adopted at fixed definition ' + role)
    for key in ['scopeFormats', 'savedWorkspaceVersions', 'relationRevisions']:
        require(set(contract[key]) <= set(caps[key]), 'Consumer capability missing: ' + key)


class Compatibility:
    def __init__(self, policy, active_operator, *, execute=run, fetch=get):
        self.policy, self.execute, self.fetch = policy, execute, fetch
        require(policy['schemaVersion'] == 1 and active_operator == policy['operator']['deploymentDigest'], 'Active operator pin differs; never inherit an old request pin')

    def identities(self):
        identities = {}
        for kind in ['web', 'operator']:
            configured = self.policy[kind]
            require(re.fullmatch('sha256:[a-f0-9]{64}', configured['image']), 'Immutable consumer image required')
            image = self.execute(['/usr/bin/docker', 'image', 'inspect', configured['image']])[0]
            require(image['Id'] == configured['image'] and image['Os'] == 'linux' and image['Architecture'] == 'amd64', 'Consumer image identity/platform differs')
            identities[kind] = {'image': image['Id'], 'expectedNodeVersion': configured['nodeVersion']}
        worker = self.policy['worker']; root = Path(worker['root'])
        require(root.is_absolute() and Path(worker['node']).is_absolute(), 'Fixed Worker paths required')
        pins = {path: sha(root / path) for path in worker['files']}
        require(pins == worker['files'] and sha(worker['node']) == worker['nodeSha256'], 'Worker code or Node executable drifted')
        identities['worker'] = {'root': str(root), 'files': pins, 'nodeSha256': worker['nodeSha256'], 'expectedNodeVersion': worker['nodeVersion']}
        live = self.fetch(self.policy['web']['url'])
        require(live['buildId'] == self.policy['web']['buildId'], 'Installed Web build differs')
        require(digest(live['capabilities']) == self.policy['web']['capabilitiesSha256'], 'Installed Web capability manifest differs')
        identities['liveWeb'] = live
        return identities

    def verify(self, directory, *, reuse=None):
        directory = Path(directory).resolve(); contract = read(directory / 'compatibility.json')
        require(sha(directory / 'data.json') == contract['dataSha256'] and sha(directory / 'manifest.json') == contract['manifestSha256'], 'Candidate bytes differ from compatibility contract')
        identities = self.identities()
        check_contract(contract, identities['liveWeb']['capabilities'])
        key = digest({'contract': contract, 'policy': self.policy, 'identities': identities})
        if reuse is not None:
            require(reuse.get('verified') is True and reuse['cacheKey'] == key and set(reuse['consumers']) == {'web', 'operator', 'worker'}, 'Frozen compatibility proof invalidated; rebuild/review before signature')
            for kind, proof in reuse['consumers'].items():
                require(proof['verified'] and proof['contract'] == contract, 'Incomplete consumer proof')
                require(digest(proof['capabilities']) == self.policy[kind]['capabilitiesSha256'], 'Proof is not for the reviewed fixed consumer capabilities')
                check_contract(contract, proof['capabilities'])
            return reuse
        results = {}
        for kind in ['web', 'operator', 'worker']:
            item = self.policy[kind]
            if kind == 'worker':
                argv = [item['node'], '--import', 'tsx', 'scripts/publication-compatibility.ts', 'verify', str(directory)]
                result = self.execute(argv, cwd=item['root'])
            else:
                argv = ['/usr/bin/docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
                        '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=1000:1000', '--pids-limit=128', '--memory=1g',
                        '--mount', 'type=bind,src=' + str(directory) + ',dst=/incoming,readonly', '--entrypoint=node', item['image']]
                argv += (['/app/publication-probe.cjs'] if kind == 'web' else ['--import', 'tsx', 'scripts/publication-compatibility.ts'])
                result = self.execute(argv + ['verify', '/incoming'])
            require(result['verified'] and result['contract'] == contract, kind + ' did not validate the exact same candidate')
            require(result['capabilities']['nodeVersion'] == item['nodeVersion'], kind + ' Node version differs')
            require(digest(result['capabilities']) == item['capabilitiesSha256'], kind + ' capability manifest differs from fixed policy')
            check_contract(contract, result['capabilities'])
            if kind == 'web':
                require(result['capabilities'] == identities['liveWeb']['capabilities'], 'Probed Web image differs from installed Web capabilities')
            results[kind] = result
        return {'schemaVersion': 1, 'verified': True, 'cacheKey': key, 'identities': identities, 'consumers': results,
                'policySha256': digest(self.policy), 'signingOrApplyPerformed': False}
