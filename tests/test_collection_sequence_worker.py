"""Sequence control uses the existing Worker windows, locks, ten-minute rest and append-only transport."""
import copy
from datetime import datetime
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_collection_worker import b, FakeExecutor, MemoryStore, no_lock


class SequenceWorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name); self.store = MemoryStore(); self.executor = FakeExecutor(self.home)
        self.clock = datetime.fromisoformat('2026-10-20T03:00:00+09:00').timestamp()
        self.config = {'home': str(self.home), 'workerId': 'isolated-worker'}
        self.register_path = b.PREFIX + 'approval-registers/test.json'
        first = {'schemaVersion': 1, 'id': 'original-first', 'parentRequestId': 'original-review', 'kind': 'accept-release',
            'status': 'approved', 'applyAuthorized': b.NO_APPLY,
            'decision': {'decisionId': 'original-first', 'humanDecision': {'actorType': 'human', 'reviewer': 'ISOLATED',
                'decidedAt': '2026-10-19T00:00:00+00:00', 'statement': 'Isolated first approval'}}}
        self.register = {'batchDecisions': [{'envelope': first}]}
        self.store.files[self.register_path] = b.dump(self.register).encode()
        first_raw = b.dump(self.register['batchDecisions'][0]['envelope']).encode()
        self.store.files[b.PREFIX + 'requests/original-first.json'] = first_raw
        self.store.files[b.PREFIX + 'results/original-first/status.json'] = b.dump({'requestId': first['id'], 'request': first,
            'phase': 'completed', 'requestSha256': b.gate.digest(first_raw), 'kind': 'accept-release',
            'generation': 0, 'attempts': 1, 'workerId': 'isolated-worker'}).encode()
        self.request = {'schemaVersion': 1, 'id': 'isolated-sequence', 'kind': 'accept-sequence', 'status': 'approved',
            'approvalScope': b.SEQUENCE_SCOPE, 'applyAuthorized': b.NO_APPLY,
            'register': {'file': self.register_path, 'sha256': b.gate.digest(self.store.files[self.register_path])},
            'humanDecision': {'actorType': 'human', 'reviewer': 'ISOLATED TEST ONLY', 'decidedAt': '2026-10-19T00:00:00+00:00',
                              'statement': 'Isolated execution authorization, no operational use.'}}
        self.store.submit(self.request)
        def run(request, monitor, fd):
            monitor(); self.executor.calls += 1
            return {'sequenceComplete': self.executor.calls >= 3, 'stateDirectory': str(self.home / 'state'),
                    'publicApply': False, 'completedGroups': self.executor.calls}
        self.executor.run = run

    def worker(self):
        return b.Worker(self.config, self.store, self.executor, no_lock, clock=lambda: self.clock)

    def record(self):
        return b.read(self.home / 'state.json')['requests'][self.request['id']]

    def test_one_group_per_attempt_and_ten_minute_rest_then_complete(self):
        self.worker().tick(); self.assertEqual(self.executor.calls, 1)
        self.assertEqual(self.record()['phase'], 'sequence-progress')
        self.assertIn('"completedGroups": 1', self.store.files[b.PREFIX + 'results/' + self.request['id'] + '/README.md'].decode())
        self.clock += 599; self.worker().tick(); self.assertEqual(self.executor.calls, 1)
        self.clock += 1; self.worker().tick(); self.assertEqual(self.executor.calls, 2)
        self.clock += 600; self.worker().tick(); self.assertEqual(self.record()['phase'], 'completed')
        self.clock += 600; self.worker().tick(); self.assertEqual(self.executor.calls, 3)

    def test_saved_progress_publication_retries_without_running_next_group(self):
        original = self.executor.artifacts; failure = [True]
        def unavailable(request, result):
            if failure[0]: failure[0] = False; raise RuntimeError('isolated artifact publication failure')
            return original(request, result)
        with patch.object(self.executor, 'artifacts', side_effect=unavailable): self.worker().tick()
        self.assertTrue(self.record()['sequencePublicationPending'])
        self.assertEqual(self.executor.calls, 1)
        self.clock += 600; self.worker().tick()
        self.assertEqual(self.executor.calls, 1)
        self.assertNotIn('sequencePublicationPending', self.record())
        self.clock += 600; self.worker().tick(); self.assertEqual(self.executor.calls, 2)

    def test_register_mutation_and_original_revocation_stop_between_groups(self):
        self.worker().tick(); self.clock += 600
        self.store.files[b.PREFIX + 'revocations/original-review.json'] = b'{}'
        self.worker().tick(); self.assertEqual(self.record()['phase'], 'blocked')
        self.assertEqual(self.executor.calls, 1)

    def test_draft_scope_ai_and_apply_are_not_execution_authority(self):
        for changes in [{'status': 'draft-not-approved'}, {'approvalScope': 'formal-record-acceptance-and-release-preparation-only'},
                        {'humanDecision': {**self.request['humanDecision'], 'actorType': 'ai'}},
                        {'applyAuthorized': {'local': True, 'beta': False, 'vps': False}}]:
            with self.subTest(changes=changes):
                request = {**copy.deepcopy(self.request), **changes}
                with self.assertRaises(ValueError): self.worker().approved(request)

    def test_successor_executor_requires_original_first_completed(self):
        original = {'id': 'original-first', 'kind': 'accept-release', 'decision': {'review': {'file': 'review', 'sha256': 'a' * 64}}}
        value = {'batchDecisions': [{'envelope': {**original, 'parentRequestId': 'original-review'}}]}
        self.store.files[self.register_path] = b.dump(value).encode()
        self.request['register']['sha256'] = b.gate.digest(self.store.files[self.register_path])
        original = value['batchDecisions'][0]['envelope']
        self.store.files[b.PREFIX + 'requests/original-first.json'] = b.dump(original).encode()
        self.store.files[b.PREFIX + 'results/original-review/status.json'] = b.dump({'phase': 'completed', 'kind': 'collect-review',
            'reviewReference': original['decision']['review']}).encode()
        self.store.files[b.PREFIX + 'results/original-first/status.json'] = b.dump({'phase': 'waiting-control',
            'requestSha256': b.gate.digest(b.dump(original).encode())}).encode()
        executor = object.__new__(b.Executor); executor.store = self.store; executor.workflow = None; executor.sync_inputs = lambda commit: None
        with self.assertRaisesRegex(ValueError, 'Complete the original first request'):
            executor.validate({**self.request, 'sourceCommit': 'a' * 40})

    def test_github_artifacts_keep_receipt_paths_for_inventory_and_snapshot_mutable_state(self):
        root = self.home / 'runtime'; workspace = root / '.local/acceptance-sequences/test'
        receipt = root / 'datasets/manga-collection/accepted-test'; release = root / 'datasets/public-kg/releases/test'
        for directory in [workspace, receipt, release]: directory.mkdir(parents=True, exist_ok=True)
        (workspace / 'state.json').write_text('{}'); (workspace / 'proof.json').write_text('{}')
        (receipt / 'acceptance.json').write_text('{}'); (receipt / 'preparation.json').write_text('{}')
        (release / 'data.json').write_text('{}')
        executor = object.__new__(b.Executor); executor.root = root
        result = {'stateDirectory': str(workspace), 'lastResult': {'acceptance': str(receipt / 'acceptance.json'),
                  'releaseDirectory': str(release)}}
        files, _ = executor.artifacts(self.request, result)
        self.assertIn('datasets/manga-collection/accepted-test/acceptance.json', files)
        self.assertIn('datasets/public-kg/releases/test/data.json', files)
        self.assertIn('.local/acceptance-sequences/test/proof.json', files)
        self.assertNotIn('.local/acceptance-sequences/test/state.json', files)
        self.assertTrue(any('/reports/' in p and p.endswith('/state.json') for p in files))

    def test_explicit_human_review_signal_blocks_unfamiliar_integrity_error(self):
        error = b.workflow_failure(b.dump({'error': 'Approved target is held', 'humanReviewRequired': True}))
        self.assertIsInstance(error, b.Blocked)
        with patch.object(self.executor, 'run', side_effect=error):
            self.worker().tick()
        self.assertEqual(self.record()['phase'], 'blocked')
        self.clock += 600; self.worker().tick()
        self.assertEqual(self.record()['phase'], 'blocked')
        self.assertNotIsInstance(b.workflow_failure(b.dump({'error': 'interrupted I/O'})), b.Blocked)
