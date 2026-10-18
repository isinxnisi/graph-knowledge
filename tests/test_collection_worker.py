"""GitHub-equivalent approval transport and durable control. No real approval or DB writes."""
import copy
from contextlib import contextmanager
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('worker_test_subject', ROOT / 'scripts/collection-worker.py')
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)


def approval(ident='isolated-collect'):
    return {'schemaVersion': 1, 'id': ident, 'status': 'approved', 'kind': 'collect-review',
        'sourceCommit': '0' * 40, 'approvalScope': 'collection-candidates-and-review-only',
        'applyAuthorized': b.NO_APPLY.copy(), 'humanDecision': {'actorType': 'human',
            'reviewer': '隔離試験・実運用の承認ではない', 'decidedAt': datetime.now(timezone.utc).isoformat(),
            'statement': '隔離fixtureだけの模擬判断。実データ受入・公開applyを認めない。'},
        'target': {'themeId': 'isolated-test', 'revision': 1, 'definitionSha256': 'a' * 64}}


@contextmanager
def no_lock():
    yield None


class MemoryStore:
    def __init__(self): self.files = {}; self.head = 'test'; self.fail = False
    def sync(self): return self.head
    def tree(self, ref, prefix): return {k: b.gate.digest(v) for k, v in self.files.items() if k.startswith(prefix)}
    def json(self, path):
        raw = self.files[path]
        return b.json.loads(raw, object_pairs_hook=b.gate.unique_keys), b.gate.digest(raw)
    def publish(self, files, immutable=()):
        if self.fail: raise RuntimeError('isolated GitHub unavailable')
        for k, v in files.items():
            if k in immutable and k in self.files: b.insist(v == self.files[k], 'Immutable artifact changed')
        self.files.update(files)
    def submit(self, request): self.files[b.PREFIX + 'requests/' + request['id'] + '.json'] = b.dump(request).encode()


class FakeExecutor:
    def __init__(self, home):
        self.calls = 0; self.failed = False; self.artifact_failure = False; self.interrupt = None
        self.review = home / 'review'; self.review.mkdir()
        (self.review / 'review-manifest.json').write_text('{}')
        self.workflow = SimpleNamespace(reference=lambda path: {'file': 'datasets/review/review-manifest.json', 'sha256': b.gate.file_hash(path)})
    def validate(self, request, parent):
        if request['kind'] == 'accept-release':
            b.insist(parent and parent['phase'] == 'completed', 'Completed parent review required')
        b.insist(request.get('valid', True), 'scope/hash mismatch')
    def run(self, request, monitor, fd):
        self.calls += 1
        if self.interrupt: self.interrupt()
        monitor()
        if self.failed: self.failed = False; raise RuntimeError('isolated communication interruption')
        return {'reviewDirectory': str(self.review), 'publicApply': False, 'counts': {'claims': 1}}
    def artifacts(self, request, result):
        if self.artifact_failure: self.artifact_failure = False; raise RuntimeError('isolated rendering interruption')
        return {'datasets/review/README.md': '隔離レビュー。未公開候補。'.encode()}, ['datasets/decision-draft.json']


