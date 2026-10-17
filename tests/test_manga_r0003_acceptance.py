"""Formal receipt selection, immutable history and distinct publication scopes; no DB writes."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('accepted_manga', ROOT / 'scripts/prepare-manga-release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class MangaR0003Acceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = r.build_r0003()
        cls.fixture = json.loads(cls.output[ROOT / r.R3_OUTPUT / 'data.json'])
        cls.manifest = json.loads(cls.output[ROOT / r.R3_OUTPUT / 'manifest.json'])
        cls.receipt = r.read_json(ROOT, r.R3_ACCEPTANCE)
        cls.proposal = r.read_json(ROOT, r.R3_REVIEW + '/proposed-records.json')

    def reject_receipt(self, mutate, message):
        changed = copy.deepcopy(self.receipt)
        mutate(changed)
        original = r.read_json
        with patch.object(r, 'read_json', side_effect=lambda root, path: changed if path == r.R3_ACCEPTANCE else original(root, path)):
            with self.assertRaisesRegex(ValueError, message):
                r.build_r0003()

    def test_full_accepted_selection_preserves_old_records_and_has_no_duplicate_ids(self):
        base = r.read_json(ROOT, r.BASE + '/data.json')
        old = r.read_json(ROOT, r.COMBINED_OUTPUT + '/data.json')
        self.assertEqual({k: len(self.fixture[k]) - len(base[k]) for k in ['entities', 'claims', 'sources', 'citations']},
                         dict(entities=52, claims=40, sources=33, citations=41))
        for field in ['entities', 'claims', 'sources', 'citations']:
            current = {v['id']: v for v in self.fixture[field]}
            self.assertEqual(len(current), len(self.fixture[field]))
            self.assertTrue(all(current[v['id']] == v for v in old[field]))
            self.assertEqual(set(current) - {v['id'] for v in old[field]}, set(self.receipt['acceptedRecordIds'][field]))
        self.assertEqual(self.manifest['baseRelease'], '20261014-credits-001')
        self.assertEqual(self.manifest.get('withdrawals'), r.read_json(ROOT, r.BASE + '/manifest.json').get('withdrawals'))
        self.assertEqual(len({v['claimId'] for v in self.manifest['claimOrigins']}), len(self.fixture['claims']))

    def test_scope_and_raw_wording_survive_formal_acceptance(self):
        claims = {c['id']: c for c in self.fixture['claims']}
        for c in self.proposal['records']['claims']:
            expected = dict(c, visibility='published')
            self.assertEqual(claims[c['id']], expected)
        entities = {e['id']: e for e in self.fixture['entities']}
        self.assertNotIn('4e506b04-cc57-48e9-b502-0d89476bb5f4', entities)
        self.assertEqual(entities['290ab095-192d-4910-90f3-ae741f9d1f32']['externalIds'], [])
        rows = r.read_json(ROOT, r.R3_REVIEW + '/review.json')['claims']
        for row in rows:
            claim = claims[row['claimId']]
            if row['work'] == '【推しの子】':
                self.assertIsNone(claim['contribution']['scope'])
                self.assertEqual(claim['period'], {'from': None, 'to': None})
                self.assertTrue(row['originalTexts'][0].startswith('主に'))
            if row['person'] == '小畑健':
                self.assertEqual(claim['contribution']['roleId'], 'AUTHORSHIP')
            if row['work'] == '童夢':
                self.assertEqual(claim['contribution']['scope']['volumeLabel'], '全集第8巻（童夢）')
                self.assertEqual(len(row['citationIds']), 2)

    def test_only_recorded_source_status_notes_are_edited(self):
        sources = {s['id']: s for s in self.fixture['sources']}
        edits = {e['sourceId']: e for e in self.receipt['sourceEditorialChanges']}
        self.assertEqual(len(edits), 3)
        for source in self.proposal['records']['sources']:
            expected = dict(source)
            if source['id'] in edits:
                expected['note'] = edits[source['id']]['afterNote']
            self.assertEqual(sources[source['id']], expected)
        citations = {c['id']: c for c in self.fixture['citations']}
        self.assertTrue(all(citations[c['id']] == c for c in self.proposal['records']['citations']))

    def test_missing_human_decision_or_broader_authority_is_rejected(self):
        self.reject_receipt(lambda x: x.update(reviewer='Codex'), 'human acceptance')
        self.reject_receipt(lambda x: x['applyAuthorized'].update(local=True), 'No public apply')
        self.reject_receipt(lambda x: x.update(acceptedGroup='normal'), 'approved full group')
        self.reject_receipt(lambda x: x.update(recordedAt='2026-10-17T20:20:00+09:00'), 'recording time')
        self.reject_receipt(lambda x: x.update(referenceArtifacts=[]), 'Missing or duplicate')

    def test_target_scope_and_identity_mapping_cannot_expand(self):
        self.reject_receipt(lambda x: x['acceptedRecordIds']['entities'].append('3d279a30-0131-4b37-9429-9a39e8027e05'), 'UUIDs or Claim meaning')
        self.reject_receipt(lambda x: x['scopeByClaim'][0]['contribution'].update(roleId='SCRIPT_WRITING'), 'UUIDs or Claim meaning')
        self.reject_receipt(lambda x: x['entityMappings'][0].update(attachExternalIdentifier=True), 'identity/origin mapping')
        self.reject_receipt(lambda x: x['sourceEditorialChanges'][0].update(afterNote='根拠の意味を変更'), 'status notes')

    def test_reproduction_keeps_historical_review_hidden_and_prevents_overwrite(self):
        self.assertEqual(self.output, r.build_r0003())
        self.assertTrue(all(c['visibility'] == 'hidden' for c in self.proposal['records']['claims']))
        p = subprocess.run(['python3', 'scripts/prepare-manga-r0003-review.py'], cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn('Accepted review artifacts are immutable', p.stderr)


if __name__ == '__main__':
    unittest.main()
