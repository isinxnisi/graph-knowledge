"""Task2 isolated human inputs, actual existing validator, mocked read-only public observation/plan.

No original receipt/release is written. Separate CLI verification uses read-only local plan.
"""
import copy
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('acceptance_workflow_tests', ROOT / 'tests/test_collection_workflow.py')
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
w = fixtures.w
a = w.load('acceptance_under_test', ROOT / 'scripts/collection-acceptance.py')


class AcceptanceWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shared = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.shared.cleanup)
        root = Path(cls.shared.name)
        cls.public, cls.observed = fixtures.public_fixture()
        cls.observed.update(observation='live-readonly-backup', fixtureSha256=w.digest(cls.public), withdrawals=[],
                            references=[w.reference(ROOT / ('datasets/public-kg/releases/20261014-credits-001/' + n))
                                        for n in ['data.json', 'manifest.json']])
        cls.prior, refs = w.accepted_additions(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002', fixtures.R2_RECEIPTS)
        job = root / fixtures.JOB
        fixtures.tracked_frozen_job(job)
        outputs = w.review_job(job, cls.public, cls.observed, cls.prior, refs)
        cls.review, _ = w.write_review(root / 'reviews', outputs)
        cls.claims = outputs['decision-request.json']['groups']['normal']['recordIds']['claims']

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.decision_path = self.root / 'human.json'
        args = w.parser().parse_args(['decision-template', '--review', str(self.review), '--decision-id', 'isolated-human-test',
            '--release', 'isolated-release-test', '--output', str(self.decision_path), '--claim-id', self.claims[0]])
        w.execute(args)
        self.decision = w.read(self.decision_path)
        self.approve()
        self.node = w.node
        self.plans = 0

    def approve(self):
        self.decision['status'] = 'approved'
        self.decision['humanDecision'] = {'actorType': 'human', 'reviewer': '隔離試験用判断者（実運用承認ではない）',
            'decidedAt': datetime.now(timezone.utc).isoformat(), 'statement': '隔離試験だけの部分受入。実データの正式受入や公開applyは承認しない。'}
        w.gate.save(self.decision_path, self.decision)

    def args(self):
        return w.parser().parse_args(['accept-release', '--decision', str(self.decision_path),
            '--decision-sha', w.gate.file_hash(self.decision_path), '--acceptances', str(self.root / 'acceptances'),
            '--releases', str(self.root / 'releases')])

    def dispatch(self, args):
        self.assertEqual(args[0], 'scripts/public-kg.ts')
        self.assertIn(args[1], ['validate', 'plan'])
        if args[1] == 'plan':
            self.plans += 1
            return {'release': 'isolated-release-test', 'unchanged': False, 'added': ['isolated-node'], 'updated': [], 'relationshipsAdded': 1}
        return self.node(args)

    def run_accept(self, dispatch=None, observation=None):
        with patch.object(w, 'node', side_effect=dispatch or self.dispatch), \
             patch.object(w, 'public_snapshot', side_effect=observation or (lambda: (copy.deepcopy(self.public), copy.deepcopy(self.observed)))):
            return w.execute(self.args())

    def assert_no_receipt(self):
        self.assertFalse(list((self.root / 'acceptances').glob('accepted-*/acceptance.json')))

    def test_partial_acceptance_and_idempotent_repeat_preserve_all_original_records(self):
        first = self.run_accept()
        receipt = Path(first['acceptance'])
        before = {n: (receipt.parent / n).read_bytes() for n in ['acceptance.json', 'decision.json', 'accepted-records.json', 'acceptance-manifest.json']}
        release = Path(first['releaseDirectory'])
        inventory = w.gate.inventory(release)
        second = self.run_accept()
        self.assertEqual(before, {n: (receipt.parent / n).read_bytes() for n in before})
        self.assertEqual(inventory, w.gate.inventory(release))
        self.assertEqual(first['acceptedCounts']['claims'], 1)
        self.assertEqual(first['releaseAdditions']['claims'], 10)  # nine existing r0002 + one explicit decision
        self.assertEqual(second['recordedAt'], first['recordedAt'])
        self.assertTrue(second['acceptanceReused'] and second['releaseUnchanged'] and second['validationReused'])
        self.assertEqual(self.plans, 2)  # Cached validation cannot authorize reuse of an old plan.
        self.assertEqual(first['publicBeforePlan'], first['publicAfterPlan'])
        self.assertFalse(first['publicApply'])
        self.assertEqual(len(first['notAcceptedRecordIds']['claims']), 24)
        data = w.index(w.read(release / 'data.json'))
        manifest = w.read(release / 'manifest.json')
        prior_manifest = w.read(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002/manifest.json')
        self.assertTrue(all(r in manifest['claimOrigins'] for r in prior_manifest['claimOrigins']))
        for f, rows in w.index(self.public).items():
            self.assertTrue(all(data[f][i] == r for i, r in rows.items()))
        additions, _ = w.accepted_additions(release, [*fixtures.R2_RECEIPTS, receipt])
        self.assertEqual(len(additions['claims']), 10)  # Task1 can verify/reuse this new receipt format.
        if first['explorationPaths']:
            self.assertTrue(all(p['state'] == 'formally-accepted-not-applied' for p in first['explorationPaths']))

    def test_unsigned_recommendation_or_group_does_not_authorize_acceptance(self):
        for edit in [lambda d: d.update(status='draft-not-approved'),
                     lambda d: d['humanDecision'].update(reviewer=None),
                     lambda d: d['humanDecision'].update(actorType='ai'),
                     lambda d: d['humanDecision'].update(statement=''),
                     lambda d: d.update(acceptedRecordIds={'group': 'normal'}),
                     lambda d: d.update(applyAuthorized={'local': True, 'beta': False, 'vps': False})]:
            with self.subTest(edit=edit):
                changed = copy.deepcopy(self.decision); edit(changed); w.gate.save(self.decision_path, changed)
                with self.assertRaises((ValueError, TypeError)):
                    self.run_accept()
                self.assert_no_receipt()
        w.gate.save(self.decision_path, self.decision)

    def test_identity_only_decision_never_accepts_held_production_relations(self):
        other = self.root / 'identity-human.json'
        args = w.parser().parse_args(['decision-template', '--review', str(self.review), '--group', 'identity-only',
            '--decision-id', 'isolated-identity-test', '--release', 'isolated-identity-release', '--output', str(other)])
        w.execute(args)
        self.decision_path = other
        self.decision = w.read(other)
        self.approve()
        result = self.run_accept()
        self.assertEqual(result['acceptedCounts'], dict(entities=4, claims=0, sources=0, citations=0))
        self.assertEqual(result['releaseAdditions']['claims'], 9)
        self.assertEqual(len(result['heldClaimIds']), 3)
        self.assertEqual(result['explorationPaths'], [])

    def test_human_hash_and_artifact_and_scope_and_target_tampering_rejected(self):
        args = self.args(); args.decision_sha = '0' * 64
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            w.execute(args)
        for field, mutate in [
            ('reference', lambda d: d['referenceArtifacts'][0].update(sha256='0' * 64)),
            ('scope', lambda d: d['scopeByClaim'][0]['contribution'].update(scope=None)),
            ('body', lambda d: d['recordSha256']['claims'].update({self.claims[0]: '0' * 64})),
            ('unknown-target', lambda d: d['acceptedRecordIds']['claims'].append('00000000-0000-4000-8000-000000000000'))]:
            with self.subTest(field=field):
                changed = copy.deepcopy(self.decision); mutate(changed); w.gate.save(self.decision_path, changed)
                with self.assertRaises(ValueError):
                    self.run_accept()
                self.assert_no_receipt()

    def test_missing_explicit_dependency_is_not_implicitly_accepted(self):
        self.decision['acceptedRecordIds']['entities'] = []
        self.decision['recordSha256']['entities'] = {}
        w.gate.save(self.decision_path, self.decision)
        with self.assertRaisesRegex(ValueError, 'endpoint dependency'):
            self.run_accept()
        self.assert_no_receipt()

    def test_missing_evidence_not_implicitly_accepted(self):
        self.decision['acceptedRecordIds']['citations'] = []
        self.decision['recordSha256']['citations'] = {}
        w.gate.save(self.decision_path, self.decision)
        with self.assertRaisesRegex(ValueError, 'supporting Citation'):
            self.run_accept()
        self.assert_no_receipt()

    def test_validation_failure_resumes_without_replacing_human_receipt(self):
        validates = 0
        def fail(args):
            nonlocal validates
            if args[1] == 'validate':
                validates += 1
                # prior_accepted invokes existing validate as well; fail only the persisted new release.
                if args[2] == str(self.root / 'releases/isolated-release-test'):
                    raise ValueError('isolated validator interruption')
            return self.dispatch(args)
        with self.assertRaisesRegex(ValueError, 'validator interruption'):
            self.run_accept(fail)
        receipt = self.root / 'acceptances/accepted-isolated-human-test/acceptance.json'
        before = receipt.read_bytes()
        self.assertEqual(w.read(receipt.parent / 'preparation.json')['status'], 'preparation-incomplete-not-applied')
        result = self.run_accept()
        self.assertEqual(receipt.read_bytes(), before)
        self.assertTrue(result['acceptanceReused'] and result['releaseUnchanged'])

    def test_plan_failure_reuses_saved_validation_but_never_reuses_plan(self):
        def fail(args):
            if args[1] == 'plan':
                raise ValueError('isolated plan interruption')
            return self.dispatch(args)
        with self.assertRaisesRegex(ValueError, 'plan interruption'):
            self.run_accept(fail)
        result = self.run_accept()
        self.assertTrue(result['validationReused'] and result['acceptanceReused'])
        self.assertEqual(self.plans, 1)

    def test_base_or_revision_conflict_before_receipt_and_during_plan(self):
        for field in ['release', 'revision']:
            changed = {**self.observed, field: 'changed'}
            with self.assertRaisesRegex(ValueError, 'base/revision conflict'):
                self.run_accept(observation=lambda: (self.public, changed))
            self.assert_no_receipt()
        n = 0
        def race():
            nonlocal n
            n += 1
            return self.public, {**self.observed, 'revision': 'changed'} if n == 4 else self.observed
        with self.assertRaisesRegex(ValueError, 'base/revision conflict'):
            self.run_accept(observation=race)
        self.assertEqual(self.plans, 1)
        self.assertEqual(w.read(self.root / 'acceptances/accepted-isolated-human-test/preparation.json')['status'], 'preparation-incomplete-not-applied')

    def test_same_decision_id_changed_human_statement_or_release_refuses_rebinding(self):
        first = self.run_accept()
        self.decision['humanDecision']['statement'] += ' changed'
        w.gate.save(self.decision_path, self.decision)
        with self.assertRaisesRegex(ValueError, 'acceptance inventory/hash differs|Existing acceptance differs'):
            self.run_accept()
        self.decision['humanDecision']['statement'] = w.read(Path(first['acceptance']).parent / 'decision.json')['humanDecision']['statement']
        w.gate.save(self.decision_path, self.decision)
        release = Path(first['releaseDirectory'])
        (release / 'manifest.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'immutable release differs'):
            self.run_accept()

    def test_saved_recording_time_tamper_is_rejected_even_before_release_creation(self):
        real_writer = a.immutable_directory
        def interrupt(target, files, api):
            if target.parent == self.root / 'releases':
                raise OSError('isolated interruption before release creation')
            return real_writer(target, files, api)
        # execute loads the helper dynamically; test the same accept entry with its root lock directly.
        with patch.object(a, 'immutable_directory', side_effect=interrupt), patch.object(w, 'node', side_effect=self.dispatch), \
             patch.object(w, 'public_snapshot', return_value=(self.public, self.observed)):
            with self.assertRaisesRegex(OSError, 'before release creation'):
                a.execute(self.args(), w)
        receipt = self.root / 'acceptances/accepted-isolated-human-test/acceptance.json'
        saved = w.read(receipt); saved['recordedAt'] = '2020-01-01T00:00:00+00:00'; w.gate.save(receipt, saved)
        with self.assertRaisesRegex(ValueError, 'acceptance inventory/hash differs'):
            self.run_accept()

    def test_release_id_collision_is_rejected_before_persisting_a_new_receipt(self):
        path = self.root / 'releases/isolated-release-test'
        w.gate.save(path / 'manifest.json', {'another': 'immutable release'})
        before = w.gate.inventory(path)
        with self.assertRaisesRegex(ValueError, 'immutable release differs'):
            self.run_accept()
        self.assert_no_receipt()
        self.assertEqual(w.gate.inventory(path), before)

    def test_output_inside_frozen_review_or_job_is_rejected_before_any_write(self):
        context = w.read(self.review / 'context.json')
        job = Path(context['jobDirectory'])
        before_review, before_job = w.gate.inventory(self.review), w.gate.inventory(job)
        args = w.parser().parse_args(['decision-template', '--review', str(self.review), '--decision-id', 'bad-output-test',
            '--release', 'bad-output-release', '--output', str(self.review / 'human.json')])
        with self.assertRaisesRegex(ValueError, 'overlaps frozen'):
            w.execute(args)
        args = self.args(); args.acceptances = job / 'artifacts'
        with self.assertRaisesRegex(ValueError, 'overlaps frozen'):
            w.execute(args)
        self.assertEqual(w.gate.inventory(self.review), before_review)
        self.assertEqual(w.gate.inventory(job), before_job)  # Not even a .lock was created in the original job.

    def test_accepted_candidate_already_in_new_public_base_is_reused_without_readdition(self):
        # Hypothetical later public observation; use files only, never apply it to a KG.
        path = ROOT / 'datasets/public-kg/releases/20261017-manga-r0003-001'
        receipts = [*fixtures.R2_RECEIPTS, ROOT / 'datasets/manga-collection/accepted-r0003-20261017/acceptance.json']
        accepted, refs = w.accepted_additions(path, receipts)
        context = {'acceptedReferences': refs, 'public': {'release': path.name}}
        prior, _, _, manifest = a.prior_accepted(context, w)
        self.assertEqual(prior, accepted)
        self.assertEqual(manifest['release'], path.name)
        public = w.read(path / 'data.json')
        merged, _ = a.merge(public, prior, {f: [] for f in w.FIELDS}, w)
        self.assertEqual(merged, public)

    def test_unreviewed_acceptance_set_change_is_not_omitted(self):
        w.gate.save(self.root / 'acceptances/accepted-other/acceptance.json', {'status': 'placeholder'})
        with self.assertRaisesRegex(ValueError, 'outside the reviewed comparison set'):
            self.run_accept()
        self.assertFalse((self.root / 'acceptances/accepted-isolated-human-test/acceptance.json').exists())

    def test_uuid_external_identity_semantic_source_and_citation_collisions(self):
        _, _, records, _ = a.bundle(self.review, w)
        selected = a.selection(self.decision['acceptedRecordIds'], records, w)
        for field, mutate, message in [
            ('entities', lambda r: r.update(id=self.public['entities'][0]['id']), 'UUID'),
            ('entities', lambda r: r.update(externalIds=next(e['externalIds'] for e in self.public['entities'] if e['externalIds'])), 'ExternalIdentifier'),
            ('entities', lambda r: r.update(name=next(e['name'] for e in self.public['entities'] if e['kind'] == r['kind'])), 'identity'),
            ('claims', lambda r: r.update(id=self.public['claims'][0]['id']), 'UUID'),
            ('sources', lambda r: r.update(url=next(s['url'] for s in self.public['sources'] if s['url'])), 'Source URL'),
        ]:
            changed = copy.deepcopy(selected); mutate(changed[field][0])
            with self.subTest(field=field, message=message), self.assertRaisesRegex(ValueError, message):
                a.merge(self.public, self.prior, changed, w)
        changed = copy.deepcopy(selected)
        duplicate = copy.deepcopy(changed['claims'][0]); duplicate['id'] = '00000000-0000-4000-8000-000000000000'
        changed['claims'].append(duplicate)
        with self.assertRaisesRegex(ValueError, 'Duplicate Claim meaning'):
            a.merge(self.public, self.prior, changed, w)
        changed = copy.deepcopy(selected)
        duplicate = copy.deepcopy(changed['citations'][0]); duplicate['id'] = '00000000-0000-4000-8000-000000000001'
        changed['citations'].append(duplicate)
        with self.assertRaisesRegex(ValueError, 'Duplicate Claim/Source Citation'):
            a.merge(self.public, self.prior, changed, w)


if __name__ == '__main__':
    unittest.main()
