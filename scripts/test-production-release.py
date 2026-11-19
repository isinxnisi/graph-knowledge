#!/usr/bin/env python3
"""Regression and optional isolated Docker release tests."""
import copy
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from production_image_verification import digest
from production_release import Production, must_recover_forward, prepare, release, verify_stage
from production_release_bundle import pack_images
from production_release_plan import (
    DATABASES, SERVICES, WORKERS, checksum, expected_ledgers, ledger_index, make_plan, migration_path, release_tags, validate_migration_sql,
)

SOURCE = 'f' * 40
MIGRATION = '048-release-test.sql'
SQL = 'CREATE TABLE release_test(id integer PRIMARY KEY);\n'


def git(root, *args):
    return subprocess.check_output(['git', '-C', root, *args], stderr=subprocess.PIPE).decode().strip()


def commit(root, msg):
    git(root, 'add', '.')
    git(root, 'commit', '-m', msg)
    return git(root, 'rev-parse', 'HEAD')


def fixture_baseline(source):
    return {'build': 'isolated-build', 'services': {name: {'source': source, 'imageId': 'sha256:' + 'a' * 64}
                                                   for name in SERVICES},
            'composeSha256': 'b' * 64, 'envSha256': {'app.env': 'c' * 64, 'knowledge.env': 'd' * 64},
            'ledgers': {'member': {}, 'knowledge': {}}}


class PlanTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        git(temp.name, 'init', '-q')
        git(temp.name, 'config', 'user.name', 'Release Test')
        git(temp.name, 'config', 'user.email', 'release@example.invalid')
        self.put('README.md', 'Baseline')
        self.put('migrations/knowledge-foundation/003-dormant.sql', '-- Unselected')
        self.old = commit(temp.name, 'Baseline')
        self.baseline = fixture_baseline(self.old)

    def put(self, path, value):
        path = self.root / path
        path.parent.mkdir(exist_ok=True, parents=True)
        path.write_text(value)

    def plan(self, source, **options):
        evidence = options.pop('beta', copy.deepcopy(self.baseline['ledgers']))
        return make_plan(self.root, source, self.baseline, {'sourceCommit': source, 'ledgers': evidence}, **options)

    def test_web_and_lagging_worker_comparison(self):
        self.put('app/page.tsx', 'Web only')
        web = commit(str(self.root), 'Web')
        candidate = self.plan(web)
        self.assertTrue(candidate['web'])
        self.assertFalse(candidate['workers'])
        self.put('scripts/knowledge-patrol-worker.ts', 'Worker only')
        worker = commit(str(self.root), 'Worker')
        self.baseline['services']['web']['source'] = web
        candidate = self.plan(worker)
        self.assertFalse(candidate['web'])
        self.assertTrue(candidate['workers'])
        self.assertEqual(candidate['recovery'], 'forward')

    def test_unrelated_docs_do_not_need_release(self):
        self.put('docs/PRODUCTION.md', 'Runbook')
        source = commit(str(self.root), 'Documentation')
        with self.assertRaisesRegex(ValueError, 'no runtime changes'):
            self.plan(source)

    def test_new_schema_matches_beta_and_skips_dormant_sql(self):
        self.put(migration_path('member', MIGRATION), SQL)
        self.put('migrations/knowledge-foundation/003-dormant.sql', '-- Still unselected')
        source = commit(str(self.root), 'Schema')
        with self.assertRaisesRegex(ValueError, 'No matching beta'):
            self.plan(source)
        beta = {'member': {MIGRATION: checksum(SQL.encode())}, 'knowledge': {}}
        plan = self.plan(source, beta=beta)
        self.assertEqual([m['name'] for m in plan['migrations']], [MIGRATION])
        self.assertTrue(plan['web'] and plan['workers'])
        self.assertEqual(ledger_index(plan, expected_ledgers(plan)), 1)
        with self.assertRaisesRegex(ValueError, 'approved release sequence'):
            ledger_index(plan, {'member': {MIGRATION: '0' * 64}, 'knowledge': {}})
        with self.assertRaisesRegex(ValueError, 'different source'):
            make_plan(self.root, source, self.baseline, {'sourceCommit': self.old, 'ledgers': beta})

    def test_bundle_seal_detects_tampered_scripts(self):
        self.put('app/page.tsx', 'Web only')
        source = commit(str(self.root), 'Web')
        plan = self.plan(source)
        path = self.root / 'stage'

        def mock_build(_root, stage, plan):
            archive = stage / 'images.tar.gz'
            archive.write_bytes(b'fixture')
            return {'sourceCommit': source, 'build': 'isolated-build', 'archiveSha256': digest(archive),
                    'web': {'tag': release_tags(plan)['web'], 'imageId': 'sha256:' + 'b' * 64}}

        with patch('production_release.build_images', side_effect=mock_build):
            prepare(self.root, path, plan)
        seal = digest(path / 'RELEASE-SHA256SUMS')
        verified, _ = verify_stage(path, seal)
        self.assertEqual(verified, plan)
        (path / 'production-release-probe.cjs').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'files differ'):
            verify_stage(path, seal)

    def test_migration_keeps_transaction_control_in_runner(self):
        validate_migration_sql(b'DO $$ BEGIN PERFORM 1; END; $$; CREATE TABLE release_test(id integer);')
        for sql in (b'CREATE TABLE t(id integer); COMMIT;', b'-- note\n\\i another-file.sql\n'):
            with self.subTest(sql=sql), self.assertRaisesRegex(ValueError, 'transaction boundary'):
                validate_migration_sql(sql)

    def test_recovery_boundary(self):
        phase = {'publicationStarted': False, 'workersStarted': False, 'webStarted': False}
        self.assertFalse(must_recover_forward({'recovery': 'forward'}, 0, phase))
        self.assertTrue(must_recover_forward({'recovery': 'forward'}, 1, phase))
        self.assertFalse(must_recover_forward({'recovery': 'rollback-compatible'}, 1, phase))
        self.assertTrue(must_recover_forward({'recovery': 'rollback-compatible'}, 0, {**phase, 'publicationStarted': True}))
        self.assertTrue(must_recover_forward({'recovery': 'rollback-compatible'}, 0, {**phase, 'workersStarted': True}))
        self.assertTrue(must_recover_forward({'recovery': 'forward'}, 0, {**phase, 'webStarted': True}))


