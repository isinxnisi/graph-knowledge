"""Frozen replay and isolated approval/acquisition/review. No external provider or DB writes."""
import argparse
import copy
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import importlib.util
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('workflow_test', ROOT / 'scripts/collection-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
fixtures = w.load('workflow_provider_fixture', ROOT / 'tests/test_manga_collection_v2.py')
JOB = 'famous-manga-creators-r0003-907fdec3b7f86662'
R2_RECEIPTS = [ROOT / ('datasets/manga-collection/' + name + '/acceptance.json') for name in
               ['accepted-r0002-20261017', 'accepted-original-story-r0002-20261017']]


def public_fixture():
    fixture = w.read(ROOT / 'datasets/public-kg/releases/20261014-credits-001/data.json')
    return fixture, {'release': '20261014-credits-001', 'revision': 'isolated-public-observation',
                     'observation': 'isolated-fixture-not-live', 'references': []}


def public_backup_fixture(path):
    # Existing pure validators/graph builders only. No DB connection, apply or restore.
    w.node(['-e', "const fs=require('node:fs'),{randomUUID}=require('node:crypto');"
        "const {publicGraph,publicGraphDigest}=require('./lib/server/public-graph.ts');"
        "const {sha256,stableJson}=require('./lib/server/public-dataset.ts');"
        "const {validatePublicBackup}=require('./lib/server/public-backup.ts');"
        "const dir='datasets/public-kg/releases/20261014-credits-001/';"
        "const fixture=JSON.parse(fs.readFileSync(dir+'data.json','utf8')),m=JSON.parse(fs.readFileSync(dir+'manifest.json','utf8'));"
        "const g=publicGraph(fixture,m.withdrawals??[]);"
        "const payload={version:1,dataset:'public-kg',savedAt:'2026-10-18T00:00:00Z',release:m.release,revision:'isolated-cli-test',"
        "graphDigest:publicGraphDigest(g),fixture,withdrawals:m.withdrawals??[],"
        "receipts:[{id:m.release,digest:sha256(stableJson(m)),dataSha256:m.dataSha256,reason:'ISOLATED TEST ONLY',appliedAt:'2026-10-18T00:00:00Z'}],"
        "externalNodeIds:Object.fromEntries(Object.entries(g.nodes).filter(([k,v])=>v.label==='ExternalIdentifier').map(([k,v])=>[k,randomUUID()]))};"
        "const b=validatePublicBackup({payload,checksum:sha256(stableJson(payload))});fs.writeFileSync(process.argv[1],JSON.stringify(b));"
        "console.log(JSON.stringify({valid:true}));", str(path)])


def tracked_frozen_job(target):
    """Portable selected-field reconstruction, never overwrites the original job or approval."""
    run = ROOT / 'datasets/manga-collection/run-r0003-20261017'
    state = w.read(run / 'official-inspect.json')
    order = w.read(run / 'work-order.json')
    candidate = w.read(ROOT / 'datasets/public-kg/releases/20261014-credits-001/data.json')
    added = w.read(run / 'candidate-records.json')['records']
    for field in w.FIELDS:
        candidate[field] = sorted(candidate[field] + added[field], key=lambda v: v['id'])
    artifacts = target / 'artifacts'
    w.gate.save(target / 'work-order.json', order)
    w.gate.save(artifacts / 'candidate/data.json', candidate)
    w.gate.save(artifacts / 'candidate/manifest.json', {'dataSha256': w.gate.file_hash(artifacts / 'candidate/data.json')})
    for name in ['ledger.json', 'summary.json']:
        w.gate.save(artifacts / name, w.read(run / name))
    for path in (run / 'ndl-snapshots').glob('*.json'):
        w.gate.save(artifacts / 'snapshots' / path.name, w.read(path))
    for qid, source in w.read(ROOT / 'datasets/manga-collection/review-r0003-20261017/identity-evidence.json')['entities'].items():
        value = {k: source[k] for k in ['id', 'lastrevid', 'labels', 'aliases']}
        value['claims'] = {prop: [{'mainsnak': {'datavalue': {'value': {'id': v}}}} for v in source[key]]
                           for prop, key in [('P31', 'instanceOf'), ('P50', 'authorQids'), ('P110', 'illustratorQids')]}
        w.gate.save(artifacts / 'snapshots' / (qid + '.json'), value)
    state['artifacts'] = w.gate.inventory(artifacts)
    w.gate.save(target / 'job.json', state)


class FrozenReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.accepted, cls.refs = w.accepted_additions(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002', R2_RECEIPTS)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.job = self.root / JOB
        tracked_frozen_job(self.job)

    def review(self):
        public, context = public_fixture()
        return w.review_job(self.job, public, context, self.accepted, self.refs)

    def mutate_candidate(self, mutate):
        path = self.job / 'artifacts/candidate/data.json'
        data = w.read(path); mutate(data); w.gate.save(path, data)
        path = path.with_name('manifest.json'); manifest = w.read(path)
        manifest['dataSha256'] = w.gate.file_hash(path.with_name('data.json')); w.gate.save(path, manifest)
        state = w.read(self.job / 'job.json'); state['artifacts'] = w.gate.inventory(self.job / 'artifacts')
        w.gate.save(self.job / 'job.json', state)

    def test_frozen_r0003_reproduces_normal_review_without_manual_exception_inference(self):
        before = w.gate.inventory(self.job)
        out = self.review(); r = out['review.json']
        self.assertEqual(r['newCandidateCounts'], dict(entities=35, claims=25, sources=21, citations=25))
        self.assertEqual(r['normalReviewedEntityCount'], 36)
        self.assertEqual((r['heldClaimCount'], r['heldEntityCount']), (3, 1))
        self.assertEqual(len(r['inheritedHolds']), 2)
        self.assertEqual(len(r['identityOnlyEntityIds']), 4)
        old = w.read(ROOT / 'datasets/manga-collection/review-r0003-20261017/decision-request.json')
        self.assertEqual(out['decision-request.json']['groups']['normal']['existingEntityDependencies'],
                         old['groups']['normal']['existingEntityDependencies'])
        self.assertTrue(all(c['visibility'] == 'hidden' for c in out['proposed-records.json']['records']['claims']))
        self.assertEqual(w.gate.inventory(self.job), before)
        self.assertFalse(any(c['person'] in ['赤坂アカ', '小畑健'] for c in r['claims']))
        self.assertTrue(any('work-to-publication-mapping-needs-human-review' in c['reasons'] for c in r['claims'] if c['work'] == '童夢'))
        self.assertEqual(len([e for e in r['entities'] if e['status'] == 'reuse-formally-accepted-not-applied']), 3)

    def test_repeated_bundle_is_unchanged_and_manual_overwrite_is_rejected(self):
        out = self.review(); path, unchanged = w.write_review(self.root / 'reviews', out)
        self.assertFalse(unchanged)
        self.assertTrue(w.write_review(self.root / 'reviews', self.review())[1])
        (path / 'README.md').write_text('unreviewed replacement')
        with self.assertRaisesRegex(ValueError, 'no overwrite'):
            w.write_review(self.root / 'reviews', out)
        self.assertEqual((path / 'README.md').read_text(), 'unreviewed replacement')

    def test_new_review_version_keeps_prior_bundle(self):
        out = self.review(); path, _ = w.write_review(self.root / 'reviews', out)
        modified = copy.deepcopy(out); modified['context.json']['public']['revision'] = 'next-observed-revision'
        other, _ = w.write_review(self.root / 'reviews', modified)
        self.assertNotEqual(path, other)
        self.assertTrue(path.exists())

    def test_unknown_role_missing_evidence_and_wrong_scope_are_held(self):
        base_ids = {v['id'] for v in w.read(ROOT / 'datasets/public-kg/releases/20261014-credits-001/data.json')['claims']}
        def mutate(data):
            claims = [c for c in data['claims'] if c['id'] not in base_ids]
            claims[0]['contribution']['roleId'] = 'UNSUPPORTED_ROLE'
            claims[1]['contribution']['scope']['isbn13'] = '9784091921116'
            data['citations'] = [v for v in data['citations'] if v['claimId'] != claims[2]['id']]
        self.mutate_candidate(mutate)
        rows = self.review()['review.json']['claims']
        reasons = {reason for row in rows for reason in row['reasons']}
        self.assertIn('unknown-or-unsupported-role', reasons)
        self.assertIn('scope-or-period-not-supported', reasons)
        self.assertIn('explicit-role-citation-insufficient', reasons)

    def test_duplicate_entity_requires_mapping_and_never_merges_or_generates_direct_relation(self):
        def mutate(data):
            row = copy.deepcopy(next(e for e in data['entities'] if e['name'] == '萩尾望都'))
            row['id'] = '11111111-1111-4111-8111-111111111111'; data['entities'].append(row)
        self.mutate_candidate(mutate)
        out = self.review()
        duplicates = [e for e in out['review.json']['entities'] if e['name'] == '萩尾望都']
        self.assertTrue(all('existing-identity-needs-explicit-uuid-mapping' in e['reasons'] for e in duplicates))
        for path in out['exploration-paths.json']:
            self.assertFalse(path['observation'].startswith('live'))
            self.assertTrue(all(e['subjectId'] != e['objectId'] and e['citationIds'] and e['sourceIds'] for e in path['edges']))

    def test_r0003_accepted_overlay_is_not_treated_as_public_or_reaccepted(self):
        self.accepted, self.refs = w.accepted_additions(ROOT / 'datasets/public-kg/releases/20261017-manga-r0003-001',
                            [*R2_RECEIPTS, ROOT / 'datasets/manga-collection/accepted-r0003-20261017/acceptance.json'])
        out = self.review()
        self.assertEqual(out['review.json']['newCandidateCounts'], dict(entities=0, claims=0, sources=0, citations=0))
        self.assertTrue(any(p['state'] == 'formally-accepted-not-applied' for p in out['exploration-paths.json']))
        self.assertFalse(any(p['state'] == 'collection-candidate' for p in out['exploration-paths.json']))
        self.assertEqual(out['review.json']['heldClaimCount'], 0)
        mapped = [c for c in out['review.json']['claims'] if c['work'] == 'パイナップルARMY']
        self.assertEqual(len(mapped), 2)
        self.assertTrue(all(c['existingClaimId'] != c['claimId'] and c['existingState'] == 'formally-accepted-not-applied' for c in mapped))
        self.assertEqual(next(e for e in public_fixture()[0]['entities'] if e['id'] == '290ab095-192d-4910-90f3-ae741f9d1f32')['externalIds'], [])
        with self.assertRaisesRegex(ValueError, 'receipts'):
            w.accepted_additions(ROOT / 'datasets/public-kg/releases/20261017-manga-r0003-001', [])

    def test_artifact_tamper_fails_before_review_and_no_acceptance_file_is_created(self):
        (self.job / 'artifacts/ledger.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'modified'):
            self.review()
        self.assertFalse(list(self.root.rglob('acceptance.json')))

    def test_acceptance_hash_change_cannot_turn_a_candidate_into_accepted_knowledge(self):
        receipt = w.read(R2_RECEIPTS[0]); receipt['referenceArtifacts'][0]['sha256'] = '0' * 64
        path = self.root / 'not-valid-acceptance.json'; w.gate.save(path, receipt)
        with self.assertRaisesRegex(ValueError, 'reference changed'):
            w.accepted_additions(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002', [path, R2_RECEIPTS[1]])

    def test_default_discovery_requires_all_receipts_and_preserves_three_states(self):
        additions, refs = w.discover_accepted()
        self.assertEqual({f: len(v) for f, v in additions.items()}, dict(entities=52, claims=40, sources=33, citations=41))
        self.assertTrue(any('accepted-r0003' in p for p, sha in refs))
        self.assertFalse(any(c['visibility'] != 'published' for c in additions['claims']))
        # Published here describes an accepted artifact, not a public KG application.
        self.assertEqual(public_fixture()[1]['release'], '20261014-credits-001')

    def test_old_code_can_only_inspect_frozen_job_without_rebinding_or_collecting(self):
        args = argparse.Namespace(command='review-job', registry=self.root / 'registry', jobs=self.root, reviews=self.root / 'reviews',
                                  job_id=JOB, public_backup=None, accepted_release=None, accepted_receipt=[])
        # Reviews must be outside the jobs root.
        args.jobs = self.root / 'jobs'; args.jobs.mkdir(); self.job.rename(args.jobs / JOB)
        with patch.object(w, 'public_snapshot', return_value=public_fixture()), \
             patch.object(w, 'discover_accepted', return_value=(self.accepted, self.refs)), \
             patch.object(w.gate, 'verify_execution', side_effect=ValueError('new collector code cannot use old approval')), \
             patch.object(w.gate, 'run') as acquire:
            result = w.execute(args)
        acquire.assert_not_called()
        self.assertEqual(result['transportAttemptsAdded'], 0)
        self.assertFalse(result['formalAcceptance'] or result['publicApply'])


class OfflineOpener:
    def __init__(self, fail_at=None):
        self.provider = fixtures.ReviewedProvider(); self.calls = 0; self.fail_at = fail_at

    def open(self, request, timeout):
        self.calls += 1
        if self.calls == self.fail_at:
            raise TimeoutError('isolated simulated transport interruption')
        url = urlparse(request.full_url); query = parse_qs(url.query)
        kind, identifier = ('wikidata', re.search(r'Q[0-9]+', url.path).group()) if 'wikidata.org' in url.netloc else ('ndl', re.search(r'[0-9]{13}', query['query'][0]).group())
        body, _ = self.provider.get(kind, identifier)
        result = io.BytesIO(body); result.status = 200
        return result


class IsolatedWorkflow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.registry = self.root / 'registry'; self.jobs = self.root / 'jobs'
        self.value = w.read(ROOT / 'datasets/collection-themes/themes/famous-manga-creators/r0003.json')
        self.value.update(id='isolated-workflow-test', revision=1, relatedThemes=[])
        w.gate.save(w.gate.revision_path(self.registry, 'themes', self.value['id'], 1), self.value)
        self.args = argparse.Namespace(command='collect-review', registry=self.registry, jobs=self.jobs, reviews=self.root / 'reviews',
            theme_id=self.value['id'], revision=1, definition_sha=w.digest(self.value), public_backup=None, accepted_release=None, accepted_receipt=[])

    def approve(self):
        w.gate.execute(argparse.Namespace(command='approve', registry=self.registry, jobs=self.jobs, theme_id=self.value['id'], revision=1,
            reviewer='ISOLATED TEST ONLY', note='Test fixture, not approval of a production theme', sha256=w.digest(self.value), confirm_review=True))

    def generate(self, execution, staging):
        summary = w.manga.build(ROOT, execution, staging, staging.parent / 'request-cache')
        summary['validation'] = w.gate.technical_validation(staging / 'validation-only')
        shutil.rmtree(staging / 'validation-only'); w.gate.save(staging / 'summary.json', summary)
        return summary

    def run_workflow(self, opener):
        with patch.object(w, 'public_snapshot', return_value=public_fixture()), patch.object(w.gate, 'generate', side_effect=self.generate), \
             patch.object(w, 'discover_accepted', return_value=({f: [] for f in w.FIELDS}, [])), \
             patch('urllib.request.build_opener', return_value=opener), patch('time.sleep'):
            return w.execute(self.args)

    def test_unapproved_revoked_definition_code_and_input_hash_cannot_start_network(self):
        opener = OfflineOpener()
        with self.assertRaisesRegex(ValueError, 'Unapproved'):
            self.run_workflow(opener)
        self.assertFalse(self.jobs.exists())
        self.approve()
        self.args.definition_sha = '0' * 64
        with self.assertRaisesRegex(ValueError, 'definition hash'):
            self.run_workflow(opener)
        self.args.definition_sha = w.digest(self.value)
        for field in ['codeSha256', 'inputs']:
            current = copy.deepcopy(self.value['execution'])
            if field == 'inputs': current['inputs'][0]['sha256'] = '0' * 64
            else: current['codeSha256'] = '0' * 64
            with patch.object(w.gate, 'plan', return_value=current):
                with self.assertRaisesRegex(ValueError, 'changed'):
                    self.run_workflow(opener)
        w.gate.save(w.gate.revision_path(self.registry, 'revocations', self.value['id'], 1), {'reason': 'test revoke'})
        with self.assertRaisesRegex(ValueError, 'revoked'):
            self.run_workflow(opener)
        self.assertEqual(opener.calls, 0)
        self.assertFalse(self.jobs.exists())

    def test_collection_interruption_resumes_same_job_and_reuses_cache_and_budget(self):
        self.approve(); opener = OfflineOpener(fail_at=8)
        with self.assertRaisesRegex(ValueError, 'Transport failed'):
            self.run_workflow(opener)
        job = next(self.jobs.glob('*/job.json')).parent
        self.assertEqual(w.read(job / 'job.json')['status'], 'failed')
        result = self.run_workflow(opener)
        self.assertEqual(Path(result['reviewDirectory']).exists(), True)
        cache = w.read(job / 'request-cache/requests.json')
        self.assertEqual((len(cache['attempts']), len(cache['responses']), opener.calls), (72, 71, 72))
        self.assertEqual([a['status'] for a in w.read(job / 'job.json')['attempts']], ['failed', 'succeeded'])
        repeated = self.run_workflow(opener)
        self.assertTrue(repeated['collectionUnchanged'] and repeated['reviewUnchanged'])
        self.assertEqual(opener.calls, 72)
        self.assertEqual(w.read(job / 'request-cache/requests.json'), cache)

    def test_review_failure_retries_without_recollecting_and_keeps_human_gates(self):
        self.approve(); opener = OfflineOpener()
        with patch.object(w, 'write_review', side_effect=ValueError('isolated review rendering failure')):
            with self.assertRaisesRegex(ValueError, 'rendering failure'):
                self.run_workflow(opener)
        self.assertEqual(opener.calls, 71)
        result = self.run_workflow(opener)
        self.assertTrue(result['collectionUnchanged'])
        self.assertEqual(opener.calls, 71)
        self.assertFalse(result['formalAcceptance'] or result['publicApply'])
        self.assertFalse(list(self.root.rglob('acceptance.json')))

    def test_revocation_during_review_prevents_bundle_creation(self):
        self.approve(); opener = OfflineOpener(); original = w.review_job
        def revoke_after_review(*args):
            out = original(*args)
            w.gate.save(w.gate.revision_path(self.registry, 'revocations', self.value['id'], 1), {'reason': 'isolated concurrent revoke'})
            return out
        with patch.object(w, 'review_job', side_effect=revoke_after_review):
            with self.assertRaisesRegex(ValueError, 'revoked'):
                self.run_workflow(opener)
        self.assertFalse(self.args.reviews.exists())
        self.assertEqual(opener.calls, 71)

    def test_cache_corruption_and_network_budget_exhaustion_cannot_send_more_requests(self):
        self.approve(); opener = OfflineOpener(fail_at=8)
        with self.assertRaises(ValueError): self.run_workflow(opener)
        job = next(self.jobs.glob('*/job.json')).parent
        first = next((job / 'request-cache').glob('wikidata-*.body')); first.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'Cached response changed'):
            self.run_workflow(opener)
        self.assertEqual(opener.calls, 8)
        state = w.read(job / 'request-cache/requests.json'); state['responses'] = {}
        state['attempts'] *= 20; w.gate.save(job / 'request-cache/requests.json', state)
        with self.assertRaisesRegex(ValueError, 'budget exhausted'):
            self.run_workflow(opener)
        self.assertEqual(opener.calls, 8)

    def test_real_single_command_collects_from_isolated_cached_provider_and_creates_review(self):
        self.approve()
        order = w.gate.packet(self.registry, self.value)
        key = w.digest({'order': order, 'runnerSha256': w.gate.file_hash(ROOT / 'scripts/collection-themes.py')})
        job_id = self.value['id'] + '-r0001-' + key[:16]; cache = self.jobs / job_id / 'request-cache'; cache.mkdir(parents=True)
        recipe = w.read(ROOT / self.value['execution']['inputs'][0]['file']); provider = fixtures.ReviewedProvider()
        state = {'policy': recipe['requestPolicy'], 'attempts': [], 'responses': {}, 'blockedUntil': 0}
        for kind, anchors in [('wikidata', recipe['people'] + recipe['works']), ('ndl', recipe['works'])]:
            for a in anchors:
                identifier = a['wikidata'] if kind == 'wikidata' else a['isbn13']; body, receipt = provider.get(kind, identifier)
                name = kind + '-' + identifier; (cache / (name + '.body')).write_bytes(body)
                state['responses'][name] = receipt
                state['attempts'].append({'key': name, 'url': receipt['url'], 'time': 0, 'status': 'succeeded'})
        w.gate.save(cache / 'requests.json', state)
        backup = self.root / 'isolated-public-backup.json'; public_backup_fixture(backup)
        command = ['python3', 'scripts/collection-workflow.py', '--registry', str(self.registry), '--jobs', str(self.jobs),
                   '--reviews', str(self.root / 'reviews'), 'collect-review', self.value['id'], '--revision', '1',
                   '--definition-sha', w.digest(self.value), '--public-backup', str(backup),
                   '--accepted-release', str(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002')]
        for receipt in R2_RECEIPTS:
            command += ['--accepted-receipt', str(receipt)]
        p = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=150)
        self.assertEqual(p.returncode, 0, p.stderr)
        result = json.loads(p.stdout); self.assertFalse(result['collectionUnchanged'])
        self.assertEqual(result['transportAttemptsAdded'], 0)
        self.assertEqual(result['counts'], dict(entities=35, claims=25, sources=21, citations=25))
        self.assertTrue((Path(result['reviewDirectory']) / 'decision-request.json').exists())
        self.assertEqual(w.read(cache / 'requests.json'), state)
        p = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=150)
        self.assertEqual(p.returncode, 0, p.stderr)
        result = json.loads(p.stdout); self.assertTrue(result['collectionUnchanged'] and result['reviewUnchanged'])


if __name__ == '__main__':
    unittest.main()
