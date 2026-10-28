#!/usr/bin/env python3
"""Freeze reviewed bundle-2 update assets. Read-only inventory/Docker save; never installs."""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
WORKER = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020')
OLD_SOURCE = '7392d8e343a11644b1047364c71653779ad0c93c'
IMAGES = {'operator': 'sha256:eed48775a9ff6b790c18b9611c8b04003f2137cabb5fd608e1fb04881a3088a2',
          'web': 'sha256:7f25fc2f6df0155802db3cd1c17f5de461f2b0dd2fc9abe0dc7d6549fffb952e'}
OVERLAY = ['lib/domain/contribution.ts', 'lib/i18n/contribution.ts', 'lib/generated/contribution-roles.ts',
           'lib/server/publication-compatibility.ts', 'scripts/publication-compatibility.ts']


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()


def read(path): return json.loads(Path(path).read_bytes())
def save(path, value): Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def git(*args): return subprocess.check_output(['git', '-C', str(ROOT), *args])


def image_asset(image, target):
    inspected = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]
    assert inspected['Id'] == image and inspected['Os'] == 'linux' and inspected['Architecture'] == 'amd64'
    # Save by immutable ID, without a mutable tag. Exactly these bytes are copied to the VPS.
    process = subprocess.Popen(['docker', 'save', image], stdout=subprocess.PIPE)
    try:
        with target.open('xb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed:
            shutil.copyfileobj(process.stdout, compressed)
        assert process.wait() == 0
    finally:
        process.stdout.close()
        if process.poll() is None: process.kill(); process.wait()
    with tarfile.open(target) as archive:
        row, = json.load(archive.extractfile('manifest.json'))
        assert row.get('RepoTags') in [None, []]
        config_id = 'sha256:' + row['Config'].split('/')[-1].removesuffix('.json')
        assert config_id == image
        manifest_ids = []
        for member in archive:
            if member.name.startswith('blobs/sha256/') and member.size < 1024 * 1024:
                body = archive.extractfile(member).read()
                try: value = json.loads(body)
                except (ValueError, UnicodeError): continue
                if isinstance(value, dict) and value.get('config', {}).get('digest') == image and 'layers' in value:
                    assert hashlib.sha256(body).hexdigest() == member.name.split('/')[-1]
                    manifest_ids.append('sha256:' + member.name.split('/')[-1])
        assert len(manifest_ids) == 1
    return {'configId': image, 'manifestId': manifest_ids[0], 'archiveSha256': sha(target),
            'platform': 'linux/amd64', 'nodeVersion': 'v24.21.0'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source', required=True); ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--proof', type=Path, required=True)
    ap.add_argument('--vps-inventory', type=Path)
    ap.add_argument('--reuse-images', type=Path, help='Reuse the exact previously frozen archives, checking their hashes')
    args = ap.parse_args(); source = git('rev-parse', args.source).decode().strip(); output = args.output.resolve()
    assert output.is_relative_to(ROOT / '.local/publication-pipeline') and not output.exists()
    # Reject an asset build against a different worktree source, including uncommitted edits.
    for relative in [*OVERLAY, 'scripts/publication-executor.py', 'scripts/publication-cycle.py',
                     'scripts/publication-preparation.py', 'scripts/publication-delivery.py', 'ops/plunode-publication-approve']:
        assert git('show', source + ':' + relative) == (ROOT / relative).read_bytes(), relative
    output.mkdir(parents=True); output.chmod(0o700)
    with (output / 'source.tar').open('xb') as stream:
        subprocess.run(['git', '-C', str(ROOT), 'archive', source, 'scripts', 'ops', 'lib', 'vocabulary',
                        'package.json', 'package-lock.json', 'tsconfig.json'], stdout=stream, check=True)
    if args.reuse_images:
        images = read(args.reuse_images / 'deployment.json')['images']
        for name, image in IMAGES.items():
            original = args.reuse_images / (name + '-image.tar.gz')
            assert images[name]['configId'] == image and sha(original) == images[name]['archiveSha256']
            shutil.copyfile(original, output / original.name)
    else:
        images = {name: image_asset(image, output / (name + '-image.tar.gz')) for name, image in IMAGES.items()}
    policy = read(args.proof / 'compatibility-policy-isolated.json')
    assert policy['worker']['nodeVersion'] == 'v24.21.0'
    policy['worker']['root'] = str(WORKER / 'runtime')
    policy['operator']['deploymentDigest'] = images['operator']['manifestId']
    policy['web']['deploymentImage'] = images['web']['manifestId']
    # Linux Docker can expose config ID locally and OCI manifest ID after archive load. Both are verified above.
    save(output / 'compatibility-policy.json', policy)
    worker_files = {}
    for relative in OVERLAY:
        destination = output / 'worker-overlay' / relative; destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, destination)
        old = WORKER / 'runtime' / relative
        worker_files[relative] = {'before': sha(old) if old.exists() else None, 'after': sha(destination)}
    # This proof must be based on a shadow of the actual installed Worker, not just a historical branch.
    for relative, expected in policy['worker']['files'].items():
        path = ROOT / relative if relative in OVERLAY else WORKER / 'runtime' / relative
        assert sha(path) == expected, 'Installed Worker shadow differs: ' + relative
    before = read('/etc/plunode-publication/delivery.json'); assert before['sourceCommit'] == OLD_SOURCE
    after = copy.deepcopy(before); after['sourceCommit'] = source
    after['preparation'].update(nodeImage=IMAGES['operator'], compatibilityRequired=True, compatibility=policy)
    save(output / 'delivery.after.json', after)
    cached_manifest = Path('/home/isinxnisi/.local/share/plunode-recovery/film-acceptance-20261027/operator-update/program-manifest.json')
    previous = read(cached_manifest)
    inventory = read(args.vps_inventory) if args.vps_inventory else None
    if inventory:
        assert inventory['authority'] == 'read-only-installed-vps-inventory'
        assert inventory['programManifest'] == previous, 'VPS trust set advanced; inspect before fixing the update'
        assert inventory['operatorImage']['Id'] in [previous['operatorConfigId'], previous['operatorManifestId']]
        assert inventory['operatorNodeVersion'] == 'v24.21.0' and len(inventory['web']) == 1
        previous = inventory['programManifest']
        shutil.copyfile(args.vps_inventory, output / 'vps-inventory.json')
    updated = copy.deepcopy(previous); updated.update(sourceCommit=source, operatorSourceCommit=source,
        operatorConfigId=images['operator']['configId'], operatorManifestId=images['operator']['manifestId'])
    updated['configBindings']['compatibilityRequired'] = True
    gate_files = {}
    for relative in ['scripts/publication-executor.py', 'scripts/publication-cycle.py']:
        target = output / 'gate-overlay' / Path(relative).name; target.parent.mkdir(exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
        gate_files[relative] = {'before': previous['files'][relative], 'after': sha(target)}
        updated['files'][relative] = sha(target)
    save(output / 'program-manifest.after.json', updated)
    receipts = [{'file': str(p.relative_to(WORKER / 'runtime')), 'sha256': sha(p)}
                for p in sorted((WORKER / 'runtime/datasets/manga-collection').glob('accepted-*/acceptance.json'))]
    assert len(receipts) == 12
    plan = {'authority': 'candidate-update-assets-not-installation-or-publication-approval', 'sourceCommit': source,
        'vpsFreshInventoryConfirmed': bool(inventory), 'installationAuthorized': False,
        'images': images, 'workerOverlay': worker_files, 'gateOverlay': gate_files,
        'workerConfigSha256Unchanged': sha(WORKER / 'config.json'), 'formalReceiptsUnchanged': receipts,
        'deliveryConfigBeforeSha256': sha('/etc/plunode-publication/delivery.json'),
        'approverBeforeSha256': sha('/usr/local/sbin/plunode-publication-approve'),
        'approverAfterSha256': sha(ROOT / 'ops/plunode-publication-approve'),
        'rootManifestBeforeSha256': sha(cached_manifest),
        'vpsConfigBeforeSha256': inventory['configSha256'] if inventory else None,
        'vpsConfigChangesOnly': {'operatorDigest': images['operator']['manifestId'], 'compatibilityRequired': True},
        'windowsTask': {'name': 'Plunode-Publication-Delivery', 'sourceBefore': OLD_SOURCE, 'sourceAfter': source,
                        'preserveTriggerPrincipalSettingsAndHiddenLauncher': True},
        'preserve': ['keys', 'sudoers', 'SSH modes', 'all old requests/signatures/nonces', 'all receipts',
                     'Worker base/collector/approvals', 'KG', 'member database', 'environment files'],
        'signed': False, 'applyCalls': 0}
    save(output / 'deployment.json', plan)
    sums = ''.join(sha(p) + '  ' + str(p.relative_to(output)) + '\n' for p in sorted(output.rglob('*')) if p.is_file())
    (output / 'SHA256SUMS').write_text(sums)
    print(json.dumps({'directory': str(output), 'sha256sums': sha(output / 'SHA256SUMS'),
                      'deploymentSha256': sha(output / 'deployment.json'), 'vpsFreshInventoryConfirmed': bool(inventory),
                      'installed': False, 'signed': False, 'applyCalls': 0}))


if __name__ == '__main__': main()
