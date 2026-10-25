#!/usr/bin/env python3
"""Verify migrated, completed collection results and requeue ONLY their publication.

No collector, acceptance, control, receipt or frozen artifact bytes are changed.
Only verified old-runtime cache links and completed-result pointers are relocated. Run under
an existing autopilot hold. The worker lock is nonblocking; a busy worker is left
alone. A reviewed SHA-256 of the original migration proof is mandatory.
"""
import argparse
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
import shutil
import uuid
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tempfile
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def load(path):
    spec = importlib.util.spec_from_file_location('relocation_worker', path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def inside(root, name):
    relative = PurePosixPath(name)
    require(isinstance(name, str) and name and not relative.is_absolute()
            and '..' not in relative.parts and chr(92) not in name, 'Unsafe relative path')
    path = root / name
    require(path.resolve().is_relative_to(root.resolve()), 'Path escapes runtime')
    require(not any(p.is_symlink() for p in [path, *path.parents] if p != root.parent),
            'Symlink in migration path')
    return path


def verify_transfer(home, pinned_sha):
    proof_path = home / 'migration/transfer-verification.json'
    require(sha(proof_path.read_bytes()) == pinned_sha, 'Migration proof changed')
    proof = read(proof_path)
    require(Path(proof['newHome']) == home and proof['oldRuntimeUnchanged'] is True
            and proof['oldStateCopiedByteIdentical'] is True, 'Migration is not verified')
    inventory_file = home / 'migration/source-runtime-inventory.json'
    require(sha(inventory_file.read_bytes()) == proof['sourceRuntimeInventorySha256'],
            'Migration inventory changed')
    inventory = read(inventory_file)
    old, new = Path(proof['oldHome']) / 'runtime', home / 'runtime'
    require(old.resolve() != new.resolve(), 'Runtimes must differ')
    for name, expected in proof['copiedFilesSha256'].items():
        require(inventory.get(name, {}).get('sha256') == expected, 'Unproven transferred file')
        for root in [old, new]:
            path = inside(root, name)
            require(path.is_file() and sha(path.read_bytes()) == expected,
                    'Transferred artifact changed: ' + name)
    config = read(home / 'config.json')
    require(config['home'] == str(home) and config['workerId'] == proof['workerId']
            and config['codeCommit'] == proof['codeCommit'], 'Worker identity/code changed')
    # Verify executable code BEFORE importing it. Keep the installed source guard.
    for name, expected in proof['codeFilesSha256'].items():
        path = inside(new, name)
        require(path.is_file() and sha(path.read_bytes()) == expected, 'Runtime code changed: ' + name)
        raw = subprocess.run(['git', '--git-dir=' + str(home / 'control.git'),
                              'show', proof['codeCommit'] + ':' + name],
                             check=True, capture_output=True).stdout
        require(sha(raw) == expected, 'Runtime code differs from pinned commit: ' + name)
    require('scripts/collection-worker.py' in proof['codeFilesSha256'], 'Worker code not pinned')
    return proof, config


def cache_links(state, ids, proof, home):
    inventory = read(home / 'migration/source-runtime-inventory.json')
    old, new = Path(proof['oldHome']) / 'runtime', home / 'runtime'
    result = []
    for ident in ids:
        record = state['requests'][ident]
        require(record['kind'] == 'collect-review', 'Only completed collection results are relocatable')
        job = record['result']['jobId']
        require('/' not in job and job not in ['.', '..'], 'Invalid job ID')
        name = '.local/collection-jobs/' + job + '/request-cache'
        source = inventory.get(name, {}).get('symlink')
        require(isinstance(source, str), 'Original shared cache link not recorded')
        source_path = Path(source)
        require(source_path.is_absolute() and source_path.is_relative_to(old), 'Cache was outside old runtime')
        target = source_path.relative_to(old).as_posix()
        require(target.startswith('.local/collection-issues/') and target.endswith('/request-cache'), 'Unexpected shared cache')
        old_target, new_target = inside(old, target), inside(new, target)
        old_link, new_link = old / name, new / name
        require(old_link.is_symlink() and os.readlink(old_link) == source, 'Original cache link changed')
        require(new_link.parent.resolve().is_relative_to(new) and new_link.is_symlink(), 'Current cache link missing/unsafe')
        observed = os.readlink(new_link)
        require(observed in [source, str(new_target)], 'Current cache link changed')
        for root in [old_target, new_target]:
            files = [p for p in root.rglob('*') if p.is_file() or p.is_symlink()]
            require(files, 'Shared cache is empty')
            for path in files:
                require(not path.is_symlink(), 'Nested cache symlink forbidden')
                relative = target + '/' + path.relative_to(root).as_posix()
                require(proof['copiedFilesSha256'].get(relative) == sha(path.read_bytes()), 'Shared cache changed')
        result.append({'file': name, 'oldTarget': source, 'target': str(new_target),
                       'targetRelative': target, 'observedTarget': observed})
    return result


def canonical_file(name, links):
    for link in links:
        if name.startswith(link['file'] + '/'):
            return link['targetRelative'] + name[len(link['file']):]
    return name


def isolated_executor(executor, proof, links, directory):
    root = Path(directory)
    # Copy bytes, never execute or modify original artifacts during preflight.
    for name in proof['copiedFilesSha256']:
        source = inside(executor.root, name)
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    for link in links:
        path = root / link['file']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.symlink_to(root / link['targetRelative'], target_is_directory=True)
    value = copy.copy(executor)
    value.root, value.registry = root, root / 'datasets/collection-themes'
    return value


def no_create(*args, **kwargs):
    raise ValueError('Missing frozen draft; generating a replacement is forbidden')


def relocated_record(record, proof, home, executor, links=()):
    require(record['kind'] == record['request']['kind'] == 'collect-review', 'Not a collection result')
    require(record['phase'] == 'blocked' and record.get('message') == 'Artifact escapes runtime',
            'Result is not blocked by the migration path')
    require(record.get('executionComplete') is True, 'Collection has not completed')
    require(record['workerId'] == proof['workerId'], 'Foreign worker result')
    old, new = Path(proof['oldHome']) / 'runtime', home / 'runtime'
    original = Path(record['result']['reviewDirectory'])
    require(original.is_absolute() and original.is_relative_to(old), 'Not an old-runtime review')
    name = original.relative_to(old).as_posix()
    require(name.startswith('datasets/manga-collection/workflow-reviews/'), 'Unexpected review path')
    review = inside(new, name)
    reference = record['reviewReference']
    require(reference['file'] == name + '/review-manifest.json', 'Review reference changed')
    require(sha((review / 'review-manifest.json').read_bytes()) == reference['sha256'], 'Review manifest changed')
    manifest = read(review / 'review-manifest.json')
    for artifact, expected in manifest['artifacts'].items():
        require(sha(inside(review, artifact).read_bytes()) == expected, 'Frozen review changed')
    result = copy.deepcopy(record)
    result['result']['reviewDirectory'] = str(review)
    # Execute the existing artifact traversal guard, but prohibit ALL draft creation.
    with patch.object(executor.workflow, 'execute', no_create), patch.object(executor.artifacts.__func__.__globals__['gate'], 'create', no_create):
        validation_result = copy.deepcopy(result['result'])
        validation_result['reviewDirectory'] = str(executor.root / name)
        files, drafts = executor.artifacts(record['request'], validation_result)
    require(drafts == record['decisionDrafts'], 'Decision draft references changed')
    for path, raw in files.items():
        require(proof['copiedFilesSha256'].get(canonical_file(path, links)) == sha(raw), 'Unproven publication artifact: ' + path)
    result['phase'] = 'publishing'
    return result, {path: sha(raw) for path, raw in sorted(files.items())}


def make_plan(state, ids, proof, home, executor, active, links=()):
    require(ids and len(ids) == len(set(ids)), 'Select unique requests explicitly')
    require(not state.get('executionControl', {}).get('activeAttempt'), 'An execution attempt is active')
    after = copy.deepcopy(state)
    details = []
    for ident in ids:
        record = state['requests'][ident]
        active(record['request'], record['requestSha256'])
        relocated, files = relocated_record(record, proof, home, executor, links)
        after['requests'][ident] = relocated
        details.append({'requestId': ident, 'requestSha256': record['requestSha256'],
                        'oldReviewDirectory': record['result']['reviewDirectory'],
                        'reviewDirectory': relocated['result']['reviewDirectory'],
                        'publicationFilesSha256': files})
    return after, details


def write_private(path, raw):
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def apply_state(home, before, after, plan, verify=lambda: None):
    require((home / 'state.json').read_bytes() == before, 'Worker state changed during inspection')
    directory = Path(tempfile.mkdtemp(prefix='result-relocation-', dir=home / 'migration'))
    write_private(directory / 'state-before.json', before)
    encoded = (json.dumps(after, ensure_ascii=False, indent=2) + chr(10)).encode()
    write_private(directory / 'proof.json', (json.dumps({**plan, 'beforeSha256': sha(before),
                  'afterSha256': sha(encoded)}, ensure_ascii=False, indent=2) + chr(10)).encode())
    pending = directory / 'state-after.json'
    write_private(pending, encoded)
    require((home / 'state.json').read_bytes() == before, 'Worker state changed before replacement')
    for folder in [directory, directory.parent]:
        backup_fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(backup_fd)
        finally:
            os.close(backup_fd)
    for link in plan.get('cacheLinks', []):
        path = home / 'runtime' / link['file']
        require(path.is_symlink() and os.readlink(path) == link['observedTarget'], 'Cache link changed before replacement')
        if link['observedTarget'] != link['target']:
            temporary = path.with_name('.relocation-' + uuid.uuid4().hex)
            temporary.symlink_to(link['target'], target_is_directory=True)
            os.replace(temporary, path)
            fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    verify()  # Original, unchanged Worker traversal guard on actual repaired paths.
    require((home / 'state.json').read_bytes() == before, 'Worker state changed after cache repair')
    os.replace(pending, home / 'state.json')
    fd = os.open(home, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return str(directory)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--config', type=Path, required=True)
    cli.add_argument('--migration-sha256', required=True)
    cli.add_argument('--request', action='append', required=True)
    cli.add_argument('--token', required=True)
    cli.add_argument('--apply', action='store_true')
    args = cli.parse_args()
    def held():
        subprocess.run([sys.executable, str(ROOT / 'scripts/autopilot.py'),
                        'assert-held', '--token', args.token], check=True, stdout=subprocess.DEVNULL)
    held()
    home = args.config.resolve().parent
    require(args.config.resolve() == home / 'config.json', 'Unexpected configuration path')
    with (home / 'worker.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        proof, config = verify_transfer(home, args.migration_sha256)
        worker_code = load(home / 'runtime/scripts/collection-worker.py')
        store = worker_code.GitHubStore(home, config['remote'], config['branch'])
        store.sync()
        before = (home / 'state.json').read_bytes()
        state = json.loads(before)
        require(not state.get('executionControl', {}).get('activeAttempt'), 'An execution attempt is active')
        executor = worker_code.Executor(config, store)
        worker = worker_code.Worker(config, store, executor)
        links = cache_links(state, args.request, proof, home)
        with tempfile.TemporaryDirectory(prefix='collection-relocation-preflight-') as directory:
            isolated = isolated_executor(executor, proof, links, directory)
            after, details = make_plan(state, args.request, proof, home, isolated,
                                      lambda request, digest: worker.active(request, digest, sync=False), links)
        plan = {'schemaVersion': 1, 'migrationSha256': args.migration_sha256,
                'controlCommit': store.head, 'requests': details, 'cacheLinks': links, 'collectorRuns': 0,
                'acceptanceRuns': 0, 'publicApply': False, 'controlChanged': False}
        # Existing immutable remote artifacts must also match before resuming.
        remote_files = store.tree(store.head, worker_code.PREFIX + 'artifacts/')
        for detail in details:
            prefix = worker_code.PREFIX + 'artifacts/' + detail['requestId'] + '/'
            for name, expected in detail['publicationFilesSha256'].items():
                if prefix + name in remote_files:
                    require(sha(store.blob(prefix + name)) == expected, 'Remote artifact differs: ' + name)
        held()
        if args.apply:
            def verify_actual():
                for ident in args.request:
                    relocated_record(state['requests'][ident], proof, home, executor, links)
            plan['preserveDirectory'] = apply_state(home, before, after, plan, verify_actual)
        print(json.dumps({**plan, 'phase': 'queued-for-existing-worker' if args.apply else 'verified-dry-run'},
                         ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BlockingIOError:
        print(json.dumps({'error': 'Worker lock busy; nothing changed', 'publicApply': False}))
        sys.exit(75)
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error), 'publicApply': False}), file=sys.stderr)
        sys.exit(1)
