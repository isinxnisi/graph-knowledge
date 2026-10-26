"""Offline Issue authorization -> frozen recipe -> unchanged adapter/cache -> review."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value


i = load('issues_test', ROOT / 'scripts/collection-issues.py')
b = load('worker_issues_test', ROOT / 'scripts/collection-worker.py')
fixtures = load('issue_providers', ROOT / 'tests/test_manga_collection_v2.py')
base = load('issue_worker_fixture', ROOT / 'tests/test_collection_worker.py')


def issue():
    p = {'schemaVersion': 1, 'approvalId': 'isolated-test', 'status': 'approved', 'approvalScope': i.SCOPE,
         'adapter': 'manga-discovery-v2', 'requestPolicy': i.POLICY.copy(),
         'targets': [{'person': '浦沢直樹', 'work': 'あさドラ！'}, {'person': '手塚治虫', 'work': 'ブラック・ジャック'}],
         'humanDecision': base.approval()['humanDecision']}
    return {'body': i.BEGIN + '\n```json\n' + i.dump(p) + '```\n' + i.END,
            'html_url': 'https://github.com/isinxnisi/graph-knowledge/issues/999999', 'updated_at': '2026-10-18T00:00:00Z'}


class FakeIssues:
    def __init__(self, value): self.value = value
    def get(self, number): return self.value


class IssueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name); self.store = base.MemoryStore(); self.live = issue()
        self.config = {'home': str(self.home), 'workerId': 'isolated-worker', 'codeCommit': '0' * 40}
        self.worker = b.Worker(self.config, self.store, base.FakeExecutor(self.home), base.no_lock,
            clock=lambda: 1792346400)
        self.worker.issue_api = FakeIssues(self.live)
        self.store.files[b.PREFIX + 'issue-sources/999999.json'] = i.dump({'schemaVersion': 1, 'repository': i.REPOSITORY,
            'issueNumber': 999999, 'workerId': self.config['workerId']}).encode()

    def register(self):
        b.issues.poll(self.worker)
        requests = [json.loads(v) for k, v in self.store.files.items() if '/requests/' in k]
        self.assertEqual(len(requests), 1); return requests[0]

    def test_existing_permission_once_and_original_human_time_preserved(self):
        request = self.register(); self.register()
        self.assertEqual(request['humanDecision'], i.permission(self.live)['humanDecision'])
        self.assertEqual(request['permission']['targets'], i.permission(self.live)['targets'])
        self.assertEqual(request['recipeRevisionCount'], 2)
        b.issues.assert_live(request, self.worker.issue_api)

    def test_no_permission_or_ai_suggestion_never_queues(self):
        for value in [{'body': '収集したい'}, {**self.live, 'body': self.live['body'].replace('"human"', '"ai"')}]:
            self.worker.issue_api.value = value; b.issues.poll(self.worker)
            self.assertFalse(any('/requests/' in k for k in self.store.files))

    def test_mutated_or_revoked_permission_holds_old_queue(self):
        request = self.register()
        for body in [self.live['body'].replace('"approved"', '"revoked"'), self.live['body'].replace('142', '143'), self.live['body'].replace('142', '30')]:
            self.worker.issue_api.value = {**self.live, 'body': body}
            with self.assertRaises(ValueError): b.issues.assert_live(request, self.worker.issue_api)
            b.issues.poll(self.worker)
            self.assertEqual(len([k for k in self.store.files if '/requests/' in k]), 1)

    def test_issue_editorial_changes_do_not_expand_frozen_scope(self):
        request = self.register(); self.worker.issue_api.value['body'] += '\n別の未承認計画'
        b.issues.assert_live(request, self.worker.issue_api); self.register()

    def test_prepared_children_and_completed_parent_publish_atomically(self):
        request = self.register(); record = {'phase': 'completed', 'workerId': self.config['workerId'],
            'requestSha256': i.gate.digest(self.store.files[b.PREFIX + 'requests/' + request['id'] + '.json']), 'generation': 1,
            'result': {'batchRequests': [{**base.approval('isolated-child'), 'parentRequestId': request['id']}]}}
        self.worker.publish(request, record, {'datasets/review/README.md': b'isolated'})
        self.assertEqual(self.store.json(b.PREFIX + 'results/' + request['id'] + '/status.json')[0]['phase'], 'completed')
        self.assertIn(b.PREFIX + 'requests/isolated-child.json', self.store.files)
        self.worker.publish(request, record, {'datasets/review/README.md': b'isolated'})

    def test_scheduled_parent_then_child_after_persistent_rest(self):
        request = self.register(); executor = self.worker.executor
        child = {**base.approval('isolated-child'), 'parentRequestId': request['id'], 'issueOrigin': request['issueOrigin']}
        original = executor.run
        def run(value, monitor, fd):
            if value['kind'] != 'issue-prepare': return original(value, monitor, fd)
            executor.calls += 1; monitor(); return {'batchRequests': [child], 'publicApply': False}
        with patch.object(executor, 'run', side_effect=run):
            self.worker.tick()
            self.assertEqual(self.worker.state['requests'][request['id']]['phase'], 'completed')
            clock = self.worker.now()
            def tick(advance):
                worker = b.Worker(self.config, self.store, executor, base.no_lock, clock=lambda: clock + advance)
                worker.issue_api = self.worker.issue_api; worker.tick(); return worker
            self.assertEqual(tick(60).state['requests'][child['id']]['phase'], 'waiting-control')
            self.assertEqual(tick(600).state['requests'][child['id']]['phase'], 'completed')
            self.assertEqual(tick(1200).state['requests'][child['id']]['phase'], 'completed')
            self.assertEqual(executor.calls, 2)
    def test_shared_budget_survives_restart_and_cached_bodies_do_not_spend(self):
        directory = self.home / 'cache'; f = i.Acquisition(directory, i.POLICY)
        url = i.legacy.request_url('wikidata', 'Q5'); body = b'{"entities":{}}'
        f.state['attempts'] = [{'key': 'prior-' + str(n), 'time': 0} for n in range(142)]
        f.state['responses']['wikidata-Q5'] = {'url': url, 'sha256': i.legacy.sha(body), 'bytes': len(body), 'fetchedAt': 'test'}
        (directory / 'wikidata-Q5.body').write_bytes(body); i.save(f.index, f.state)
        f = i.Acquisition(directory, i.POLICY)
        self.assertEqual(f.url('wikidata-Q5', url)[0], body)
        with self.assertRaisesRegex(i.transport.TechnicalWait, 'shared-budget-exhausted'): f.url('wikidata-Q6', i.legacy.request_url('wikidata', 'Q6'))
        self.assertEqual(len(f.state['attempts']), 142)

    def test_transport_interruption_counts_before_request_and_retry_after_is_durable(self):
        f = i.Acquisition(self.home / 'cache', i.POLICY)
        import urllib.error
        error = urllib.error.HTTPError('https://www.wikidata.org/', 429, 'slow down', {'Retry-After': '90'}, None)
        with patch.object(i.urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(RuntimeError): f.url('test', 'https://www.wikidata.org/w/api.php')
            self.assertEqual(len(f.state['attempts']), 1)
            f = i.Acquisition(f.directory, i.POLICY)
            with self.assertRaisesRegex(RuntimeError, 'Retry-After'): f.url('test', 'https://www.wikidata.org/w/api.php')
            self.assertEqual(len(f.state['attempts']), 1)

    def test_ambiguous_qid_and_scope_are_held_without_role_inference(self):
        provider = fixtures.ReviewedProvider()
        entity = next(e for e in provider.entities.values() if 'Q5' in i.legacy.item_ids(e, 'P31'))
        fake = type('F', (), {'api': lambda s, **kw: {'search': []}})()
        with self.assertRaises(ValueError): i.identify(fake, '不明人物', 'person', {'x': entity})
        work = next(e for e in provider.entities.values() if i.legacy.item_ids(e, 'P31') & {'Q21198342', 'Q8274'})
        with self.assertRaises(ValueError): i.choose_publication([], False, '人物', work)

    def test_publication_date_precision_and_ndl_dot_notation(self):
        self.assertEqual(i.date_range('1995.6'), i.date_range('1995-06'))
        self.assertLess(i.date_range('1994')[1], i.date_range('1995.1')[0])
        self.assertGreaterEqual(i.date_range('1995')[1], i.date_range('1995.6')[0])
        for value in ['1995-13', '1995-02-31', '不明', None]: self.assertIsNone(i.date_range(value))

    def test_nested_bibliography_reference_cannot_erase_publication_date(self):
        provider = fixtures.ReviewedProvider(); record = next(iter(provider.records.values()))
        tree = i.ET.fromstring(fixtures.record_xml(record)); data = tree.find('.//srw:recordData', i.legacy.NS)
        inner = i.ET.fromstring(data.text); bib = inner.find('.//ndl:BibResource', i.legacy.NS)
        i.ET.SubElement(bib, '{' + i.legacy.NS['dct'] + '}issued').text = '2000'
        i.ET.SubElement(bib, '{' + i.legacy.NS['dct'] + '}date').text = '2000.6'
        i.ET.SubElement(i.ET.SubElement(bib, '{test}holding'), '{' + i.legacy.NS['ndl'] + '}BibResource', {i.legacy.RDF + 'about': record['url'] + '#material'})
        data.text = i.ET.tostring(inner, encoding='unicode')
        records, _ = i.publication_records(i.ET.tostring(tree))
        self.assertTrue(records); self.assertEqual(records[0]['issued'], '2000.6')

    def test_technical_preparation_retry_requires_same_scope_and_no_dispatched_children(self):
        previous = self.register(); request = copy.deepcopy(previous)
        request.update(id=previous['id'] + '-repair1', preparationCycle='repair1', resumePreparationId=previous['id'], parentRequestId=previous['id'])
        executor = object.__new__(b.Executor); executor.workflow = object(); executor.root = self.home
        executor.sync_inputs = lambda commit: None
        parent = {'requestId': previous['id'], 'kind': 'issue-prepare', 'phase': 'completed', 'request': previous, 'result': {'batchRequests': []}}
        executor.validate(request, parent); self.worker.approved(request)
        parent['result']['batchRequests'] = [base.approval()]
        with self.assertRaisesRegex(b.Blocked, 'without dispatched children'): executor.validate(request, parent)

    def test_offline_prepare_resume_gate_adapter_and_review(self):
        request = self.register(); root = self.home / 'runtime'; root.mkdir()
        shutil.copytree(ROOT / 'scripts', root / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
        for name in [i.CATALOG, 'datasets/collection-themes/themes/famous-manga-creators/r0003.json',
                     'datasets/public-kg/releases/20261014-credits-001/data.json', 'datasets/public-kg/releases/20261014-credits-001/manifest.json']:
            target = root / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT / name, target)
        provider = fixtures.ReviewedProvider(); recipe = i.read(ROOT / 'datasets/manga-collection/r0003/recipe.json')
        people = {p['name']: p for p in recipe['people']}; works = {w['name']: w for w in recipe['works']}
        entities = {**provider.entities}
        # Synthetic exact-name alias: real shortened titles without one must remain held.
        entities[works['あさドラ！']['wikidata']].setdefault('aliases', {}).setdefault('ja', []).append({'language': 'ja', 'value': 'あさドラ！'})
        entities[works['あさドラ！']['wikidata']]['aliases']['ja'].append({'language': 'ja', 'value': 'あさドラ! : 連続漫画小説'})
        class Offline(i.Acquisition):
            interrupted = False
            def api(self, **params): return {'entities': entities}
            def url(self, key, url):
                if key.startswith('ndl-') and not Offline.interrupted:
                    Offline.interrupted = True
                    raise RuntimeError('isolated preparation interruption')
                if key.startswith('publication-'):
                    name = next(t['work'] for t in request['permission']['targets'] if t['work'] in i.urllib.parse.unquote(url))
                    data = copy.deepcopy(provider.records[works[name]['isbn13']]); data['volume'] = ['1']
                    body = fixtures.record_xml(data)
                    tree = i.ET.fromstring(body); node = tree.find('.//srw:recordData', i.legacy.NS)
                    inner = i.ET.fromstring(node.text)
                    bib = inner.find('.//ndl:BibResource', i.legacy.NS)
                    i.ET.SubElement(bib, '{' + i.legacy.NS['dct'] + '}issued').text = '2000-01'
                    node.text = i.ET.tostring(inner, encoding='unicode'); body = i.ET.tostring(tree)
                elif key.startswith('ndl-'):
                    data = copy.deepcopy(provider.records[key[4:]]); data['volume'] = ['1']; body = fixtures.record_xml(data)
                else: body = provider.get('wikidata', key[9:])[0]
                if key not in self.state['responses']:
                    r = {'url': url, 'sha256': i.legacy.sha(body), 'bytes': len(body), 'fetchedAt': '2026-10-18T00:00:00Z'}
                    self.state['responses'][key] = r; self.state['attempts'].append({'key': key, 'time': 0, 'status': 'succeeded'})
                    (self.directory / (key + '.body')).write_bytes(body); i.save(self.index, self.state)
                return body, self.state['responses'][key]
        with self.assertRaisesRegex(RuntimeError, 'preparation interruption'): i.prepare(root, request, Offline)
        progress_path = root / '.local/collection-issues' / request['id'] / 'progress.json'
        original_progress = progress_path.read_bytes(); broken = i.read(progress_path)
        broken['payload']['stamp'] = 'unreviewed change'; i.save(progress_path, broken)
        with self.assertRaisesRegex(ValueError, 'checkpoint hash'): i.prepare(root, request, Offline)
        progress_path.write_bytes(original_progress)
        result = i.prepare(root, request, Offline)
        self.assertEqual(result['counts']['batches'], 2, result['holds'])
        self.assertEqual(result['counts']['preparedWorks'], 2)
        self.assertEqual(i.prepare(root, request, Offline), result)
        manga = load('isolated_issue_adapter', root / 'scripts/collect-manga-v2.py')
        workflow = load('isolated_issue_review', root / 'scripts/collection-workflow.py')
        public = i.read(root / 'datasets/public-kg/releases/20261014-credits-001/data.json')
        for child in result['batchRequests']:
            value = workflow.gate.definition(root / 'datasets/collection-themes', child['target']['themeId'], child['target']['revision'])
            packet = workflow.gate.packet(root / 'datasets/collection-themes', value)
            key = workflow.gate.content_hash({'order': packet, 'runnerSha256': workflow.gate.file_hash(root / 'scripts/collection-themes.py')})
            job = root / '.local/collection-jobs' / (value['id'] + '-r' + str(value['revision']).zfill(4) + '-' + key[:16])
            self.assertTrue((job / 'request-cache').is_symlink())
            before = i.read(job / 'request-cache/requests.json')
            staging = job / 'artifacts'; staging.mkdir(); i.save(job / 'work-order.json', packet)
            summary = manga.build(root, value['execution'], staging, job / 'request-cache')
            # Exercise the real public fixture schema, not only the Python generator/reviewer.
            self.assertTrue(i.gate.technical_validation(staging / 'validation-only')['valid'])
            self.assertEqual(i.read(job / 'request-cache/requests.json'), before)
            candidates = i.read(staging / 'candidate/data.json')
            original = {c['id'] for c in public['claims']}
            added = [c for c in candidates['claims'] if c['id'] not in original]
            self.assertTrue(added); self.assertTrue(all(c['visibility'] == 'hidden' for c in added))
            i.save(job / 'job.json', {'jobId': job.name, 'status': 'candidate-ready', 'workOrder': packet, 'artifacts': workflow.gate.inventory(staging)})
            bundle = workflow.review_job(job, public, {'release': '20261014-credits-001', 'revision': 'isolated-only',
                'observation': 'isolated-fixture-not-live', 'references': []}, {f: [] for f in workflow.FIELDS}, [])
            self.assertIn('decision-request.json', bundle)
            review, _ = workflow.write_review(root / 'isolated-reviews', bundle)
            self.assertTrue((review / 'README.md').is_file())
            self.assertTrue(bundle['exploration-paths.json'])
            self.assertTrue(all(c['visibility'] == 'hidden' for c in bundle['proposed-records.json']['records']['claims']))
            self.assertFalse((root / 'datasets/manga-collection/decisions').exists())
        # Immutable result/input reuse detects tampering instead of rebinding approval.
        victim = next(iter(result['generatedArtifacts'])); (root / victim).write_text('{}')
        with self.assertRaisesRegex(ValueError, 'changed'): i.prepare(root, request, Offline)


if __name__ == '__main__': unittest.main()
