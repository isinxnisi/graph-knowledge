import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parents[1]/'scripts/release-accepted-beta-production.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.audit = {'memberMigrations': {'038-theme-updates.sql': 'old'}, 'knowledgeMigrations': {'009.sql': 'knowledge'}}
        self.manifest = {'sourceCommit': 'a'*40, 'additionalMigrations': sorted(release.ADDITIONS), 'memberMigrations': {**self.audit['memberMigrations'], **{k: 'new' for k in release.ADDITIONS}}, 'knowledgeMigrations': self.audit['knowledgeMigrations'], 'imageServices': sorted(release.IMAGE_SERVICES), 'contentMigration': False, 'qualityGuideSeed': False}

    def test_rejects_changed_applied_checksum_or_unplanned_migration(self):
        release.validate_plan(self.manifest, self.audit)
        for action in ['checksum', 'extra', 'knowledge', 'content', 'guide', 'services']:
            value = copy.deepcopy(self.manifest)
            if action == 'checksum': value['memberMigrations']['038-theme-updates.sql'] = 'tampered'
            if action == 'extra': value['memberMigrations']['044-unplanned.sql'] = 'extra'
            if action == 'knowledge': value['knowledgeMigrations']['009.sql'] = 'changed'
            if action == 'content': value['contentMigration'] = True
            if action == 'guide': value['qualityGuideSeed'] = True
            if action == 'services': value['imageServices'].append('ops')
            with self.subTest(action=action), self.assertRaises(AssertionError):
                release.validate_plan(value, self.audit)

    def test_existing_columns_and_owners_survive_additive_migrations(self):
        old = [{'schema': 'knowledge_import', 'name': 'items', 'owner': 'gk_member', 'columns': ['id', 'state']}]
        added = [{**old[0], 'columns': ['id', 'state', 'input_revision']}]
        release.assert_old_columns(None, old, lambda _: added)
        for current in [[{**added[0], 'owner': 'other'}], [{**added[0], 'columns': ['id', 'input_revision']}]]:
            with self.assertRaises(AssertionError): release.assert_old_columns(None, old, lambda _: current)

    def test_production_sql_uses_socket_and_isolated_sql_uses_tcp(self):
        instance = release.Release.__new__(release.Release)
        instance.pg = 'formal-pg'
        calls = []
        instance.run = lambda args, data: calls.append(args) or ''
        instance.sql('SELECT 1')
        instance.sql('SELECT 1', pg='isolated-pg')
        self.assertNotIn('-h', calls[0])
        self.assertIn('restore_admin', calls[1])
        self.assertIn('127.0.0.1', calls[1])

    def test_failure_after_migration_starts_never_restarts_old_web_or_restores_dump(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder/'prepared.json').write_text(json.dumps({'source': 'a'*40, 'build': 'candidate'}))
            instance = release.Release.__new__(release.Release)
            instance.stage = folder
            instance.m = {'sourceCommit': 'a'*40, 'build': 'candidate', 'additionalMigrations': sorted(release.ADDITIONS)}
            instance.audit = {'memberMigrations': {}, 'files': {}}
            instance.dc = ['compose']
            instance.preflight = lambda: None
            instance.images = lambda load: None
            instance.candidate = lambda: ('candidate compose', ['candidate-compose'])
            instance.directory = lambda phase: folder
            instance.dump = lambda *args: None
            instance.encrypt = lambda *args: {}
            instance.f = types.SimpleNamespace(columns=lambda sql: [])
            instance.sql = lambda *args: ''
            calls = []
            instance.run = lambda args, **kwargs: calls.append(args) or ''
            instance.h = types.SimpleNamespace(emit=lambda *args, **kwargs: None, private=lambda *args: None)
            def uncertain_commit(**kwargs): raise RuntimeError('Connection lost after migration may have committed')
            instance.migrate = uncertain_commit
            with self.assertRaises(RuntimeError): instance.activate()
            self.assertTrue(any('stop' in call for call in calls))
            self.assertFalse(any('up' in call or 'pg_restore' in call for call in calls))


if __name__ == '__main__':
    unittest.main()
