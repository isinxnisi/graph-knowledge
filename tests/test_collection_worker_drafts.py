"""Saved collection -> unsigned decision drafts. No provider, acceptance or live DB."""
import copy
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_collection_worker import b, approval, MemoryStore, no_lock

fixtures = b.module('draft_workflow_fixtures', b.ROOT / 'tests/test_collection_workflow.py')
w = fixtures.w


class DecisionDrafts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.runtime = self.home / 'runtime'
        self.job = self.runtime / '.local/collection-jobs' / fixtures.JOB
        fixtures.tracked_frozen_job(self.job)
        self.old = self.runtime / 'datasets/manga-collection/decisions/previous-human.json'
        b.save(self.old, {'status': 'approved', 'meaning': 'frozen prior human input'})
        public, observed = fixtures.public_fixture()
        self.outputs = w.review_job(self.job, public, observed, {f: [] for f in w.FIELDS},
                                    [(str(self.old), b.gate.file_hash(self.old))])
        self.executor = object.__new__(b.Executor)
        self.executor.root = self.runtime
        self.executor.registry = self.runtime / 'datasets/collection-themes'
        self.executor.workflow = w
        self.executor.validate = lambda *args: self.fail('Saved execution must not validate/collect again')
        self.executor.run = lambda *args: self.fail('Saved execution must not collect again')
        self.store = MemoryStore()
        self.config = {'home': str(self.home), 'workerId': 'isolated-worker'}
        self.clock = datetime(2026, 10, 18, 18, 0, tzinfo=timezone.utc).timestamp()

    def review(self, index=None, extra_refs=()):
        outputs = copy.deepcopy(self.outputs)
        outputs['context.json']['acceptedReferences'] += list(extra_refs)
        if index is not None:
            rows = outputs['proposed-records.json']['records']
            claim = rows['claims'][index]
            citations = [r for r in rows['citations'] if r['claimId'] == claim['id']]
            selected = {'claims': [claim], 'citations': citations,
                        'entities': [r for r in rows['entities'] if r['id'] in [claim['subjectId'], claim['objectId']]],
                        'sources': [r for r in rows['sources'] if r['id'] in {c['sourceId'] for c in citations}]}
            outputs['proposed-records.json']['records'] = selected
            outputs['decision-request.json']['groups']['normal']['recordIds'] = {
                f: [r['id'] for r in selected[f]] for f in w.FIELDS}
            outputs['decision-request.json']['groups']['identity-only']['recordIds'] = {f: [] for f in w.FIELDS}
            outputs['identity-only-records.json']['records'] = {f: [] for f in w.FIELDS}
        outputs['context.json']['isolatedCandidateIndex'] = index
        outputs['decision-request.json']['referenceArtifacts'] = [
            {'file': n, 'sha256': w.gate.digest(w.dump(outputs[n]).encode())}
            for n in ['context.json', 'proposed-records.json', 'identity-only-records.json', 'review.json', 'exploration-paths.json']]
        review, _ = w.write_review(self.runtime / 'datasets/workflow-reviews', outputs)
        return review

    def request_result(self, ident, review):
        request = approval(ident)
        request['target']['themeId'] = ident
        self.store.submit(request)
        path = b.gate.revision_path(self.executor.registry, 'approvals', request['target']['themeId'], 1)
        if not path.exists(): b.save(path, {'status': 'approved', 'isolated': True})
        result = {'reviewDirectory': str(review), 'jobId': fixtures.JOB}
        return request, result

    def saved_worker(self, request, result):
        worker = b.Worker(self.config, self.store, self.executor, no_lock, clock=lambda: self.clock)
        worker.state['requests'][request['id']] = {'requestId': request['id'], 'request': request,
            'requestSha256': self.store.json(b.PREFIX + 'requests/' + request['id'] + '.json')[1],
            'kind': 'collect-review', 'phase': 'retry-wait', 'generation': 6, 'attempts': 6,
            'workerId': 'isolated-worker', 'executionComplete': True, 'result': result}
        worker.checkpoint()
        return worker

    def test_prior_decision_collision_reproduced_then_two_new_candidates_finish(self):
        ids = []
        for index in [0, 1]:
            with self.subTest(candidate=index):
                review = self.review(index)
                request, result = self.request_result('new-candidate-' + str(index), review)
                old_output = self.old.with_name(request['id'] + '-normal-draft.json')
                args = w.parser().parse_args(['decision-template', '--review', str(review),
                    '--decision-id', request['id'], '--release', 'manga-' + request['id'], '--output', str(old_output)])
                with self.assertRaisesRegex(ValueError, 'Output overlaps'):
                    w.execute(args)
                before = {str(p): p.read_bytes() for root in [review, self.job, self.old.parent]
                          for p in root.rglob('*') if p.is_file()}
                worker = self.saved_worker(request, result)
                with patch('urllib.request.build_opener', side_effect=AssertionError('No provider transport')):
                    worker.tick()
                record = worker.state['requests'][request['id']]
                self.assertEqual(record['phase'], 'completed', record.get('message'))
                self.assertEqual(record['attempts'], 6)
                self.assertTrue(record['executionComplete'])
                draft = b.read(self.runtime / record['decisionDrafts'][0])
                self.assertEqual(draft['status'], 'draft-not-approved')
                self.assertIsNone(draft['humanDecision']['reviewer'])
                self.assertEqual(draft['applyAuthorized'], b.NO_APPLY)
                self.assertIn('/' + b.gate.file_hash(review / 'review-manifest.json') + '/', record['decisionDrafts'][0])
                ids += draft['acceptedRecordIds']['claims']
                self.assertEqual(before, {p: Path(p).read_bytes() for p in before})
                self.assertIn(b.PREFIX + 'results/' + request['id'] + '/status.json', self.store.files)
                self.assertTrue(any(n.endswith('-request-draft.json') for n in self.store.files))
                files = self.executor.artifacts(request, result)
                self.assertEqual(files, self.executor.artifacts(request, result))
                self.clock += 600
        self.assertEqual(len(set(ids)), 2)

    def test_combined_draft_and_new_review_do_not_share_frozen_directory(self):
        review = self.review()
        request, result = self.request_result('both-groups', review)
        files, drafts = self.executor.artifacts(request, result)
        self.assertEqual(len(drafts), 3)
        first = self.runtime / drafts[0]
        # Once one draft is referenced by a formal receipt, its directory stays frozen.
        later = self.review(0, [(str(first), b.gate.file_hash(first))])
        result['reviewDirectory'] = str(later)
        _, later_drafts = self.executor.artifacts(request, result)
        self.assertNotEqual(first.parent, (self.runtime / later_drafts[0]).parent)
        self.assertEqual(files[drafts[0]], first.read_bytes())

    def test_hash_tampering_stops_without_retry_loop(self):
        review = self.review(0)
        request, result = self.request_result('tampered-review', review)
        (review / 'proposed-records.json').write_text('{}')
        worker = self.saved_worker(request, result)
        worker.tick()
        record = worker.state['requests'][request['id']]
        self.assertEqual(record['phase'], 'blocked')
        self.assertIn('ValueError', record['message'])
        self.assertIn('hash mismatch', record['message'])
        self.clock += 600
        with patch.object(self.executor, 'artifacts', side_effect=AssertionError('Must not retry logical failure')):
            b.Worker(self.config, self.store, self.executor, no_lock, clock=lambda: self.clock).tick()
        self.assertEqual(record['attempts'], 6)

    def test_io_failure_retries_only_saved_postprocessing(self):
        review = self.review(0)
        request, result = self.request_result('retry-report', review)
        worker = self.saved_worker(request, result)
        original = self.executor._artifacts
        def failed(*args):
            original(*args)
            raise OSError('isolated delivery interruption after drafts')
        with patch.object(self.executor, '_artifacts', side_effect=failed): worker.tick()
        self.assertEqual(worker.state['requests'][request['id']]['phase'], 'retry-wait')
        self.clock += 7200
        worker = b.Worker(self.config, self.store, self.executor, no_lock, clock=lambda: self.clock)
        worker.tick()
        record = worker.state['requests'][request['id']]
        self.assertEqual(record['phase'], 'completed', record.get('message'))
        self.assertEqual(record['attempts'], 6)


if __name__ == '__main__': unittest.main()
