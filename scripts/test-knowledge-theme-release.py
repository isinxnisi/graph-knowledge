#!/usr/bin/env python3
"""Check the historical Theme release against its 036 migration boundary."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
THEME_MIGRATION = '036-theme-registration.sql'
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/release-knowledge-theme-production.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def manifest():
    previous = {}
    for file in (ROOT / 'db/member').glob('*.sql'):
        match = re.fullmatch(r'(\d{3})-.+\.sql', file.name)
        if match and int(match[1]) < 36:
            previous[file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
    theme = hashlib.sha256((ROOT / 'db/member' / THEME_MIGRATION).read_bytes()).hexdigest()
    return {'previous': {'memberMigrations': previous},
            'memberMigrations': {**previous, THEME_MIGRATION: theme},
            'additionalMemberMigrations': [THEME_MIGRATION]}


class ReleasePlan(unittest.TestCase):
    def test_exact_additive_plan(self):
        value = manifest()
        before, after = value['previous']['memberMigrations'], value['memberMigrations']
        self.assertEqual(set(after) - set(before), {THEME_MIGRATION})
        self.assertEqual({name: after[name] for name in before}, before)
        release.validate_migration_plan(value)

    def test_rejects_unrelated_sql_before_touching_runtime(self):
        for name in ('production-init.sql', '037-featured-themes.sql'):
            with self.subTest(name=name), self.assertRaisesRegex(AssertionError, 'unrelated'):
                value = manifest()
                value['memberMigrations'][name] = '0' * 64
                release.validate_migration_plan(value)

    def test_rejects_missing_or_changed_migrations(self):
        value = manifest()
        for missing in (THEME_MIGRATION, '000-auth.sql'):
            with self.subTest(missing=missing), self.assertRaisesRegex(AssertionError, 'missing'):
                candidate = copy.deepcopy(value)
                del candidate['memberMigrations'][missing]
                release.validate_migration_plan(candidate)
        value['memberMigrations']['000-auth.sql'] = '0' * 64
        with self.assertRaisesRegex(AssertionError, 'checksum changed'):
            release.validate_migration_plan(value)


if __name__ == '__main__':
    unittest.main()
