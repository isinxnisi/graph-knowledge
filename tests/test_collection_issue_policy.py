"""Issue-level lower budgets and provenance-preserving response reuse, offline."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('policy_fixture', ROOT / 'tests/test_collection_issues.py')
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
i = t.i


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'collection-issues'
        self.old = self.root / 'old/request-cache'
        self.new = self.root / 'new/request-cache'
        self.policy = {**i.POLICY, 'maxAttempts': 30}

    def parsed(self, policy):
        original = t.issue()
        p = i.permission(original); p['requestPolicy'] = policy
        return i.permission({'body': i.BEGIN + chr(10) + '```json' + chr(10) + i.dump(p) + '```' + chr(10) + i.END})

    def test_smaller_and_existing_default_limits_preserve_exact_approval(self):
        for maximum in [1, 30, 141, 142]:
            policy = {**i.POLICY, 'maxAttempts': maximum}
            self.assertEqual(self.parsed(policy)['requestPolicy'], policy)
        self.assertEqual(i.POLICY['maxAttempts'], 142)

    def test_above_cap_nonpositive_boolean_fractional_and_unbounded_limits_rejected(self):
        for value in [143, 0, -1, True, False, 30.0, 30.5, '30', None]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.parsed({**i.POLICY, 'maxAttempts': value})

    def test_all_other_constraints_and_unknown_provider_fields_stay_fixed(self):
        for field in ['attemptsPerRequest', 'minIntervalSeconds', 'timeoutSeconds', 'maxBytes']:
            for value in [i.POLICY[field] + 1, i.POLICY[field] - 1, float(i.POLICY[field])]:
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    self.parsed({**self.policy, field: value})
        for policy in [{**self.policy, 'provider': 'other'}, {k:v for k,v in self.policy.items() if k!='maxBytes'}, None, []]:
            with self.assertRaises(ValueError): self.parsed(policy)

    def seed(self):
        old = i.Acquisition(self.old, i.POLICY)
        old.state['attempts'] = [{'key': 'old-' + str(n), 'time': 0} for n in range(89)]
        body = b'{"entities":{}}'; key = 'wikidata-Q5'; url = i.legacy.request_url('wikidata', 'Q5')
        old.state['responses'][key] = {'url': url, 'sha256': i.legacy.sha(body), 'bytes': len(body), 'fetchedAt': '2026-10-19T00:00:00Z'}
        (self.old / (key + '.body')).write_bytes(body); i.save(old.index, old.state)
        return old, key, url, body

    def test_cache_reuse_keeps_89_of_142_and_new_30_budgets_separate(self):
        old, key, url, body = self.seed(); original = old.index.read_bytes()
        new = i.Acquisition(self.new, self.policy)
        with patch.object(i.urllib.request, 'build_opener', side_effect=AssertionError('no network')):
            self.assertEqual(new.url(key, url)[0], body)
            self.assertEqual(i.Acquisition(self.new, self.policy).url(key, url)[0], body)
        self.assertEqual(new.state['attempts'], [])
        self.assertEqual(new.state['policy']['maxAttempts'], 30)
        self.assertEqual(old.index.read_bytes(), original)
        self.assertEqual(len(i.read(old.index)['attempts']), 89)
        self.assertEqual(i.read(old.index)['policy']['maxAttempts'], 142)
        self.assertIn(key, new.state['reusedResponses'])

    def test_runtime_30th_request_and_restart_refuse_31st(self):
        old, _, _, _ = self.seed(); old_before = old.index.read_bytes()
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, maximum): return b'ok'
        new = i.Acquisition(self.new, self.policy)
        with patch.object(i.urllib.request, 'build_opener') as opener, patch.object(i.time, 'sleep'):
            opener.return_value.open.return_value = Response()
            for n in range(30): new.url('new-' + str(n), 'https://ndlsearch.ndl.go.jp/api/sru?query=' + str(n))
            self.assertEqual(opener.return_value.open.call_count, 30)
            restarted = i.Acquisition(self.new, self.policy)
            with self.assertRaisesRegex(i.transport.TechnicalWait, 'shared-budget-exhausted'):
                restarted.url('new-31', 'https://ndlsearch.ndl.go.jp/api/sru?query=31')
            self.assertEqual(opener.return_value.open.call_count, 30)
        self.assertEqual(len(restarted.state['attempts']), 30)
        # The unchanged child collector uses the SAME durable 30-attempt cache.
        child = i.legacy.Fetcher(self.new, self.policy)
        with self.assertRaisesRegex(ValueError, 'budget exhausted'):
            child.get('wikidata', 'Q999999')
        self.assertEqual(len(child.state['attempts']), 30)
        self.assertEqual(old.index.read_bytes(), old_before)

    def test_cache_tampering_and_foreign_url_rejected(self):
        old, key, url, body = self.seed()
        (self.old / (key + '.body')).write_bytes(b'tampered')
        new = i.Acquisition(self.new, self.policy)
        with self.assertRaisesRegex(i.transport.LocalFailure, 'Prior cache verification failed'): new.url(key, url)
        with self.assertRaisesRegex(i.transport.LocalFailure, 'outside approval'): new.url(key, 'https://example.org/')
        self.assertEqual(new.state['attempts'], [])

    def test_provider_retry_after_survives_reuse_without_copying_attempts(self):
        old, key, url, body = self.seed(); old.state['blockedUntil'] = i.time.time() + 90; i.save(old.index, old.state)
        new = i.Acquisition(self.new, self.policy); new.url(key, url)
        with self.assertRaisesRegex(RuntimeError, 'Retry-After'):
            i.Acquisition(self.new, self.policy).url('other', 'https://www.wikidata.org/w/api.php')
        self.assertEqual(new.state['attempts'], [])


class IntakeTests(unittest.TestCase):
    setUp = t.IssueTests.setUp
    register = t.IssueTests.register
    # Reuse existing end-to-end intake fixture; this one checks the actual parser
    # used by the Worker, not just an isolated policy function.
    def test_30_attempt_issue_is_registered_once_without_changing_permission(self):
        self.live['body'] = self.live['body'].replace('142', '30')
        request = self.register(); self.register()
        self.assertEqual(request['permission']['requestPolicy']['maxAttempts'], 30)
        self.assertEqual(request['issueAdapterSha256'], i.gate.file_hash(ROOT / 'scripts/collection-issues.py'))
        self.assertEqual(request['issueOrigin']['permissionSha256'], i.digest(i.permission(self.live)))

    def test_pinned_adapter_change_stops_before_creating_work_or_spending(self):
        self.live['body'] = self.live['body'].replace('142', '30')
        request = self.register(); request['issueAdapterSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Pinned Issue adapter changed'):
            i.prepare(self.home / 'runtime', request)
        self.assertFalse((self.home / 'runtime/.local/collection-issues').exists())


if __name__ == '__main__': unittest.main()
