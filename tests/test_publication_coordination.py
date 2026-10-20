"""Real Git controls, real Worker parser/state, OS processes/flocks and the isolated VPS gate."""
import copy
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import time
import unittest
import uuid
from unittest.mock import patch
import test_publication_executor as fixture
import test_collection_worker as worker_fixture

ROOT = Path(__file__).resolve().parents[1]
e, s, a = fixture.e, fixture.s, fixture.a
c = fixture.fixtures.module('coordination_test', ROOT / 'scripts/publication-coordination.py')


class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.f = fixture.ExecutorTests(); self.f.setUp(); self.addCleanup(self.f.doCleanups)
        self.root = self.f.root
        key = self.root / 'trusted/exclusion-private.pem'; pub = self.root / 'trusted/exclusion.pem'
        subprocess.run(['openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(key)], check=True, capture_output=True)
        key.chmod(0o600)
        subprocess.run(['openssl', 'pkey', '-in', str(key), '-pubout', '-out', str(pub)], check=True, capture_output=True)
        self.f.config.update(freezePolicy=e.exclusion.POLICY, workerId='isolated-worker', workerCodeCommit='a'*40, exclusionKeySha256=e.sha(pub))
        self.f.save_config()
        self.remote = self.root / 'remote.git'
        subprocess.run(['git', 'init', '--bare', str(self.remote)], check=True, capture_output=True)
        def git(*args, data=None):
            return subprocess.run(['git', '--git-dir='+str(self.remote), *args], input=data, check=True, capture_output=True,
                env={**os.environ, 'GIT_AUTHOR_NAME':'Isolated', 'GIT_AUTHOR_EMAIL':'isolated@example.invalid',
                    'GIT_COMMITTER_NAME':'Isolated', 'GIT_COMMITTER_EMAIL':'isolated@example.invalid'}).stdout.decode().strip()
        tree=git('mktree',data=b''); commit=git('commit-tree',tree,data=b'isolated seed')
        for branch in ['main','control']:git('update-ref','refs/heads/'+branch,commit)
        self.home = self.root / 'worker'; self.home.mkdir(); (self.home/'runtime').symlink_to(self.f.fixture.f.root,target_is_directory=True)
        self.common = self.root / 'common.lock'; self.common.touch()
        self.config = {'workerHome':str(self.home), 'journalDir':str(self.root/'coordination'), 'remote':str(self.remote),
            'branch':'control', 'workerId':'isolated-worker', 'codeCommit':'a'*40, 'commonLock':str(self.common),
            'serverKey':str(pub), 'serverKeySha256':e.sha(pub)}
        self.worker_config={'home':str(self.home),'workerId':'isolated-worker','codeCommit':'a'*40,'remote':str(self.remote),'branch':'control'}
        self.executor=worker_fixture.FakeExecutor(self.home)
        e.durable(self.home/'config.json',self.worker_config)
        self.decision=worker_fixture.approval()['humanDecision']
        self.co = c.Coordinator(self.config); self.nonce=self.f.nonce
        self.ticket = self.f.gate().run('arm',self.nonce,self.exchange)
    def ack(self):
        # Same startup lock order and actual tick/control code, with no approved jobs to execute.
        with e.locked(self.home/'worker.lock'):
            store=c.w.GitHubStore(self.home,str(self.remote),'control')
            worker=c.w.Worker(self.worker_config,store,self.executor)
            worker.tick()
        return worker.state
    def pause(self):self.co.pause(self.ticket,self.decision);self.ack()
    def exchange(self, challenge):
        a.check_challenge(challenge)
        with self.co.barrier():
            payload=dict(challenge)
            if challenge['purpose']=='worker-resume':payload['workerResume']=self.co.resume_proof(challenge)
            else:
                if challenge['purpose']=='receipt-freshness':a.freshness(self.f.fixture.f.root,self.f.fixture.args.output,challenge)
                payload['workerPause']=self.co.pause_proof(challenge)
            return s.sign(payload,self.f.keys['attester'])
    def ready(self):self.pause();self.f.gate().run('preflight',self.nonce,self.exchange);self.f.approve()
    def execute(self):return self.f.gate().run('execute',self.nonce,self.exchange)
    def terminal(self, command):return self.f.gate().run(command,self.nonce,self.exchange)
    def resume(self,closure):self.co.resume(closure,self.decision)

    def test_round_trip_restarts_replay_and_no_second_apply(self):
        self.ready();self.assertEqual(self.execute()['phase'],'completed')
        closure=self.terminal('close')
        self.assertEqual(closure,self.terminal('close'))
        with self.assertRaises(ValueError):self.execute()
        self.co=c.Coordinator(self.config);self.resume(closure);self.resume(closure)
        self.assertEqual(self.terminal('finish')['phase'],'finished')
        self.assertEqual(self.terminal('finish')['phase'],'finished')
        self.assertEqual(self.ack()['executionControl']['pauseMode'],None)
        with self.assertRaises(ValueError):self.f.gate().run('arm',self.nonce,self.exchange)
        self.assertEqual(self.f.calls('apply'),1)

    def test_unacknowledged_pause_and_active_attempt_do_not_publish(self):
        self.ack();self.co.pause(self.ticket,self.decision)
        with self.assertRaisesRegex(ValueError,'acknowledgement'):self.f.gate().run('preflight',self.nonce,self.exchange)
        self.ack();state=e.read(self.home/'state.json');state['executionControl']['activeAttempt']={'requestId':'old'}
        e.durable(self.home/'state.json',state)
        with self.assertRaisesRegex(ValueError,'acknowledgement'):self.f.gate().run('preflight',self.nonce,self.exchange)
        self.ack()  # Actual Worker restart records recoveredAttempt; never changes pause.
        self.assertEqual(self.f.gate().run('preflight',self.nonce,self.exchange)['phase'],'awaiting-publication-approval')
        self.assertEqual(self.f.calls('apply'),0)

    def test_pc_shutdown_after_proof_before_server_apply_keeps_worker_paused(self):
        self.ready();child=self.f.start()
        for _ in range(2):
            challenge=json.loads(child.stdout.readline())['challenge']
            child.stdin.write(json.dumps(self.exchange(challenge))+'\n');child.stdin.flush()
        # Emulate loss of the PC channel after both valid proofs. Apply may or may not have started.
        child.stdin.close();child.wait(timeout=10);child.stdout.close();child.stderr.close()
        self.co=c.Coordinator(self.config)
        state=self.ack()['executionControl'];self.assertEqual(state['pauseMode'],'pause-new')
        self.assertEqual(self.co.latest()['pauseMode'],'pause-new')
        self.assertLessEqual(self.f.calls('apply'),1)
        if self.f.gate().reservations()['nonces']:
            self.assertEqual(self.execute()['phase'],'completed')
        self.assertEqual(self.ack()['executionControl']['pauseMode'],'pause-new')

    def test_network_partition_worker_restart_aborts_before_work(self):
        self.pause()
        store=c.w.GitHubStore(self.home,str(self.remote),'control');worker=c.w.Worker(self.worker_config,store,self.executor)
        with patch.object(store,'sync',side_effect=RuntimeError('isolated communication loss')):
            with self.assertRaises(RuntimeError):worker.tick()
        self.assertEqual(e.read(self.home/'state.json')['executionControl']['pauseMode'],'pause-new')
        self.assertEqual(self.f.calls('apply'),0)

    def test_pause_push_reply_lost_recovers_same_intent_without_revision_increment(self):
        # One actual push then kill-equivalent exception before caller receives result.
        with patch.object(self.co,'cas',side_effect=lambda command:(self.real_push_then_die(command))):
            with self.assertRaises(RuntimeError):self.co.pause(self.ticket,self.decision)
        self.co=c.Coordinator(self.config);self.co.pause(self.ticket,self.decision)
        self.assertEqual(self.co.latest()['revision'],1)
        self.ack();self.assertEqual(self.terminal('cancel')['payload']['phase'],'cancelled')
    def real_push_then_die(self,command):
        c.Coordinator(self.config).cas(command);raise RuntimeError('isolated PC power loss after push')

    def test_old_vps_process_resumed_after_cancel_cannot_apply(self):
        self.ready();child=self.f.start();challenge=json.loads(child.stdout.readline())['challenge']
        response=self.exchange(challenge)  # Old process suspended before first reply reaches VPS.
        closure=self.terminal('cancel');self.resume(closure);self.terminal('finish');self.ack()
        child.stdin.write(json.dumps(response)+'\n');child.stdin.flush()
        code,_,_=self.f.finish(child)
        self.assertNotEqual(code,0);self.assertEqual(self.f.calls('apply'),0)

    def test_close_before_resume_keeps_next_publication_blocked(self):
        self.ready();self.execute();closure=self.terminal('close')
        other=str(uuid.uuid4());self.f.upload(other)
        with self.assertRaisesRegex(ValueError,'awaits'):self.f.gate().run('arm',other,self.exchange)
        # PC dies after close: OS locks disappear, durable pause remains on actual Worker startup.
        self.assertEqual(self.ack()['executionControl']['pauseMode'],'pause-new')
        self.resume(closure)  # Git push durable, but PC dies before finish. Still cannot arm another.
        with self.assertRaises(ValueError):self.f.gate().run('arm',other,self.exchange)
        self.co=c.Coordinator(self.config);self.resume(closure);self.terminal('finish')
        ticket=self.f.gate().run('arm',other,self.exchange);self.assertEqual(ticket['generation'],2)
        self.assertNotEqual(ticket['ticketId'],self.ticket['ticketId'])

    def test_consumed_unknown_apply_cannot_cancel_close_resume_or_reapply(self):
        self.ready();self.f.control({'applyBefore':True});self.execute();self.f.control({})
        for command in ['cancel','close']:
            with self.assertRaises(ValueError):self.terminal(command)
        self.assertEqual(self.execute()['phase'],'operator-inspection-required-no-reapply')
        self.assertEqual(self.f.calls('apply'),1)
        self.assertEqual(self.ack()['executionControl']['pauseMode'],'pause-new')

    def test_receipt_saved_then_pc_dies_requires_new_candidate_not_stale_approval(self):
        self.ready();receipt=next((self.f.fixture.f.root/'datasets/manga-collection').glob('accepted-*/acceptance.json'))
        receipt.write_text('{}')  # Durable acceptance receipt change before loss/restart.
        self.co=c.Coordinator(self.config);self.ack()
        with self.assertRaises(ValueError):self.execute()
        self.assertEqual(self.f.calls('apply'),0)
        # Stale candidate freshness must not prevent safe cancellation and conditional resume.
        closure=self.terminal('cancel');self.resume(closure);self.terminal('finish')

    def test_second_receipt_check_rejects_change_after_first_proof(self):
        self.ready();count=[0]
        def changed(challenge):
            count[0]+=1
            if count[0]==2:
                receipt=next((self.f.fixture.f.root/'datasets/manga-collection').glob('accepted-*/acceptance.json'));receipt.write_text('{}')
            return self.exchange(challenge)
        with self.assertRaises(ValueError):self.f.gate().run('execute',self.nonce,changed)
        self.assertEqual(self.f.calls('apply'),0)

    def test_approval_import_does_not_unpause_worker(self):
        self.ready();record=worker_fixture.approval('queued-after-pause')
        self.co.store.publish({'collection-control/requests/'+record['id']+'.json':e.canonical(record)})
        state=self.ack();self.assertEqual(state['requests'][record['id']]['phase'],'waiting-control')
        self.assertEqual(state['executionControl']['pauseMode'],'pause-new')
        self.assertEqual(self.execute()['phase'],'completed')

    def test_foreign_control_wins_cas_without_overwriting_or_resume(self):
        self.pause();current=self.co.latest()
        foreign=self.co.command('pause-new',self.nonce,current,self.decision);foreign['id']='operator-separate-pause'
        other=c.Coordinator({**self.config,'journalDir':str(self.root/'other-cache')});other.cas(foreign)
        with self.assertRaises(ValueError):self.co.pause(self.ticket,self.decision)
        with self.assertRaises(ValueError):self.f.gate().run('preflight',self.nonce,self.exchange)
        self.assertEqual(self.co.latest()['lastControlId'],'operator-separate-pause')

    def test_stale_ticket_signature_and_closure_cannot_resume_new_pause(self):
        self.ready();closure=self.terminal('cancel')
        bad=copy.deepcopy(closure);bad['payload']['generation']+=1
        with self.assertRaises(ValueError):self.resume(bad)
        self.resume(closure);self.terminal('finish');self.ack()
        other=str(uuid.uuid4());self.f.upload(other);ticket=self.f.gate().run('arm',other,self.exchange)
        self.co.pause(ticket,self.decision);self.ack()
        with self.assertRaises(ValueError):self.resume(closure)
        challenge=self.f.gate().challenge(other,ticket);challenge['exclusion']=dict(ticket);challenge['exclusion']['generation']=1
        with self.assertRaises(ValueError):self.exchange(challenge)
        self.assertEqual(self.co.latest()['pauseMode'],'pause-new')

    def test_worker_lock_busy_and_orphan_common_lock_release_without_waiting(self):
        self.pause()
        # An orphaned acceptance child inherits the real common FD; worker.lock alone is insufficient.
        script='import fcntl,os,sys,time;f=os.open(sys.argv[1],os.O_RDWR);fcntl.flock(f,fcntl.LOCK_EX);print("locked",flush=True);time.sleep(30)'
        child=subprocess.Popen([sys.executable,'-c',script,str(self.common)],stdout=subprocess.PIPE,text=True)
        self.assertEqual(child.stdout.readline().strip(),'locked')
        try:
            with self.assertRaises(BlockingIOError):
                with self.co.barrier():pass
            with e.locked(self.home/'worker.lock'):pass  # Failed barrier already released first lock.
        finally:child.kill();child.wait();child.stdout.close()
        with e.locked(self.home/'worker.lock'):
            with self.assertRaises(BlockingIOError):
                with self.co.barrier():pass
        with self.co.barrier():pass

    def test_real_wsl_peer_kill_during_remote_apply_leaves_durable_pause(self):
        self.pause();config=self.root/'coordination-config.json';e.durable(config,self.config)
        client=self.root/'fixed-client'
        client.write_text('#!/usr/bin/python3\nimport os,sys\nos.execv("/usr/bin/python3",'+repr(['/usr/bin/python3','-I',str(ROOT/'scripts/publication-executor.py'),'--sandbox-root',str(self.root)])+'+sys.argv[1:])\n')
        client.chmod(0o700)
        argv=[sys.executable,str(ROOT/'scripts/publication-attest.py'),'--runtime',str(self.f.fixture.f.root),
            '--candidate',str(self.f.fixture.args.output),'--key',str(self.f.keys['attester']),'--client',str(client),
            '--coordination-config',str(config)]
        before=subprocess.run(argv+['preflight',self.nonce],capture_output=True,text=True,timeout=20)
        self.assertEqual(before.returncode,0,before.stderr);self.f.approve();self.f.control({'applyDelay':True})
        peer=subprocess.Popen(argv+['execute',self.nonce],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            deadline=time.monotonic()+10
            while not (self.root/'applying.marker').exists() and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue((self.root/'applying.marker').exists())
            peer.kill();peer.wait(timeout=5)  # Only this isolated peer, never the live Worker.
            self.assertEqual(self.ack()['executionControl']['pauseMode'],'pause-new')
            time.sleep(1.2);self.f.control({})
            self.assertEqual(self.execute()['phase'],'completed');self.assertEqual(self.f.calls('apply'),1)
            closure=self.terminal('close');self.resume(closure);self.terminal('finish')
        finally:
            if peer.poll() is None:peer.kill();peer.wait()

    def test_vps_process_crash_after_commit_can_only_verify_then_close(self):
        self.ready();self.f.control({'afterCommitDelay':True});child=self.f.start()
        try:
            for _ in range(2):
                challenge=json.loads(child.stdout.readline())['challenge']
                child.stdin.write(json.dumps(self.exchange(challenge))+'\n');child.stdin.flush()
            deadline=time.monotonic()+5
            while not (self.root/'committed.marker').exists() and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue((self.root/'committed.marker').exists());child.kill();child.wait(timeout=5)
        finally:
            if child.poll() is None:child.kill();child.wait()
            child.stdin.close();child.stdout.close();child.stderr.close()
        with self.assertRaises(ValueError):self.terminal('close')
        time.sleep(1.1);self.f.control({})
        self.assertEqual(self.execute()['phase'],'completed');self.assertEqual(self.f.calls('apply'),1)
        self.assertEqual(self.ack()['executionControl']['pauseMode'],'pause-new')
        self.resume(self.terminal('close'));self.terminal('finish')

    def test_cas_detects_foreign_control_inserted_at_push_boundary(self):
        original=self.co.store.git;inserted=[False]
        def race(*args,**kwargs):
            if args[0]=='push' and not inserted[0]:
                inserted[0]=True
                other=c.Coordinator({**self.config,'journalDir':str(self.root/'racing-cache')})
                command=other.command('pause-new',str(uuid.uuid4()),other.latest(),self.decision)
                command['id']='operator-racing-pause';other.cas(command)
            return original(*args,**kwargs)
        with patch.object(self.co.store,'git',side_effect=race):
            with self.assertRaisesRegex(ValueError,'Concurrent'):self.co.pause(self.ticket,self.decision)
        self.assertEqual(self.co.latest()['lastControlId'],'operator-racing-pause')
        self.assertEqual(self.co.latest()['revision'],1)

    def test_cancel_before_first_preflight_binds_pause_without_receipt_freshness(self):
        self.pause();receipt=next((self.f.fixture.f.root/'datasets/manga-collection').glob('accepted-*/acceptance.json'));receipt.write_text('{}')
        closure=self.terminal('cancel');self.resume(closure);self.terminal('finish')
        self.assertEqual(self.f.calls('apply'),0)

    def test_closed_certificate_retry_rechecks_directory_durability(self):
        self.ready();self.execute();closure=self.terminal('close')
        original=e.durable
        def broken(path,value,fail=None):
            if path.name=='exclusion.json':raise OSError('isolated unavailable directory fsync')
            return original(path,value,fail)
        with patch.object(e.Gate,'durable',staticmethod(broken)):
            with self.assertRaises(OSError):self.terminal('close')
        self.assertEqual(self.terminal('close'),closure)


    def test_status_exposes_exclusion_before_preflight_and_after_close(self):
        status=self.f.gate().run('status',self.nonce,self.exchange)
        self.assertEqual(status['phase'],'awaiting-worker-pause')
        self.assertEqual(status['exclusion']['ticketId'],self.ticket['ticketId'])
        self.pause();self.terminal('cancel')
        self.assertEqual(self.f.gate().run('status',self.nonce,self.exchange)['exclusion']['phase'],'cancelled')


    def test_additional_valid_receipt_after_approval_stops_before_consuming(self):
        self.ready();root=self.f.fixture.f.root
        original=next((root/'datasets/manga-collection').glob('accepted-*/acceptance.json'))
        shutil.copytree(original.parent,original.parent.with_name('accepted-later-same-records'))
        self.co=c.Coordinator(self.config);self.ack()
        # All original records remain hash-valid, but a newly saved formal receipt changes the approved set.
        with self.assertRaisesRegex(ValueError,'New/missing formal receipt'):self.execute()
        self.assertEqual(self.f.calls('apply'),0);self.assertFalse(self.f.gate().reservations()['nonces'])
        self.resume(self.terminal('cancel'));self.terminal('finish')


    def test_missing_pause_proof_or_legacy_signature_never_reaches_apply(self):
        self.ready()
        with self.assertRaises(ValueError):self.f.gate().run('execute',self.nonce,self.f.exchange)
        self.assertEqual(self.f.calls('apply'),0)


if __name__=='__main__':unittest.main()
