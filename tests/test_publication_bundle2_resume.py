"""The WSL continuation retries only contention before fixed runtime changes."""
import contextlib
import copy
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module


resume = load('bundle2_resume_test', 'ops/resume-publication-bundle2-wsl.py')
helpers = load('bundle2_existing_lock_test', 'ops/film-publication-image-update.py')
LOCK_FAILURE = {'error': 'bundle2-update-stopped', 'errorType': 'BlockingIOError',
    'diagnostics': {'operation': 'wsl-before-identities-and-locks'}, 'signed': False, 'applyCalls': 0,
    'traceFrames': [{'file': 'apply-publication-bundle2-update.py', 'function': 'wsl'},
                    {'file': 'film-publication-image-update.py', 'function': 'existing_lock'}]}
SUCCESS = {'target': 'wsl', 'signed': False, 'applyCalls': 0}


class ResumeChecks(unittest.TestCase):
    def test_only_the_known_preupdate_lock_error_is_retryable(self):
        self.assertTrue(resume.safe_lock_failure(LOCK_FAILURE))
        for change in [{'errorType': 'ValueError'}, {'diagnostics': {'operation': 'wsl-fixed-source-task-and-worker-update'}},
                       {'traceFrames': []}, {'applyCalls': 1}, {'signed': True},
                       {'traceFrames': [{'file': 'other.py', 'function': 'existing_lock'}]}]:
            self.assertFalse(resume.safe_lock_failure({**copy.deepcopy(LOCK_FAILURE), **change}))

    def test_partial_lock_probe_releases_every_acquired_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            first, second = [Path(folder) / name for name in ['common.lock', 'worker.lock']]
            first.touch(mode=0o600); second.touch(mode=0o600)
            with second.open('r+') as held:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertEqual(resume.busy_lock(helpers, [first, second], os.geteuid()), str(second))
                with first.open('r+') as check: fcntl.flock(check, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertIsNone(resume.busy_lock(helpers, [first, second], os.geteuid()))

    def test_waits_for_activity_and_retries_only_the_lock_race(self):
        clock = [0]; attempts = []; probes = iter(['worker.lock', None, None])
        outcomes = iter([SimpleNamespace(returncode=1, stdout=json.dumps(LOCK_FAILURE)+'\n'),
                         SimpleNamespace(returncode=0, stdout='checksum: OK\n'+json.dumps(SUCCESS)+'\n')])
        def invoke(): attempts.append(True); return next(outcomes)
        with contextlib.redirect_stdout(io.StringIO()):
            result = resume.wait_and_resume(None, None, wait_limit=30, clock=lambda: clock[0],
                pause=lambda seconds: clock.__setitem__(0, clock[0]+seconds),
                probe_task=lambda: False, probe_locks=lambda: next(probes), invoke=invoke)
        self.assertEqual(result, SUCCESS); self.assertEqual(len(attempts), 2); self.assertEqual(clock[0], 4)

    def test_any_midupdate_or_unknown_failure_stops_without_retry(self):
        attempts = []
        def invoke():
            attempts.append(True)
            return SimpleNamespace(returncode=1, stdout=json.dumps({**LOCK_FAILURE, 'diagnostics': {'operation': 'wsl-fixed-source-task-and-worker-update'}}))
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            resume.wait_and_resume(None, None, probe_task=lambda: False, probe_locks=lambda: None, invoke=invoke)
        self.assertEqual(len(attempts), 1)

    def test_busy_timeout_never_invokes_the_update(self):
        clock = [0]; attempts = []
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(TimeoutError):
            resume.wait_and_resume(None, None, wait_limit=25, clock=lambda: clock[0],
                pause=lambda seconds: clock.__setitem__(0, clock[0]+seconds), probe_task=lambda: False,
                probe_locks=lambda: 'worker.lock', invoke=lambda: attempts.append(True))
        self.assertEqual(clock[0], 25); self.assertEqual(attempts, [])

    def test_no_structured_result_is_not_success(self):
        with self.assertRaises(ValueError): resume.child_result('checksum: OK\n')

    def test_default_continuation_invokes_only_the_existing_wsl_sudo_operation(self):
        operations = []
        def operation(home, target, incoming, interop):
            operations.append((home, target, incoming, interop)); return 'fixed-wsl-operation'
        runner = SimpleNamespace(operation=operation)
        with contextlib.redirect_stdout(io.StringIO()), patch.object(resume, 'public_vps_check') as public_check, \
             patch.object(resume.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(SUCCESS))) as run, \
             patch.dict(os.environ, {'WSL_INTEROP': '/run/WSL/123_interop'}):
            self.assertEqual(resume.wait_and_resume(None, runner, probe_locks=lambda: None, probe_task=lambda: False), SUCCESS)
        self.assertEqual(operations, [(resume.PACKAGE, 'wsl', resume.PACKAGE, '/run/WSL/123_interop')])
        self.assertEqual(run.call_args.args[0], ['sudo', '/bin/bash', '-c', 'fixed-wsl-operation'])
        public_check.assert_called_once()

    def test_vps_result_cannot_be_misreported_as_wsl_success(self):
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            resume.wait_and_resume(None, None, probe_locks=lambda: None, probe_task=lambda: False,
                invoke=lambda: SimpleNamespace(returncode=0, stdout=json.dumps({**SUCCESS, 'target': 'vps'})))

    def test_idle_window_lost_during_https_check_never_invokes_sudo(self):
        clock = [0]; probes = iter([None, 'worker.lock'])
        with contextlib.redirect_stdout(io.StringIO()), patch.object(resume, 'public_vps_check'), \
             patch.object(resume.subprocess, 'run') as run, self.assertRaises(TimeoutError):
            resume.wait_and_resume(None, None, wait_limit=2, clock=lambda: clock[0],
                pause=lambda seconds: clock.__setitem__(0, clock[0]+seconds),
                probe_locks=lambda: next(probes), probe_task=lambda: False)
        run.assert_not_called()

    def test_root_staging_metadata_cannot_replace_the_pinned_applier_or_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); package = root / 'package'; (root / 'ops').mkdir(); (package / 'payload').mkdir(parents=True)
            runner = root / 'ops/run-publication-bundle2-update.py'; runner.write_bytes(b'fixed-runner')
            applier = package / 'apply-publication-bundle2-update.py'; applier.write_bytes(b'fixed-applier')
            manifest = package / 'payload/OPERATOR_SHA256SUMS'; manifest.write_bytes(b'fixed-manifest')
            sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
            valid = {'applierSha256': sha(applier), 'operatorManifestSha256': sha(manifest)}
            for key in valid:
                (package / 'operation.json').write_text(json.dumps({**valid, key: '0' * 64}))
                with patch.object(resume, 'ROOT', root), patch.object(resume, 'PACKAGE', package), \
                     patch.object(resume, 'RUNNER_SHA', sha(runner)), patch.object(resume, 'APPLIER_SHA', sha(applier)), \
                     patch.object(resume, 'PAYLOAD_SHA', sha(manifest)), patch.object(resume, 'load') as load, \
                     self.assertRaisesRegex(ValueError, 'Root staging command pins differ'):
                    resume.main()
                load.assert_not_called()


if __name__ == '__main__': unittest.main()
