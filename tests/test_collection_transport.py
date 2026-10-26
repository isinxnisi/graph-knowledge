"""No provider calls: diagnostics, bounded recovery and preparation -> real review."""
import copy
from datetime import datetime, timezone
import errno
import importlib.util
import json
from pathlib import Path
import shutil
import socket
import ssl
import tempfile
import time
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('transport_fixtures', ROOT / 'tests/test_collection_issues.py')
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
i, b, transport = t.i, t.b, t.i.transport


def runtime(root):
    root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'scripts', root / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
    for name in [i.CATALOG, 'datasets/collection-themes/themes/famous-manga-creators/r0003.json',
                 'datasets/public-kg/releases/20261014-credits-001/data.json', 'datasets/public-kg/releases/20261014-credits-001/manifest.json']:
        target = root / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT / name, target)


def request():
    live = t.issue(); p = i.permission(live); p['requestPolicy']['maxAttempts'] = 30
    live['body'] = i.BEGIN + '\n```json\n' + i.dump(p) + '```\n' + i.END
    return dict(schemaVersion=1, id='isolated-transport', kind='issue-prepare', status='approved',
                sourceCommit='0' * 40, approvalScope=i.SCOPE, humanDecision=p['humanDecision'], permission=p,
                issueOrigin=dict(repository=i.REPOSITORY, issueNumber=999999, approvalId=p['approvalId'],
                                 permissionSha256=i.digest(p), issueBodySha256=i.gate.digest(live['body'].encode())),
                issueSnapshot=live, firstRecipeRevision=9900, recipeRevisionCount=2, applyAuthorized=b.NO_APPLY)


class Response:
    status = 200
    def __init__(self, body=b'OK', error=None): self.body, self.error = body, error
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, maximum):
        if self.error: raise self.error
        return self.body[:maximum]


class Provider:
    """Original reviewed fixture fields, no network; one title deliberately unavailable."""
    def __init__(self, failing=True):
        self.failing = failing
        self.fixture = t.fixtures.ReviewedProvider()
        self.entities = copy.deepcopy(self.fixture.entities)
        recipe = i.read(ROOT / 'datasets/manga-collection/r0003/recipe.json')
        self.works = {w['name']: w for w in recipe['works']}
        e = self.entities[self.works['あさドラ！']['wikidata']]
        e.setdefault('aliases', {}).setdefault('ja', []).extend([
            {'language': 'ja', 'value': 'あさドラ！'}, {'language': 'ja', 'value': 'あさドラ! : 連続漫画小説'}])
        self.urls = []
    def open(self, req, timeout):
        url = req.full_url; self.urls.append(url)
        if '/w/api.php?' in url: return Response(json.dumps({'entities': self.entities}, ensure_ascii=False).encode())
        if '/Special:EntityData/' in url:
            qid = url.split('/')[-1].removesuffix('.json')
            return Response(json.dumps({'entities': {qid: self.entities[qid]}}, ensure_ascii=False).encode())
        query = i.urllib.parse.parse_qs(i.urllib.parse.urlsplit(url).query)['query'][0]
        if query.startswith('title='):
            name = next(n for n in ['あさドラ！', 'ブラック・ジャック'] if n in query)
            if self.failing and name == 'あさドラ！': raise TimeoutError('secret_token_should_never_be_logged')
            record = copy.deepcopy(self.fixture.records[self.works[name]['isbn13']])
        else: record = copy.deepcopy(self.fixture.records[query.split('"')[1]])
        record['volume'] = ['1']
        tree = i.ET.fromstring(t.fixtures.record_xml(record)); data = tree.find('.//srw:recordData', i.legacy.NS)
        inner = i.ET.fromstring(data.text); bib = inner.find('.//ndl:BibResource', i.legacy.NS)
        i.ET.SubElement(bib, '{' + i.legacy.NS['dct'] + '}issued').text = '2000-01'
        data.text = i.ET.tostring(inner, encoding='unicode')
        return Response(i.ET.tostring(tree))


