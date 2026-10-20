"""Offline planning checks; never invokes the collector, database, or provider APIs."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bridge_candidates', ROOT / 'scripts/collection-bridge-candidates.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class PlanningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = bridge.build(ROOT)

    def test_frozen_current_graph_and_all_18_groups(self):
        result = self.result
        self.assertEqual(result['currentGraph'], {'entityCount': 2175, 'eligibleClaimCount': 1894, 'componentCount': 312})
        self.assertEqual(len(result['original18']), 18)
        self.assertEqual(sum(bool(row['selectedThemes']) for row in result['original18']), 5)
        self.assertEqual(len(result['themes']), 4)

    def test_conditional_mergers_are_not_observed_results(self):
        effects = [row['conditionalEffect'] for row in self.result['themes']]
        self.assertEqual([row['conditionalComponentCount'] for row in effects], [311, 311, 312, 312])
        self.assertTrue(all(row['notObservedKG'] for row in effects))
        self.assertEqual([len(row['newUnconfirmedNodeKeys']) for row in effects], [0, 2, 1, 1])
        self.assertEqual(self.result['combinedConditionalEffect']['conditionalComponentCount'], 310)

    def test_single_hypothesis_and_joint_effect_differ(self):
        theme = self.result['themes'][1]
        self.assertEqual([row['conditionalComponentDelta'] for row in theme['singleHypothesisEffects']], [0, 1, 0])
        self.assertEqual(theme['conditionalEffect']['conditionalComponentDelta'], -1)
        self.assertEqual(theme['conditionalEffect']['mergedCurrentGroups'][0]['conditionalEntityCount'], 34)

    def test_star_branch_does_not_claim_three_hop_routes(self):
        theme = self.result['themes'][3]
        self.assertEqual([row['hops'] for row in theme['paths']], [2, 2, 2])
        root = theme['conditionalEffect']['rootReachability'][0]
        self.assertEqual(root['beforeWithinHops'], [2, 2, 2])
        self.assertEqual(root['conditionalWithinHops'], [3, 3, 3])
        self.assertEqual(theme['hypotheses'][0]['roleCandidates'], [])

    def test_existing_evidence_preserved_and_hypotheses_not_claim_records(self):
        raw = json.loads(__import__('gzip').decompress((ROOT / bridge.FIXTURE).read_bytes()))
        for field in ['entities', 'claims', 'sources', 'citations']:
            original = {row['id']: row for row in raw[field]}
            for row in self.result['publishedEvidence'][field]:
                self.assertEqual(row, original[row['id']])
        for theme in self.result['themes']:
            for h in theme['hypotheses']:
                self.assertNotIn('id', h)
                self.assertNotIn('claimId', h)
                self.assertIsNone(h['scope'])
                self.assertEqual(h['status'], 'unconfirmed-not-a-Claim')
            for path in theme['paths']:
                self.assertIn(path['status'], ['published', 'conditional'])
                self.assertEqual(path['hops'], len(path['steps']))

    def test_deterministic_and_no_input_mutation(self):
        before = {ref: (ROOT / ref).read_bytes() for ref in self.result['verifiedInputs']}
        self.assertEqual(bridge.build(ROOT), self.result)
        self.assertTrue(all((ROOT / file).read_bytes() == raw for file, raw in before.items()))

    def test_checksum_mismatch_fails_before_using_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = json.loads((ROOT / bridge.INPUT).read_text(encoding='utf-8'))
            source['inputs'] = [source['inputs'][0]]
            target = root / bridge.INPUT
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps(source), encoding='utf-8')
            bad = root / source['inputs'][0]['file']
            bad.parent.mkdir(parents=True, exist_ok=True)
            bad.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                bridge.build(root)

    def test_same_name_does_not_merge_nodes_and_new_leaf_keeps_component(self):
        nodes = {'a': {'name': '同じ名'}, 'b': {'name': '既存作品'}}
        proposed = {'proposal:c': {'name': '同じ名'}}
        saved = copy.deepcopy(nodes)
        result = bridge.scenario(nodes, [('a', 'b')], [{'key': 'h', 'subjectKey': 'proposal:c', 'objectKey': 'b'}], proposed, ['a'], [], set(nodes))
        self.assertEqual(result['conditionalTotalEntityCount'], 3)
        self.assertEqual(result['conditionalComponentDelta'], 0)
        self.assertEqual(nodes, saved)


if __name__ == '__main__':
    unittest.main()
