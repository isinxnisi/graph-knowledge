import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import autonomy as a
from runtime import read_sealed

class ScheduledStartupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.home=Path(self.temp.name);a.init(self.home)
    def tearDown(self):self.temp.cleanup()
    def test_dead_pid_is_archived_without_blocking_next_poll(self):
        old={'pid':2147483647,'sourceSha256':'a'*64};a.atomic(self.home/'worker.pid',old)
        with patch('autonomy.tick',return_value={'status':'skipped','reason':'paused','at':a.now()}):
            self.assertEqual(a.scheduled_tick(self.home)['reason'],'paused')
        self.assertFalse((self.home/'worker.pid').exists())
        receipt=read_sealed(next((self.home/'worker-history').glob('*.json')))
        self.assertEqual(receipt['previous'],old);self.assertFalse(receipt['processSignalled'])
    def test_reused_unrelated_pid_is_never_signalled(self):
        a.atomic(self.home/'worker.pid',{'pid':os.getpid()})
        self.assertFalse(a.worker_state(self.home)['running'])
        with patch('os.kill',side_effect=AssertionError('never kill an unrelated process')):
            self.assertEqual(a.scheduled_tick(self.home)['reason'],'paused')
        self.assertTrue((Path('/proc')/str(os.getpid())).exists())
    def test_existing_daemon_excludes_task_without_changing_pid(self):
        before={'pid':1234};a.atomic(self.home/'worker.pid',before)
        with (self.home/'.daemon.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch('autonomy.tick',side_effect=AssertionError('no duplicate tick')):
                self.assertEqual(a.scheduled_tick(self.home)['reason'],'existing-daemon')
            self.assertEqual(json.loads((self.home/'worker.pid').read_text()),before)
    def test_stop_and_pause_remain_persistent_without_compute(self):
        a.atomic(self.home/'stop.requested',{'at':a.now()})
        with patch('autonomy.experiment',side_effect=AssertionError('no model')),patch('autonomy.subprocess.run',side_effect=AssertionError('no guard or GitHub')):
            for _ in range(2):self.assertEqual(a.scheduled_tick(self.home)['reason'],'paused')
        self.assertFalse(a.configuration(self.home)['enabled']);self.assertTrue((self.home/'stop.requested').exists())
        self.assertEqual(a.intents(self.home),[])
    def test_real_foreground_invocations_recover_stale_pid_and_leave_no_daemon(self):
        a.atomic(self.home/'worker.pid',{'pid':2147483647})
        command=[sys.executable,str(a.HERE/'autonomy.py'),'--home',str(self.home),'scheduled-tick']
        for _ in range(2):
            r=subprocess.run(command,cwd=a.ROOT,text=True,capture_output=True,check=True,timeout=15)
            self.assertEqual(json.loads(r.stdout)['reason'],'paused')
            self.assertFalse((self.home/'worker.pid').exists())
        self.assertEqual(len(list((self.home/'worker-history').glob('*.json'))),1)
        self.assertEqual(a.intents(self.home),[])
        self.assertEqual(json.loads((self.home/'scheduler-status.json').read_text())['executionMode'],'windows-task')

if __name__=='__main__':unittest.main()
