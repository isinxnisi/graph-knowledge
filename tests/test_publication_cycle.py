"""Read-only publication integration against the existing isolated acceptance fixtures."""
import argparse
import copy
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urlparse
import test_collection_sequence as fixtures

ROOT = Path(__file__).resolve().parents[1]
c = fixtures.module('publication_cycle_test', ROOT / 'scripts/publication-cycle.py')
b = fixtures.module('publication_freeze_test', ROOT / 'scripts/prepare-publication-bundle.py')


class PublicationCycleTests(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.SequenceTests(); self.f.setUp(); self.addCleanup(self.f.doCleanups)
        self.f.first(); self.f.step()
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.outer = Path(self.tmp.name)
        f = self.f; backup = f.save('backup.json', {'isolated': True})
        self.bundle = self.outer / 'published'
        with patch.object(b, 'BASELINE_RECEIPTS', set()):
            b.prepare(argparse.Namespace(runtime=f.root, release='release-group-2', register=f.register_path,
                register_sha=f.w.gate.file_hash(f.register_path), public_backup=backup, output=self.bundle), f.w)
        self.public = c.read(self.bundle / 'release/data.json'); self.known = f.w.index(self.public)
        self.args = argparse.Namespace(runtime=f.root, published_bundle=self.bundle, bundle_sha=c.sha(self.bundle / 'SHA256SUMS'),
            revision='after-publication', output=self.outer / 'sync', command='sync', release=None, public_backup=None, operator_digest=None)
        self.datasets = 0; self.on_final = None

    def get(self, path):
        parsed = urlparse(path)
        if parsed.path == '/api/dataset':
            self.datasets += 1
            if self.datasets == 5 and self.on_final: self.on_final()
            return {'dataset': 'public-kg', 'revision': 'after-publication'}
        if parsed.path == '/api/entities': return {'items': list(self.known['entities'].values())}
        if '/neighbors' in parsed.path:
            return {'revision': 'after-publication', 'claims': self.public['claims'], 'nodes': self.public['entities'], 'page': {'hasMore': False}}
        ident = parsed.path.rsplit('/', 1)[-1]
        if parsed.path.startswith('/api/entities/'):
            row = self.known['entities'][ident]
            return {'entity': {k: row.get(k) for k in ['id', 'kind', 'name', 'description', 'aliases', 'event']}}
        if parsed.path.startswith('/api/claims/'):
            row = copy.deepcopy(self.known['claims'][ident])
            row['citations'] = [{**{k: v for k, v in r.items() if k not in ['claimId', 'sourceId']},
                'source': self.known['sources'][r['sourceId']]} for r in self.public['citations'] if r['claimId'] == ident]
            return {'revision': 'after-publication', 'claim': row}
        raise AssertionError(path)

    def audit(self): return c.audit(self.args, self.get, self.f.w)
    def execute(self): return c.execute(self.args, self.get, self.f.w)

    def test_published_receipts_are_not_pending_and_remain_immutable(self):
        before = [self.f.effect_hashes(d) for d in self.f.decisions[:2]]
        ledger, verification, _, _ = self.audit()
        self.assertEqual(ledger['counts']['publishedAccepted']['claims'], 2)
        self.assertEqual(ledger['counts']['acceptedUnpublished']['claims'], 0)
        self.assertEqual(len(verification['verified']), 2)
        self.assertEqual(before, [self.f.effect_hashes(d) for d in self.f.decisions[:2]])

    def test_new_formal_receipt_only_is_pending(self):
        self.f.step(); ledger = self.audit()[0]
        self.assertEqual(ledger['pending']['claims'], [self.f.groups[2]['claims'][0]['id']])
        self.assertEqual(ledger['counts']['publishedAccepted']['claims'], 2)

    def test_revision_change_stops(self):
        get = self.get
        def changed(path):
            result = get(path)
            if path == '/api/dataset' and self.datasets > 1: result['revision'] = 'changed'
            return result
        with self.assertRaises(AssertionError): c.audit(self.args, changed, self.f.w)

    def test_changed_formal_records_stop(self):
        target, _ = self.f.s.saved_receipt(self.f.decisions[0], self.f.w)
        (target / 'accepted-records.json').write_text('{}')
        with self.assertRaises(ValueError): self.audit()

    def test_changed_sealed_artifact_stops(self):
        (self.bundle / 'release/data.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'content differs'): self.audit()

    def test_missing_public_claim_is_not_treated_as_unpublished(self):
        get = self.get
        def missing(path):
            if path.startswith('/api/claims/'): raise OSError('HTTP 404')
            return get(path)
        with self.assertRaises(OSError): c.audit(self.args, missing, self.f.w)

    def test_same_uuid_different_meaning_or_type_stops(self):
        accepted = {f: {} for f in c.FIELDS}; row = copy.deepcopy(self.public['claims'][0])
        row['contribution']['roleId'] = 'DRAWING'; accepted['claims'][row['id']] = row
        with self.assertRaisesRegex(ValueError, 'meaning'): c.partition(accepted, self.public, self.f.w)
        accepted = {f: {} for f in c.FIELDS}; accepted['sources'][row['id']] = {'id': row['id']}
        with self.assertRaisesRegex(ValueError, 'type'): c.partition(accepted, self.public, self.f.w)

    def test_prepare_without_pending_does_not_make_release_or_approval(self):
        self.args.command = 'prepare'; result = self.execute()
        self.assertFalse(result['candidateCreated'])
        self.assertFalse((self.args.output / 'approval-request.json').exists())
        self.assertFalse((self.args.output / 'release').exists())

    def test_already_published_id_is_rejected_even_without_pending(self):
        self.args.command = 'prepare'; self.args.release = 'release-group-2'
        with self.assertRaisesRegex(ValueError, 'already published'): self.execute()
        self.assertFalse(self.args.output.exists())

    def test_pending_requires_current_backup(self):
        self.f.step(); self.args.command = 'prepare'; self.args.release = 'next'
        with self.assertRaisesRegex(ValueError, 'backup is required'): self.execute()
        self.args.public_backup = self.f.root / 'backup.json'
        with self.assertRaisesRegex(ValueError, 'Backup is stale'): self.execute()

    def test_receipt_arrives_during_final_revision_read_no_observation_committed(self):
        self.on_final = self.f.step
        with self.assertRaisesRegex(ValueError, 'Receipt set advanced'): self.execute()
        self.assertFalse(self.args.output.exists())

    def test_protected_and_existing_outputs_refused(self):
        self.args.output = self.f.root / 'datasets/new'
        with self.assertRaisesRegex(ValueError, 'protected'): self.execute()
        self.args.output = self.bundle.parent
        with self.assertRaisesRegex(ValueError, 'protected'): self.execute()
        self.args.output = self.outer / 'exists'; self.args.output.mkdir()
        with self.assertRaisesRegex(ValueError, 'overwrite'): self.execute()

    def prepare_current(self, drift=False):
        self.f.step(); f = self.f
        f.public = copy.deepcopy(self.public)
        if drift: f.public['sources'][0]['title'] = 'unexplained drift'
        f.observed.update(release='release-group-2', revision='after-publication', references=[
            f.w.reference(f.root / 'datasets/public-kg/releases/release-group-2' / n) for n in ['data.json', 'manifest.json']])
        self.args.command = 'prepare'; self.args.release = 'next'
        self.args.public_backup = f.save('current-backup.json', {'payload': {'receipts': [{'id': 'release-group-2'}]}})
        self.args.operator_digest = 'sha256:' + 'd' * 64
        original = f.w.node
        f.w.node = lambda cmd: {'release': 'next', 'updated': [], 'added': ['Claim:' + f.groups[2]['claims'][0]['id']], 'relationshipsAdded': 4} if cmd[0].endswith('publication-backup-plan.ts') else original(cmd)
        return self.execute()

    def test_fresh_draft_uses_new_base_and_exact_pending_delta(self):
        result = self.prepare_current(); self.assertTrue(result['candidateCreated'])
        request = c.verify_prepared_artifact(self.args.output)
        self.assertEqual(request['baseRelease'], 'release-group-2')
        self.assertEqual(request['baseRevision'], 'after-publication')
        self.assertFalse(result['productionExecutionEnabled'])
        self.assertEqual(len(c.read(self.args.output / 'release/data.json')['claims']), 3)
        (self.args.output / 'release/data.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'asset differs'): c.verify_prepared_artifact(self.args.output)

    def test_backup_graph_drift_cannot_hide_behind_same_revision(self):
        with self.assertRaisesRegex(ValueError, 'sealed published fixture'): self.prepare_current(drift=True)
        self.assertFalse(self.args.output.exists())

    def test_worker_home_sibling_output_is_protected(self):
        self.args.runtime = self.outer / 'worker/runtime'
        self.args.output = self.outer / 'worker/logs/observation'
        with self.assertRaisesRegex(ValueError, 'protected'): self.execute()

    def test_runtime_published_manifest_drift_stops_draft(self):
        original = c.candidate
        def mutate(args, ledger, context, stage):
            path = self.f.root / 'datasets/public-kg/releases/release-group-2/manifest.json'
            value = c.read(path); value['reason'] = 'tampered'; path.write_text(c.dump(value))
            return original(args, ledger, context, stage)
        with patch.object(c, 'candidate', side_effect=mutate):
            with self.assertRaisesRegex(ValueError, 'Runtime published artifact differs'): self.prepare_current()

    def test_prepared_unexpected_asset_or_symlink_is_rejected(self):
        self.prepare_current(); extra = self.args.output / 'unexpected'
        extra.write_text('extra')
        with self.assertRaisesRegex(ValueError, 'Unexpected prepared asset'): c.verify_prepared_artifact(self.args.output)
        extra.unlink(); extra.symlink_to(self.args.output / 'release/data.json')
        with self.assertRaisesRegex(ValueError, 'symlink'): c.verify_prepared_artifact(self.args.output)

    def test_optimized_python_cannot_skip_existing_api_assertions(self):
        result = subprocess.run([sys.executable, '-O', '-c',
            "import runpy; runpy.run_path('scripts/publication-cycle.py')['audit'](None)"],
            cwd=ROOT, capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Optimized Python disables', result.stderr)


if __name__ == '__main__': unittest.main()
