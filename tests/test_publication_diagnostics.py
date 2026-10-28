import copy
import contextlib
import io
import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publication_diagnostic_test', ROOT / 'scripts/publication-diagnostics.py')
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.job = {'nonce': '13abfb93-ba2d-44f7-a56b-352aa7ab0ab0', 'request': {'release': 'fixed', 'artifactSha256': 'a' * 64}}
        self.root = {**self.job, 'phase': 'awaiting-publication-approval'}
    def state(self, present=False, valid=False): return d.classify(self.job, self.root, approval_present=present, approval_valid=valid)
    def test_unsigned_signed_published_finishing_completed_and_failure(self):
        self.assertEqual(self.state()['phase'], 'unsigned-approval-pending')
        self.assertEqual(self.state(True, True)['phase'], 'signed-delivery-pending')
        self.root.update(phase='completed', release='fixed', artifactSha256='a' * 64, publishedRevision='new', verification={'verified': True, 'release': 'fixed', 'revision': 'new'}, exclusion={'phase': 'closed'}, pendingAudit=True)
        self.assertEqual(self.state(True, True)['phase'], 'published-finalization-pending')
        self.root.update(exclusion={'phase': 'finished'}, pendingAudit=False)
        self.assertEqual(self.state(True, True)['phase'], 'completed')
        self.root['request'] = {'release': 'changed'}
        self.assertEqual(self.state(True, True)['phase'], 'failed')
    def test_lost_result_never_authorizes_new_nonce_resign_or_apply(self):
        for root in [None, {**self.root, 'phase': 'applying'}]:
            result = d.classify(self.job, root, approval_present=True, approval_valid=True)
            self.assertFalse(result['newNonceAuthorized']); self.assertFalse(result['reSignAuthorized'])
            self.assertFalse(result['automaticApplyAuthorized'])
            self.assertIn(result['phase'], ['state-unknown', 'signed-result-unknown'])
    def test_failure_log_has_stage_trace_bounded_redacted_output_and_private_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            try: raise ValueError('example')
            except ValueError as error:
                path = Path(d.private_failure(Path(tmp) / 'logs', self.job['nonce'], 'accept-approval', error,
                            stdout=b'x' * 10000, stderr=b'password=hidden\nactual child failure', returncode=1))
            value = json.loads(path.read_text())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn('hidden', value['stderrTail']); self.assertIn('actual child failure', value['stderrTail'])
            self.assertLessEqual(len(value['stdoutTail']), 4096)
            self.assertEqual(value['stage'], 'accept-approval'); self.assertTrue(value['trace'])
    def test_operator_preserves_child_failure_context(self):
        loader = SourceFileLoader('operator_boundary_test', str(ROOT / 'ops/plunode-publication-approve'))
        spec = importlib.util.spec_from_loader(loader.name, loader); module = importlib.util.module_from_spec(spec); loader.exec_module(module)
        cfg = {'uid': os.getuid(), 'sourceCommit': 'a' * 40}
        for stdout, code in [(b'not-json', 0), (b'{}', 1), (b'x' * 65537, 0)]:
            with patch.object(module, 'trusted'), patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], code, stdout, b'child cause')):
                with self.assertRaises(module.ChildFailure) as raised: module.child(cfg, ['--job', 'fixed', '--accept-approval'])
                self.assertEqual(raised.exception.result.stderr, b'child cause')
                self.assertEqual(module.CONTEXT['stage'], '--accept-approval')
    def test_operator_reports_completed_after_child_error_without_resigning(self):
        loader = SourceFileLoader('operator_reconcile_test', str(ROOT / 'ops/plunode-publication-approve'))
        spec = importlib.util.spec_from_loader(loader.name, loader); module = importlib.util.module_from_spec(spec); loader.exec_module(module)
        self.root.update(phase='completed', release='fixed', artifactSha256='a' * 64, publishedRevision='new', verification={'verified': True, 'release': 'fixed', 'revision': 'new'}, exclusion={'phase': 'finished'}, pendingAudit=False)
        completed = self.state(True, True)
        diagnostics_spec = importlib.util.spec_from_file_location('fixed_operator_diag', ROOT / 'scripts/publication-diagnostics.py')
        failure = module.ChildFailure(subprocess.CompletedProcess([], 1, b'child stopped', b'actual cause'))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp); cfg = folder / 'config.json'; cfg.write_text(json.dumps({'sourceCommit': 'a' * 40, 'queueDir': str(folder / 'queue')}))
            module.CONFIG = cfg; module.DIAGNOSTICS = folder / 'diagnostics'; module.CONTEXT.update(nonce=self.job['nonce'], stage='--accept-approval', signed=True)
            output = io.StringIO()
            with patch.object(module, 'main', side_effect=failure), patch.object(module, 'trusted'), patch.object(module.importlib.util, 'spec_from_file_location', return_value=diagnostics_spec), patch.object(module, 'child', return_value=completed) as child, contextlib.redirect_stdout(output):
                self.assertEqual(module.operator_entry(), 0)
            result = json.loads(output.getvalue())
            self.assertEqual(result['phase'], 'completed'); self.assertTrue(result['operatorChildError'])
            self.assertFalse(result['newNonceAuthorized']); self.assertFalse(result['reSignAuthorized'])
            self.assertEqual(child.call_count, 1); self.assertEqual(child.call_args.args[1][-1], '--diagnose')
            self.assertEqual(len(list(module.DIAGNOSTICS.glob('*.json'))), 1)


if __name__ == '__main__': unittest.main()
