"""Isolated operational controls. No real approvals, collection, KG or Windows task changes."""
import copy
from datetime import datetime
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from test_collection_worker import b, approval, FakeExecutor, MemoryStore, no_lock

c = b.controls


class Clock:
    def __init__(self, value='2026-10-19T03:00:00+09:00'): self.set(value)
    def set(self, value): self.value = datetime.fromisoformat(value).timestamp()
    def __call__(self): return self.value
    def advance(self, seconds=600): self.value += seconds


class Windows(unittest.TestCase):
    def test_three_windows_and_host_timezone_independence(self):
        for hour in ['03:00', '06:44', '09:00', '11:44', '15:00', '17:44']:
            result = c.admission(c.WINDOWS, Clock('2026-10-19T' + hour + ':00+09:00')())
            self.assertTrue(result['ready'], hour)
        for hour in ['00:00', '02:59', '06:45', '07:00', '08:59', '11:45', '12:00', '14:59', '17:45', '18:00', '23:59']:
            self.assertFalse(c.admission(c.WINDOWS, Clock('2026-10-19T' + hour + ':00+09:00')())['ready'], hour)
        utc = Clock('2026-10-18T18:00:00+00:00')()
        self.assertTrue(c.admission(c.WINDOWS, utc)['ready'])
        self.assertEqual(c.admission(c.WINDOWS, Clock('2026-10-19T18:00:00+09:00')())['eligibleAt'],
                         '2026-10-19T18:00:00+00:00')  # Next day 03:00 JST

    def test_window_validation_and_interval_crossing_window_end(self):
        for rows in [[], [{'start':'23:00','end':'03:00'}], [{'start':'03:00','end':'03:15'}],
                     [{'start':'09:00','end':'12:00'}, {'start':'11:00','end':'14:00'}]]:
            with self.assertRaises(ValueError): c.validate_windows(rows)
        clock = Clock('2026-10-19T06:40:00+09:00')
        gate = c.admission(c.WINDOWS, clock(), clock()+600)
        self.assertFalse(gate['ready'])
        self.assertEqual(gate['eligibleAt'], '2026-10-19T00:00:00+00:00')  # 09:00 JST
        c.validate_windows([{'start':'23:00','end':'24:00'}])