class WorkerControl(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name); self.store = MemoryStore(); self.executor = FakeExecutor(self.home)
        self.config = {'home': str(self.home), 'workerId': 'isolated-worker'}
        self.request = approval(); self.store.submit(self.request)
    def worker(self, lock=no_lock): return b.Worker(self.config, self.store, self.executor, lock)
    def record(self, ident=None): return b.read(self.home / 'state.json')['requests'][ident or self.request['id']]
    def test_complete_restart_and_duplicate_have_one_execution(self):
        self.worker().tick(); self.assertEqual(self.record()['phase'], 'completed')
        before = copy.deepcopy(self.store.files)
        self.worker().tick(); self.assertEqual(self.executor.calls, 1)
        self.assertEqual(before, self.store.files)
        duplicate = copy.deepcopy(self.request); duplicate['id'] = 'second-collect'; self.store.submit(duplicate)
        self.worker().tick(); self.assertEqual(self.record('second-collect')['phase'], 'duplicate')
        self.assertEqual(self.executor.calls, 1)
        # Loss of local bookkeeping can recover completion from the GitHub result.
        (self.home / 'state.json').unlink(); self.worker().tick(); self.assertEqual(self.executor.calls, 1)
    def test_communication_failure_resume_and_no_reexecution_after_report_failure(self):
        self.executor.failed = True; self.worker().tick(); self.assertEqual(self.record()['phase'], 'retry-wait')
        state = b.read(self.home / 'state.json'); state['requests'][self.request['id']]['retryAt'] = 0; b.save(self.home / 'state.json', state)
        self.executor.artifact_failure = True; self.worker().tick(); self.assertTrue(self.record()['executionComplete'])
        self.worker().tick(); self.assertEqual(self.record()['phase'], 'completed'); self.assertEqual(self.executor.calls, 2)
        self.assertIn('reviewReference', self.record())
    def test_github_publication_failure_retries_only_saved_report(self):
        original = self.executor.artifacts
        def unavailable(request, result):
            files = original(request, result); self.store.fail = True; return files
        with patch.object(self.executor, 'artifacts', side_effect=unavailable): self.worker().tick()
        self.assertTrue(self.record()['executionComplete']); self.assertEqual(self.executor.calls, 1)
        self.store.fail = False; self.worker().tick()
        self.assertEqual(self.record()['phase'], 'completed'); self.assertEqual(self.executor.calls, 1)
    def test_no_approval_ai_flag_scope_future_and_apply_rejected(self):
        for mutate in [lambda r: r.update(status='draft-not-approved'),
            lambda r: r['humanDecision'].update(actorType='ai'), lambda r: r['humanDecision'].update(reviewer=None),
            lambda r: r['humanDecision'].update(decidedAt='2999-01-01T00:00:00+00:00'),
            lambda r: r.update(approvalScope='all'), lambda r: r['applyAuthorized'].update(local=True),
            lambda r: r.update(kind='apply')]:
            r = approval('invalid-' + str(len(self.store.files))); mutate(r); self.store.submit(r)
        self.store.files.pop(b.PREFIX + 'requests/' + self.request['id'] + '.json')
        self.worker().tick(); self.assertEqual(self.executor.calls, 0)
        self.assertTrue(all(r['phase'] == 'blocked' for r in b.read(self.home / 'state.json')['requests'].values()))
    def test_immutable_request_and_operation_target_changes_block(self):
        self.worker().tick(); r = copy.deepcopy(self.request); r['target']['definitionSha256'] = 'b' * 64
        self.store.submit(r); self.worker().tick(); self.assertEqual(self.record()['phase'], 'blocked')
        r['id'] = 'target-rebinding'; self.store.submit(r); self.worker().tick()
        self.assertEqual(self.record(r['id'])['phase'], 'blocked'); self.assertEqual(self.executor.calls, 1)
    def test_revocation_before_and_during_execution_and_removed_request(self):
        def revoke():
            sha = self.store.json(b.PREFIX + 'requests/' + self.request['id'] + '.json')[1]
            self.store.files[b.PREFIX + 'revocations/' + self.request['id'] + '.json'] = b.dump({
                'humanDecision': self.request['humanDecision'], 'requestSha256': sha, 'approvalScope': 'request-cancellation-only'}).encode()
        revoke(); self.worker().tick(); self.assertEqual(self.executor.calls, 0); self.assertEqual(self.record()['phase'], 'blocked')
        self.store.files.pop(b.PREFIX + 'revocations/' + self.request['id'] + '.json'); (self.home / 'state.json').unlink()
        self.store.files.pop(b.PREFIX + 'results/' + self.request['id'] + '/status.json')
        self.executor.interrupt = revoke; self.worker().tick(); self.assertEqual(self.record()['phase'], 'blocked')
        self.assertNotIn('executionComplete', self.record())
        self.store.files.pop(b.PREFIX + 'requests/' + self.request['id'] + '.json'); self.worker().tick()
        self.assertIn('removed', self.record()['message'])
    def test_common_lock_waits_without_execution_and_resumes(self):
        @contextmanager
        def occupied(): raise RuntimeError('共通ロックは使用中'); yield
        self.worker(occupied).tick(); self.assertEqual(self.record()['phase'], 'waiting-lock'); self.assertEqual(self.executor.calls, 0)
        self.worker().tick(); self.assertEqual(self.record()['phase'], 'completed')
    def test_new_explicit_review_cycle_can_refresh_an_existing_completed_job(self):
        self.worker().tick(); r = copy.deepcopy(self.request); r.update(id='refresh-review', reviewCycle='after-partial-acceptance')
        self.store.submit(r); self.worker().tick()
        self.assertEqual(self.record(r['id'])['phase'], 'completed'); self.assertEqual(self.executor.calls, 2)
    def test_malformed_file_does_not_block_valid_request(self):
        self.store.files[b.PREFIX + 'requests/broken.json'] = b'{"id":"broken","id":"changed"}'
        self.worker().tick(); self.assertEqual(self.record()['phase'], 'completed')
        self.assertIn(b.PREFIX + 'requests/broken.json', b.read(self.home / 'state.json')['invalidFiles'])
    def test_semantic_failure_and_missing_parent_do_not_execute(self):
        r = approval('semantic-conflict'); r['target']['themeId'] = 'other-test'; r['valid'] = False; self.store.submit(r)
        r = approval('accept-no-parent'); r.update(kind='accept-release', parentRequestId='absent',
            decision={'decisionId': 'missing-parent', 'humanDecision': r.pop('humanDecision')}); self.store.submit(r)
        self.worker().tick(); self.assertEqual(self.record('semantic-conflict')['phase'], 'blocked')
        self.assertEqual(self.record('accept-no-parent')['phase'], 'blocked'); self.assertEqual(self.executor.calls, 1)


