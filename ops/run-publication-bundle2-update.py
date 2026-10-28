#!/usr/bin/env python3
"""Prepare/run the approved one-time update through existing operator SSH/sudo. No credentials stored."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs/research/publication-pipeline-bundle2-20261028'
DECISION = '142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82'
SSH = ['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/etc/plunode-publication/known_hosts',
       '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'HostKeyAlgorithms=ssh-ed25519']
REMOTE = 'develop@153.115.17.82'
PACKAGE = 'operator-package-approved-journal-fix1'
PREVIOUS_PAYLOAD = 'ad596417d0abd4b24740b278c20d0cfa0bc708715ad66ed9ec804e1908512261'


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()


def read(path): return json.loads(Path(path).read_bytes())
def save(path, value): Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def run(argv): return subprocess.run(list(map(str, argv)), check=True)


def local_precheck(home):
    """Reject local drift before asking the operator for VPS passwords; root repeats checks under locks."""
    spec = importlib.util.spec_from_file_location('bundle2_applier_precheck', home / 'apply-publication-bundle2-update.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    files = home / 'payload'; approved = files / 'approved'
    helper.checksum_set(files, files / 'OPERATOR_SHA256SUMS')
    assert sha(files / 'decision-request.json') == DECISION
    decision = read(files / 'decision-request.json'); meta = read(approved / 'deployment.json')
    helper.checksum_set(approved, approved / 'SHA256SUMS')
    assert sha(approved / 'SHA256SUMS') == decision['assetManifestSha256']
    worker = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020'); runtime = worker / 'runtime'
    assert sha(worker / 'config.json') == meta['workerConfigSha256Unchanged']
    assert [{'file': str(p.relative_to(runtime)), 'sha256': sha(p)} for p in sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))] == meta['formalReceiptsUnchanged']
    delivery = Path('/etc/plunode-publication/delivery.json'); before = sha(delivery) == meta['deliveryConfigBeforeSha256']
    assert before or sha(delivery) == decision['deliveryConfigAfterSha256'], 'Local delivery advanced'
    for rel, pins in decision['workerOverlay'].items():
        expected = pins['before'] if before else pins['after']; path = runtime / rel
        assert sha(path) == expected if expected else not path.exists(), 'Local Worker advanced'
    assert sha('/usr/local/sbin/plunode-publication-approve') == decision['approverBeforeSha256' if before else 'approverAfterSha256']
    publication = Path('/home/isinxnisi/.local/share/plunode-publication')
    assert read(publication / 'preparation/state.json').get('phase') == 'idle'
    assert all(read(p).get('deliveryStage') == 'completed' for p in (publication / 'deliveries').glob('*/job.json'))
    assert not read(worker / 'state.json').get('executionControl', {}).get('activeAttempt')
    source = helper.OLD_SOURCE if before else helper.SOURCE
    task = helper.windows_task(files, source, source, os.environ.get('WSL_INTEROP'))
    print(json.dumps({'localPrecheck': 'passed', 'formalReceipts': 12, 'workerBeforeUpdate': before, 'taskSource': task['sourceAfter'], 'signed': False, 'applyCalls': 0}), flush=True)


def prepare():
    decision = DOCS / 'update-decision-request.json'; assert sha(decision) == DECISION
    d = read(decision); approved = Path(d['assetDirectory']); home = approved.parent / PACKAGE
    assert not home.exists(), 'Existing operator package must be verified, not replaced'
    home.mkdir(mode=0o700); payload = home / 'payload'; payload.mkdir(mode=0o700)
    assert sha(approved / 'SHA256SUMS') == d['assetManifestSha256']
    for line in (approved / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1); assert sha(approved / name) == expected
    # Fixed asset bytes are reused; neither the original package nor the approved files is edited.
    shutil.copytree(approved, payload / 'approved', copy_function=os.link)
    shutil.copyfile(decision, payload / 'decision-request.json')
    approval = DOCS / 'rollout/operator-approval.json'
    assert read(approval)['status'] == 'approved' and read(approval)['decisionRequestSha256'] == DECISION
    shutil.copyfile(approval, payload / 'operator-approval.json')
    for name in ['film-publication-image-update.py', 'film-web-only-update.py']:
        shutil.copyfile(ROOT / 'ops' / name, payload / name)
    shutil.copyfile(Path('/home/isinxnisi/.local/share/plunode-recovery/film-acceptance-20261027/operator-update/existing-image-verifier.py'), payload / 'existing-image-verifier.py')
    shutil.copyfile(ROOT / 'ops/update-publication-bundle2-task.ps1', payload / 'update-task.ps1')
    shutil.copyfile(ROOT / 'ops/apply-publication-bundle2-update.py', home / 'apply-publication-bundle2-update.py')
    release = payload / 'probe/release'; release.mkdir(parents=True)
    published = Path('/home/isinxnisi/.local/share/plunode-publication/preparation/candidates/13abfb93-ba2d-44f7-a56b-352aa7ab0ab0/release')
    for name in ['data.json', 'manifest.json']: shutil.copyfile(published / name, release / name)
    assert sha(release / 'data.json') == '908e6f3cc180a004d53cb5a34937daa8ca3ff539788dc35ffd56e496eca12f1b'
    contract = subprocess.check_output(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only', '--user=1000:1000',
        '--mount', 'type=bind,src=' + str(release) + ',dst=/incoming,readonly', '--entrypoint=node', d['images']['operator']['configId'],
        '--import', 'tsx', 'scripts/publication-compatibility.ts', 'contract', '/incoming'])
    save(release / 'compatibility.json', json.loads(contract))
    save(payload / 'execution-material.json', {'purpose': 'one-time-installer-job-inventory-fix',
        'decisionRequestSha256Unchanged': DECISION, 'approvedAssetManifestSha256Unchanged': d['assetManifestSha256'],
        'previousPayloadManifestSha256': PREVIOUS_PAYLOAD,
        'applierSha256': sha(home / 'apply-publication-bundle2-update.py'),
        'runtimeTargetsChanged': False, 'signed': False, 'applyCalls': 0})
    sums = ''.join(sha(p) + '  ' + str(p.relative_to(payload)) + '\n' for p in sorted(payload.rglob('*')) if p.is_file())
    (payload / 'OPERATOR_SHA256SUMS').write_text(sums)
    info = {'authority': 'one-time-execution-material-for-approved-fixed-target', 'decisionRequestSha256': DECISION,
            'directory': str(home), 'operatorManifestSha256': sha(payload / 'OPERATOR_SHA256SUMS'),
            'applierSha256': sha(home / 'apply-publication-bundle2-update.py'), 'installed': False,
            'signed': False, 'applyCalls': 0}
    save(home / 'operation.json', info); print(json.dumps(info)); return home


def operation(home, target, incoming, interop=None):
    """Generate only quoted fixed install/verify commands. Payload is never executed from user-writable paths."""
    info = read(home / 'operation.json'); stage = '/root/plunode-bundle2-update-' + info['operatorManifestSha256'][:12]
    q = shlex.quote; rows = ['set -eu', 'umask 077', 'if test ! -e ' + q(stage) + '; then', 'install -d -m 0700 ' + q(stage)]
    directories = sorted({str(p.relative_to(home)) for p in (home / 'payload').rglob('*') if p.is_dir()} | {'payload'})
    for rel in directories: rows.append('install -d -m 0700 ' + q(stage + '/' + rel))
    paths = ['apply-publication-bundle2-update.py', *[str(p.relative_to(home)) for p in sorted((home / 'payload').rglob('*')) if p.is_file()]]
    for rel in paths: rows.append('install -m 0600 ' + q(str(incoming) + '/' + rel) + ' ' + q(stage + '/' + rel))
    rows += ['fi', "printf '%s  %s\\n' " + q(info['applierSha256']) + ' ' + q(stage + '/apply-publication-bundle2-update.py') + ' | sha256sum -c -',
             "printf '%s  %s\\n' " + q(info['operatorManifestSha256']) + ' ' + q(stage + '/payload/OPERATOR_SHA256SUMS') + ' | sha256sum -c -']
    command = '/usr/bin/python3 -I ' + q(stage + '/apply-publication-bundle2-update.py') + ' ' + target
    if interop is not None: command += ' --interop ' + q(interop)
    rows.append(command); return '\n'.join(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('step', choices=['prepare', 'vps', 'wsl', 'all'])
    args = ap.parse_args()
    home = Path(read(DOCS / 'update-decision-request.json')['assetDirectory']).parent / PACKAGE
    if args.step == 'prepare': prepare(); return
    info = read(home / 'operation.json'); assert sha(home / 'apply-publication-bundle2-update.py') == info['applierSha256']
    assert sha(home / 'payload/OPERATOR_SHA256SUMS') == info['operatorManifestSha256']
    local_precheck(home)
    # Passwords remain in the existing operator terminal; no -S, password arguments, keys or sudoers changes.
    if args.step in ['vps', 'all']:
        incoming = '/home/develop/plunode-bundle2-update-' + info['operatorManifestSha256'][:12]
        # The completed prior upload contains the identical approved images. Recheck its manifest,
        # copy it to a distinct user-owned location, and transfer only the revised execution material.
        previous = '/home/develop/plunode-bundle2-update-' + PREVIOUS_PAYLOAD[:12] + '/payload'
        q = shlex.quote
        reuse = "set -eu\nprintf '%s  %s\\n' " + q(PREVIOUS_PAYLOAD) + ' ' + q(previous + '/OPERATOR_SHA256SUMS') + ' | sha256sum -c -\n'
        reuse += 'mkdir -p -- ' + q(incoming) + '\nif test ! -e ' + q(incoming + '/payload') + '; then cp -a -- ' + q(previous) + ' ' + q(incoming + '/payload') + '; fi'
        run(['ssh', *SSH, REMOTE, reuse])
        run(['scp', *SSH, home / 'payload/execution-material.json', home / 'payload/OPERATOR_SHA256SUMS',
             home / 'apply-publication-bundle2-update.py', REMOTE + ':' + incoming + '/'])
        command = 'set -eu\ncp -- ' + q(incoming + '/execution-material.json') + ' ' + q(incoming + '/OPERATOR_SHA256SUMS') + ' ' + q(incoming + '/payload/')
        command += '\nsudo /bin/bash -c ' + shlex.quote(operation(home, 'vps', incoming))
        run(['ssh', '-t', *SSH, REMOTE, command])
    if args.step in ['wsl', 'all']:
        run(['sudo', '/bin/bash', '-c', operation(home, 'wsl', home, os.environ.get('WSL_INTEROP', ''))])
    print('Requested fixed update steps finished. Return the result JSON lines to Codex for installed verification.')


if __name__ == '__main__': main()