class OperationalControls(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.home=Path(self.temp.name); self.store=MemoryStore(); self.executor=FakeExecutor(self.home)
        self.config={'home':str(self.home),'workerId':'isolated-worker'}
        self.clock=Clock()
        self.request=approval(); self.store.submit(self.request)
        self.revision=0; self.last_id=None
    def worker(self, **kwargs):
        return b.Worker(self.config,self.store,self.executor,no_lock,clock=self.clock,**kwargs)
    def record(self, ident=None):
        return b.read(self.home/'state.json')['requests'][ident or self.request['id']]
    def control(self, action, **extra):
        self.revision+=1; ident='control-'+str(self.revision)
        value={'schemaVersion':1,'workerId':'isolated-worker','id':ident,'revision':self.revision,
               'previousControlId':self.last_id,'status':'approved','approvalScope':'worker-execution-control-only',
               'action':action,'humanDecision':copy.deepcopy(self.request['humanDecision']),**extra}
        path=b.PREFIX+'controls/isolated-worker/'+ident+'.json'
        self.store.files[path]=b.dump(value).encode(); self.last_id=ident
        return path,value

    def test_outside_window_detects_approval_and_reports_without_heavy_work(self):
        self.clock.set('2026-10-19T01:00:00+09:00')
        with patch.object(self.executor,'validate',wraps=self.executor.validate) as validate:
            self.worker().tick(); validate.assert_not_called()
        self.assertEqual(self.executor.calls,0)
        self.assertEqual(self.record()['phase'],'waiting-control')
        status=b.PREFIX+'workers/isolated-worker/status.json'
        self.assertEqual(self.store.json(status)[0]['phase'],'outside-window')
        self.clock.set('2026-10-19T03:00:00+09:00'); self.worker().tick()
        self.assertEqual(self.record()['phase'],'completed')

    def test_serial_one_job_per_invocation_and_durable_ten_minute_rest(self):
        second=approval('second-job'); second['target']['themeId']='different-theme'; self.store.submit(second)
        self.worker().tick()
        self.assertEqual(self.executor.calls,1)
        self.assertEqual(self.record('second-job')['phase'],'waiting-control')
        self.clock.advance(599); self.worker().tick(); self.assertEqual(self.executor.calls,1)
        self.clock.advance(1); self.worker().tick(); self.assertEqual(self.executor.calls,2)
        self.assertEqual(self.record('second-job')['phase'],'completed')

    def test_pause_new_before_start_resume_preserves_original_approval(self):
        original=copy.deepcopy(self.store.files[b.PREFIX+'requests/'+self.request['id']+'.json'])
        self.control('pause-new'); self.worker().tick(); self.assertEqual(self.executor.calls,0)
        self.control('resume'); self.worker().tick(); self.assertEqual(self.executor.calls,1)
        self.assertEqual(original,self.store.files[b.PREFIX+'requests/'+self.request['id']+'.json'])
        self.worker().tick(); self.assertEqual(self.executor.calls,1)

    def test_pause_new_allows_current_attempt_to_finish(self):
        self.executor.interrupt=lambda:self.control('pause-new')
        self.worker().tick()
        self.assertEqual(self.record()['phase'],'completed')
        self.assertEqual(b.read(self.home/'state.json')['executionControl']['pauseMode'],'pause-new')

    def test_pause_running_retains_progress_and_acceptance_and_resumes_same_operation(self):
        self.executor.interrupt=lambda:self.control('pause-running')
        self.executor.partial=lambda request:{'status':'formally-accepted-preparation-incomplete-not-applied'}
        self.worker().tick(); record=self.record()
        self.assertEqual(record['phase'],'paused'); self.assertNotIn('executionComplete',record)
        self.assertIn('savedAcceptance',record)
        self.executor.interrupt=None
        self.control('resume'); self.worker().tick(); self.assertEqual(self.executor.calls,1)
        self.clock.advance(); self.worker().tick(); self.assertEqual(self.record()['phase'],'completed')
        self.assertEqual(self.executor.calls,2)

    def test_near_end_no_start_soft_overrun_then_checkpoint_stop(self):
        self.clock.set('2026-10-19T06:46:00+09:00'); self.worker().tick()
        self.assertEqual(self.executor.calls,0)
        self.clock.set('2026-10-19T09:00:00+09:00')
        # An in-flight job just after close may finish safely.
        self.clock.set('2026-10-19T11:40:00+09:00')
        self.executor.interrupt=lambda:self.clock.set('2026-10-19T12:05:00+09:00')
        self.worker().tick(); self.assertEqual(self.record()['phase'],'completed')
        other=approval('long-job'); other['target']['themeId']='long-theme'; self.store.submit(other)
        self.clock.set('2026-10-19T17:40:00+09:00')
        self.executor.interrupt=lambda:self.clock.set('2026-10-19T18:10:01+09:00')
        self.worker().tick(); self.assertEqual(self.record('long-job')['phase'],'paused')
        self.executor.interrupt=None; self.clock.set('2026-10-20T03:00:00+09:00')
        self.worker().tick(); self.assertEqual(self.record('long-job')['phase'],'completed')

    def test_schedule_change_and_pause_survive_process_restart(self):
        self.control('set-windows',windows=[{'start':'20:00','end':'22:00'}])
        self.worker().tick(); self.assertEqual(self.executor.calls,0)
        self.control('pause-running'); self.worker().tick()
        self.clock.set('2026-10-19T20:00:00+09:00'); self.worker().tick()
        self.assertEqual(self.executor.calls,0)
        self.control('resume'); self.worker().tick(); self.assertEqual(self.executor.calls,1)
        self.assertEqual(b.read(self.home/'state.json')['executionControl']['revision'],3)

    def test_pc_stop_mid_attempt_conservatively_restores_reservation(self):
        w=self.worker(); w.control.refresh(); w.control.begin_attempt(self.request)
        # Simulate process/PC disappearance without finally/end_attempt.
        limit=w.control.value['nextStartAt']
        self.clock.advance(300); recovered=self.worker()
        self.assertIn('recoveredAttempt',recovered.control.value)
        recovered.tick(); self.assertEqual(self.executor.calls,0)
        self.clock.value=limit; self.worker().tick(); self.assertEqual(self.executor.calls,1)

    def test_invalid_fork_hash_tampering_deletion_and_ai_control_fail_closed(self):
        path,value=self.control('pause-new'); self.worker().tick()
        self.store.files[path]=b.dump({**value,'action':'resume'}).encode()
        self.clock.advance(); self.worker().tick(); self.assertEqual(self.executor.calls,0)
        self.assertIn('changed',b.read(self.home/'state.json')['executionControl']['error'])
        self.store.files.pop(path); self.worker().tick(); self.assertEqual(self.executor.calls,0)
        self.store.files[path]=b.dump(value).encode()
        path2,bad=self.control('resume'); bad['humanDecision']['actorType']='ai'; self.store.files[path2]=b.dump(bad).encode()
        self.worker().tick(); self.assertEqual(self.executor.calls,0)
        self.assertIn('human',b.read(self.home/'state.json')['executionControl']['error'])
        bad['humanDecision']=copy.deepcopy(self.request['humanDecision']); bad['previousControlId']='wrong'
        self.store.files[path2]=b.dump(bad).encode(); self.worker().tick()
        self.assertIn('fork',b.read(self.home/'state.json')['executionControl']['error'])

    def test_unknown_controls_do_not_authorize_jobs_or_apply(self):
        self.control('apply'); self.worker().tick(); self.assertEqual(self.executor.calls,0)
        self.assertEqual(self.record()['phase'],'waiting-control')
        self.assertIn('Unsupported',b.read(self.home/'state.json')['executionControl']['error'])

    def test_revocation_is_separate_from_pause_and_resume(self):
        self.control('pause-new'); self.worker().tick()
        self.store.files[b.PREFIX+'revocations/'+self.request['id']+'.json']=b.dump({
            'humanDecision':self.request['humanDecision'],'requestSha256':self.record()['requestSha256'],
            'approvalScope':'request-cancellation-only'}).encode()
        self.control('resume'); self.worker().tick()
        self.assertEqual(self.record()['phase'],'blocked'); self.assertEqual(self.executor.calls,0)

    def test_cycle_budget_interrupts_resumably_before_windows_one_hour_limit(self):
        self.worker(work_deadline=time.monotonic()-1).tick()
        self.assertEqual(self.record()['phase'],'paused'); self.assertEqual(self.executor.calls,0)
        self.assertEqual(c.WORK_LIMIT,55*60); self.assertLess(c.CYCLE_LIMIT,60*60)

    def test_status_heartbeat_and_control_template_not_an_approval(self):
        self.clock.set('2026-10-19T01:00:00+09:00'); self.worker().tick()
        base=b.PREFIX+'workers/isolated-worker/'
        template=self.store.json(base+'control-template.json')[0]
        self.assertEqual(template['status'],'draft-not-approved')
        before=copy.deepcopy(self.store.files)
        self.clock.advance(60); self.worker().tick(); self.assertEqual(before,self.store.files)
        self.clock.advance(900); self.worker().tick(); self.assertNotEqual(before,self.store.files)


class BoundedCommands(unittest.TestCase):
    def test_real_child_checkpoint_interrupt_and_resume_preserve_logs_and_decision(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp); runtime=home/'runtime'; (runtime/'scripts').mkdir(parents=True)
            # Only a fixture executable, never real collect/accept or a database connection.
            (runtime/'scripts/collection-workflow.py').write_text(
                "import json,time,pathlib\n"
                "p=pathlib.Path('checkpoint.json')\n"
                "if not p.exists():\n"
                " p.write_text('{\"step\":1}')\n"
                " while True: time.sleep(.05)\n"
                "print(json.dumps({'publicApply':False,'checkpointStep':2}))\n")
            executor=object.__new__(b.Executor)
            executor.root=runtime; executor.config={'home':str(home)}
            executor.workflow=type('FixtureWorkflow',(),{'gate':b.gate})()
            request={'id':'isolated-child','kind':'accept-release','decision':{'testOnly':True}}
            def interrupt():
                if (runtime/'checkpoint.json').exists(): raise c.Deferred('Isolated safe interrupt')
            with self.assertRaises(c.Deferred): executor.run(request,interrupt)
            decision=runtime/'datasets/manga-collection/decisions/isolated-child.json'
            frozen=decision.read_bytes()
            result=executor.run(request,lambda:None)
            self.assertEqual(result,{'publicApply':False,'checkpointStep':2})
            self.assertEqual(decision.read_bytes(),frozen)
            self.assertEqual(b.read(runtime/'checkpoint.json'),{'step':1})
            self.assertEqual(len(list((home/'logs').glob('*.stdout'))),2)
            self.assertEqual(len(list((home/'logs').glob('*.stderr'))),2)

    def test_long_child_is_stopped_before_cycle_limit(self):
        started=time.monotonic()
        with patch.object(b,'CYCLE_DEADLINE',time.monotonic()+0.15):
            with self.assertRaises(subprocess.TimeoutExpired):
                b.command([sys.executable,'-c','import time; time.sleep(5)'])
        self.assertLess(time.monotonic()-started,2)


class GitControlTransport(unittest.TestCase):
    def test_connector_append_offline_replay_status_sharing_and_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp); origin=home/'origin.git'; seed=home/'seed'
            b.command(['git','init','--bare',str(origin)])
            b.command(['git','init','-b','main',str(seed)])
            (seed/'README.md').write_text('ISOLATED CONTROL TRANSPORT')
            b.command(['git','-C',str(seed),'add','.'])
            b.command(['git','-C',str(seed),'-c','user.name=Test','-c','user.email=test@example.invalid',
                       'commit','-m','隔離操作記録試験'])
            b.command(['git','-C',str(seed),'push',str(origin),'main','main:refs/heads/control'])
            worker_home=home/'worker'; worker_home.mkdir()
            store=b.GitHubStore(worker_home,str(origin),'control'); store.sync()
            connector=b.GitHubStore(home/'connector',str(origin),'control'); connector.sync()
            config={'home':str(worker_home),'workerId':'isolated-worker'}
            executor=FakeExecutor(worker_home); clock=Clock('2026-10-19T01:00:00+09:00')
            request=approval()
            path=b.PREFIX+'requests/'+request['id']+'.json'
            connector.publish({path:b.dump(request).encode()},[path])
            def tick():
                current=b.Worker(config,store,executor,no_lock,clock=clock)
                current.tick(); return current
            tick(); self.assertEqual(executor.calls,0)
            # Two append-only commands arrive while this Worker is offline.
            for revision,action in [(1,'pause-new'),(2,'resume')]:
                ident='control-'+str(revision)
                value={'schemaVersion':1,'id':ident,'revision':revision,
                       'previousControlId':None if revision==1 else 'control-1',
                       'workerId':'isolated-worker','status':'approved','action':action,
                       'approvalScope':'worker-execution-control-only','humanDecision':request['humanDecision']}
                path=b.PREFIX+'controls/isolated-worker/'+ident+'.json'
                connector.publish({path:b.dump(value).encode()},[path])
            current=tick(); self.assertEqual(current.control.value['revision'],2)
            self.assertEqual(executor.calls,0)
            clock.set('2026-10-19T03:00:00+09:00'); tick()
            self.assertEqual(executor.calls,1)
            tick(); self.assertEqual(executor.calls,1)
            connector.sync()
            base=b.PREFIX+'workers/isolated-worker/'
            status=connector.json(base+'status.json')[0]
            self.assertEqual(status['controlRevision'],2)
            self.assertEqual(status['phase'],'interval')
            self.assertIn('03:00',connector.blob(base+'README.md').decode())
            self.assertFalse(status['publicApply'])


if __name__=='__main__': unittest.main()
