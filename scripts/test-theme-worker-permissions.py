#!/usr/bin/env python3
"""Worker repair changes only the existing Web operator settings."""
import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('repair', pathlib.Path(__file__).with_name('repair-knowledge-theme-worker-production.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class RepairTest(unittest.TestCase):
    def test_only_worker_operator_flags_and_no_new_credentials(self):
        value = {'services': {'web': {'image': 'web-pinned', 'environment': {'COMMUNITY_ENABLED': '1', 'SITE_OPERATIONS_ENABLED': '1', 'SITE_OPERATOR_USER_IDS': 'existing-operator', 'GOOGLE_SECRET': 'do-not-copy'}}, 'knowledge-review': {'image': 'ops-pinned', 'env_file': ['./knowledge.env'], 'environment': {'GRAPH_DEPLOYMENT': 'production'}}, 'postgres': {'image': 'pg-pinned'}}}
        before = copy.deepcopy(value)
        fixed = repair.repaired(value)
        self.assertEqual(value, before)
        self.assertEqual(fixed['services']['web'], before['services']['web'])
        self.assertEqual(fixed['services']['postgres'], before['services']['postgres'])
        worker = fixed['services']['knowledge-review']
        self.assertEqual(worker['image'], 'ops-pinned')
        self.assertNotIn('GOOGLE_SECRET', worker['environment'])
        self.assertEqual(set(worker['environment']) - {'GRAPH_DEPLOYMENT'}, set(repair.FLAGS))
        self.assertEqual(repair.repaired(fixed), fixed)

    def test_preserves_explicit_disabled_operator_state(self):
        value = {'services': {'web': {'environment': dict.fromkeys(repair.FLAGS, '0')}, 'knowledge-review': {}}}
        self.assertEqual(repair.repaired(value)['services']['knowledge-review']['environment']['SITE_OPERATIONS_ENABLED'], '0')

    def test_refuses_to_invent_an_operator(self):
        value = {'services': {'web': {'environment': {}}, 'knowledge-review': {}}}
        with self.assertRaises(ValueError):
            repair.repaired(value)


if __name__ == '__main__':
    unittest.main()
