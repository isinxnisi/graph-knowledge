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
            (root / 'exclusion.json').write_text('{"active":null}')
            (root / 'reservations.json').write_text('{"nonces":["published"]}')
            job = root / 'jobs/published.json'; job.write_text('{"phase":"completed","pendingAudit":false}')
            apply.current_jobs(root)
            for phase in ['applying', 'awaiting-publication-approval', 'failed']:
                job.write_text(json.dumps({'phase': phase}))
                with self.assertRaises(ValueError): apply.current_jobs(root)
            job.write_text('{"phase":"completed","pendingAudit":true}')
            with self.assertRaises(ValueError): apply.current_jobs(root)
            job.write_text('{"phase":"completed"}'); (root / 'exclusion.json').write_text('{"active":"published"}')
            with self.assertRaises(ValueError): apply.current_jobs(root)

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


if __name__ == '__main__': unittest.main()
