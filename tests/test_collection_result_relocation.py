"""Operational relocation only. No network, collection, acceptance or KG writes."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import shutil
import os
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


r = load('relocation_test', ROOT / 'scripts/collection-result-relocation.py')
w = load('relocation_worker_test', ROOT / 'scripts/collection-worker.py')


class RelocationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.home = self.base / 'new'
        self.root = self.home / 'runtime'
        self.old = self.base / 'old/runtime'
        self.review_name = 'datasets/manga-collection/workflow-reviews/test-review'
        self.review = self.root / self.review_name
        self.review.mkdir(parents=True)
        self.put(self.review_name + '/decision-request.json', {'groups': {
            'normal': {'recordIds': {'claims': ['claim']}},
            'identity-only': {'recordIds': {'claims': []}}}})
        self.put(self.review_name + '/review.json', {'held': True})
        artifacts = {p.name: r.sha(p.read_bytes()) for p in self.review.iterdir()}
        self.put(self.review_name + '/review-manifest.json', {'artifacts': artifacts})
        draft = 'datasets/manga-collection/decisions/test-normal-draft.json'
        self.put(draft, {'frozen': 'draft'})
        self.put(draft.replace('-draft.json', '-request-draft.json'), {'status': 'draft-not-approved'})
        for file in ['artifacts/records.json', 'job.json', 'work-order.json', 'request-cache/requests.json']:
            self.put('.local/collection-jobs/job/' + file, {'immutable': True})
        self.put('datasets/collection-themes/approvals/test/r0001.json', {'approved': True})
        self.proof = {'oldHome': str(self.old.parent), 'workerId': 'test', 'copiedFilesSha256': {
            p.relative_to(self.root).as_posix(): r.sha(p.read_bytes())
            for p in self.root.rglob('*') if p.is_file()}}
        for name in self.proof['copiedFilesSha256']:
            target = self.old / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((self.root / name).read_bytes())
        self.record = {'kind': 'collect-review', 'request': {'id': 'test', 'kind': 'collect-review', 'sourceCommit': 'a' * 40,
                       'target': {'themeId': 'test', 'revision': 1}},
                       'requestSha256': 'request-hash', 'workerId': 'test', 'phase': 'blocked',
                       'message': 'Artifact escapes runtime', 'executionComplete': True,
                       'attempts': 1, 'result': {'reviewDirectory': str(self.old / self.review_name), 'jobId': 'job'},
                       'reviewReference': {'file': self.review_name + '/review-manifest.json',
                                           'sha256': r.sha((self.review / 'review-manifest.json').read_bytes())},
                       'decisionDrafts': [draft]}
        self.executor = object.__new__(w.Executor)
        self.executor.root = self.root
        self.executor.registry = self.root / 'datasets/collection-themes'
        self.executor.workflow = w.module('relocation_test_workflow', ROOT / 'scripts/collection-workflow.py')

    def put(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def relocate(self):
        return r.relocated_record(self.record, self.proof, self.home, self.executor)

    def shared_cache_fixture(self):
        name = '.local/collection-jobs/job/request-cache'
        target = '.local/collection-issues/issue/request-cache'
        raw = (self.root / name / 'requests.json').read_bytes()
        for root in [self.old, self.root]:
            path = root / target
            path.mkdir(parents=True)
            (path / 'requests.json').write_bytes(raw)
            shutil.rmtree(root / name)
            (root / name).symlink_to(self.old / target)
        self.proof['copiedFilesSha256'].pop(name + '/requests.json')
        self.proof['copiedFilesSha256'][target + '/requests.json'] = r.sha(raw)
        migration = self.home / 'migration'
        migration.mkdir(exist_ok=True)
        (migration / 'source-runtime-inventory.json').write_text(json.dumps({name: {'symlink': str(self.old / target)}}))
        return name, target

    def test_cache_link_preflight_is_isolated_and_interruption_resumes(self):
        name, target = self.shared_cache_fixture()
        state = {'requests': {'test': self.record}, 'executionControl': {}}
        links = r.cache_links(state, ['test'], self.proof, self.home)
        before_link = os.readlink(self.root / name)
        with tempfile.TemporaryDirectory() as directory:
            executor = r.isolated_executor(self.executor, self.proof, links, directory)
            after, details = r.make_plan(state, ['test'], self.proof, self.home, executor, lambda *a: None, links)
        self.assertEqual(os.readlink(self.root / name), before_link)
        raw = json.dumps(state).encode()
        (self.home / 'state.json').write_bytes(raw)
        def interrupted():
            raise ValueError('simulated power loss after cache link relocation')
        with self.assertRaisesRegex(ValueError, 'power loss'):
            r.apply_state(self.home, raw, after, {'cacheLinks': links}, interrupted)
        self.assertEqual((self.home / 'state.json').read_bytes(), raw)
        self.assertEqual((self.root / target / 'requests.json').read_bytes(), (self.old / target / 'requests.json').read_bytes())
        self.assertEqual(os.readlink(self.old / name), before_link)
        links = r.cache_links(state, ['test'], self.proof, self.home)
        r.apply_state(self.home, raw, after, {'cacheLinks': links}, lambda: self.relocate_with_links(links))
        self.assertEqual(r.read(self.home / 'state.json'), after)

    def relocate_with_links(self, links):
        return r.relocated_record(self.record, self.proof, self.home, self.executor, links)

    def test_changed_cache_link_and_new_cache_bytes_rejected(self):
        name, target = self.shared_cache_fixture()
        state = {'requests': {'test': self.record}}
        link = self.root / name
        link.unlink()
        link.symlink_to(self.base / 'unexpected')
        with self.assertRaisesRegex(ValueError, 'cache link changed'):
            r.cache_links(state, ['test'], self.proof, self.home)
        link.unlink()
        link.symlink_to(self.old / target)
        (self.root / target / 'new.body').write_bytes(b'unproven response')
        with self.assertRaisesRegex(ValueError, 'Shared cache changed'):
            r.cache_links(state, ['test'], self.proof, self.home)

    def transfer_fixture(self):
        proof = copy.deepcopy(self.proof)
        proof.update(newHome=str(self.home), oldRuntimeUnchanged=True, oldStateCopiedByteIdentical=True,
                     codeCommit='a' * 40)
        self.put('scripts/collection-worker.py', {'reviewed-code': True})
        code = (self.root / 'scripts/collection-worker.py').read_bytes()
        proof['codeFilesSha256'] = {'scripts/collection-worker.py': r.sha(code)}
        inventory = {name: {'sha256': value} for name, value in proof['copiedFilesSha256'].items()}
        migration = self.home / 'migration'
        migration.mkdir()
        (migration / 'source-runtime-inventory.json').write_text(json.dumps(inventory))
        proof['sourceRuntimeInventorySha256'] = r.sha((migration / 'source-runtime-inventory.json').read_bytes())
        proof_path = migration / 'transfer-verification.json'
        proof_path.write_text(json.dumps(proof))
        (self.home / 'config.json').write_text(json.dumps({'home': str(self.home), 'workerId': 'test', 'codeCommit': 'a' * 40}))
        return proof_path, code

    def test_transfer_pin_old_and_new_bytes_and_code_commit(self):
        proof_path, code = self.transfer_fixture()
        pin = r.sha(proof_path.read_bytes())
        with patch.object(r.subprocess, 'run', return_value=SimpleNamespace(stdout=code)):
            proof, config = r.verify_transfer(self.home, pin)
            self.assertEqual(config['codeCommit'], proof['codeCommit'])
            with self.assertRaisesRegex(ValueError, 'proof changed'):
                r.verify_transfer(self.home, '0' * 64)
            with patch.object(r.subprocess, 'run', return_value=SimpleNamespace(stdout=b'other code')):
                with self.assertRaisesRegex(ValueError, 'pinned commit'):
                    r.verify_transfer(self.home, pin)
            old_cache = self.old / '.local/collection-jobs/job/request-cache/requests.json'
            old_cache.write_text('modified old cache')
            with self.assertRaisesRegex(ValueError, 'Transferred artifact changed'):
                r.verify_transfer(self.home, pin)

    def test_only_pointer_and_publication_phase_change(self):
        changed, files = self.relocate()
        expected = copy.deepcopy(self.record)
        expected['phase'] = 'publishing'
        expected['result']['reviewDirectory'] = str(self.review)
        self.assertEqual(changed, expected)
        self.assertEqual(files, self.proof['copiedFilesSha256'])
        self.assertEqual(self.record['phase'], 'blocked')

    def test_existing_escape_guard_still_rejects_original(self):
        with self.assertRaisesRegex(ValueError, 'Artifact escapes runtime'):
            self.executor.artifacts(self.record['request'], self.record['result'])

    def test_frozen_review_tampering_rejected(self):
        (self.review / 'review.json').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'Frozen review changed'):
            self.relocate()

    def test_cache_tampering_rejected(self):
        self.put('.local/collection-jobs/job/request-cache/requests.json', {'changed': True})
        with self.assertRaisesRegex(ValueError, 'Unproven publication artifact'):
            self.relocate()

    def test_missing_draft_never_regenerated(self):
        draft = self.root / self.record['decisionDrafts'][0]
        draft.unlink()
        with self.assertRaisesRegex(ValueError, 'Missing frozen draft'):
            self.relocate()
        self.assertFalse(draft.exists())

    def test_missing_envelope_never_regenerated(self):
        path = self.root / self.record['decisionDrafts'][0].replace('-draft.json', '-request-draft.json')
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'Missing frozen draft'):
            self.relocate()
        self.assertFalse(path.exists())

    def test_unfinished_acceptance_prepare_or_other_error_rejected(self):
        for change in [{'executionComplete': False}, {'kind': 'accept-release'},
                       {'kind': 'issue-prepare'}, {'message': 'hash mismatch'}, {'phase': 'completed'}]:
            original = self.record
            self.record = {**original, **change}
            with self.assertRaises(ValueError):
                self.relocate()
            self.record = original

    def test_traversal_and_foreign_prefix_rejected(self):
        for path in [str(self.old) + '-other/review', str(self.old / '../outside'), str(self.old / 'datasets/../escape')]:
            self.record['result']['reviewDirectory'] = path
            with self.assertRaises(ValueError):
                self.relocate()

    def test_symlink_and_extra_file_rejected(self):
        outside = self.base / 'outside'
        outside.write_text('outside')
        link = self.review / 'injected'
        link.symlink_to(outside)
        with self.assertRaises(ValueError):
            self.relocate()
        link.unlink()
        link.write_text('new unproven file')
        with self.assertRaisesRegex(ValueError, 'Unproven publication artifact'):
            self.relocate()

    def test_active_attempt_and_changed_approval_rejected(self):
        state = {'requests': {'test': self.record}, 'executionControl': {'activeAttempt': {'id': 'running'}}}
        with self.assertRaisesRegex(ValueError, 'active'):
            r.make_plan(state, ['test'], self.proof, self.home, self.executor, lambda *a: None)
        state['executionControl'] = {}
        def changed(*a):
            raise ValueError('approval revoked')
        with self.assertRaisesRegex(ValueError, 'approval revoked'):
            r.make_plan(state, ['test'], self.proof, self.home, self.executor, changed)

    def test_state_backup_cas_and_repeat_do_not_reexecute(self):
        state = {'requests': {'test': self.record}, 'executionControl': {'pauseMode': None}, 'operations': {'keep': 'keep'}}
        after, plan = r.make_plan(state, ['test'], self.proof, self.home, self.executor, lambda *a: None)
        self.assertEqual(state['executionControl'], after['executionControl'])
        self.assertEqual(state['operations'], after['operations'])
        (self.home / 'migration').mkdir()
        raw = json.dumps(state).encode()
        (self.home / 'state.json').write_bytes(raw)
        saved = Path(r.apply_state(self.home, raw, after, {'requests': plan}))
        self.assertEqual((saved / 'state-before.json').read_bytes(), raw)
        self.assertEqual(r.read(self.home / 'state.json'), after)
        with self.assertRaisesRegex(ValueError, 'state changed'):
            r.apply_state(self.home, raw, after, {})
        with self.assertRaisesRegex(ValueError, 'not blocked'):
            r.make_plan(after, ['test'], self.proof, self.home, self.executor, lambda *a: None)


if __name__ == '__main__':
    unittest.main()
