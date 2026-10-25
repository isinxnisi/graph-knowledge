"""Receipt-backed comparison closure, without changing publication delta semantics."""
import copy
import io
import json
from types import SimpleNamespace
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('comparison_workflow', ROOT / 'scripts/collection-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class ComparisonClosure(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old = w.ROOT
        w.ROOT = self.root
        self.addCleanup(setattr, w, 'ROOT', self.old)
        self.records = dict(entities=[dict(id='person', name='Verified person'), dict(id='work')],
                            claims=[dict(id='claim', subjectId='person', objectId='work', visibility='hidden')],
                            sources=[dict(id='source')],
                            citations=[dict(id='cite', claimId='claim', sourceId='source')])
        current = copy.deepcopy(self.records)
        current['claims'][0]['visibility'] = 'published'
        base = copy.deepcopy(current)
        base['claims'] = []; base['sources'] = []; base['citations'] = []
        w.gate.save(self.root / 'datasets/public-kg/releases/previous/data.json', base)
        self.release = self.root / 'datasets/public-kg/releases/next'
        w.gate.save(self.release / 'data.json', current)
        w.gate.save(self.release / 'manifest.json', dict(baseRelease='previous', dataSha256=w.gate.file_hash(self.release / 'data.json')))
        w.gate.save(self.root / 'review.json', dict(records=self.records))
        self.receipt = self.root / 'acceptance.json'
        self.receipt_value = dict(status='accepted-for-release-preparation-only', reviewer='Human', recordedAt='fixed',
             acceptedRecordIds={f: [v['id'] for v in self.records[f]] for f in w.FIELDS},
             scopeByClaim=[dict(id='claim')], referenceArtifacts=[w.reference(self.root / 'review.json')])
        w.gate.save(self.receipt, self.receipt_value)

    def accepted(self, comparison=False):
        with patch.object(w, 'node', return_value=dict(valid=True)):
            return w.accepted_additions(self.release, [self.receipt], comparison=comparison)

    def test_new_base_dependencies_are_in_comparison_but_not_publication_delta(self):
        delta, refs = self.accepted()
        full, checked = self.accepted(comparison=True)
        self.assertEqual(delta['entities'], [])
        self.assertEqual(len(delta['claims']), 1)
        self.assertEqual(full['entities'], self.records['entities'])
        self.assertEqual(refs, checked)
        w.require_references(w.index(full))
        with self.assertRaisesRegex(ValueError, 'Entity required: person'):
            w.require_references(w.index(delta))

    def test_missing_reference_requires_human_without_skipping_graph_rows(self):
        for field, missing in [('entities', 'person'), ('entities', 'work'), ('claims', 'claim'), ('sources', 'source')]:
            with self.subTest(field=field, missing=missing):
                records = w.index(self.records)
                del records[field][missing]
                with self.assertRaisesRegex(ValueError, 'required: ' + missing):
                    w.exploration_paths(records, {}, set(), set())

    def test_comparison_does_not_authorize_unreceipted_base_entities(self):
        self.receipt_value['acceptedRecordIds']['entities'] = []
        w.gate.save(self.receipt, self.receipt_value)
        full, _ = self.accepted(comparison=True)
        self.assertEqual(full['entities'], [])
        with self.assertRaisesRegex(ValueError, 'Entity required: person'):
            w.require_references(w.index(full))

    def test_comparison_rejects_modified_approved_record(self):
        fixture = w.read(self.release / 'data.json')
        fixture['claims'][0]['subjectId'] = 'invented'
        w.gate.save(self.release / 'data.json', fixture)
        m = w.read(self.release / 'manifest.json')
        m['dataSha256'] = w.gate.file_hash(self.release / 'data.json')
        w.gate.save(self.release / 'manifest.json', m)
        with self.assertRaisesRegex(ValueError, 'human-reviewed meaning'):
            self.accepted(comparison=True)

    def test_unexpected_logic_error_stops_worker_retries_with_exception_type(self):
        stderr = io.StringIO()
        parser = SimpleNamespace(parse_args=lambda: SimpleNamespace(command='collect-review'))
        with patch.object(w, 'parser', return_value=parser), \
             patch.object(w, 'execute', side_effect=KeyError('missing-id')), \
             patch.object(w.sys, 'stderr', stderr):
            self.assertEqual(w.main(), 1)
        failure = json.loads(stderr.getvalue())
        self.assertEqual(failure['errorType'], 'KeyError')
        self.assertTrue(failure['humanReviewRequired'])
        worker = w.load('comparison_worker', ROOT / 'scripts/collection-worker.py')
        self.assertIsInstance(worker.workflow_failure(stderr.getvalue()), worker.Blocked)

    def test_comparison_rejects_changed_frozen_reference(self):
        w.gate.save(self.root / 'review.json', dict(records={}))
        with self.assertRaisesRegex(ValueError, 'Accepted reference changed'):
            self.accepted(comparison=True)


if __name__ == '__main__':
    unittest.main()
