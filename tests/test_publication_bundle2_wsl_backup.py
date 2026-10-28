"""Reproduce colliding Worker basenames and exercise the installer in a private tree."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result


apply = load('bundle2_backup_applier_test', 'ops/apply-publication-bundle2-update.py')
helper = load('bundle2_backup_helpers_test', 'ops/film-publication-image-update.py')


class BackupChecks(unittest.TestCase):
    def fixture(self, folder):
        runtime = Path(folder) / 'runtime'
        before = {runtime / 'lib/domain/contribution.ts': b'domain-before',
                  runtime / 'lib/i18n/contribution.ts': b'i18n-before',
                  runtime / 'lib/generated/contribution-roles.ts': None,
                  runtime / 'lib/server/publication-compatibility.ts': None,
                  runtime / 'scripts/publication-compatibility.ts': None,
                  Path(folder) / 'etc/delivery.json': b'config-before',
                  Path(folder) / 'sbin/approver': b'approver-before'}
        specs = {p: (1000, 1000, 0o644) for p in before}
        stage = Path(folder) / 'stage'; stage.mkdir()
        return runtime, before, specs, stage

    def test_same_basename_backups_roundtrip_without_overwrite_and_resume(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime, before, specs, stage = self.fixture(folder)
            # The old formula demonstrably aliases two different approved before bytes.
            old = ['worker-' + p.name + '.before' for p in before if p.is_relative_to(runtime)]
            self.assertLess(len(set(old)), len(old))
            apply.save_wsl_backups(stage, before, specs, runtime, helper)
            snapshot = {p: (p.read_bytes(), p.stat().st_ino) for p in (stage / 'backup').rglob('*') if p.is_file()}
            apply.save_wsl_backups(stage, before, specs, runtime, helper)
            self.assertEqual(snapshot, {p: (p.read_bytes(), p.stat().st_ino) for p in snapshot})
            manifest = json.loads((stage / 'backup/wsl-backup-manifest.json').read_bytes())
            self.assertEqual(len(manifest['files']), 7)
            for row in manifest['files']:
                self.assertEqual((stage / 'backup' / row['backup']).read_bytes() if row['existed'] else None, before[Path(row['path'])])
            self.assertEqual(sum(row['existed'] for row in manifest['files']), 4)

    def test_existing_later_mismatch_stops_before_creating_any_new_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime, before, specs, stage = self.fixture(folder)
            bad = stage / 'backup/worker/lib/i18n/contribution.ts.before'
            bad.parent.mkdir(parents=True); bad.write_bytes(b'drift')
            initial = {p: p.read_bytes() for p in (stage / 'backup').rglob('*') if p.is_file()}
            with self.assertRaisesRegex(ValueError, 'Existing backup differs'):
                apply.save_wsl_backups(stage, before, specs, runtime, helper)
            self.assertEqual(initial, {p: p.read_bytes() for p in (stage / 'backup').rglob('*') if p.is_file()})
            self.assertEqual(apply.DIAGNOSTICS['backupComparison']['file'], 'worker/lib/i18n/contribution.ts.before')

    def test_backup_escape_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = Path(folder); outside = stage / 'outside'; outside.mkdir()
            for name in ['', '.', '../outside', '/outside', 'worker/../../outside', 'a\\b', 'a//b', './a']:
                with self.assertRaises(ValueError): apply.backup(stage, name, b'fixed', helper)
            (stage / 'backup').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError): apply.backup(stage, 'worker/file', b'fixed', helper)
            (stage / 'backup').unlink(); (stage / 'backup').mkdir()
            (stage / 'backup/worker').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError): apply.backup(stage, 'worker/file', b'fixed', helper)
            (stage / 'backup/worker').unlink(); (outside / 'file').write_bytes(b'fixed')
            (stage / 'backup/file').symlink_to(outside / 'file')
            with self.assertRaises(ValueError): apply.backup(stage, 'file', b'fixed', helper)

    def test_previous_partial_backup_requires_exact_hash_and_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = Path(folder); (stage / 'backup').mkdir(); (stage / 'payload').mkdir()
            old = stage / 'backup/worker-contribution.ts.before'; old.write_bytes(b'fixed-domain-before')
            actual_sha = apply.sha
            pins = {'apply-publication-bundle2-update.py': '74a2bb1a3abe79c897b74f56a0b9e4db1ba1d9a97e8ef0520f9e48dcb9fd50e9',
                    'OPERATOR_SHA256SUMS': '9955a6dbf84ccb53d0a4e3daa18e7c967746267785426e2926ec0aff13354215'}
            decision = {'workerOverlay': {'lib/domain/contribution.ts': {'before': actual_sha(old)}}}
            trusted = SimpleNamespace(trusted=lambda p, directory=False: helper.trusted(p, uid=os.geteuid(), directory=directory))
            def pinned_sha(p): return pins[p.name] if p.name in pins else actual_sha(p)
            with patch.object(apply, 'sha', side_effect=pinned_sha):
                inode = old.stat().st_ino
                self.assertTrue(apply.previous_wsl_backup(trusted, decision, stage)['preserved'])
                self.assertEqual(old.stat().st_ino, inode)
                old.write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError, 'Previous backup hash differs'): apply.previous_wsl_backup(trusted, decision, stage)
                old.write_bytes(b'fixed-domain-before'); (stage / 'backup/unexpected').write_text('stop')
                with self.assertRaisesRegex(ValueError, 'Unexpected previous backup'): apply.previous_wsl_backup(trusted, decision, stage)

    def run_installer(self, folder, fail_after_task=False):
        """Actual wsl() flow, redirected paths, real backup/atomic files; no live process/Task."""
        env = Path(folder) / 'installed'; env.mkdir()
        def redirected(*values):
            path = Path(*values)
            return env / path.relative_to('/') if path.is_absolute() and not path.is_relative_to(Path(folder)) else path
        worker = redirected('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020')
        runtime = worker / 'runtime'; runtime.mkdir(parents=True)
        home = redirected('/home/isinxnisi/.local/share/plunode-publication')
        cfg = redirected('/etc/plunode-publication/delivery.json')
        approver = redirected('/usr/local/sbin/plunode-publication-approve')
        redirected('/usr/local/lib/plunode-receipts').mkdir(parents=True)
        for path, data in [(cfg, b'config-before'), (approver, b'approver-before'), (worker / 'config.json', b'worker-config'),
                           (worker / 'state.json', b'{"executionControl":{"revision":8}}'),
                           (home / 'preparation/state.json', b'{"phase":"idle"}')]:
            path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
        receipts = []
        for i in range(12):
            path = runtime / f'datasets/manga-collection/accepted-{i:02}/acceptance.json'
            path.parent.mkdir(parents=True); path.write_bytes(apply.body({'receipt': i}))
            receipts.append({'file': str(path.relative_to(runtime)), 'sha256': apply.sha(path)})
        approved = Path(folder) / 'approved'; approved.mkdir()
        decision = {'workerOverlay': {}}
        names = ['lib/domain/contribution.ts', 'lib/i18n/contribution.ts', 'lib/generated/contribution-roles.ts',
                 'lib/server/publication-compatibility.ts', 'scripts/publication-compatibility.ts']
        for index, rel in enumerate(names):
            path = runtime / rel
            if index < 2: path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(f'before-{index}'.encode())
            after = approved / 'worker-overlay' / rel; after.parent.mkdir(parents=True, exist_ok=True); after.write_bytes(f'after-{index}'.encode())
            decision['workerOverlay'][rel] = {'before': apply.sha(path) if path.exists() else None, 'after': apply.sha(after)}
        node = Path(folder) / 'node'; node.write_bytes(b'isolated-node')
        policy = {'worker': {'node': str(node), 'nodeSha256': apply.sha(node),
                            'files': {rel: row['after'] for rel, row in decision['workerOverlay'].items()}}}
        (approved / 'compatibility-policy.json').write_bytes(apply.body(policy))
        (approved / 'delivery.after.json').write_bytes(b'config-after')
        with tarfile.open(approved / 'source.tar', 'w') as archive:
            data = b'approver-after'; entry = tarfile.TarInfo('ops/plunode-publication-approve'); entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        decision.update(approverBeforeSha256=apply.sha(approver), approverAfterSha256=apply.hashlib.sha256(b'approver-after').hexdigest(), deliveryConfigAfterSha256=apply.sha(approved / 'delivery.after.json'))
        meta = {'deliveryConfigBeforeSha256': apply.sha(cfg), 'workerConfigSha256Unchanged': apply.sha(worker / 'config.json'),
                'formalReceiptsUnchanged': receipts, 'images': {kind: {'configId': kind} for kind in ['web', 'operator']}}
        before = {p: p.read_bytes() for p in env.rglob('*') if p.is_file()}
        stage = Path(folder) / 'stage'; stage.mkdir(); calls = []
        def task(files, old, new, interop):
            calls.append((old, new))
            return {'beforeXmlBase64': apply.base64.b64encode(b'private-task-before').decode(), 'triggerPrincipalSettingsPreserved': True}
        def run(args, **kwargs):
            if args[-1] == '--version': return b'v24.21.0\n'
            self.assertEqual(args, [approver, '--self-check'])
            if fail_after_task: raise ValueError('isolated-self-check-failure')
            return b'{"signed":false,"applyCalls":0}'
        h = SimpleNamespace(existing_lock=lambda *a: contextlib.nullcontext(), trusted=lambda *a, **k: None,
                            atomic=helper.atomic, save_new=helper.save_new)
        with patch.object(apply, 'Path', side_effect=redirected), patch.object(apply, 'read_image', side_effect=lambda image: {'Id': image, 'Os': 'linux', 'Architecture': 'amd64'}), \
             patch.object(apply, 'run', side_effect=run), patch.object(apply, 'windows_task', side_effect=task), \
             patch.object(apply, 'previous_wsl_backup', return_value={'preserved': True}), patch.object(apply.os, 'chown'):
            if fail_after_task:
                with self.assertRaisesRegex(ValueError, 'isolated-self-check-failure'):
                    apply.wsl(stage, Path(folder), approved, decision, meta, h, '/run/WSL/123_interop')
                for path, data in before.items(): self.assertEqual(path.read_bytes(), data)
                for rel in names[2:]: self.assertFalse((runtime / rel).exists())
                self.assertEqual(calls, [(apply.OLD_SOURCE, apply.SOURCE), (apply.SOURCE, apply.OLD_SOURCE)])
            else:
                result = apply.wsl(stage, Path(folder), approved, decision, meta, h, '/run/WSL/123_interop')
                self.assertEqual(result['workerOverlayFiles'], 5); self.assertEqual(result['formalReceiptsPreserved'], 12)
                self.assertFalse(result['signed']); self.assertEqual(result['applyCalls'], 0)
                for rel, pins in decision['workerOverlay'].items(): self.assertEqual(apply.sha(runtime / rel), pins['after'])
                self.assertEqual(calls, [(apply.OLD_SOURCE, apply.SOURCE)])
                for path, data in before.items():
                    if path not in [cfg, approver, *[runtime / rel for rel in names]]: self.assertEqual(path.read_bytes(), data)
            index = json.loads((stage / 'backup/wsl-backup-manifest.json').read_bytes())
            for row in index['files']:
                self.assertEqual((stage / 'backup' / row['backup']).read_bytes() if row['existed'] else None, before.get(Path(row['path'])))

    def test_full_isolated_wsl_update_with_real_backups(self):
        with tempfile.TemporaryDirectory() as folder: self.run_installer(folder)

    def test_full_isolated_wsl_rollback_restores_task_files_and_absence(self):
        with tempfile.TemporaryDirectory() as folder: self.run_installer(folder, fail_after_task=True)


if __name__ == '__main__': unittest.main()
