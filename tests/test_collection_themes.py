"""Approval simulations use temporary registries; real themes stay unapproved."""
import argparse
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('collection_themes', ROOT / 'scripts/collection-themes.py')
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


class CollectionThemes(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.registry = self.root / 'registry'
        self.jobs = self.root / 'jobs'
        self.value = gate.read(ROOT / 'datasets/collection-themes/themes/nobel-affiliations-replay/r0001.json')
        self.value['id'] = 'isolated-review-test'
        self.value['relatedThemes'] = []
        self.register(self.value)

    def command(self, command, **kwargs):
        return gate.execute(argparse.Namespace(command=command, registry=self.registry, jobs=self.jobs,
                                              theme_id=self.value['id'], revision=1, **kwargs))

    def register(self, value):
        path = self.root / 'candidate.json'
        gate.save(path, value)
        return self.command('register', file=path)

    def approve(self, value=None):
        value = value or self.value
        return gate.execute(argparse.Namespace(command='approve', registry=self.registry, jobs=self.jobs,
                            theme_id=value['id'], revision=value['revision'], reviewer='isolated-test-reviewer',
                            note='TEST ONLY: not an approval of any live candidate', sha256=gate.content_hash(value), confirm_review=True))

    def test_unapproved_theme_cannot_export_or_execute_and_creates_no_job(self):
        for command, options in [('run', {}), ('export', {'out': self.root / 'order.json'})]:
            with self.assertRaisesRegex(ValueError, 'Unapproved'):
                self.command(command, **options)
        self.assertFalse(self.jobs.exists())
        self.assertFalse((self.root / 'order.json').exists())

    def test_review_exposes_scope_grain_sources_and_exact_hash(self):
        review = self.command('review')
        self.assertEqual(review['status'], 'candidate')
        self.assertEqual(review['definitionSha256'], gate.content_hash(self.value))
        self.assertEqual(review['executionStatus'], 'frozen-inputs-match')
        for field in ['purpose', 'scope', 'dataRequirements', 'sources', 'exploration']:
            self.assertIn(field, review['theme'])
        with self.assertRaisesRegex(ValueError, 'digest differs'):
            self.command('approve', reviewer='test', note='test', sha256='0' * 64, confirm_review=True)

    def test_explicit_approved_revision_export_and_changed_revision_gate(self):
        self.approve()
        out = self.root / 'approved.json'
        self.command('export', out=out)
        packet = gate.read(out)
        self.assertEqual(packet['theme'], self.value)
        self.assertIn('not knowledge acceptance', packet['authority'])
        next_value = dict(self.value, revision=2, purpose='別の範囲に変更')
        self.register(next_value)
        with self.assertRaisesRegex(ValueError, 'Unapproved'):
            gate.execute(argparse.Namespace(command='run', registry=self.registry, jobs=self.jobs, theme_id=next_value['id'], revision=2))
        self.assertEqual(gate.approval(self.registry, self.value)['revision'], 1)

    def test_immutable_registration_and_post_approval_mutation(self):
        with self.assertRaises(ValueError):
            self.register(self.value)
        self.approve()
        modified = dict(self.value, purpose='Unreviewed expansion of the scope')
        gate.save(gate.revision_path(self.registry, 'themes', self.value['id'], 1), modified)
        for command, options in [('run', {}), ('export', {'out': self.root / 'order.json'})]:
            with self.assertRaisesRegex(ValueError, 'definition changed'):
                self.command(command, **options)
        self.assertEqual(self.command('review')['status'], 'approval-invalid')

    def test_revocation_stops_exports_and_runs(self):
        self.approve()
        self.command('revoke', reviewer='test-reviewer', note='Stop this exact scope')
        self.assertEqual(self.command('review')['status'], 'revoked')
        with self.assertRaisesRegex(ValueError, 'revoked'):
            self.command('run')
        with self.assertRaisesRegex(ValueError, 'cannot be reapproved'):
            self.approve()

    def test_changed_collector_or_frozen_input_is_not_executable(self):
        self.approve()
        for field in ['codeSha256', 'inputs']:
            changed = gate.plan()
            if field == 'inputs':
                changed['inputs'][0]['sha256'] = '0' * 64
            else:
                changed[field] = '0' * 64
            with patch.object(gate, 'plan', return_value=changed):
                with self.assertRaisesRegex(ValueError, 'changed'):
                    self.command('run')
                with self.assertRaisesRegex(ValueError, 'changed'):
                    self.command('export', out=self.root / 'drifted.json')
        self.assertFalse(self.jobs.exists())

    def test_unconfigured_and_unknown_adapters_never_execute_arbitrary_commands(self):
        value = dict(self.value, revision=2, execution=None)
        self.register(value)
        self.approve(value)
        order = gate.packet(self.registry, value)
        self.assertEqual(order['executionStatus'], 'not-configured')
        self.assertIn('planning-only', order['authority'])
        with self.assertRaisesRegex(ValueError, 'No executable adapter'):
            gate.run(self.registry, self.jobs, value)
        value['execution'] = dict(self.value['execution'], adapter='shell-command')
        with self.assertRaisesRegex(ValueError, 'not allowlisted'):
            gate.validate(value)
        value['execution'] = dict(self.value['execution'], inputs=[{'file': '../../secret', 'sha256': '0' * 64}])
        with self.assertRaisesRegex(ValueError, 'fixed recipe'):
            gate.validate(value)

    def test_cli_requires_revision_and_human_review_confirmation(self):
        base = [sys.executable, str(ROOT / 'scripts/collection-themes.py'), '--registry', str(self.registry), '--jobs', str(self.jobs)]
        for tail in [['run', self.value['id']], ['approve', self.value['id'], '--revision', '1', '--sha256', gate.content_hash(self.value), '--reviewer', 'test', '--note', 'test']]:
            result = subprocess.run(base + tail, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
        result = subprocess.run(base + ['run', self.value['id'], '--revision', '1'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Unapproved', result.stderr)

    def test_real_generator_validator_idempotency_and_provenance_without_source_changes(self):
        original_paths = [ROOT / p for p in gate.INPUTS] + [ROOT / gate.GENERATOR,
            ROOT / 'datasets/nobel-affiliations/v1/ledger.json',
            ROOT / 'datasets/public-kg/releases/20261014-nobel-001/data.json',
            ROOT / 'datasets/public-kg/releases/20261014-nobel-001/manifest.json']
        original = {str(p): gate.file_hash(p) for p in original_paths}
        self.approve()
        result = self.command('run')
        self.assertFalse(result['unchanged'])
        self.assertEqual(result['summary']['counts'], {'entities': 1132, 'claims': 854, 'sources': 768, 'citations': 858})
        self.assertTrue(result['summary']['validation']['valid'])
        directory = Path(result['directory'])
        ledger = gate.read(directory / 'artifacts/ledger.json')
        self.assertEqual(ledger['status'], 'pending-public-approval')
        self.assertEqual(len(ledger['rows']), 829)
        self.assertTrue(all(row['jsonPointer'] and row['sourceUrl'] for row in ledger['rows']))
        repeated = self.command('run')
        self.assertTrue(repeated['unchanged'])
        self.assertEqual(result['jobId'], repeated['jobId'])
        state = gate.read(directory / 'job.json')
        self.assertEqual(len(state['attempts']), 1)
        self.assertEqual(state['workOrder']['definitionSha256'], gate.content_hash(self.value))
        self.assertEqual(original, {str(p): gate.file_hash(p) for p in original_paths})
        (directory / 'artifacts/ledger.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'missing or modified'):
            self.command('run')

    def test_failed_run_resumes_with_history_and_no_duplicate_candidates(self):
        self.approve()
        with patch.object(gate, 'generate', side_effect=ValueError('simulated interruption')):
            with self.assertRaisesRegex(ValueError, 'simulated interruption'):
                self.command('run')
        path = next(self.jobs.glob('*/job.json'))
        state = gate.read(path)
        self.assertEqual(state['status'], 'failed')
        self.assertIn('simulated interruption', state['attempts'][0]['error'])
        result = self.command('run')
        state = gate.read(path)
        self.assertEqual([a['status'] for a in state['attempts']], ['failed', 'succeeded'])
        self.assertEqual(len(list(self.jobs.glob('*/artifacts'))), 1)
        self.assertEqual(result['summary']['counts']['claims'], 854)

    def test_in_progress_receipt_and_bootstrap_crash_are_resumable(self):
        self.approve()
        order = gate.packet(self.registry, self.value)
        key = gate.content_hash({'order': order, 'runnerSha256': gate.file_hash(Path(gate.__file__))})
        directory = self.jobs / f"{self.value['id']}-r0001-{key[:16]}"
        gate.create(directory / 'work-order.json', order)
        # Simulate a process killed after persisting the work order, before the job receipt.
        with patch.object(gate, 'generate', side_effect=ValueError('interrupt again')):
            with self.assertRaises(ValueError):
                self.command('run')
        state = gate.read(directory / 'job.json')
        state['status'] = 'running'
        state['attempts'][-1]['status'] = 'running'
        gate.save(directory / 'job.json', state)
        with patch.object(gate, 'generate', side_effect=ValueError('next attempt')):
            with self.assertRaises(ValueError):
                self.command('run')
        state = gate.read(directory / 'job.json')
        self.assertEqual([a['status'] for a in state['attempts']], ['interrupted', 'failed'])

    def test_approved_output_limits_fail_closed(self):
        value = dict(self.value, revision=2, execution=dict(self.value['execution'], maxEntities=1))
        self.register(value)
        self.approve(value)
        with self.assertRaisesRegex(ValueError, 'output limits'):
            gate.run(self.registry, self.jobs, value)
        self.assertEqual(gate.read(next(self.jobs.glob('*/job.json')))['status'], 'failed')

    def test_changed_approval_during_run_cannot_publish_candidate_result(self):
        self.approve()
        original = gate.generate
        def changed(execution, staging):
            result = original(execution, staging)
            path = gate.revision_path(self.registry, 'approvals', self.value['id'], 1)
            record = gate.read(path)
            record['note'] = 'Changed while running'
            gate.save(path, record)
            return result
        with patch.object(gate, 'generate', side_effect=changed):
            with self.assertRaisesRegex(ValueError, 'Approval changed'):
                self.command('run')
        path = next(self.jobs.glob('*/job.json'))
        self.assertEqual(gate.read(path)['status'], 'failed')
        self.assertFalse((path.parent / 'artifacts').exists())

    def test_exclusive_export_never_overwrites_existing_files(self):
        self.approve()
        out = self.root / 'existing.json'
        out.write_text('preserve this file')
        with self.assertRaises(FileExistsError):
            self.command('export', out=out)
        self.assertEqual(out.read_text(), 'preserve this file')

    def test_registry_and_jobs_cannot_share_a_lock_directory(self):
        with self.assertRaisesRegex(ValueError, 'different directories'):
            gate.execute(argparse.Namespace(command='jobs', registry=self.registry, jobs=self.registry))


if __name__ == '__main__':
    unittest.main()
