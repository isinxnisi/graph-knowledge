"""Candidate identity, fixed consumer probes and reuse. No live environment writes."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import traceback
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('compatibility_test', ROOT / 'scripts/publication-compatibility.py')
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)


class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.release = self.root / 'release'; self.release.mkdir()
        (self.release / 'data.json').write_text('{}\n'); (self.release / 'manifest.json').write_text('{}\n')
        self.caps = json.loads((ROOT / 'vocabulary/contribution-roles/generated-compatibility.json').read_text())
        self.caps.update(catalogValid=True, adoptedDefinitionHashes=copy.deepcopy(self.caps['definitionHashes']), nodeVersion='v24.21.0')
        self.contract = {'schemaVersion': 1, 'fixtureSchemaVersion': 4, 'serialization': self.caps['serialization'][0],
                         'dataSha256': c.sha(self.release / 'data.json'), 'manifestSha256': c.sha(self.release / 'manifest.json'),
                         'catalogSha256': self.caps['catalogSha256'], 'reviewsSha256': self.caps['reviewsSha256'],
                         'codegenSha256': self.caps['codegenSha256'], 'labelsSha256': self.caps['labelsSha256'],
                         'requiredRoleHashes': {'ACTING': self.caps['definitionHashes']['ACTING']},
                         'scopeFormats': ['null'], 'savedWorkspaceVersions': [1, 2, 3], 'relationRevisions': [1, 2, 3]}
        (self.release / 'compatibility.json').write_text(json.dumps(self.contract))
        self.worker = self.root / 'worker'; self.worker.mkdir(); (self.worker / 'schema').write_text('fixed worker schema')
        self.node = self.root / 'node'; self.node.write_text('fixed node executable')
        self.policy = {'schemaVersion': 1, 'web': {'image': 'sha256:' + 'a' * 64, 'buildId': 'fixed-build',
                       'nodeVersion': 'v24.21.0', 'url': 'https://plunode.net/api/publication/compatibility'},
                       'operator': {'image': 'sha256:' + 'b' * 64, 'deploymentDigest': 'sha256:' + 'c' * 64, 'nodeVersion': 'v24.21.0'},
                       'worker': {'root': str(self.worker), 'node': str(self.node), 'nodeSha256': c.sha(self.node),
                                  'nodeVersion': 'v24.21.0', 'files': {'schema': c.sha(self.worker / 'schema')}}}
        self.calls = []; self.unsupported = None
        for kind in ['web', 'operator', 'worker']: self.policy[kind]['capabilitiesSha256'] = c.digest(self.caps)
    def execute(self, argv, cwd=None):
        self.calls.append(argv)
        if argv[1:3] == ['image', 'inspect']:
            return [{'Id': argv[-1], 'Os': 'linux', 'Architecture': 'amd64'}]
        kind = 'worker' if cwd else ('web' if '/app/publication-probe.cjs' in argv else 'operator')
        caps = copy.deepcopy(self.caps)
        if self.unsupported == kind:
            caps['recognizedRoleIds'].remove('ACTING')
        return {'verified': True, 'contract': self.contract, 'capabilities': caps}
    def fetch(self, url): return {'buildId': 'fixed-build', 'capabilities': copy.deepcopy(self.caps)}
    def checker(self): return c.Compatibility(self.policy, self.policy['operator']['deploymentDigest'], execute=self.execute, fetch=self.fetch)
    def test_same_candidate_all_consumers_and_reuse_without_probing_again(self):
        result = self.checker().verify(self.release)
        self.assertEqual(set(result['consumers']), {'web', 'operator', 'worker'})
        self.calls = []; self.assertEqual(self.checker().verify(self.release, reuse=result), result)
        self.assertEqual(len(self.calls), 2)  # Fresh image identity checks, no repeat schema probes.
    def test_each_consumer_can_stop_unsupported_role(self):
        for kind in ['web', 'operator', 'worker']:
            with self.subTest(kind=kind):
                self.unsupported = kind
                with self.assertRaises(ValueError): self.checker().verify(self.release)
    def test_old_operator_pin_is_not_inherited(self):
        with self.assertRaisesRegex(ValueError, 'Active operator pin differs'):
            c.Compatibility(self.policy, 'sha256:' + 'd' * 64)
    def test_actual_installed_web_image_must_match_the_deployment_pin(self):
        self.policy['web']['deploymentImage'] = 'sha256:' + 'e' * 64
        with self.assertRaisesRegex(ValueError, 'Installed Web image'):
            c.Compatibility(self.policy, self.policy['operator']['deploymentDigest'])
        with self.assertRaisesRegex(ValueError, 'Installed Web image'):
            c.Compatibility(self.policy, self.policy['operator']['deploymentDigest'], active_web='sha256:' + 'f' * 64)
        c.Compatibility(self.policy, self.policy['operator']['deploymentDigest'], active_web='sha256:' + 'e' * 64)
    def test_bytes_worker_node_and_live_web_drift_invalidate(self):
        result = self.checker().verify(self.release)
        (self.release / 'data.json').write_text('{"changed":true}')
        with self.assertRaisesRegex(ValueError, 'Candidate bytes'): self.checker().verify(self.release, reuse=result)
        (self.release / 'data.json').write_text('{}\n'); self.node.write_text('another Node')
        with self.assertRaisesRegex(ValueError, 'Worker code or Node'): self.checker().verify(self.release, reuse=result)
        self.node.write_text('fixed node executable'); self.policy['web']['buildId'] = 'different-build'
        with self.assertRaisesRegex(ValueError, 'Installed Web build'): self.checker().verify(self.release, reuse=result)
    def test_schema_serialization_scope_and_recognized_unadopted_are_rejected(self):
        for change in [{'fixtureSchemaVersion': 99}, {'serialization': 'other'}, {'scopeFormats': ['unknown-scope']}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                c.check_contract({**self.contract, **change}, self.caps)
        caps = copy.deepcopy(self.caps); del caps['adoptedDefinitionHashes']['ACTING']
        with self.assertRaisesRegex(ValueError, 'not adopted'): c.check_contract(self.contract, caps)

    def test_failed_real_probe_adapter_stops_before_other_consumers_and_redacts(self):
        checker = c.Compatibility(self.policy, self.policy['operator']['deploymentDigest'], fetch=self.fetch)
        stderr = (b'image unavailable\nAuthorization: DO_NOT_LOG_HEADER\n' + b'token=' + b'x' * 5000 +
                  b'DO_NOT_LOG_LONG_LINE\n-----BEGIN PRIVATE KEY-----\nDO_NOT_LOG_KEY\n-----END PRIVATE KEY-----\n')
        result = SimpleNamespace(returncode=17, stdout=b'{"verified":true}', stderr=stderr)
        with patch.object(c.subprocess, 'run', return_value=result) as child, self.assertRaises(c.ConsumerProbeError) as caught:
            checker.verify(self.release)
        child.assert_called_once()  # No further consumer probe or retry after the first failure.
        detail = caught.exception.detail
        self.assertEqual(detail['stage'], 'consumer-image-inspect')
        self.assertEqual(detail['returnCode'], 17)
        self.assertIn('image unavailable', detail['stderrTail'])
        self.assertLessEqual(len(detail['stderrTail']), 1600)
        self.assertNotIn('DO_NOT_LOG', str(caught.exception))
        self.assertNotIn('verified', str(caught.exception))  # Child stdout is hashed, never echoed.

    def test_timeout_and_spawn_failure_do_not_echo_command_or_retry(self):
        argv = ['/private/bin/node', '--import', 'tsx', 'DO_NOT_LOG_ARG']
        failures = [(subprocess.TimeoutExpired(argv, 180, output=b'private output', stderr=b'token=DO_NOT_LOG_TOKEN'), 'timeout'),
                    (FileNotFoundError(2, 'DO_NOT_LOG_PATH'), 'spawn-error')]
        for error, reason in failures:
            with self.subTest(reason=reason), patch.object(c.subprocess, 'run', side_effect=error) as child, self.assertRaises(c.ConsumerProbeError) as caught:
                c.run(argv)
            child.assert_called_once()
            self.assertEqual(child.call_args.kwargs['timeout'], 180)
            self.assertEqual(caught.exception.detail['reason'], reason)
            self.assertEqual(caught.exception.detail['errorType'], type(error).__name__)
            self.assertIsNone(caught.exception.detail['returnCode'])
            self.assertTrue(caught.exception.__suppress_context__)
            self.assertNotIn('DO_NOT_LOG', ''.join(traceback.format_exception(caught.exception)))
            if reason == 'timeout': self.assertEqual(caught.exception.detail['timeoutSeconds'], 180)
            else: self.assertEqual(caught.exception.detail['errno'], 2)

    def test_success_json_is_unchanged_and_invalid_output_is_not_exposed(self):
        argv = ['/private/bin/node', 'verify']
        with patch.object(c.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'{"verified":true}', stderr=b'warning')):
            self.assertEqual(c.run(argv), {'verified': True})
        for output in [b'DO_NOT_LOG_STDOUT', b'\xff']:
            with patch.object(c.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=output, stderr=b'invalid probe output')), self.assertRaises(c.ConsumerProbeError) as caught:
                c.run(argv)
            self.assertEqual(caught.exception.detail['reason'], 'invalid-json')
            self.assertEqual(caught.exception.detail['returnCode'], 0)
            self.assertEqual(caught.exception.detail['stdoutSha256'], c.hashlib.sha256(output).hexdigest())
            self.assertNotIn('DO_NOT_LOG', str(caught.exception))


if __name__ == '__main__': unittest.main()
