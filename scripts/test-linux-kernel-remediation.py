#!/usr/bin/env python3
"""Reject unintended changes before the production kernel installation."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('kernel_repair', Path(__file__).with_name('remediate-linux-kernel-production.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)

class PlanBoundary(unittest.TestCase):
    def setUp(self):
        self.plan = '\n'.join('Inst ' + n + ' (' + v + ' Ubuntu:24.04/noble-updates [amd64])' for n, v in repair.PACKAGES.items())
    def test_reviewed_plan(self):
        self.assertEqual(repair.validate_plan(self.plan), repair.PACKAGES)
    def test_removal(self):
        with self.assertRaises(ValueError): repair.validate_plan(self.plan + '\nRemv linux-image-6.8.0-147-generic [6.8.0-147.147]')
    def test_unrelated_service_update(self):
        with self.assertRaises(ValueError): repair.validate_plan(self.plan + '\nInst docker-ce (99.0 vendor [amd64])')
    def test_changed_version(self):
        with self.assertRaises(ValueError): repair.validate_plan(self.plan.replace('6.8.0-149.149', '6.8.0-150.150', 1))
    def test_missing_kernel_dependency(self):
        with self.assertRaises(ValueError): repair.validate_plan('\n'.join(s for s in self.plan.splitlines() if not s.startswith('Inst linux-modules-')))
    def test_duplicate_action(self):
        with self.assertRaises(ValueError): repair.validate_plan(self.plan + '\n' + self.plan.splitlines()[0])

if __name__ == '__main__': unittest.main()