HTTP_FIXTURE = """
const {createServer}=require('node:http');
const base={record:{id:'r',revision:1,content:{kind:'relation',subjectId:'subject'}},sources:[{id:'source'}]};
createServer((req,res)=>{
  const url=new URL(req.url, 'http://localhost');
  if(req.headers.host!=='plunode.net'){res.writeHead(403).end();return;}
  const mode=url.searchParams.get('mode');
  const results={status:{active:{id:'generation',recordCount:4}},search:{
    generation:'generation',records:[base,base],nextCursor:'cursor'
  },'record-version':{record:base},neighbors:{records:[base]}};
  const value=results[mode]||{dataset:'public-kg'};
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
}).listen(3000,'0.0.0.0')
"""


@unittest.skipUnless(os.getenv('PLUNODE_RELEASE_DOCKER_TEST') == '1', 'Set PLUNODE_RELEASE_DOCKER_TEST=1 for an isolated real Compose and PostgreSQL test')
class IsolatedReleaseTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='plunode-release-test-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.dc = ['docker', 'compose', '--project-directory', str(self.root), '-f', str(self.root / 'compose.yaml')]
        prefix = self.root.name
        self.images = {name: prefix + ':' + name for name in ('old', 'web', 'ops', 'next', 'broken')}
        self.addCleanup(self.command, ['docker', 'image', 'rm', *self.images.values()], False)
        (self.root / 'fixture.cjs').write_text(HTTP_FIXTURE)
        (self.root / 'Dockerfile').write_text('''FROM node:24.21.0-bookworm-slim
WORKDIR /app
ARG BUILD
RUN mkdir .next-public && echo "$BUILD" > .next-public/BUILD_ID
COPY fixture.cjs ./
CMD ["node","fixture.cjs"]
''')
        for name, tag in self.images.items():
            build = 'isolated-' + name
            self.command(['docker', 'build', '--platform', 'linux/amd64', '--build-arg', f'BUILD={build}',
                          '--label', 'org.opencontainers.image.revision=' + ('a' * 40 if name == 'old' else SOURCE),
                          '-t', tag, str(self.root)])
        for name in ('app.env', 'knowledge.env'):
            (self.root / name).write_text('# isolation fixture\n')
        (self.root / 'compose.yaml').write_text(f'''services:
  graph-member-postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_HOST_AUTH_METHOD: trust
    healthcheck:
      test: ["CMD-SHELL","pg_isready -U postgres"]
      interval: 1s
      timeout: 2s
      retries: 25
  web:
    init: true
    image: "{self.images["old"]}"
    environment:
      MEMBER_ORIGIN: https://plunode.net
      KNOWLEDGE_RUNTIME: production
    healthcheck:
      test: ["CMD","node","-e","fetch('http://127.0.0.1:3000').then(()=>process.exit(0),()=>process.exit(1))"]
      interval: 1s
      timeout: 2s
      retries: 20
''' + ''.join(f'''  {name}:
    init: true
    image: "{self.images["old"]}"
    environment:
      KNOWLEDGE_RUNTIME: production
    command: ["sleep","infinity"]
''' for name in (*WORKERS, 'member-ops', 'knowledge-ops')))
        self.addCleanup(self.command, self.dc + ['down', '-v'], False)
        self.command(self.dc + ['up', '-d', '--wait', 'graph-member-postgres', *SERVICES])
        self.runtime = Production(self.root, self.root / 'private.log')
        for db, (name, ledger, _) in DATABASES.items():
            self.command(['docker', 'exec', self.runtime.pg, 'createdb', '-U', 'postgres', name])
            if db == 'knowledge':
                self.runtime.sql(db, 'CREATE SCHEMA knowledge75')
            self.runtime.sql(db, f'CREATE TABLE {ledger}(name text PRIMARY KEY, checksum text NOT NULL)')
        self.stage = self.root / 'stage'
        self.stage.mkdir()
        shutil.copyfile(Path(__file__).resolve().with_name('production-release-probe.cjs'), self.stage / 'production-release-probe.cjs')
        self.baseline = self.runtime.audit()

    def command(self, args, check=True):
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=180)
        if check:
            self.assertEqual(result.returncode, 0, result.stdout)
        return result.stdout.strip()

    def bundle(self, images, build):
        archive = self.stage / 'images.tar.gz'
        if archive.exists():
            archive.unlink()
        images, _ = pack_images(self.stage, {key: self.images[name] for key, name in images.items()}, SOURCE)
        return {'sourceCommit': SOURCE, 'build': build, 'archiveSha256': digest(archive), **images}

    def test_cutover_rollback_schema_and_retry(self):
        plan = {'sourceCommit': SOURCE, 'baseline': self.baseline, 'web': True, 'workers': False,
                'migrations': [], 'rebuildPublication': False, 'recovery': 'rollback-compatible'}
        with self.assertRaisesRegex(ValueError, 'Running Web build differs'):
            release(self.runtime, self.stage, '1'*64, plan, self.bundle({'web': 'broken'}, 'incorrect-build'))
        self.assertEqual(self.runtime.audit(), self.baseline)
        self.assertFalse(list((self.root / 'backups').rglob('*.dump')))
        release(self.runtime, self.stage, '2'*64, plan, self.bundle({'web': 'web'}, 'isolated-web'))
        new = self.runtime.audit()
        self.assertEqual(new['build'], 'isolated-web')
        self.assertEqual({n: new['services'][n] for n in WORKERS}, {n: self.baseline['services'][n] for n in WORKERS})
        plan.update(baseline=new, workers=True, recovery='forward')
        member = self.stage / migration_path('member', MIGRATION)
        member.parent.mkdir(parents=True)
        member.write_text(SQL)
        knowledge_name = '013-release-test.sql'
        knowledge = self.stage / migration_path('knowledge', knowledge_name)
        knowledge.parent.mkdir(parents=True)
        knowledge_sql = ('CREATE TABLE knowledge75.release_test(id integer PRIMARY KEY);\n'
                         'SELECT id FROM knowledge75.release_guard;')
        knowledge.write_text(knowledge_sql)
        plan['migrations'] = [{'database': db, 'name': name, 'checksum': digest(path)}
                              for db, name, path in [('member', MIGRATION, member), ('knowledge', knowledge_name, knowledge)]]
        bundle = self.bundle({'web': 'next', 'memberOps': 'ops'}, 'isolated-next')
        with self.assertRaisesRegex(RuntimeError, 'Apply knowledge/013-release-test.sql'):
            release(self.runtime, self.stage, '3'*64, plan, bundle)
        self.assertEqual(ledger_index(plan, self.runtime.ledgers()), 1)
        self.assertFalse(self.runtime.inspect('web')['State']['Running'])
        self.assertEqual(self.runtime.sql('knowledge', "SELECT to_regclass('knowledge75.release_test')"), '')
        self.runtime.sql('knowledge', 'CREATE TABLE knowledge75.release_guard(id integer PRIMARY KEY)')
        # Same seal retries the exact approved prefix without running the member SQL again.
        release(self.runtime, self.stage, '3'*64, plan, bundle)
        self.assertEqual(self.runtime.ledgers(), expected_ledgers(plan))
        self.assertEqual(self.runtime.sql('knowledge', "SELECT to_regclass('knowledge75.release_test')"), 'knowledge75.release_test')
        self.assertEqual(len(list((self.root / 'backups').rglob('*.dump'))), 2)
        self.assertTrue(all(self.runtime.inspect(name)['State']['Running'] for name in SERVICES))


if __name__ == '__main__':
    unittest.main(verbosity=2)
