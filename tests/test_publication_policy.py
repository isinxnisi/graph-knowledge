"""Cryptographic bindings and isolated recovery policy; no production adapter."""
import base64
import copy
import datetime as dt
import hashlib
import subprocess
import tempfile
from pathlib import Path
import unittest
import uuid
import test_collection_sequence as fixtures

p = fixtures.module('publication_policy_test', Path(__file__).resolve().parents[1] / 'scripts/publication-policy.py')


class PublicationPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root = Path(self.tmp.name)
        self.private = self.root / 'ephemeral-test-key.pem'; self.public = self.root / 'public.pem'
        subprocess.run(['openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(self.private)], check=True, capture_output=True)
        self.private.chmod(0o600)
        subprocess.run(['openssl', 'pkey', '-in', str(self.private), '-pubout', '-out', str(self.public)], check=True, capture_output=True)
        self.trust = hashlib.sha256(self.public.read_bytes()).hexdigest()
        self.now = dt.datetime(2026, 10, 20, 8, tzinfo=dt.timezone.utc)
        self.request = {'schemaVersion': 1, 'purpose': 'public-kg-publication', 'environment': 'production',
            'release': 'next', 'baseRelease': 'published', 'baseRevision': str(uuid.uuid4()),
            'receiptSetSha256': 'a' * 64, 'artifactSha256': 'b' * 64, 'planSha256': 'c' * 64, 'operatorDigest': 'sha256:' + 'd' * 64}
        self.payload = {**self.request, 'nonce': str(uuid.uuid4()), 'issuedAt': (self.now - dt.timedelta(minutes=1)).isoformat(),
            'expiresAt': (self.now + dt.timedelta(hours=1)).isoformat()}
        self.current = {**self.request, 'release': 'published', 'revision': self.request['baseRevision'], 'usedReleases': ['published']}

    def sign(self):
        (self.root / 'payload').write_bytes(p.canonical(self.payload))
        signature = subprocess.run(['openssl', 'pkeyutl', '-sign', '-rawin', '-inkey', str(self.private), '-in', str(self.root / 'payload')], check=True, capture_output=True).stdout
        return {'payload': copy.deepcopy(self.payload), 'signature': base64.b64encode(signature).decode()}

    def check(self, used=()):
        payload = p.verify_signature(self.sign(), self.public, self.trust)
        return p.check_approval(payload, self.request, self.current, used, self.now)

    def test_valid_signature_is_offline_only(self): self.assertFalse(self.check()['productionExecutionEnabled'])

    def test_signed_payload_tamper_fails(self):
        signed = self.sign(); signed['payload']['release'] = 'other'
        with self.assertRaisesRegex(ValueError, 'signature is invalid'): p.verify_signature(signed, self.public, self.trust)

    def test_untrusted_key_fails(self):
        with self.assertRaisesRegex(ValueError, 'Untrusted'): p.verify_signature(self.sign(), self.public, 'f' * 64)

    def test_each_binding_is_exact_even_when_resigned(self):
        for key in p.BINDINGS:
            original = self.payload[key]; self.payload[key] = 'different'
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'exact publication'): self.check()
            self.payload[key] = original

    def test_each_current_binding_change_makes_approval_stale(self):
        for key in ['environment', 'release', 'revision', 'receiptSetSha256', 'artifactSha256', 'planSha256', 'operatorDigest']:
            original = self.current[key]; self.current[key] = 'changed'
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'stale'): self.check()
            self.current[key] = original

    def test_expired_future_overlong_and_naive_time_fail(self):
        for changes in [dict(expiresAt=self.now.isoformat()), dict(issuedAt=(self.now + dt.timedelta(seconds=1)).isoformat()),
                        dict(expiresAt=(self.now + dt.timedelta(days=2)).isoformat()), dict(issuedAt='2026-10-20T07:00:00')]:
            old = copy.deepcopy(self.payload); self.payload.update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError): self.check()
            self.payload = old

    def test_single_use_nonce_and_release(self):
        with self.assertRaisesRegex(ValueError, 'nonce'): self.check([self.payload['nonce']])
        self.current['usedReleases'].append('next')
        with self.assertRaisesRegex(ValueError, 'already published'): self.check()

    def test_extra_command_fields_fail(self):
        self.payload['command'] = 'sudo anything'
        with self.assertRaisesRegex(ValueError, 'Unexpected'): self.check()

    def test_boolean_schema_version_and_unsafe_release_fail(self):
        for key, value in [('schemaVersion', True), ('release', '../next')]:
            request = dict(self.request); payload = dict(self.payload); request[key] = payload[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): p.check_approval(payload, request, self.current, [], self.now)


class RecoveryPolicyTests(unittest.TestCase):
    def setUp(self):
        self.state = {'phase': 'applying', 'release': 'next', 'baseRelease': 'published', 'baseRevision': 'before', 'artifactSha256': 'a' * 64}
        self.actual = {'release': 'next', 'revision': 'after', 'artifactSha256': 'a' * 64}

    def test_committed_apply_with_lost_response_only_verifies(self): self.assertEqual(p.resume_action(self.state, self.actual), 'verify-only-no-reapply')

    def test_uncertain_apply_even_with_old_base_requires_human(self):
        self.actual.update(release='published', revision='before')
        self.assertEqual(p.resume_action(self.state, self.actual), 'operator-inspection-required-no-reapply')

    def test_verification_failure_does_not_reapply(self):
        self.state['phase'] = 'published-verification-failed'
        self.assertEqual(p.resume_action(self.state, self.actual), 'verify-only-no-reapply')

    def test_completed_is_idempotent_only_at_saved_revision(self):
        self.state.update(phase='completed', publishedRevision='after')
        self.assertEqual(p.resume_action(self.state, self.actual), 'already-completed')
        self.actual['revision'] = 'restored-later'
        self.assertEqual(p.resume_action(self.state, self.actual), 'verify-only-no-reapply')

    def test_preapply_base_change_blocks(self):
        self.state['phase'] = 'approved'
        self.assertEqual(p.resume_action(self.state, self.actual), 'blocked-base-changed')

    def test_every_failure_stage_is_safe_in_isolated_model(self):
        stages = p.simulate()['events']
        for stage in stages:
            with self.subTest(stage=stage):
                result = p.simulate(stage)
                self.assertEqual(result['applyCalls'], int(stages.index(stage) >= stages.index('apply')))
                self.assertFalse(result['autoRestore']); self.assertFalse(result['autoReapply'])
        self.assertEqual(p.simulate()['applyCalls'], 1)


if __name__ == '__main__': unittest.main()
