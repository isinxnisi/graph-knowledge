"""Isolated checks for the one-time operator wrapper; never touches installed services."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value


apply = load('bundle2_rollout_applier_test', 'ops/apply-publication-bundle2-update.py')
runner = load('bundle2_rollout_runner_test', 'ops/run-publication-bundle2-update.py')


class RolloutChecks(unittest.TestCase):
    def test_exact_payload_rejects_changes_extras_duplicates_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); item = root / 'a'; item.write_text('fixed')
            manifest = root / 'SHA256SUMS'; line = apply.sha(item) + '  a\n'; manifest.write_text(line)
            apply.checksum_set(root, manifest)
            item.write_text('drift')
            with self.assertRaises(ValueError): apply.checksum_set(root, manifest)
            item.write_text('fixed'); extra = root / 'extra'; extra.write_text('extra')
            with self.assertRaises(ValueError): apply.checksum_set(root, manifest)
            extra.unlink(); manifest.write_text(line + line)
            with self.assertRaises(ValueError): apply.checksum_set(root, manifest)
            manifest.write_text(line); item.unlink(); outside = root.parent / (root.name + '-outside')
            try:
                outside.write_text('fixed'); item.symlink_to(outside)
                with self.assertRaises(ValueError): apply.checksum_set(root, manifest)
            finally: outside.unlink()

    def test_manifest_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); manifest = root / 'SHA256SUMS'
            for name in ['../outside', '/etc/passwd', 'a\\b']:
                manifest.write_text('0' * 64 + '  ' + name + '\n')
                with self.assertRaises(ValueError): apply.checksum_set(root, manifest)

    def test_config_transformation_changes_only_approved_fields(self):
        request = json.loads((ROOT / 'docs/research/publication-pipeline-bundle2-20261028/update-decision-request.json').read_bytes())
        transform = request['vpsConfigTransform']
        previous = {'operatorDigest': 'old', 'deploymentEnabled': True, 'keys': {'pin': 'unchanged'}, 'workerCodeCommit': 'fixed'}
        updated = apply.transformed_config(previous, transform)
        self.assertEqual(updated, {**previous, **transform['set']})
        self.assertEqual(previous['operatorDigest'], 'old')
        for change in [{'deploymentEnabled': False}, {'compatibilityRequired': False}, {'operatorDigest': 'sha256:' + '0' * 64}]:
            with self.assertRaises(ValueError): apply.transformed_config(previous, {'set': {**transform['set'], **change}})

    def test_busy_or_uncertain_jobs_reject_update(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'jobs').mkdir()
            nonce = '13abfb93-ba2d-44f7-a56b-352aa7ab0ab0'
            (root / 'exclusion.json').write_text('{"active":null}')
            (root / 'reservations.json').write_text(json.dumps({'nonces': {nonce: {}}}))
            job = root / 'jobs' / (nonce + '.json')
            complete = {'nonce': nonce, 'phase': 'completed', 'pendingAudit': False}
            job.write_text(json.dumps(complete))
            backup = root / 'jobs' / (nonce + '-backup.json')
            backup_body = {'checksum': 'a' * 64, 'payload': {'version': 1, 'dataset': 'public-kg'}}
            backup.write_text(json.dumps(backup_body))
            initial = {p.name: p.read_bytes() for p in root.rglob('*.json')}
            self.assertEqual(apply.current_jobs(root), {'jobs': 1, 'backups': 1, 'unfinishedJobs': 0})
            self.assertEqual(initial, {p.name: p.read_bytes() for p in root.rglob('*.json')})
            for phase in ['applying', 'awaiting-publication-approval', 'failed']:
                job.write_text(json.dumps({**complete, 'phase': phase}))
                with self.assertRaises(ValueError): apply.current_jobs(root)
            job.write_text(json.dumps({**complete, 'pendingAudit': True}))
            with self.assertRaises(ValueError): apply.current_jobs(root)
            job.write_text(json.dumps(complete)); (root / 'exclusion.json').write_text(json.dumps({'active': nonce}))
            with self.assertRaises(ValueError): apply.current_jobs(root)

    def test_unknown_or_malformed_journals_and_orphan_backups_stop(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'jobs').mkdir()
            nonce = '13abfb93-ba2d-44f7-a56b-352aa7ab0ab0'
            (root / 'exclusion.json').write_text('{"active":null}')
            (root / 'reservations.json').write_text('{"nonces":{}}')
            unknown = root / 'jobs/unknown-backup.json'; unknown.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Unknown publication journal'): apply.current_jobs(root)
            unknown.unlink()
            backup = root / 'jobs' / (nonce + '-backup.json'); backup.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Malformed publication backup'): apply.current_jobs(root)
            backup.write_text(json.dumps({'checksum': 'a' * 64, 'payload': {'version': 1, 'dataset': 'public-kg'}}))
            with self.assertRaisesRegex(ValueError, 'Orphan publication backup'): apply.current_jobs(root)
            job = root / 'jobs' / (nonce + '.json'); job.write_text('{"payload":{}}')
            with self.assertRaisesRegex(ValueError, 'Malformed publication job'): apply.current_jobs(root)
            job.write_text(json.dumps({'nonce': nonce, 'phase': 'completed'}))
            with self.assertRaisesRegex(ValueError, 'Unfinished/uncertain'): apply.current_jobs(root)

    def test_consumed_nonce_still_requires_completed_job(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'jobs').mkdir()
            nonce = '13abfb93-ba2d-44f7-a56b-352aa7ab0ab0'
            (root / 'exclusion.json').write_text('{"active":null}')
            (root / 'reservations.json').write_text(json.dumps({'nonces': {nonce: {}}}))
            job = root / 'jobs' / (nonce + '.json')
            for value in [None, {'nonce': nonce, 'phase': 'cancelled', 'pendingAudit': False}]:
                if value is not None: job.write_text(json.dumps(value))
                with self.assertRaisesRegex(ValueError, 'Consumed uncertain'): apply.current_jobs(root)

    def test_new_worker_directory_is_traversable_without_changing_existing_parent(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime = Path(folder); lib = runtime / 'lib'; lib.mkdir(mode=0o750)
            with patch.object(apply.os, 'chown') as chown:
                apply.worker_parent(lib / 'generated/contribution-roles.ts', runtime)
                self.assertEqual((lib / 'generated').stat().st_mode & 0o777, 0o755)
                self.assertEqual(lib.stat().st_mode & 0o777, 0o750)
                chown.assert_called_once_with(lib / 'generated', 1000, 1000)
            with self.assertRaises(ValueError): apply.worker_parent(runtime.parent / 'outside', runtime)

    def test_quoted_operator_commands_have_valid_shell_and_no_publication_action(self):
        with tempfile.TemporaryDirectory(prefix="bundle2-' ") as folder:
            home = Path(folder); (home / 'payload/nested').mkdir(parents=True)
            (home / 'payload/nested/asset.json').write_text('{}')
            (home / 'operation.json').write_text(json.dumps({'operatorManifestSha256': 'a' * 64, 'applierSha256': 'b' * 64}))
            for target in ['vps', 'wsl']:
                command = runner.operation(home, target, "/operator/' quoted path", '/run/WSL/123_interop' if target == 'wsl' else None)
                subprocess.run(['bash', '-n'], input=command.encode(), check=True)
                self.assertNotIn(' apply ', command); self.assertNotIn(' sign ', command)
                self.assertIn('sha256sum -c -', command)
            # The exact printf format emitted above must delimit one checksum record with LF.
            self.assertEqual(subprocess.check_output(['bash', '-c', "printf '%s  %s\\n' hash name"]), b'hash  name\n')

    def test_repair_reuses_the_previous_upload_and_transfers_only_small_execution_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); docs = root / 'docs'; docs.mkdir()
            (docs / 'update-decision-request.json').write_text(json.dumps({'assetDirectory': str(root / 'approved')}))
            home = root / runner.PACKAGE; (home / 'payload').mkdir(parents=True)
            (home / 'payload/OPERATOR_SHA256SUMS').write_text('fixed payload manifest')
            (home / 'apply-publication-bundle2-update.py').write_text('fixed applier')
            info = {'operatorManifestSha256': runner.sha(home / 'payload/OPERATOR_SHA256SUMS'), 'applierSha256': runner.sha(home / 'apply-publication-bundle2-update.py')}
            (home / 'operation.json').write_text(json.dumps(info))
            calls = []
            with patch.object(runner, 'DOCS', docs), patch.object(runner, 'local_precheck'), patch.object(runner, 'run', side_effect=lambda args: calls.append(list(map(str, args)))), patch.object(runner.sys, 'argv', ['runner', 'vps']):
                runner.main()
            self.assertEqual(len(calls), 3)
            self.assertEqual([x[0] for x in calls], ['ssh', 'scp', 'ssh'])
            transferred = [Path(x).name for x in calls[1] if x.startswith(str(home))]
            self.assertEqual(transferred, ['execution-material.json', 'OPERATOR_SHA256SUMS', 'apply-publication-bundle2-update.py'])
            self.assertIn(runner.PREVIOUS_PAYLOAD, calls[0][-1])
            self.assertIn('cp -a --', calls[0][-1])
            self.assertIn('sudo /bin/bash -c', calls[2][-1])
            for command in [calls[0][-1], calls[2][-1]]:
                subprocess.run(['bash', '-n'], input=command.encode(), check=True)


if __name__ == '__main__': unittest.main()