class GitTransport(unittest.TestCase):
    def test_ff_publication_and_immutable_evidence_and_history_rewrite(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp); origin = home / 'origin.git'; seed = home / 'seed'
            b.command(['git', 'init', '--bare', str(origin)])
            b.command(['git', 'init', '-b', 'main', str(seed)])
            (seed / 'README.md').write_text('ISOLATED GITHUB EQUIVALENT')
            b.command(['git', '-C', str(seed), 'add', '.'])
            b.command(['git', '-C', str(seed), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', '隔離試験'])
            b.command(['git', '-C', str(seed), 'push', str(origin), 'main', 'main:refs/heads/control'])
            store = b.GitHubStore(home / 'worker', str(origin), 'control'); store.sync()
            fixed = b.PREFIX + 'artifacts/test/evidence.md'
            store.publish({fixed: b'first'}, [fixed]); first = store.head
            other = b.GitHubStore(home / 'connector', str(origin), 'control'); other.sync()
            other.publish({b.PREFIX + 'requests/test.json': b'{}'})
            status = b.PREFIX + 'results/test/status.json'
            store.publish({status: b.dump({'workerId': 'first', 'requestSha256': 'a' * 64, 'generation': 2}).encode()})
            self.assertIn(b.PREFIX + 'requests/test.json', store.tree(store.head, b.PREFIX))
            with self.assertRaisesRegex(b.Blocked, 'ownership'):
                other.publish({status: b.dump({'workerId': 'second', 'requestSha256': 'a' * 64, 'generation': 3}).encode()})
            with self.assertRaisesRegex(b.Blocked, 'Stale'):
                store.publish({status: b.dump({'workerId': 'first', 'requestSha256': 'a' * 64, 'generation': 1}).encode()})
            with self.assertRaisesRegex(b.Blocked, 'Immutable'): store.publish({fixed: b'changed'}, [fixed])
            b.command(['git', '--git-dir=' + str(origin), 'update-ref', 'refs/heads/control', first])
            with self.assertRaises((b.Blocked, RuntimeError)): store.sync()


class ExistingCLIInvocation(unittest.TestCase):
    def test_gate_receipt_resume_and_fixed_collect_command(self):
        fixtures = b.module('worker_invocation_fixtures', ROOT / 'tests/test_collection_workflow.py')
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp); runtime = home / 'runtime'; runtime.mkdir()
            executor = object.__new__(b.Executor)
            executor.root, executor.registry = runtime, runtime / 'datasets/collection-themes'
            executor.config, executor.workflow = {'home': str(home)}, fixtures.w
            executor.sync_inputs = lambda commit: None
            value = b.read(ROOT / 'datasets/collection-themes/themes/famous-manga-creators/r0003.json')
            value.update(id='isolated-cli-invocation', revision=1, relatedThemes=[])
            b.save(b.gate.revision_path(executor.registry, 'themes', value['id'], 1), value)
            recipe = value['execution']['inputs'][0]['file']; (runtime / recipe).parent.mkdir(parents=True)
            (runtime / recipe).write_bytes((ROOT / recipe).read_bytes())
            request = approval(); request['target'] = b.proposal(value, runtime, executor.registry)
            calls = []
            class Child:
                def __init__(self, args, **kwargs):
                    calls.append((args, kwargs)); kwargs['stdout'].write('{"publicApply":false}'); kwargs['stdout'].flush()
                    self.returncode = 0
                def poll(self): return 0
            executor.validate(request)
            with patch.object(b.subprocess, 'Popen', Child): executor.run(request, lambda: None)
            path = b.gate.revision_path(executor.registry, 'approvals', value['id'], 1); before = path.read_bytes()
            executor.validate(request)  # Request approved with null existing receipt, now resumes its OWN receipt.
            with patch.object(b.subprocess, 'Popen', Child): executor.run(request, lambda: None)
            self.assertEqual(before, path.read_bytes())
            self.assertEqual(calls[0][0][2:], ['collect-review', value['id'], '--revision', '1', '--definition-sha', b.digest(value)])
            self.assertNotIn('apply', calls[0][0]); self.assertEqual(calls[0][1]['cwd'], runtime)
            changed = copy.deepcopy(request); changed['target']['execution']['codeSha256'] = '0' * 64
            with self.assertRaisesRegex(b.Blocked, 'different request|hash changed'): executor.validate(changed)


if __name__ == '__main__': unittest.main()
