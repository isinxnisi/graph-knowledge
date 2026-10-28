"""Thin delivery connector with real signatures/Git controls/root gate and fake filesystem KG.
No Docker, network, live Worker, actual KG or operator key is used.
"""
import copy
from pathlib import Path
import shutil
import unittest
import test_publication_coordination as fixture

c=fixture.c;e=fixture.e
d=c.load('delivery_test','publication-delivery.py')


class DeliveryTests(unittest.TestCase):
    # Only this class's tests; the existing coordination suite is not re-run here.
    def setUp(self):
        base=fixture.CoordinationTests();base.setUp();self.addCleanup(base.doCleanups)
        for name in ['root','f','co','nonce','decision','ticket','exchange','ack','ready']:
            setattr(self,name,getattr(base,name))
        self.ready()
        self.jobdir=self.root/'delivery';self.jobdir.mkdir(mode=0o700)
        self.job=self.jobdir/'job.json'
        request=e.read(self.root/'jobs'/(self.nonce+'.json'))['request']
        e.durable(self.job,{'schemaVersion':1,'nonce':self.nonce,'candidate':str(self.f.fixture.args.output),
            'request':request,'ticket':self.co.ticket(self.ticket),'humanDecision':self.decision})
        shutil.copyfile(self.root/'inbox'/self.nonce/'approval.json',self.jobdir/'approval.json')
        case=self
        class Gateway:
            def __init__(self):self.calls=[];self.drop_after=None
            def verify_approval(self,value):return e.policy.verify_signature(value,case.root/'trusted/approver.pem',case.f.config['approverKeySha256'])
            def upload_approval(self,nonce,path):
                self.calls.append('upload');shutil.copyfile(path,case.root/'inbox'/nonce/'approval.json')
            def call(self,mode,nonce):
                self.calls.append(mode);result=case.f.gate().run(mode,nonce,case.exchange)
                if self.drop_after==mode:self.drop_after=None;raise OSError('isolated lost response')
                return result
        self.gateway=Gateway();self.gateway.config={}
    def run_delivery(self):return d.Delivery(self.job,self.gateway,self.co).run()
    def test_full_chain_and_completed_retry_never_executes_again(self):
        result=self.run_delivery();self.assertEqual(result['phase'],'completed')
        self.assertEqual(self.ack()['executionControl']['pauseMode'],None)
        self.gateway.calls=[];self.run_delivery()
        self.assertEqual(self.gateway.calls,['status','notify']);self.assertEqual(self.f.calls('apply'),1)
    def test_lost_apply_response_discovers_verified_result_without_execute(self):
        self.gateway.drop_after='execute'
        with self.assertRaises(OSError):self.run_delivery()
        self.gateway.calls=[];self.run_delivery()
        self.assertNotIn('execute',self.gateway.calls);self.assertEqual(self.f.calls('apply'),1)
    def test_commit_then_failure_recovers_same_nonce_verify_only(self):
        self.f.control({'applyAfter':True})
        with self.assertRaises(ValueError):self.run_delivery()
        self.assertEqual(self.ack()['executionControl']['pauseMode'],'pause-new')
        self.f.control({});self.run_delivery();self.assertEqual(self.f.calls('apply'),1)
    def test_lost_close_and_finish_responses_resume_idempotently(self):
        self.gateway.drop_after='close'
        with self.assertRaises(OSError):self.run_delivery()
        self.gateway.drop_after='finish'
        with self.assertRaises(OSError):self.run_delivery()
        self.gateway.calls=[];self.run_delivery()
        self.assertEqual(self.gateway.calls,['status','notify']);self.assertEqual(self.f.calls('apply'),1)
    def test_notification_failure_retries_only_notification(self):
        self.f.control({'fault':'notify'})
        with self.assertRaises(ValueError):self.run_delivery()
        self.assertEqual(e.read(self.job)['deliveryStage'],'notifying')
        self.f.control({});self.gateway.calls=[];self.run_delivery()
        self.assertEqual(self.gateway.calls,['status','notify']);self.assertEqual(self.f.calls('apply'),1)
    def test_modified_approval_or_root_request_is_rejected_before_execute(self):
        approval=e.read(self.jobdir/'approval.json');approval['payload']['planSha256']='f'*64
        e.durable(self.jobdir/'approval.json',approval)
        with self.assertRaises(ValueError):self.run_delivery()
        self.assertNotIn('execute',self.gateway.calls);self.assertEqual(self.f.calls('apply'),0)
        original=self.gateway.call
        def rebound(mode,nonce):
            result=copy.deepcopy(original(mode,nonce));result['request']['planSha256']='e'*64;return result
        self.gateway.call=rebound
        with self.assertRaises(ValueError):self.run_delivery()
        self.assertEqual(self.f.calls('apply'),0)
    def test_foreign_operational_control_is_preserved(self):
        self.gateway.drop_after='close'
        with self.assertRaises(OSError):self.run_delivery()
        previous=self.co.latest();command=self.co.command('resume','00000000-0000-4000-8000-000000000001',previous,self.decision);self.co.cas(command)
        with self.assertRaises(ValueError):self.run_delivery()
        self.assertEqual(self.co.latest()['lastControlId'],command['id']);self.assertEqual(self.f.calls('apply'),1)

    def test_signature_handoff_is_immutable_and_immediately_resumable(self):
        path=self.jobdir/'approval.json';document=e.read(path);path.unlink()
        d.accept_approval(self.job,document,self.gateway)
        d.accept_approval(self.job,document,self.gateway)
        changed=copy.deepcopy(document);changed['payload']['nonce']='00000000-0000-4000-8000-000000000001'
        with self.assertRaises(ValueError):d.accept_approval(self.job,changed,self.gateway)
        self.assertEqual(e.read(path),document);self.run_delivery();self.assertEqual(self.f.calls('apply'),1)
    def test_registration_uses_root_live_plan_and_cannot_rebind(self):
        queue=self.root/'registration';queue.mkdir();path=queue/self.nonce/'job.json'
        candidate=self.f.fixture.args.output
        result=d.register(path,candidate,self.nonce,self.decision,self.gateway,self.co)
        self.assertEqual(result['phase'],'awaiting-operator-signature')
        self.assertEqual(e.read(path)['request'],e.read(self.job)['request'])
        changed=copy.deepcopy(self.decision);changed['statement']+=' changed'
        with self.assertRaises(ValueError):d.register(path,candidate,self.nonce,changed,self.gateway,self.co)
        self.assertEqual(self.f.calls('apply'),0)


