#!/usr/bin/env python3
import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('caddy_repair',pathlib.Path(__file__).with_name('remediate-caddy-production.py'));repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
class Plan(unittest.TestCase):
 def setUp(self):self.plan='Inst caddy [2.6.2-6ubuntu0.24.04.3] (2.11.9 local-deb [amd64])'
 def test_only_caddy(self):self.assertEqual(repair.validate_plan(self.plan),{'caddy':'2.11.9'})
 def test_extra_package(self):
  with self.assertRaises(ValueError):repair.validate_plan(self.plan+'\nInst docker-ce (1.0 vendor [amd64])')
 def test_remove(self):
  with self.assertRaises(ValueError):repair.validate_plan(self.plan+'\nRemv caddy')
 def test_wrong_version(self):
  with self.assertRaises(ValueError):repair.validate_plan(self.plan.replace('(2.11.9','(2.12.0'))
if __name__=='__main__':unittest.main()
