import ast
import hashlib
import json
import pathlib
import tempfile
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/release-collection-theme-publication-production.py'


class CollectionReleaseGuards(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(SCRIPT.read_text())
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        klass = next(n for n in main.body if isinstance(n, ast.ClassDef))
        self.capture = []
        self.events = []
        self.manifest = {'additions': {}, 'webbRepair': {'themeId': 'fixed-fixture'}, 'memberOps': {'tag': 'fixed-ops'}}
        legacy = types.SimpleNamespace(Release=object, ident=lambda s: '"' + s + '"')
        self.ns = {'legacy': legacy, 'm': self.manifest, 'prev': {}, 'json': json,
                   'h': types.SimpleNamespace(emit=lambda *args, **kwargs: self.events.append((args, kwargs))),
                   'hashlib': hashlib, 're': __import__('re'), 'WEBB': 'theme:webb'}
        exec(compile(ast.Module(body=[klass], type_ignores=[]), str(SCRIPT), 'exec'), self.ns)
        self.release = object.__new__(self.ns['Release'])
        self.release.candidateDc = ['docker', 'compose', '-f', '/verified/candidate.yaml']
        self.release.dc = ['docker', 'compose', '-f', '/live/old.yaml']
        self.release.run = lambda args: self.capture.append(args) or '{"outcome":"verified"}'

    def test_maintenance_cli_uses_candidate_ops_before_cutover(self):
        self.release.repair()
        command = self.capture[0]
        self.assertEqual(command[:len(self.release.candidateDc)], self.release.candidateDc)
        self.assertEqual(command[-1], '--check')
        self.assertIn('scripts/repair-webb-collection-publication.ts', command)

    def test_isolated_repair_has_no_production_mount_or_env(self):
        self.release.repair(network='isolated-net', pg='isolated-pg', apply=True)
        command = self.capture[0]
        self.assertEqual(command[command.index('--network') + 1], 'isolated-net')
        self.assertNotIn('--env-file', command)
        self.assertNotIn('--mount', command)
        self.assertIn('isolated-pg:5432/graph_member', command[-1])
        self.assertIn('isolated-pg:5432/plunode_knowledge75_production', command[-1])
        self.assertIn('ISOLATED_REPAIR_AUDIT', command[-1])
        self.assertIn('ISOLATED_REPAIR_ERROR', command[-1])

    def test_isolated_failure_surfaces_the_real_error_and_safe_precondition_audit(self):
        with tempfile.TemporaryDirectory() as folder:
            self.release.stage = pathlib.Path(folder)
            detail = 'ISOLATED_REPAIR_AUDIT {"parentFrozen":false}\nISOLATED_REPAIR_ERROR {"code":"COLLECTION_REPAIR_CONFLICT"}'
            def fail(command):
                (self.release.stage / 'command-failure.json').write_text(json.dumps({'exit': 1, 'stderr': detail}))
                raise RuntimeError('Protected command failed')
            self.release.run = fail
            with self.assertRaisesRegex(RuntimeError, 'Protected command failed'):
                self.release.repair(network='isolated-net', pg='isolated-pg', apply=True)
            self.assertEqual(self.events, [(('isolated-repair-diagnostic',), {'exitCode': 1, 'detail': detail})])

    def test_fingerprints_preserve_other_themes_and_old_webb_editions(self):
        queries = []
        def fingerprints(query, tables, member):
            for table in ['theme_publications', 'theme_releases', 'theme_release_approvals', 'revisions', 'migrations']:
                query('SELECT * FROM "knowledge75"."' + table + '"')
        self.ns['legacy'].fingerprints = fingerprints
        self.release.fingerprints(lambda q: queries.append(q), [], {}, {'001-records.sql': 'unchanged'})
        self.assertIn("WHERE theme_id<>'theme:webb'", queries[0])
        for query in queries[1:3]:
            self.assertIn("NOT(theme_id='theme:webb' AND revision=29)", query)
        self.assertNotIn('WHERE', queries[3])
        self.assertIn("WHERE name IN ('001-records.sql')", queries[4])

    def test_only_011_is_applied_as_the_existing_ledger_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = pathlib.Path(folder)
            name = '011-theme-knowledge-updates.sql'
            text = (ROOT / 'migrations/knowledge-foundation' / name).read_text()
            (stage / name).write_text(text)
            self.ns['stage'] = stage
            self.manifest['additions'][name] = hashlib.sha256(text.encode()).hexdigest()
            commands = []
            def sql(query, db, pg):
                commands.append((query, db))
                return 'ledger_owner' if 'pg_get_userbyid' in query else ''
            self.release.sql = sql
            self.release.migrate()
            self.assertEqual({db for _, db in commands}, {'plunode_knowledge75_production'})
            self.assertIn('SET LOCAL ROLE "ledger_owner"', commands[-1][0])
            self.assertIn(text, commands[-1][0])
            self.assertTrue(commands[-1][0].endswith('COMMIT'))

    def test_checksum_mismatch_stops_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = pathlib.Path(folder)
            name = '011-theme-knowledge-updates.sql'
            (stage / name).write_text('changed')
            self.ns['stage'] = stage
            self.manifest['additions'][name] = '0' * 64
            self.release.sql = lambda *args: self.fail('SQL must not run before checksum validation')
            with self.assertRaises(AssertionError):
                self.release.migrate()


if __name__ == '__main__':
    unittest.main()