class QueueTests(unittest.TestCase):
    def test_unsigned_and_completed_jobs_are_not_run(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            queue=Path(tmp);one=queue/'00000000-0000-4000-8000-000000000001';one.mkdir()
            e.durable(one/'job.json',{'nonce':one.name});self.assertIsNone(d.pending(queue))
            e.durable(one/'approval.json',{});self.assertEqual(d.pending(queue),one/'job.json')
            e.durable(one/'job.json',{'nonce':one.name,'deliveryStage':'completed'});self.assertIsNone(d.pending(queue))
    def test_queue_symlinks_and_wrong_nonce_are_rejected(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            queue=Path(tmp);one=queue/'00000000-0000-4000-8000-000000000001';one.mkdir()
            e.durable(one/'job.json',{'nonce':'00000000-0000-4000-8000-000000000002'});e.durable(one/'approval.json',{})
            with self.assertRaises(ValueError):d.pending(queue)
            (one/'approval.json').unlink();(one/'approval.json').symlink_to(one/'job.json')
            with self.assertRaises(ValueError):d.pending(queue)

class PeerConfigurationTests(unittest.TestCase):
    def test_existing_private_config_must_equal_fixed_root_policy(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);(home/'keys').mkdir();fixed=home/'fixed.json';private=home/'coordinator.json'
            e.durable(fixed,{'workerId':'fixed','branch':'protected'});e.durable(private,e.read(fixed))
            gateway=d.Gateway.__new__(d.Gateway);gateway.config={'attesterKey':str(home/'keys/attester.pem'),'coordinationConfig':str(fixed)}
            self.assertEqual(gateway.peer_configuration(),str(private))
            e.durable(private,{'workerId':'changed','branch':'protected'})
            with self.assertRaises(ValueError):gateway.peer_configuration()
    def test_world_readable_or_symlink_peer_config_is_refused(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);(home/'keys').mkdir();fixed=home/'fixed.json';private=home/'coordinator.json'
            e.durable(fixed,{});e.durable(private,{})
            gateway=d.Gateway.__new__(d.Gateway);gateway.config={'attesterKey':str(home/'keys/attester.pem'),'coordinationConfig':str(fixed)}
            private.chmod(0o644)
            with self.assertRaises(ValueError):gateway.peer_configuration()
            private.unlink();private.symlink_to(fixed)
            with self.assertRaises(ValueError):gateway.peer_configuration()

if __name__=='__main__':unittest.main()
