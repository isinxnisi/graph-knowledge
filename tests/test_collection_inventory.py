"""Read-only reconciliation, authority separation, stable replay and protected inputs."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


w = module('inventory_test_workflow', 'scripts/collection-workflow.py')
i = module('inventory_test_module', 'scripts/collection-inventory.py')


def records():
    return {'entities': [{'id': 'person', 'name': '人物', 'kind': 'person'}, {'id': 'work', 'name': '作品', 'kind': 'work'}],
        'claims': [{'id': 'claim', 'subjectId': 'person', 'objectId': 'work', 'predicate': 'CONTRIBUTED_TO',
            'polarity': 'affirmed', 'period': {'from': None, 'to': None}, 'visibility': 'hidden',
            'contribution': {'roleId': 'AUTHORSHIP', 'scope': {'kind': 'publication', 'isbn13': '9784091252012'}}}],
        'sources': [{'id': 'source', 'title': '書誌', 'url': 'https://example.com/book'}],
        'citations': [{'id': 'citation', 'claimId': 'claim', 'sourceId': 'source', 'stance': 'support',
                      'roleEvidence': {'originalText': '人物 著', 'language': 'ja'}}]}


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.backup = self.save('backup.json', {})
        self.context = {'backupPath': self.backup, 'release': 'base', 'revision': 'revision', 'observedAt': '2026-10-01T00:00:00Z',
                        'fixtureSha256': 'hash', 'observation': 'supplied-backup-not-a-live-check', 'controlCommit': 'a' * 40}
        self.empty = {f: [] for f in w.FIELDS}
        self.inv = i.Inventory(w, [('test', self.root)], self.empty, self.context)

    def save(self, file, value):
        path = self.root / file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(w.dump(value), encoding='utf-8')
        return path

    def reference(self, path):
        return {'file': str(path.relative_to(self.root)), 'sha256': w.gate.file_hash(path)}

    def receipt(self):
        data = records()
        proposals = self.save('proposals.json', {'records': data})
        receipt = {'status': 'accepted-for-release-preparation-only', 'reviewer': '人間', 'recordedAt': '2026-10-01T00:00:00Z',
            'applyAuthorized': i.NO_APPLY, 'referenceArtifacts': [self.reference(proposals)],
            'acceptedRecordIds': {f: [r['id'] for r in data[f]] for f in w.FIELDS},
            'scopeByClaim': [{'id': c['id'], **w.semantic(c)} for c in data['claims']]}
        return self.save('datasets/manga-collection/accepted-one/acceptance.json', receipt)

    def review_decision(self):
        data = records()
        base = 'datasets/manga-collection/workflow-reviews/review/'
        context = {'jobId': 'job', 'public': {'release': 'base', 'revision': 'revision'}, 'acceptedReferences': []}
        files = {'context.json': context, 'proposed-records.json': {'records': data},
                 'identity-only-records.json': {'records': self.empty},
                 'review.json': {'recordConflicts': []},
                 'decision-request.json': {'status': 'pending-human-decision', 'heldEntityIds': [], 'heldClaimIds': [],
                    'groups': {'normal': {'recordIds': {f: [r['id'] for r in data[f]] for f in w.FIELDS}}}}}
        refs = []
        for name, value in files.items():
            refs.append(self.reference(self.save(base + name, value)))
        manifest = self.save(base + 'review-manifest.json', {'inputSha256': w.digest(context), 'schemaVersion': 1,
            'authority': 'pending-human-review-only',
            'artifacts': {Path(r['file']).name: r['sha256'] for r in refs}})
        refs.append(self.reference(manifest))
        return {'status': 'approved', 'decisionId': 'decision',
            'approvalScope': 'formal-record-acceptance-and-release-preparation-only', 'applyAuthorized': i.NO_APPLY,
            'humanDecision': {'actorType': 'human', 'reviewer': '運営者', 'statement': '明示受入判断', 'decidedAt': '2026-10-01T00:00:00Z'},
            'review': self.reference(manifest), 'referenceArtifacts': sorted(refs, key=lambda r: r['file']),
            'acceptedRecordIds': {f: [r['id'] for r in data[f]] for f in w.FIELDS},
            'recordSha256': {f: {r['id']: w.digest(r) for r in data[f]} for f in w.FIELDS},
            'scopeByClaim': [{'id': c['id'], **w.semantic(c)} for c in data['claims']],
            'baseRelease': 'base', 'baseRevision': 'revision'}

    def test_saved_receipt_is_formal_without_release_and_duplicate_copies_count_once(self):
        receipt = self.receipt()
        self.save('copy/datasets/manga-collection/accepted-one/acceptance.json', w.read(receipt))
        self.inv.roots.append(('copy', self.root / 'copy'))
        self.inv.formal_receipts()
        report = self.inv.finish()
        self.assertEqual(report['counts']['formally-accepted-unapplied'], {'entities': 2, 'claims': 1, 'sources': 1, 'citations': 1})
        self.assertEqual(len(report['receipts']), 1)
        self.assertEqual(report['releasePreparedCounts']['claims'], 0)

    def test_changed_reference_does_not_promote_receipt(self):
        self.receipt()
        self.save('proposals.json', {'records': self.empty})
        self.inv.formal_receipts()
        self.assertEqual(len(self.inv.receipts), 0)
        self.assertEqual(self.inv.issues[0]['kind'], 'invalid-formal-receipt')

    def test_invalid_receipt_does_not_leave_partial_identity_mapping(self):
        path = self.receipt()
        receipt = w.read(path)
        receipt['entityMappings'] = [{'sourceEntityId': 'old-person', 'existingEntityId': 'person'},
                                     {'sourceEntityId': 'other', 'existingEntityId': 'missing'}]
        self.save(str(path.relative_to(self.root)), receipt)
        self.inv.formal_receipts()
        self.assertEqual(self.inv.aliases['entities'], {})
        self.assertEqual(self.inv.rows, {})
        self.assertEqual(self.inv.receipts, [])

    def test_approval_is_pending_and_never_formal(self):
        decision = self.review_decision()
        path = self.save('decision.json', decision)
        self.inv.decision(decision, self.root, path, 'human-approval')
        report = self.inv.finish()
        self.assertEqual(report['counts']['human-approved-pending-execution']['claims'], 1)
        self.assertEqual(report['counts']['formally-accepted-unapplied']['claims'], 0)
        self.assertFalse(report['sideEffects']['formalAcceptance'])

    def test_body_scope_evidence_and_base_tampering_fail_closed(self):
        original = self.review_decision()
        for mutate in [lambda d: d['recordSha256']['claims'].update(claim='wrong'),
                       lambda d: d['scopeByClaim'][0]['contribution'].update(roleId='DRAWING'),
                       lambda d: d['referenceArtifacts'].pop(),
                       lambda d: d.update(baseRevision='new-revision'),
                       lambda d: d['humanDecision'].update(actorType='ai')]:
            with self.subTest(mutate=mutate):
                decision = copy.deepcopy(original)
                mutate(decision)
                path = self.save('decision.json', decision)
                with self.assertRaises(ValueError):
                    self.inv.decision(decision, self.root, path, 'human-approval')
                self.assertEqual(self.inv.rows, {})

    def test_candidate_and_failed_history_do_not_demote_formal_or_published(self):
        self.receipt()
        self.inv.formal_receipts()
        public = copy.deepcopy(records())
        public['claims'][0]['visibility'] = 'published'
        self.inv.public = w.index(public)
        path = self.save('candidate.json', {'records': records()})
        for f in w.FIELDS:
            for r in records()[f]:
                self.inv.add(f, r, path, 'raw-candidate')
        report = self.inv.finish()
        self.assertEqual(report['counts']['published']['claims'], 1)
        self.assertEqual(report['counts']['formally-accepted-unapplied']['claims'], 0)
        self.assertEqual(len(report['records']), 5)

    def test_different_isbn_and_unmapped_uuid_remain_separate(self):
        path = self.save('candidate.json', {})
        a = records()['claims'][0]
        b = copy.deepcopy(a); b['id'] = 'another-claim'; b['contribution']['scope']['isbn13'] = '9784091231512'
        self.inv.add('claims', a, path, 'candidate')
        self.inv.add('claims', b, path, 'candidate')
        self.assertEqual(len(self.inv.rows), 2)

    def test_held_claim_propagates_to_citation_and_source(self):
        path = self.save('candidate.json', {})
        for f in w.FIELDS:
            for r in records()[f]:
                row = self.inv.add(f, r, path, 'raw-candidate')
                if f == 'claims':
                    row['holds'].append({'reasons': ['identity-held']})
        report = self.inv.finish()
        self.assertEqual(report['counts']['held']['citations'], 1)
        self.assertEqual(report['counts']['held']['sources'], 1)

    def test_explicit_mapping_folds_only_identical_citation_after_claim_mapping(self):
        self.receipt()
        self.inv.formal_receipts()
        self.inv.aliases['claims']['raw-claim'] = 'claim'
        c = copy.deepcopy(records()['citations'][0]); c.update(id='raw-citation', claimId='raw-claim')
        self.save('datasets/manga-collection/raw/candidate-records.json', {'records': {'citations': [c]}})
        self.inv.candidates()
        report = self.inv.finish()
        self.assertEqual(report['counts']['formally-accepted-unapplied']['citations'], 1)
        self.assertEqual(report['counts']['candidate']['citations'], 0)
        self.assertEqual(report['derivedCitationMappings'][0]['sourceCitationId'], 'raw-citation')

    def test_readset_detects_input_changed_during_inventory(self):
        path = self.save('read.json', {'version': 1})
        self.inv.read(path)
        self.save('read.json', {'version': 2})
        with self.assertRaisesRegex(ValueError, 'Input changed'):
            self.inv.finish()

    def test_withdrawn_public_claim_does_not_become_unapplied_acceptance(self):
        self.receipt()
        self.inv.formal_receipts()
        self.inv.public = w.index(records())
        report = self.inv.finish()
        self.assertEqual(report['counts']['held']['claims'], 1)
        self.assertEqual(report['counts']['formally-accepted-unapplied']['claims'], 0)

    def test_same_uuid_different_candidate_content_is_held(self):
        path = self.save('candidate.json', {})
        a = records()['entities'][0]
        self.inv.add('entities', a, path, 'candidate')
        self.inv.add('entities', {**a, 'name': '別名義'}, path, 'candidate')
        report = self.inv.finish()
        self.assertEqual(report['counts']['held']['entities'], 1)

    def test_bad_register_union_does_not_leave_partial_approval(self):
        decision = self.review_decision()
        envelope = {'id': 'batch', 'parentRequestId': 'parent', 'decision': decision}
        register = {'status': 'approved-by-human-pending-sequential-worker-processing',
            'scope': 'formal-record-acceptance-and-release-preparation-only', 'applyAuthorized': i.NO_APPLY,
            'approvalId': 'register', 'humanDecision': decision['humanDecision'],
            'batchDecisions': [{'envelope': envelope}], 'approvedRecordIds': {**decision['acceptedRecordIds'], 'claims': []}}
        self.save('collection-control/approval-registers/register.json', register)
        self.inv.control(self.root / 'collection-control')
        self.assertEqual(self.inv.rows, {})
        self.assertEqual(self.inv.issues[0]['kind'], 'invalid-approval-register')
        self.assertIn('Register union differs', self.inv.issues[0]['reason'])

    def test_different_citation_evidence_is_not_folded(self):
        self.receipt()
        self.inv.formal_receipts()
        self.inv.aliases['claims']['raw-claim'] = 'claim'
        c = copy.deepcopy(records()['citations'][0]); c.update(id='raw-citation', claimId='raw-claim', stance='background')
        self.save('datasets/manga-collection/raw/candidate-records.json', {'records': {'citations': [c]}})
        self.inv.candidates()
        report = self.inv.finish()
        self.assertEqual(report['derivedCitationMappings'], [])
        self.assertEqual(report['counts']['candidate']['citations'], 1)

    def test_fixed_inputs_generate_identical_json_and_markdown(self):
        def generate():
            inv = i.Inventory(w, [('test', self.root)], self.empty, self.context)
            inv.formal_receipts()
            return inv.finish()
        self.receipt()
        first, second = generate(), generate()
        self.assertEqual(w.dump(first), w.dump(second))
        self.assertEqual(i.markdown(first), i.markdown(second))

    def test_protected_output_rejected_before_git_or_db_access(self):
        args = w.parser().parse_args(['inventory', '--control-git', '/tmp/mirror.git', '--control-ref', 'a' * 40,
            '--output', str(ROOT / 'datasets/manga-collection/forbidden')])
        with patch.object(i.subprocess, 'check_output', side_effect=AssertionError('No Git allowed')):
            with self.assertRaisesRegex(ValueError, 'overlaps protected input'):
                i.execute(args, w)


if __name__ == '__main__':
    unittest.main()
