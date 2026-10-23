"""Real temporary OS locks only; no live Worker, Git, keys, SSH or KG."""
import contextlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import test_publication_coordination as fixture

c=fixture.c;e=c.e

class BarrierWaitTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        root=Path(tmp.name);self.co=c.Coordinator.__new__(c.Coordinator)
        self.co.directory=root/'coord';self.co.directory.mkdir()
        self.co.home=root/'worker';self.co.home.mkdir()
        self.co.config={'commonLock':str(root/'common.lock')}
        self.locks=[self.co.directory/'coordinator.lock',self.co.home/'worker.lock',root/'common.lock']

    def test_wait_releases_all_partial_locks_before_retry(self):
        for busy in self.locks:
            with self.subTest(busy=busy.name):
                held=contextlib.ExitStack();held.enter_context(e.locked(busy))
                self.addCleanup(held.close)
                def wait(_):
                    # The real busy lock remains held; every other lock is available.
                    with self.assertRaises(BlockingIOError):
                        with e.locked(busy):pass
                    for path in self.locks:
                        if path!=busy:
                            with e.locked(path):pass
                    held.close()
                with patch.object(c.time,'sleep',side_effect=wait) as sleeping:
                    with self.co.barrier(wait_seconds=1):
                        for path in self.locks:
                            with self.assertRaises(BlockingIOError):
                                with e.locked(path):pass
                    sleeping.assert_called_once()
                for path in self.locks:
                    with e.locked(path):pass

    def test_timeout_preserves_busy_lock_and_releases_others(self):
        with e.locked(self.locks[1]):
            with self.assertRaises(BlockingIOError):
                with self.co.barrier(wait_seconds=.03):self.fail('busy barrier yielded')
            for path in [self.locks[0],self.locks[2]]:
                with e.locked(path):pass

    def test_default_remains_immediate_and_body_error_is_not_retried(self):
        with patch.object(c.time,'sleep') as sleeping:
            with e.locked(self.locks[1]):
                with self.assertRaises(BlockingIOError):
                    with self.co.barrier():pass
            with self.assertRaises(BlockingIOError):
                with self.co.barrier(wait_seconds=1):raise BlockingIOError('body, not acquisition')
            sleeping.assert_not_called()
        for path in self.locks:
            with e.locked(path):pass

    def test_non_contention_failure_stops_and_releases_prior_locks(self):
        original=e.locked
        def faulty(path):
            if path==self.locks[1]:raise ValueError('invalid lock')
            return original(path)
        with patch.object(e,'locked',side_effect=faulty),patch.object(c.time,'sleep') as sleeping:
            with self.assertRaises(ValueError):
                with self.co.barrier(wait_seconds=1):pass
            sleeping.assert_not_called()
        with e.locked(self.locks[0]):pass

    def test_unbounded_wait_is_refused(self):
        for seconds in [-1,31]:
            with self.assertRaises(ValueError):
                with self.co.barrier(wait_seconds=seconds):pass

if __name__=='__main__':unittest.main()
