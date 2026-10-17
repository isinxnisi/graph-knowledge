"""Review groups, exception semantics and preservation; no provider or DB calls."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('review_r0003', ROOT / 'scripts/prepare-manga-r0003-review.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class MangaReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = r.build()
        cls.proposal = json.loads(cls.outputs[ROOT / r.OUT / 'proposed-records.json'])
        cls.review = json.loads(cls.outputs[ROOT / r.OUT / 'review.json'])
        cls.accepted = r.read(ROOT, r.R2 + '/data.json')

    def test_every_normal_claim_and_entity_has_individual_checks_and_pending_decision(self):
        normal = [c for c in self.review['claims'] if c['group'] == 'normal']
        entities = [e for e in self.review['entities'] if e['inputPopulation'] == 'normal-36']
        self.assertEqual((len(normal), len(entities)), (25, 36))
        self.assertTrue(all(all(c['checks'].values()) and c['formalAcceptance'] == 'pending' for c in normal))
        self.assertTrue(all(all(e['checks'].values()) and e['recommendation'] == 'recommend-acceptance' for e in entities))
        self.assertEqual(self.proposal['humanReviewer'], None)
        self.assertTrue(all(c['visibility'] == 'hidden' for c in self.proposal['records']['claims']))

    def test_normal_batch_closure_does_not_publish_domus_identity_in_advance(self):
        values = r.subset(self.proposal, self.accepted, 'normal')
        self.assertEqual({f: len(v) for f, v in values.items()}, dict(entities=35, claims=25, sources=21, citations=25))
        self.assertNotIn(self.review['normalIdentityOnlyEntity'], {e['id'] for e in values['entities']})
        values = r.subset(self.proposal, self.accepted, 'core-with-resolved-exceptions')
        self.assertEqual({f: len(v) for f, v in values.items()}, dict(entities=36, claims=28, sources=24, citations=29))

    def test_pineapple_reuses_existing_uuid_and_keeps_both_isbn_scopes(self):
        old = r.read(ROOT, r.RUN + '/candidate-records.json')['records']
        for mapping in self.proposal['claimIdMappings']:
            claim = next(c for c in self.proposal['records']['claims'] if c['id'] == mapping['proposedClaimId'])
            source = next(c for c in old['claims'] if c['id'] == mapping['sourceClaimId'])
            self.assertNotEqual(claim['id'], source['id'])
            self.assertEqual(claim['objectId'], r.PINE_EXISTING)
            self.assertEqual(claim['contribution'], source['contribution'])
            self.assertEqual(claim['contribution']['scope']['isbn13'], '9784091810816')
        fixture, manifest = r.projection(ROOT, self.proposal, 'all-recommended')
        self.assertNotIn(r.PINE_COLLECTED, {e['id'] for e in fixture['entities']})
        self.assertEqual(next(e for e in fixture['entities'] if e['id'] == r.PINE_EXISTING)['externalIds'], [])
        existing_claims = [c for c in self.accepted['claims'] if c['objectId'] == r.PINE_EXISTING]
        current = {c['id']: c for c in fixture['claims']}
        self.assertTrue(all(current[c['id']] == c for c in existing_claims))
        self.assertTrue(all(c['contribution']['scope']['isbn13'] == '9784091921116' for c in existing_claims))
        self.assertEqual(manifest['baseRelease'], '20261014-credits-001')

    def test_domu_is_same_claim_with_collection_scope_and_additional_support(self):
        row = next(c for c in self.review['claims'] if c['work'] == '童夢')
        self.assertEqual(row['claimId'], row['sourceClaimId'])
        self.assertEqual(row['scope']['volumeLabel'], '全集第8巻（童夢）')
        self.assertEqual(row['scope']['isbn13'], '9784065262634')
        self.assertEqual(len(row['citationIds']), 2)
        evidence = r.read(ROOT, r.OUT + '/additional-evidence.json')
        self.assertEqual(evidence['domuNdlAdditionalFields']['fields'], {'alternative': ['童夢'], 'partTitles': ['童夢']})

    def test_manga_wording_is_not_replaced_and_independent_author_credit_has_same_isbn(self):
        row = next(c for c in self.review['claims'] if c['person'] == '小畑健')
        self.assertEqual(row['roleId'], 'AUTHORSHIP')
        self.assertEqual(row['scope']['isbn13'], '9784086196901')
        self.assertEqual(row['originalTexts'], ['著者：小畑 健'])
        self.assertTrue(any(h['rawResponsibility'] == '小畑健 漫画' for h in self.review['inheritedHolds']))
        self.assertFalse(any(c['person'] == '小畑健' and c['roleId'] == 'DRAWING' for c in self.review['claims']))

    def test_oshi_credits_preserve_mostly_and_never_borrow_first_volume_isbn_or_article_date(self):
        rows = [c for c in self.review['claims'] if c['work'] == '【推しの子】']
        self.assertEqual({(c['person'], c['roleId']) for c in rows}, {('赤坂アカ', 'ORIGINAL_STORY'), ('横槍メンゴ', 'DRAWING')})
        for row in rows:
            self.assertIsNone(row['scope'])
            self.assertTrue(row['originalTexts'][0].startswith('主に'))
            claim = next(c for c in self.proposal['records']['claims'] if c['id'] == row['claimId'])
            self.assertEqual(claim['period'], {'from': None, 'to': None})

    def test_full_integration_preserves_base_and_accepted_r0002_exactly_without_duplicate_reacceptance(self):
        values = r.subset(self.proposal, self.accepted, 'all-recommended')
        self.assertEqual({f: len(v) for f, v in values.items()}, dict(entities=39, claims=31, sources=26, citations=32))
        fixture, _ = r.projection(ROOT, self.proposal, 'all-recommended')
        for field in r.FIELDS:
            current = {v['id']: v for v in fixture[field]}
            self.assertTrue(all(current[v['id']] == v for v in self.accepted[field]))
        self.assertEqual(len(self.proposal['reusedR0002EntityIds']), 3)
        self.assertFalse(set(self.proposal['reusedR0002EntityIds']) & {e['id'] for e in values['entities']})
        self.assertTrue(all(c['createdAt'].endswith('Z') and c['updatedAt'].endswith('Z') for c in values['claims']))
        interview = next(s for s in values['sources'] if s['url'] == 'https://shueisha.online/articles/-/21959')
        self.assertEqual(interview['publishedAt'], {'value': '2022-06-10', 'precision': 'day'})

    def test_mutated_proposal_or_frozen_input_fails_closed_and_output_is_reproducible(self):
        altered = copy.deepcopy(self.proposal)
        altered['records']['claims'][0]['contribution']['roleId'] = 'SCRIPT_WRITING'
        with self.assertRaisesRegex(ValueError, 'Reviewed proposal changed'):
            r.projection(ROOT, altered, 'all-recommended')
        altered = copy.deepcopy(self.proposal)
        altered['formalAcceptance'] = 'accepted'
        with self.assertRaisesRegex(ValueError, 'unaccepted'):
            r.subset(altered, self.accepted, 'normal')
        original_read = r.read
        def changed(root, path):
            value = original_read(root, path)
            if path == r.OUT + '/frozen-inputs.json':
                value['files'][0]['sha256'] = '0' * 64
            return value
        with patch.object(r, 'read', side_effect=changed):
            with self.assertRaisesRegex(ValueError, 'Frozen review input changed'):
                r.build()
        self.assertEqual(self.outputs, r.build())


if __name__ == '__main__':
    unittest.main()