def grant(fetch, previous, key, url, now, successor):
    return {'schemaVersion': 1, 'approvalScope': transport.SCOPE,
            'predecessorRequestSha256': i.digest(previous),
            'successorRequestSha256': i.digest({k: v for k, v in successor.items() if k != 'transportRecovery'}), 'permissionSha256': previous['issueOrigin']['permissionSha256'],
            'ledgerSha256': i.gate.file_hash(fetch.index), 'attemptCount': len(fetch.state['attempts']),
            'requests': [{'key': key, 'url': url, 'additionalAttempts': 1}],
            'humanDecision': {'actorType': 'human', 'reviewer': 'isolated-human-not-live-approval',
                              'statement': 'TEST ONLY: one transport retry, no acceptance or apply',
                              'decidedAt': datetime.fromtimestamp(now - 1, timezone.utc).isoformat()},
            'expiresAt': datetime.fromtimestamp(now + 3600, timezone.utc).isoformat()}


def review(root, result):
    manga = t.load('transport_manga_review', root / 'scripts/collect-manga-v2.py')
    workflow = t.load('transport_workflow_review', root / 'scripts/collection-workflow.py')
    public = i.read(root / 'datasets/public-kg/releases/20261014-credits-001/data.json')
    counts = []
    for child in result['batchRequests']:
        value = workflow.gate.definition(root / 'datasets/collection-themes', child['target']['themeId'], child['target']['revision'])
        packet = workflow.gate.packet(root / 'datasets/collection-themes', value)
        key = workflow.gate.content_hash({'order': packet, 'runnerSha256': workflow.gate.file_hash(root / 'scripts/collection-themes.py')})
        job = root / '.local/collection-jobs' / (value['id'] + '-r' + str(value['revision']).zfill(4) + '-' + key[:16])
        staging = job / 'artifacts'; staging.mkdir(); i.save(job / 'work-order.json', packet)
        before = (job / 'request-cache/requests.json').read_bytes()
        manga.build(root, value['execution'], staging, job / 'request-cache')
        assert i.gate.technical_validation(staging / 'validation-only')['valid']
        i.save(job / 'job.json', {'jobId': job.name, 'status': 'candidate-ready', 'workOrder': packet,
                                'artifacts': workflow.gate.inventory(staging)})
        bundle = workflow.review_job(job, public, {'release': '20261014-credits-001', 'revision': 'isolated',
                    'observation': 'offline-test-not-live', 'references': []}, {f: [] for f in workflow.FIELDS}, [])
        directory, _ = workflow.write_review(root / 'isolated-reviews', bundle)
        assert (directory / 'decision-request.json').exists()
        assert before == (job / 'request-cache/requests.json').read_bytes()
        counts.append({f: len(v) for f, v in bundle['proposed-records.json']['records'].items()})
    return counts


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name); self.policy = {**i.POLICY, 'maxAttempts': 30}
        self.url = i.legacy.request_url('ndl', '9784091885579')
        self.fetch = i.Acquisition(self.home / 'cache', self.policy, reuse_sources=[])

    def call(self, response=None, error=None):
        with patch.object(i.urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = error
            opener.return_value.open.return_value = response or Response()
            return self.fetch.url('ndl-9784091885579', self.url)

    def test_open_and_read_phase_elapsed_http_and_safe_causes(self):
        errors = [(TimeoutError('SECRET'), 'open-through-response-headers'),
                  (urllib.error.URLError(socket.gaierror(-3, 'SECRET')), 'dns'),
                  (urllib.error.URLError(ssl.SSLError('SECRET')), 'tls'),
                  (ConnectionRefusedError(errno.ECONNREFUSED, 'SECRET'), 'tcp-connect')]
        for error, phase in errors:
            self.fetch.state['attempts'] = []; self.fetch.state['requestRetryAt'] = {}
            with self.assertRaises(transport.TechnicalWait): self.call(error=error)
            row = self.fetch.state['attempts'][-1]['diagnostic']
            self.assertEqual(row['phase'], phase); self.assertGreaterEqual(row['elapsedSeconds'], 0)
            self.assertNotIn('SECRET', json.dumps(self.fetch.state))
        self.fetch.state['attempts'] = []; self.fetch.state['requestRetryAt'] = {}
        with self.assertRaises(transport.TechnicalWait): self.call(Response(error=TimeoutError('SECRET')))
        row = self.fetch.state['attempts'][-1]['diagnostic']
        self.assertEqual((row['phase'], row['httpStatus']), ('response-body-read', 200))

    def test_http_retry_after_is_provider_specific_and_durable(self):
        for code in [429, 503]:
            self.fetch.state = {'policy': self.policy, 'attempts': [], 'responses': {}, 'blockedUntil': 0}
            error = urllib.error.HTTPError(self.url, code, 'SECRET', {'Retry-After': '90'}, None)
            with self.assertRaises(transport.TechnicalWait): self.call(error=error)
            row = self.fetch.state['attempts'][-1]['diagnostic']
            self.assertEqual(row['httpStatus'], code)
            restarted = i.Acquisition(self.fetch.directory, self.policy, reuse_sources=[])
            with self.assertRaises(transport.TechnicalWait): restarted.url('other', self.url)
            # NDL cooldown must not block independent Wikidata.
            with patch.object(i.urllib.request, 'build_opener') as opener, patch.object(i.time, 'sleep'):
                opener.return_value.open.return_value = Response()
                restarted.url('wikidata-Q5', i.legacy.request_url('wikidata', 'Q5'))
            self.assertEqual(len(restarted.state['attempts']), 2)

    def test_cache_disk_contract_and_secrets_are_not_transport_or_holds(self):
        with self.assertRaises(transport.LocalFailure):
            self.fetch.url('bad', self.url + '&token=SECRET')
        self.assertEqual(self.fetch.state['attempts'], [])
        with self.assertRaises(transport.LocalFailure): self.call(Response(b'x' * (self.policy['maxBytes'] + 1)))
        self.assertEqual(self.fetch.state['attempts'][-1]['diagnostic']['category'], 'response-contract')
        self.fetch.state['attempts'] = []
        with patch.object(Path, 'write_bytes', side_effect=OSError('SECRET disk')):
            with self.assertRaises(transport.LocalFailure): self.call()
        self.assertEqual(self.fetch.state['attempts'][-1]['diagnostic']['category'], 'local-processing')
        self.assertNotIn('error', self.fetch.state['attempts'][-1])
        # Power loss/process death after durable handoff consumes the slot on restart.
        crashed = i.Acquisition(self.home / 'crash-cache', self.policy, reuse_sources=[])
        with patch.object(i.urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = KeyboardInterrupt()
            for _ in range(2):
                with self.assertRaises(KeyboardInterrupt), patch.object(i.time, 'sleep'):
                    crashed.url('same', self.url)
                crashed = i.Acquisition(crashed.directory, self.policy, reuse_sources=[])
            with self.assertRaises(transport.TechnicalWait): crashed.url('same', self.url)
            self.assertEqual(opener.return_value.open.call_count, 2)
        self.assertEqual([a['status'] for a in crashed.state['attempts']], ['started', 'started'])


    def exhausted(self):
        self.fetch.state['attempts'] = [dict(key='ndl-9784091885579', url=self.url, time=0, status='failed', error='TimeoutError') for _ in range(2)]
        self.fetch.persist()
        previous = request(); new = copy.deepcopy(previous)
        new.update(id='isolated-recovery', resumePreparationId=previous['id'], parentRequestId=previous['id'], preparationCycle='recovery')
        new['transportRecovery'] = grant(self.fetch, previous, 'ndl-9784091885579', self.url, time.time(), new)
        return previous, new

    def test_recovery_bound_to_url_permission_history_expiry_and_no_replay(self):
        previous, new = self.exhausted(); original = self.fetch.index.read_bytes()
        for field, value in [('ledgerSha256', '0' * 64), ('permissionSha256', '0' * 64), ('predecessorRequestSha256', '0' * 64), ('successorRequestSha256', '0' * 64),
                             ('expiresAt', '2000-01-01T00:00:00Z')]:
            bad = copy.deepcopy(new); bad['transportRecovery'][field] = value
            with self.assertRaises(ValueError): transport.install_grant(self.fetch, bad, previous)
            self.assertEqual(self.fetch.index.read_bytes(), original)
        for field, value in [('url', self.url + '&query=other'), ('additionalAttempts', 3)]:
            bad = copy.deepcopy(new); bad['transportRecovery']['requests'][0][field] = value
            with self.assertRaises(ValueError): transport.install_grant(self.fetch, bad, previous)
        transport.install_grant(self.fetch, new, previous); saved = self.fetch.index.read_bytes()
        transport.install_grant(self.fetch, new, previous); self.assertEqual(saved, self.fetch.index.read_bytes())
        # Original request has no grant even though the cache now contains one.
        old = i.Acquisition(self.fetch.directory, self.policy)
        with self.assertRaises(transport.TechnicalWait): old.url('ndl-9784091885579', self.url)
        self.call(); self.assertEqual(len(self.fetch.state['attempts']), 3)
        self.fetch.state['responses'] = {}; self.fetch.persist()
        with self.assertRaises(transport.TechnicalWait): self.call()
        self.assertEqual(len(self.fetch.state['attempts']), 3)

    def test_cli_local_failure_is_sanitized_and_stops_logical_worker_retries(self):
        import subprocess
        import sys
        source = self.home / 'invalid-request.json'
        source.write_text(json.dumps({'permission': {'password': 'SECRET'}}))
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/collection-issues.py'), '--request', str(source)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('SECRET', result.stdout + result.stderr)
        failure = json.loads(result.stderr)
        self.assertEqual(failure['failureCategory'], 'local-processing')
        self.assertTrue(failure['humanReviewRequired'])
        self.assertIsInstance(b.workflow_failure(result.stderr), b.Blocked)
        source.write_text(json.dumps({'permission': None}))
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/collection-issues.py'), '--request', str(source)], capture_output=True, text=True)
        self.assertEqual(json.loads(result.stderr)['failureCategory'], 'local-processing')

    def test_http_body_interruption_and_expired_grant_and_changed_history_do_not_resume(self):
        import http.client
        with self.assertRaises(transport.TechnicalWait): self.call(Response(error=http.client.IncompleteRead(b'SECRET')))
        self.assertEqual(self.fetch.state['attempts'][-1]['diagnostic']['phase'], 'response-body-read')
        previous, new = self.exhausted(); transport.install_grant(self.fetch, new, previous)
        with patch.object(transport.time, 'time', return_value=time.time() + 7200):
            with self.assertRaises(transport.TechnicalWait): self.call()
        self.fetch.state['attempts'][0]['status'] = 'tampered'
        with self.assertRaisesRegex(ValueError, 'history changed'): transport.install_grant(self.fetch, new, previous)

    def test_total_budget_cannot_be_extended_by_recovery(self):
        previous, new = self.exhausted()
        self.fetch.state['attempts'] += [dict(key='prior-' + str(n), time=0) for n in range(28)]
        self.fetch.persist(); new['transportRecovery'] = grant(self.fetch, previous, 'ndl-9784091885579', self.url, time.time(), new)
        with self.assertRaisesRegex(ValueError, 'shared budget'): transport.install_grant(self.fetch, new, previous)
        self.assertEqual(len(self.fetch.state['attempts']), 30)

    def test_two_timeouts_sibling_progress_permission_recovery_real_candidate_and_review(self):
        root = self.home / 'runtime'; runtime(root); old = request()
        work = root / '.local/collection-issues' / old['id']; i.frozen(work / 'request.json', old)
        provider = Provider(); start = time.time()
        with patch.object(i.urllib.request, 'build_opener', return_value=provider), patch.object(i.time, 'sleep'):
            first = i.prepare(root, old)
            self.assertEqual(first['status'], 'technical-incomplete'); self.assertEqual(first['counts']['holds'], 0)
            self.assertEqual(first['counts']['identifiedWorks'], 1)  # sibling already acquired
            self.assertFalse((work / 'result.json').exists())
            with patch.object(i.time, 'time', return_value=start + 600): second = i.prepare(root, old)
            self.assertIsNone(second['retryAt']); self.assertEqual(second['counts']['holds'], 0)
            ledger = work / 'request-cache/requests.json'; before = i.read(ledger); bytes_before = ledger.read_bytes()
            self.assertEqual(i.prepare(root, old)['counts']['networkAttempts'], len(before['attempts']))
            self.assertEqual(ledger.read_bytes(), bytes_before)
            failed = second['technicalWaits'][0]
            new = copy.deepcopy(old); new.update(id=old['id'] + '-recovery', preparationCycle='recovery', resumePreparationId=old['id'], parentRequestId=old['id'])
            f = i.Acquisition(work / 'request-cache', self.policy)
            new['transportRecovery'] = grant(f, old, failed['key'], next(a['url'] for a in before['attempts'] if a['key'] == failed['key']), start + 601, new)
            provider.failing = False
            with patch.object(i.time, 'time', return_value=start + 900): result = i.prepare(root, new)
            self.assertEqual(result['counts']['preparedWorks'], 2); self.assertEqual(result['holds'], [])
            after = i.read(ledger); self.assertEqual(after['attempts'][:len(before['attempts'])], before['attempts'])
            self.assertTrue(all(after['responses'][k] == v for k, v in before['responses'].items()))
            self.assertEqual(len(after['attempts']) - len(before['attempts']), 2)  # selected search + missing canonical
            self.assertEqual(i.read(work / 'request.json'), old); self.assertFalse((work / 'result.json').exists())
            self.assertEqual(i.prepare(root, new), result)  # frozen idempotent result
            counts = review(root, result)
            self.assertTrue(all(c['claims'] > 0 for c in counts))
            self.assertNotIn('SECRET', json.dumps(after))

    def test_sunny_saved_first_collection_keeps_literal_scope_and_excludes_special_edition(self):
        fixture = i.read(ROOT / 'tests/fixtures/issue42-sunny-publications.json')
        records = fixture['records']; entity = {'labels': {'ja': {'value': 'Sunny'}}}
        chosen = i.choose_publication(records, False, '松本大洋', entity)
        self.assertEqual(chosen['volume'], ['第1集'])
        self.assertEqual(chosen['isbn13'], ['9784091885579']); self.assertEqual(chosen['edition'], [])
        special = [r for r in records if r['edition']]
        with self.assertRaises(ValueError): i.choose_publication(special, False, '松本大洋', entity)
        for field, value in [('volume', ['第2集']), ('responsibilities', ['別人 著']), ('language', ['eng']),
                             ('mainTitles', ['別作品']), ('isbn13', ['9784091885579', '9784091591029'])]:
            bad = copy.deepcopy(chosen); bad[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                i.choose_publication([bad], False, '松本大洋', entity)

    def test_worker_technical_wait_not_completed_or_semantic_block_and_restart_retains_rest(self):
        home = self.home / 'worker'; home.mkdir(); config = {'home': str(home), 'workerId': 'isolated-worker', 'codeCommit': '0' * 40}
        store = t.base.MemoryStore(); executor = t.base.FakeExecutor(home); req = request()
        store.submit(req); now = 1792346400
        result = {'preparationComplete': False, 'batchRequests': [], 'technicalWaits': [], 'retryAt': now + 60}
        def tick(stamp):
            w = b.Worker(config, store, executor, t.base.no_lock, clock=lambda: stamp)
            w.issue_api = t.FakeIssues(req['issueSnapshot']); w.tick(); return w
        with patch.object(executor, 'run', return_value=result) as run:
            w = tick(now); self.assertEqual(w.state['requests'][req['id']]['phase'], 'retry-transport')
            self.assertFalse(w.state['requests'][req['id']]['executionComplete'])
            tick(now + 120); self.assertEqual(run.call_count, 1)  # existing ten-minute rest
            result['retryAt'] = None; w = tick(now + 600)
            self.assertEqual(w.state['requests'][req['id']]['phase'], 'awaiting-recovery')
            tick(now + 1200); self.assertEqual(run.call_count, 2)  # no endless logical retries


if __name__ == '__main__': unittest.main()
