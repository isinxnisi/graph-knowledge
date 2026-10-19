"""Publication freezes existing formal effects; races and changed evidence fail closed."""
import argparse
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import test_collection_sequence as fixtures

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publication_bundle', ROOT / 'scripts/prepare-publication-bundle.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.SequenceTests(); self.f.setUp(); self.addCleanup(self.f.doCleanups)
        baseline = patch.object(p, 'BASELINE_RECEIPTS', set()); baseline.start(); self.addCleanup(baseline.stop)
        self.f.first(); self.f.step()
        self.args = argparse.Namespace(runtime=self.f.root, output=self.f.root / 'bundle-output',
            release='release-group-2', register=self.f.register_path,
            register_sha=self.f.w.gate.file_hash(self.f.register_path), public_backup=self.f.root / 'backup.json')
        self.f.save('backup.json', {'fixtureObservation': 'mocked by the existing sequence fixture'})
        # Real bundles must be outside runtime; give this fixture a sibling destination.
        self.args.output = Path(self.f.tmp.name + '-publication')
        self.addCleanup(lambda: __import__('shutil').rmtree(self.args.output, ignore_errors=True))

    def test_exact_release_and_original_decisions_frozen_without_apply(self):
        result = p.prepare(self.args, self.f.w)
        self.assertEqual(result['additions']['claims'], 2)
        self.assertFalse(result['issue25Complete']); self.assertFalse(result['publicApply'])
        self.assertEqual(len(result['adoptedReceipts']), 2)
        self.assertEqual((self.args.output / 'release/data.json').read_bytes(),
                         (self.f.root / 'datasets/public-kg/releases/release-group-2/data.json').read_bytes())
        self.assertTrue((self.args.output / 'SHA256SUMS').exists())
        base_manifest = 'datasets/public-kg/releases/base/manifest.json'
        self.assertEqual((self.args.output / 'evidence' / base_manifest).read_bytes(),
                         (self.f.root / base_manifest).read_bytes())
        self.assertEqual(result['evidenceSha256'][base_manifest], self.f.w.gate.file_hash(self.f.root / base_manifest))

    def test_changed_accepted_body_rejected_before_output(self):
        target = self.f.root / 'datasets/manga-collection/accepted-group-2/accepted-records.json'
        target.write_text('{}')
        with self.assertRaises(ValueError): p.prepare(self.args, self.f.w)
        self.assertFalse(self.args.output.exists())

    def test_older_release_cannot_drop_a_formal_receipt(self):
        self.f.step()
        with self.assertRaises(ValueError): p.prepare(self.args, self.f.w)
        self.assertFalse(self.args.output.exists())

    def test_receipt_race_during_freeze_never_publishes_partial_bundle(self):
        original = p.shutil.copyfile; added = [False]
        def raced(source, target):
            if not added[0]: added[0] = True; self.f.step()
            return original(source, target)
        with patch.object(p.shutil, 'copyfile', side_effect=raced):
            with self.assertRaisesRegex(ValueError, 'Receipt set advanced'): p.prepare(self.args, self.f.w)
        self.assertFalse(self.args.output.exists())

    def test_existing_bundle_is_never_overwritten(self):
        p.prepare(self.args, self.f.w)
        before = (self.args.output / 'SHA256SUMS').read_bytes()
        with self.assertRaises(ValueError): p.prepare(self.args, self.f.w)
        self.assertEqual((self.args.output / 'SHA256SUMS').read_bytes(), before)

    def test_other_formal_acceptance_is_not_silently_added_to_this_publication(self):
        self.f.save('datasets/manga-collection/accepted-other/acceptance.json', {})
        with self.assertRaisesRegex(ValueError, 'Unexpected/missing formal receipt'): p.prepare(self.args, self.f.w)
        self.assertFalse(self.args.output.exists())

    def test_public_observation_race_never_finalizes_a_bundle(self):
        original = p.shutil.copyfile; changed = [False]
        def raced(source, target):
            if not changed[0]: changed[0] = True; self.args.public_backup.write_text('{"changed": true}')
            return original(source, target)
        with patch.object(p.shutil, 'copyfile', side_effect=raced):
            with self.assertRaisesRegex(ValueError, 'Public observation changed'): p.prepare(self.args, self.f.w)
        self.assertFalse(self.args.output.exists())
