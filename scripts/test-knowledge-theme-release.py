#!/usr/bin/env python3
"""Regression checks for the additive Theme release manifest; no DB mutation."""
import copy,hashlib,importlib.util,pathlib,re,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release',ROOT/'scripts/release-knowledge-theme-production.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
def manifest():
 migrations={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'db/member').glob('*.sql') if re.fullmatch(r'[0-9]{3}-.+\.sql',p.name)}
 return {'previous':{'memberMigrations':{k:v for k,v in migrations.items() if k<'036'}},'memberMigrations':migrations,'additionalMemberMigrations':['036-theme-registration.sql']}
class ReleasePlan(unittest.TestCase):
 def test_exact_additive_plan(self):
  value=manifest();self.assertEqual(len(value['memberMigrations']),37);release.validate_migration_plan(value)
 def test_rejects_bootstrap_sql_before_touching_runtime(self):
  value=manifest();value['memberMigrations']['production-init.sql']='0'*64
  with self.assertRaisesRegex(AssertionError,'unrelated'):release.validate_migration_plan(value)
 def test_rejects_missing_or_changed_applied_migrations(self):
  for change in ['missing','changed']:
   value=copy.deepcopy(manifest())
   if change=='missing':value['memberMigrations'].pop('036-theme-registration.sql')
   else:value['memberMigrations']['000-auth.sql']='0'*64
   with self.assertRaises(AssertionError):release.validate_migration_plan(value)
if __name__=='__main__':unittest.main()
