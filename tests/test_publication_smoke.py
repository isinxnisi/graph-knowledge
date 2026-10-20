import copy
import importlib.util
from pathlib import Path
import unittest
from urllib.parse import urlparse, parse_qs

spec = importlib.util.spec_from_file_location('publication_smoke', Path(__file__).resolve().parents[1] / 'scripts/verify-publication.py')
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)


class PublicationSmokeTests(unittest.TestCase):
    def setUp(self):
        self.row = {'claimId': 'claim', 'subjectId': 'person', 'subject': 'Creator', 'objectId': 'work', 'object': 'Work',
            'predicate': 'CONTRIBUTED_TO', 'polarity': 'affirmed', 'period': {'from': None, 'to': None},
            'contribution': {'roleId': 'ORIGINAL_STORY', 'scope': {'isbn13': '9784088733708'}},
            'citations': [{'id': 'citation', 'claimId': 'claim', 'sourceId': 'source', 'stance': 'support'}],
            'sources': [{'id': 'source', 'title': 'Original bibliography'}]}
        self.mode = None; self.datasets = 0

    def get(self, path):
        parsed = urlparse(path); query = parse_qs(parsed.query)
        if parsed.path == '/api/dataset':
            self.datasets += 1
            return {'dataset': 'public-kg', 'revision': 'changed' if self.mode == 'changed-revision' and self.datasets > 1 else 'revision'}
        if parsed.path == '/api/entities':
            assert int(query['limit'][0]) <= 20
            return {'items': [{'id': 'person'}, {'id': 'work'}]}
        if '/api/claims/' in path:
            claim = {k: copy.deepcopy(value) for k, value in self.row.items() if k in ['subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution']}
            claim.update(id='claim', citations=[{'id': 'citation', 'stance': 'support', 'source': copy.deepcopy(self.row['sources'][0])}])
            if self.mode == 'scope': claim['contribution']['scope']['isbn13'] = 'changed'
            if self.mode == 'source': claim['citations'][0]['source']['title'] = 'Different evidence'
            return {'revision': 'revision', 'claim': claim}
        if '/neighbors' in path:
            if not query.get('after'): return {'revision': 'revision', 'claims': [], 'nodes': [], 'page': {'hasMore': True, 'nextCursor': 'next'}}
            return {'revision': 'revision', 'claims': [] if self.mode == 'missing-graph' else [{'id': 'claim'}],
                'nodes': [{'id': 'work'}], 'page': {'hasMore': False, 'nextCursor': None}}
        raise AssertionError(path)

    def test_api_name_graph_pagination_and_evidence(self):
        result = v.verify([self.row], 'revision', self.get)
        self.assertTrue(result['readOnly']); self.assertTrue(result['manualUiCheckStillRequired'])
        self.assertEqual(result['verified'][0]['graphPages'], 2)

    def test_changed_isbn_scope_fails(self):
        self.mode = 'scope'
        with self.assertRaisesRegex(AssertionError, 'Role/ISBN'): v.verify([self.row], 'revision', self.get)

    def test_changed_supporting_source_fails(self):
        self.mode = 'source'
        with self.assertRaisesRegex(AssertionError, 'Source evidence'): v.verify([self.row], 'revision', self.get)

    def test_missing_graph_claim_is_not_success(self):
        self.mode = 'missing-graph'
        with self.assertRaisesRegex(AssertionError, 'missing from Graph'): v.verify([self.row], 'revision', self.get)

    def test_publication_change_during_checks_fails(self):
        self.mode = 'changed-revision'
        with self.assertRaisesRegex(AssertionError, 'changed during'): v.verify([self.row], 'revision', self.get)

    def test_all_claims_checks_nonrepresentative_claims(self):
        second = copy.deepcopy(self.row); second['claimId'] = 'second'
        def get(path):
            if path.startswith('/api/claims/second'):
                result = self.get('/api/claims/claim'); result['claim']['id'] = 'second'
                result['claim']['contribution']['scope']['isbn13'] = 'changed'
                return result
            return self.get(path)
        self.assertEqual(len(v.verify([self.row, second], 'revision', get)['verified']), 1)
        with self.assertRaisesRegex(AssertionError, 'Role/ISBN'):
            v.verify([self.row, second], 'revision', get, all_claims=True)
