"""Isolated approval continuation, real accept-release core, fake read-only DB/plan and tiny frozen reviews."""
import argparse
import copy
import importlib.util
import contextlib
import io
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def uid(number):
    return str(UUID(int=(number << 80) | (4 << 76) | (2 << 62) | number))


class SequenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.w = module('isolated_sequence_workflow', ROOT / 'scripts/collection-workflow.py')
        self.s = module('isolated_sequence', ROOT / 'scripts/collection-sequence.py')
        self.a = module('isolated_sequence_acceptance', ROOT / 'scripts/collection-acceptance.py')
        self.w.ROOT = self.root
        original_load = self.w.load
        self.w.load = lambda name, path: self.s if Path(path).name == 'collection-sequence.py' else (
            self.a if Path(path).name == 'collection-acceptance.py' else original_load(name, ROOT / 'scripts' / Path(path).name))
        self.w.gate.REGISTRY = self.root / 'datasets/collection-themes'
        self.public = {'schemaVersion': 4, **{f: [] for f in self.w.FIELDS}}
        self.save('datasets/public-kg/releases/base/data.json', self.public)
        self.save('datasets/public-kg/releases/base/manifest.json', {'dataset': 'public-kg', 'release': 'base', 'baseRelease': None,
            'reason': 'ISOLATED TEST', 'dataSha256': self.w.gate.file_hash(self.root / 'datasets/public-kg/releases/base/data.json'),
            'inputs': [{'dataset': 'isolated', 'file': 'fixture', 'sha256': 'a' * 64}], 'claimOrigins': []})
        self.observed = {'release': 'base', 'revision': 'isolated-revision', 'observation': 'live-readonly-backup',
            'references': [self.w.reference(self.root / 'datasets/public-kg/releases/base' / name) for name in ['data.json', 'manifest.json']]}
        self.w.public_snapshot = lambda *args: (copy.deepcopy(self.public), copy.deepcopy(self.observed))
        self.w.verify_job = lambda p: self.w.read(p / 'job.json')
        self.w.markdown = lambda outputs: '# ISOLATED REVIEW\n'
        self.w.review_job = self.refresh
        self.calls = []; self.failure = None
        self.w.node = self.node
        for name in ['public-dataset.ts', 'public-backup.ts']:
            p = self.root / 'lib/server' / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('// test validator')
        p = self.root / 'lib/domain/fixture.ts'; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('// test schema')
        self.groups = [self.records(n) for n in [1, 2, 3]]
        self.job_groups = {}
        self.decisions = []
        for n, records in enumerate(self.groups, 1):
            job = self.root / '.local/collection-jobs' / ('job-' + str(n))
            self.save(str(job.relative_to(self.root) / 'work-order.json'), {'test': n})
            self.save(str(job.relative_to(self.root) / 'job.json'), {'jobId': job.name, 'artifacts': {}})
            self.job_groups[str(job)] = records
            outputs = self.refresh(job, self.public, self.observed, {f: [] for f in self.w.FIELDS}, [])
            review, _ = self.w.write_review(self.root / 'original-reviews', outputs)
            _, request, indexed, refs = self.a.bundle(review, self.w)
            decision = {'schemaVersion': 1, 'decisionId': 'group-' + str(n), 'releaseId': 'release-group-' + str(n),
                'status': 'approved', 'humanDecision': {'actorType': 'human', 'reviewer': 'ISOLATED TEST ONLY',
                    'decidedAt': '2026-10-19T00:00:00+00:00', 'statement': 'Isolated fixture; no operational acceptance authorized.'},
                'approvalScope': 'formal-record-acceptance-and-release-preparation-only', 'applyAuthorized': self.s.NO_APPLY,
                'review': self.w.reference(review / 'review-manifest.json'), 'referenceArtifacts': refs,
                'acceptedRecordIds': {f: sorted(indexed[f]) for f in self.w.FIELDS},
                'recordSha256': {f: {i: self.w.digest(r) for i, r in indexed[f].items()} for f in self.w.FIELDS},
                'scopeByClaim': self.a.scope_rows(records, self.w), 'baseRelease': 'base', 'baseRevision': 'isolated-revision'}
            self.decisions.append(decision)
        self.register = {'schemaVersion': 1, 'approvalId': 'isolated-three',
            'status': 'approved-by-human-pending-sequential-worker-processing',
            'humanDecision': self.decisions[0]['humanDecision'], 'scope': self.decisions[0]['approvalScope'], 'applyAuthorized': self.s.NO_APPLY,
            'approvedRecordIds': {f: sorted({i for d in self.decisions for i in d['acceptedRecordIds'][f]}) for f in self.w.FIELDS},
            'batchDecisions': [{'envelope': {'schemaVersion': 1, 'kind': 'accept-release', 'status': 'approved',
                'id': d['decisionId'], 'parentRequestId': 'parent-' + str(n), 'applyAuthorized': self.s.NO_APPLY, 'decision': d}}
                for n, d in enumerate(self.decisions)]}
        self.register_path = self.save('.local/acceptance-sequences/test/register-source.json', self.register)
        self.args = argparse.Namespace(register=self.register_path, register_sha=self.w.gate.file_hash(self.register_path),
                                       state_dir=self.root / '.local/acceptance-sequences/test')

    def save(self, path, value):
        target = self.root / path; self.w.gate.save(target, value); return target

    def records(self, n):
        person = {'id': uid(1), 'kind': 'person', 'name': 'Shared creator', 'aliases': [], 'description': None, 'externalIds': []}
        work = {'id': uid(10 + n), 'kind': 'work', 'name': 'Work ' + str(n), 'aliases': [], 'description': None, 'externalIds': []}
        claim = {'id': uid(20 + n), 'subjectId': person['id'], 'objectId': work['id'], 'predicate': 'CONTRIBUTED_TO',
            'polarity': 'affirmed', 'visibility': 'hidden', 'period': {'from': None, 'to': None},
            'contribution': {'roleId': 'AUTHORSHIP', 'scope': {'kind': 'publication', 'isbn13': str(9780000000000 + n)}},
            'organizationParticipation': None, 'eventParticipation': None}
        source = {'id': uid(30 + n), 'title': 'Source ' + str(n), 'url': 'https://example.com/book/' + str(n)}
        citation = {'id': uid(40 + n), 'claimId': claim['id'], 'sourceId': source['id'], 'stance': 'support'}
        return {'entities': [person, work], 'claims': [claim], 'sources': [source], 'citations': [citation]}

    def refresh(self, job, public, observed, accepted, refs):
        records = copy.deepcopy(self.job_groups[str(job)])
        known = self.w.index(public)
        for f in self.w.FIELDS:
            known[f].update({r['id']: r for r in accepted[f]})
        pending = {f: [r for r in records[f] if r['id'] not in known[f]] for f in self.w.FIELDS}
        if self.failure == 'meaning-change':
            pending['claims'][0]['contribution']['roleId'] = 'DRAWING'
        elif self.failure == 'isbn-change':
            pending['claims'][0]['contribution']['scope']['isbn13'] = '9789999999999'
        elif self.failure == 'source-change':
            pending['sources'][0]['url'] = 'https://example.com/different-source'
        elif self.failure == 'citation-change':
            pending['citations'][0]['stance'] = 'background'
        context = {'jobId': job.name, 'jobDirectory': str(job), 'jobArtifacts': {},
            'workOrderSha256': self.w.gate.file_hash(job / 'work-order.json'), 'public': observed, 'acceptedReferences': refs}
        review = {'recordConflicts': [], 'inheritedHolds': [],
            'entities': [{'entityId': r['id'], 'name': r['name'], 'status': 'reuse' if r['id'] in known['entities'] else 'candidate', 'reasons': []} for r in records['entities']],
            'claims': [{'claimId': r['id'], 'person': 'Shared creator', 'work': 'Work', 'status': 'reuse' if r['id'] in known['claims'] else 'candidate', 'reasons': []} for r in records['claims']]}
        result = {'context.json': context, 'review.json': review, 'proposed-records.json': {'records': pending},
            'identity-only-records.json': {'records': {f: [] for f in self.w.FIELDS}}, 'exploration-paths.json': []}
        result['decision-request.json'] = {'status': 'pending-human-decision', 'groups': {'normal': {
            'recordIds': {f: [r['id'] for r in pending[f]] for f in self.w.FIELDS}}}, 'heldClaimIds': [], 'heldEntityIds': [],
            'referenceArtifacts': [{'file': name, 'sha256': self.w.gate.digest(self.w.dump(v).encode())} for name, v in result.items()]}
        return result

    def node(self, command):
        self.assertEqual(command[0], 'scripts/public-kg.ts'); self.assertIn(command[1], ['validate', 'plan'])
        self.calls.append(command[1])
        if self.failure == 'post-receipt-validate' and command[1] == 'validate' and Path(command[2]).name == 'release-group-2':
            self.failure = None
            raise RuntimeError('isolated validation interrupted after receipt')
        if self.failure == command[1]:
            self.failure = None
            raise RuntimeError('isolated stage interrupted')
        return {'valid': True} if command[1] == 'validate' else {'updated': [], 'added': [], 'relationshipsAdded': 0}

    def first(self):
        d = self.decisions[0]; path = self.save('datasets/manga-collection/decisions/first-original-decision.json', d)
        return self.a.execute(argparse.Namespace(command='accept-release', decision=path,
            decision_sha=self.w.gate.file_hash(path), acceptances=self.root / 'datasets/manga-collection',
            releases=self.root / 'datasets/public-kg/releases'), self.w)

    def step(self):
        return self.s.execute(self.args, self.w)

    def effect_hashes(self, decision):
        target = self.root / 'datasets/manga-collection' / ('accepted-' + decision['decisionId'])
        return {n: self.w.gate.file_hash(target / n) for n in ['acceptance.json', 'decision.json', 'accepted-records.json', 'acceptance-manifest.json']}

    def test_first_waits_without_registration_or_acceptance(self):
        result = self.step()
        self.assertEqual(result['status'], 'waiting-existing-first-request')
        self.assertEqual(self.calls, [])
        self.assertEqual(list((self.root / 'datasets/manga-collection').glob('accepted-*')), [])

    def test_sequential_rebuild_exact_shared_dependencies_and_idempotent_restart(self):
        self.first(); hashes = self.effect_hashes(self.decisions[0])
        self.assertEqual(self.step()['completedDecisionId'], 'group-2')
        self.assertEqual(self.step()['completedDecisionId'], 'group-3')
        self.assertTrue(self.step()['sequenceComplete'])
        before = self.w.gate.inventory(self.root / 'datasets/public-kg/releases')
        self.assertTrue(self.step()['sequenceComplete'])
        self.assertEqual(self.w.gate.inventory(self.root / 'datasets/public-kg/releases'), before)
        self.assertEqual(self.effect_hashes(self.decisions[0]), hashes)
        for decision in self.decisions:
            target, receipt = self.s.saved_receipt(decision, self.w)
            self.assertEqual(self.w.read(target / 'decision.json'), decision)
        self.assertEqual(len(list((self.root / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))), 3)

    def test_ordinary_old_comparison_guard_is_preserved(self):
        self.first(); d = self.decisions[1]; path = self.save('old-decision.json', d)
        with self.assertRaisesRegex(ValueError, 'outside the reviewed comparison set'):
            self.a.execute(argparse.Namespace(command='accept-release', decision=path, decision_sha=self.w.gate.file_hash(path),
                acceptances=self.root / 'datasets/manga-collection', releases=self.root / 'datasets/public-kg/releases'), self.w)

    def test_new_meaning_stops_before_receipt(self):
        self.first(); self.failure = 'meaning-change'
        with self.assertRaisesRegex(ValueError, 'body/Role/scope differs'):
            self.step()
        self.assertIsNone(self.s.saved_receipt(self.decisions[1], self.w))

    def check_fresh_evidence_change(self, mode):
        self.first(); self.failure = mode
        with self.assertRaisesRegex(ValueError, 'body/Role/scope differs'):
            self.step()
        self.assertIsNone(self.s.saved_receipt(self.decisions[1], self.w))

    def test_isbn_scope_change_requires_human_review(self):
        self.check_fresh_evidence_change('isbn-change')

    def test_source_body_change_requires_human_review(self):
        self.check_fresh_evidence_change('source-change')

    def test_citation_body_change_requires_human_review(self):
        self.check_fresh_evidence_change('citation-change')

    def test_claim_already_owned_by_other_receipt_is_not_accepted_again(self):
        self.first(); records = self.groups[1]
        proposal = self.save('datasets/external/review/proposal.json', {'records': records})
        self.save('datasets/manga-collection/accepted-external/acceptance.json', {'status': 'accepted-for-release-preparation-only',
            'reviewer': 'ISOLATED EXTERNAL HUMAN', 'recordedAt': '2026-10-19T00:00:00+00:00', 'applyAuthorized': self.s.NO_APPLY,
            'referenceArtifacts': [self.w.reference(proposal)], 'scopeByClaim': self.a.scope_rows(records, self.w),
            'acceptedRecordIds': {f: [r['id'] for r in records[f]] for f in self.w.FIELDS}})
        with self.assertRaisesRegex(ValueError, 'already accepted by another decision'): self.step()
        self.assertIsNone(self.s.saved_receipt(self.decisions[1], self.w))

    def test_release_failure_after_receipt_then_unrelated_acceptance_can_resume(self):
        self.first(); original = self.a.immutable_directory; failed = [False]
        def interrupt(target, files, w):
            if target.name == self.decisions[1]['releaseId'] and not failed[0]:
                failed[0] = True; raise RuntimeError('isolated release creation failed')
            return original(target, files, w)
        with patch.object(self.a, 'immutable_directory', side_effect=interrupt):
            with self.assertRaisesRegex(RuntimeError, 'release creation failed'): self.step()
        hashes = self.effect_hashes(self.decisions[1])
        record = {**self.groups[0]['entities'][0], 'id': uid(100), 'name': 'Independent accepted person'}
        proposal = self.save('datasets/external/review/proposal.json', {'records': {'entities': [record]}})
        self.save('datasets/manga-collection/accepted-external/acceptance.json', {'status': 'accepted-for-release-preparation-only',
            'reviewer': 'ISOLATED EXTERNAL HUMAN', 'recordedAt': '2026-10-19T00:00:00+00:00', 'applyAuthorized': self.s.NO_APPLY,
            'referenceArtifacts': [self.w.reference(proposal)], 'scopeByClaim': [],
            'acceptedRecordIds': {f: [record['id']] if f == 'entities' else [] for f in self.w.FIELDS}})
        result = self.step()
        self.assertTrue(result['lastResult']['acceptanceReused'])
        self.assertEqual(self.effect_hashes(self.decisions[1]), hashes)
        self.assertIn(record['id'], [r['id'] for r in self.w.read(Path(result['lastResult']['releaseDirectory']) / 'data.json')['entities']])

    def test_acceptance_added_after_comparison_stops_then_rebuilds_on_next_attempt(self):
        self.first(); original = self.a.accept
        record = {**self.groups[0]['entities'][0], 'id': uid(101), 'name': 'Concurrent accepted person'}
        def other_acceptance(args, w):
            proposal = self.save('datasets/external/concurrent/proposal.json', {'records': {'entities': [record]}})
            self.save('datasets/manga-collection/accepted-concurrent/acceptance.json', {
                'status': 'accepted-for-release-preparation-only', 'reviewer': 'ISOLATED EXTERNAL HUMAN',
                'recordedAt': '2026-10-19T00:00:00+00:00', 'applyAuthorized': self.s.NO_APPLY,
                'referenceArtifacts': [self.w.reference(proposal)], 'scopeByClaim': [],
                'acceptedRecordIds': {f: [record['id']] if f == 'entities' else [] for f in self.w.FIELDS}})
            return original(args, w)
        with patch.object(self.a, 'accept', side_effect=other_acceptance):
            with self.assertRaisesRegex(ValueError, 'outside the reviewed comparison set'): self.step()
        self.assertIsNone(self.s.saved_receipt(self.decisions[1], self.w))
        result = self.step()
        self.assertEqual(result['completedDecisionId'], self.decisions[1]['decisionId'])
        fixture = self.w.read(Path(result['lastResult']['releaseDirectory']) / 'data.json')
        self.assertIn(record['id'], [r['id'] for r in fixture['entities']])

    def test_plan_failure_and_resume_never_reaccept_or_reuse_plan(self):
        self.first(); self.failure = 'plan'
        with self.assertRaisesRegex(RuntimeError, 'stage interrupted'): self.step()
        hashes = self.effect_hashes(self.decisions[1]); plans = self.calls.count('plan')
        self.step()
        self.assertGreater(self.calls.count('plan'), plans)
        self.assertEqual(self.effect_hashes(self.decisions[1]), hashes)

    def test_validation_failure_after_receipt_preserves_immutable_effect(self):
        self.first(); self.failure = 'post-receipt-validate'
        with self.assertRaisesRegex(RuntimeError, 'validation interrupted after receipt'): self.step()
        hashes = self.effect_hashes(self.decisions[1])
        self.step()
        self.assertEqual(self.effect_hashes(self.decisions[1]), hashes)

    def test_interruption_before_receipt_can_restart_without_partial_effect(self):
        self.first(); original = self.a.immutable_directory
        def interrupt(target, files, w):
            if target.name == 'accepted-group-2': raise RuntimeError('isolated before receipt')
            return original(target, files, w)
        with patch.object(self.a, 'immutable_directory', side_effect=interrupt):
            with self.assertRaisesRegex(RuntimeError, 'before receipt'): self.step()
        self.assertIsNone(self.s.saved_receipt(self.decisions[1], self.w))
        self.assertEqual(self.step()['completedDecisionId'], 'group-2')

    def test_completed_release_or_receipt_tampering_stops_sequence(self):
        self.first(); result = self.step()
        release = Path(result['lastResult']['releaseDirectory']) / 'data.json'
        release.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Reference hash mismatch'): self.step()

    def test_first_partial_preparation_is_not_taken_over(self):
        self.first(); target, _ = self.s.saved_receipt(self.decisions[0], self.w)
        self.w.gate.save(target / 'preparation.json', {'status': 'preparation-incomplete-not-applied'})
        calls = len(self.calls)
        self.assertEqual(self.step()['status'], 'waiting-existing-first-request')
        self.assertEqual(len(self.calls), calls)

    def test_first_report_old_absolute_path_is_portable_without_rewriting_receipt(self):
        self.first(); target, _ = self.s.saved_receipt(self.decisions[0], self.w)
        report = self.w.read(target / 'preparation.json')
        report['releaseDirectory'] = '/old/read-only/runtime/datasets/public-kg/releases/' + self.decisions[0]['releaseId']
        self.w.gate.save(target / 'preparation.json', report)
        before = self.effect_hashes(self.decisions[0])
        self.assertEqual(self.step()['completedDecisionId'], 'group-2')
        self.assertEqual(self.effect_hashes(self.decisions[0]), before)
        self.assertEqual(self.w.read(target / 'preparation.json'), report)

    def test_proof_changed_after_review_is_rejected_before_effect(self):
        self.first(); original = self.a.accept
        def changed(args, w):
            proof = w.read(args.continuation); proof['authority'] = 'forged'
            w.gate.save(args.continuation, proof)
            return original(args, w)
        with patch.object(self.a, 'accept', side_effect=changed):
            with self.assertRaisesRegex(ValueError, 'Continuation proof hash differs'): self.step()
        self.assertIsNone(self.s.saved_receipt(self.decisions[1], self.w))

    def test_register_change_and_public_revision_change_stop(self):
        self.first(); self.observed['revision'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'Public base/revision conflict'): self.step()
        self.observed['revision'] = 'isolated-revision'
        self.save(str(self.register_path.relative_to(self.root)), {**self.register, 'approvalId': 'mutated'})
        with self.assertRaisesRegex(ValueError, 'register hash differs'): self.step()

    def test_cli_marks_integrity_failure_for_human_without_retrying_transient_io(self):
        for error, blocked in [(ValueError('Approved target is held'), True), (ValueError('evidence ' * 1000), True), (KeyError('evidence'), True),
                               (OSError('interrupted I/O'), False), (subprocess.CalledProcessError(1, 'validate'), False)]:
            with self.subTest(error=error), patch.object(self.w, 'parser') as parser, patch.object(self.w, 'execute', side_effect=error):
                parser.return_value.parse_args.return_value = argparse.Namespace(command='accept-sequence')
                output = io.StringIO()
                with contextlib.redirect_stderr(output):
                    self.assertEqual(self.w.main(), 1)
                import json
                self.assertEqual(json.loads(output.getvalue()).get('humanReviewRequired', False), blocked)
                self.assertLess(len(output.getvalue()), 4000)


if __name__ == '__main__':
    unittest.main()
