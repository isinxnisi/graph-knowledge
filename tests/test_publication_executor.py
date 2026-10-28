"""Real gate subprocess, signatures, FDs, locks, durable journals; fake isolated DB/notification."""
import copy
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch
import test_collection_sequence as fixtures
import test_publication_cycle as draft_fixture

ROOT=Path(__file__).resolve().parents[1]
e=fixtures.module('executor_test',ROOT/'scripts/publication-executor.py')
s=fixtures.module('sign_test',ROOT/'scripts/publication-sign.py')
a=fixtures.module('attest_test',ROOT/'scripts/publication-attest.py')
n=fixtures.module('notify_test',ROOT/'scripts/publication-notify.py')

FAKE = r'''import hashlib,json,sys,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent
stage=sys.argv[1];p=json.load(sys.stdin);c=Path(p['candidate']);control=json.loads((root/'control.json').read_text())
with (root/'calls').open('a') as out:out.write(stage+'\n')
if stage=='web-identity':print(json.dumps({'image':'sha256:'+'f'*64}));sys.exit(0)
if control.get('fault')==stage:raise SystemExit(7)
def read(path):return json.loads(path.read_text())
def save(path,v):path.write_text(json.dumps(v))
state=read(root/'db.json');request=read(c/'approval-request.json');manifest=read(c/'release/manifest.json')
canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
if stage=='image':result={'operatorDigest':'sha256:'+('e' if control.get('image') else 'd')*64}
elif stage=='validate':result={'valid':True}
elif stage=='observe':result={'payload':state}
elif stage=='plan':
 result=read(c/'offline-plan.json');result['unchanged']=False
 if control.get('updates'):result['updated']=['Claim:existing']
elif stage=='apply':
 if control.get('applyDelay'):
  (root/'applying.marker').touch();time.sleep(1)
 if control.get('applyBefore'):raise SystemExit(7)
 if state['revision']!=p['revision']:raise SystemExit(8)
 state.update(release=request['release'],revision='published-revision',fixture=read(c/'release/data.json'))
 state['receipts'].append({'id':request['release'],'digest':hashlib.sha256(canonical(manifest)).hexdigest(),'dataSha256':manifest['dataSha256']})
 save(root/'db.json',state)
 if control.get('afterCommitDelay'):
  (root/'committed.marker').touch();time.sleep(1)
 if control.get('applyAfter'):raise SystemExit(7)
 result={'applied':True}
elif stage=='verify':
 if state['release']!=request['release'] or state['fixture']!=read(c/'release/data.json'):raise SystemExit(8)
 receipt=next(r for r in state['receipts'] if r['id']==request['release'])
 if receipt['digest']!=hashlib.sha256(canonical(manifest)).hexdigest():raise SystemExit(9)
 result={'verified':True,'release':state['release'],'revision':state['revision'],'dataSha256':manifest['dataSha256'],'manifestDigest':receipt['digest'],'manifestFileSha256':hashlib.sha256((c/'release/manifest.json').read_bytes()).hexdigest()}
 if control.get('manifestFileMismatch'):result['manifestFileSha256']='f'*64
 if control.get('missingManifestFile'):result.pop('manifestFileSha256')
 if control.get('typescriptManifestDigest'):result['manifestDigest']='a'*64
elif stage=='notify':
 path=root/'sent.json';sent=read(path) if path.exists() else []
 if p['nonce'] not in sent:sent.append(p['nonce']);save(path,sent)
 result={'sent':True}
else:raise SystemExit(6)
print(json.dumps(result))
'''


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.fixture=draft_fixture.PublicationCycleTests();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.fixture.prepare_current()
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        for name in ['trusted','inbox']: (self.root/name).mkdir(mode=0o700)
        self.keys={}
        for name in ['approver','attester']:
            key=self.root/(name+'-private.pem');pub=self.root/'trusted'/(name+'.pem')
            subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(key)],check=True,capture_output=True);key.chmod(0o600)
            subprocess.run(['openssl','pkey','-in',str(key),'-pubout','-out',str(pub)],check=True,capture_output=True)
            self.keys[name]=key
        backend=self.root/'trusted/operator.py';backend.write_text(FAKE);backend.chmod(0o600)
        self.config={'profile':'sandbox','deploymentEnabled':False,'operatorDigest':'sha256:'+'d'*64,
            'backendSha256':e.sha(backend),**{name+'KeySha256':e.sha(self.root/'trusted'/(name+'.pem')) for name in self.keys}}
        self.save_config();self.control({})
        self.nonce=str(uuid.uuid4());self.upload(self.nonce)
        self.save('db.json',{'release':'release-group-2','revision':'after-publication','receipts':[{'id':'release-group-2'}],
            'fixture':self.fixture.public})

    def save(self,path,value): (self.root/path).write_text(json.dumps(value))
    def save_config(self):self.save('trusted/config.json',self.config)
    def control(self,value):self.save('control.json',value)
    def upload(self,nonce):
        target=self.root/'inbox'/nonce;target.mkdir(mode=0o700)
        shutil.copytree(self.fixture.args.output,target/'candidate')
    def exchange(self,challenge):return s.sign(challenge,self.keys['attester'])
    def gate(self):return e.Gate(self.root,True)
    def preflight(self,nonce=None):return self.gate().run('preflight',nonce or self.nonce,self.exchange)
    def approve(self,nonce=None,expired=False):
        nonce=nonce or self.nonce;request=e.read(self.root/'jobs'/(nonce+'.json'))['request']
        payload=s.approve(request,nonce,30)
        if expired:payload.update(issuedAt='2026-01-01T00:00:00+00:00',expiresAt='2026-01-01T00:30:00+00:00')
        self.save('inbox/'+nonce+'/approval.json',s.sign(payload,self.keys['approver']))
    def ready(self):self.preflight();self.approve()
    def calls(self,stage):return (self.root/'calls').read_text().splitlines().count(stage) if (self.root/'calls').exists() else 0

    def start(self,command='execute',nonce=None):
        return subprocess.Popen([sys.executable,'-I',str(ROOT/'scripts/publication-executor.py'),'--sandbox-root',str(self.root),command,nonce or self.nonce],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    def finish(self,child):
        result=None
        while True:
            line=child.stdout.readline()
            if not line:break
            message=json.loads(line)
            if 'challenge' in message:child.stdin.write(json.dumps(self.exchange(message['challenge']))+'\n');child.stdin.flush()
            else:result=message
        child.stdin.close();child.wait(timeout=10);error=child.stderr.read();child.stdout.close();child.stderr.close()
        return child.returncode,result,error

    def rebind_uploaded_ledger(self, change):
        directory=self.root/'inbox'/self.nonce/'candidate'
        ledger=e.read(directory/'ledger.json');change(ledger)
        (directory/'ledger.json').write_text(json.dumps(ledger))
        assets=e.read(directory/'ARTIFACT.json');assets['ledger.json']=e.sha(directory/'ledger.json')
        (directory/'ARTIFACT.json').write_text(json.dumps(assets))
        request=e.read(directory/'approval-request.json');request['artifactSha256']=e.sha(directory/'ARTIFACT.json')
        (directory/'approval-request.json').write_text(json.dumps(request))

    def test_missing_api_coverage_stops_before_preflight_or_reservation(self):
        self.rebind_uploaded_ledger(lambda ledger:ledger.pop('pending'))
        with self.assertRaisesRegex(ValueError,'Pending verification ledger'):
            self.preflight()
        self.assertEqual(self.calls('apply'),0)
        self.assertFalse(self.gate().reservations()['nonces'])

    def test_api_coverage_must_equal_live_graph_additions_before_apply(self):
        def omit(ledger):
            ledger['pending']['claims']=[];ledger['counts']['acceptedUnpublished']['claims']=0
        self.rebind_uploaded_ledger(omit)
        with self.assertRaisesRegex(ValueError,'actual unpublished delta'):
            self.preflight()
        self.assertEqual(self.calls('apply'),0)
        self.assertFalse(self.gate().reservations()['nonces'])

    def test_real_process_approval_single_apply_and_nonce_replay(self):
        self.ready();code,result,error=self.finish(self.start())
        self.assertEqual(code,0,error);self.assertEqual(result['result']['phase'],'completed')
        self.assertFalse(result['result']['pendingAudit']);self.assertEqual(self.calls('apply'),1)
        code,result,_=self.finish(self.start());self.assertEqual(code,0)
        self.assertEqual(self.calls('apply'),1);self.assertEqual(e.read(self.root/'sent.json'),[self.nonce])

    def test_legacy_operator_without_raw_manifest_capability_is_rejected(self):
        from unittest.mock import patch
        backend=e.DockerBackend(self.root,{'operatorDigest':'sha256:'+'d'*64})
        inspected=subprocess.CompletedProcess([],0,stdout=json.dumps([{'Id':'sha256:'+'d'*64,'Os':'linux','Architecture':'amd64'}]).encode())
        with patch.object(e.subprocess,'run',return_value=inspected),patch.object(backend,'command',return_value={'schemaVersion':1,'originalStory':True,'guardedApply':True}):
            with self.assertRaisesRegex(ValueError,'Operator capabilities differ'):backend.call('image',{'candidate':str(self.fixture.args.output)})
        self.assertEqual(self.calls('apply'),0)

    def test_cross_language_manifest_digest_uses_frozen_file_sha(self):
        self.ready();self.control({'typescriptManifestDigest':True})
        result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'completed')
        self.assertEqual(result['verification']['manifestDigest'],'a'*64)
        self.assertEqual(result['verification']['manifestFileSha256'],e.sha(self.root/'frozen'/self.nonce/'release/manifest.json'))
        self.assertEqual(self.calls('apply'),1)

    def test_missing_or_wrong_manifest_file_sha_stays_consumed_without_reapply(self):
        self.ready();self.control({'missingManifestFile':True})
        result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'operator-inspection-required-no-reapply')
        self.control({'manifestFileMismatch':True})
        result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'operator-inspection-required-no-reapply')
        self.control({});result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'completed');self.assertEqual(self.calls('apply'),1)

    def test_two_concurrent_processes_cannot_apply_twice(self):
        self.ready();self.control({'applyDelay':True});first=self.start()
        # Complete both challenge exchanges before its fake apply waits.
        for _ in range(2):
            message=json.loads(first.stdout.readline());first.stdin.write(json.dumps(self.exchange(message['challenge']))+'\n');first.stdin.flush()
        deadline=time.monotonic()+5
        while not (self.root/'applying.marker').exists() and time.monotonic()<deadline:time.sleep(.01)
        self.assertTrue((self.root/'applying.marker').exists())
        code,_,_=self.finish(self.start());self.assertNotEqual(code,0)
        code,_,error=self.finish(first);self.assertEqual(code,0,error);self.assertEqual(self.calls('apply'),1)

    def test_expired_approval_stops_before_consuming(self):
        self.preflight();self.approve(expired=True)
        with self.assertRaises(ValueError):self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(self.calls('apply'),0);self.assertFalse(self.gate().reservations()['nonces'])

    def test_fsync_failures_never_apply_or_allow_automatic_retry(self):
        self.ready()
        for key,fault in [('fault','file-fsync'),('fault','directory-fsync'),('reserveFault','file-fsync'),('reserveFault','directory-fsync')]:
            with self.subTest(key=key,fault=fault):
                # Each failed reservation is conservatively consumed; use a fresh independent test root.
                nonce=str(uuid.uuid4());self.upload(nonce);self.preflight(nonce);self.approve(nonce)
                self.config[key]=fault;self.save_config()
                with self.assertRaises(OSError):self.gate().run('execute',nonce,self.exchange)
                self.config.pop(key);self.save_config()
                if nonce in self.gate().reservations()['nonces']:
                    result=self.gate().run('execute',nonce,self.exchange)
                    self.assertEqual(result['phase'],'operator-inspection-required-no-reapply')
                    # Clear only this isolated test's simulated reservation before the next subcase.
                    self.save('reservations.json',{'nonces':{},'releases':{}})
                self.assertEqual(self.calls('apply'),0)

    def test_lost_apply_response_recovers_from_db_receipt_without_reapply(self):
        self.ready();self.control({'applyAfter':True})
        result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'operator-inspection-required-no-reapply')
        self.control({});result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'completed');self.assertEqual(self.calls('apply'),1)

    def test_unknown_result_requires_human_and_blocks_other_nonce_same_release(self):
        self.ready();self.control({'applyBefore':True});self.gate().run('execute',self.nonce,self.exchange)
        self.control({});result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'operator-inspection-required-no-reapply')
        other=str(uuid.uuid4());self.upload(other)
        with self.assertRaisesRegex(ValueError,'reserved'):self.preflight(other)
        self.assertEqual(self.calls('apply'),1)

    def test_postverify_failure_retries_only_verification(self):
        self.ready();self.control({'fault':'verify'});self.gate().run('execute',self.nonce,self.exchange)
        self.control({});self.assertEqual(self.gate().run('execute',self.nonce,self.exchange)['phase'],'completed')
        self.assertEqual(self.calls('apply'),1)

    def test_notification_failure_retry_has_no_attestation_or_db_or_apply(self):
        self.ready();self.control({'fault':'notify'});result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertTrue(result['pendingAudit']);before=self.calls('observe');self.control({})
        result=self.gate().run('notify',self.nonce,lambda _:self.fail('No receipt lock for audit resend'))
        self.assertFalse(result['pendingAudit']);self.assertEqual(self.calls('observe'),before);self.assertEqual(self.calls('apply'),1)

    def test_bad_attestation_closed_channel_worker_and_vps_lock_stop(self):
        self.ready()
        with self.assertRaises(ValueError):self.gate().run('execute',self.nonce,lambda challenge:s.sign(challenge,self.keys['approver']))
        with e.locked(self.root/'operation.lock'):
            with self.assertRaises(BlockingIOError):self.gate().run('execute',self.nonce,self.exchange)
        child=self.start();json.loads(child.stdout.readline());child.stdin.close();child.wait(timeout=5)
        self.assertNotEqual(child.returncode,0);child.stdout.close();child.stderr.close();self.assertEqual(self.calls('apply'),0)

    def test_drift_and_operator_backup_plan_fail_before_apply(self):
        self.ready()
        for control in [{'image':True},{'fault':'validate'},{'fault':'observe'},{'fault':'plan'},{'updates':True}]:
            self.control(control)
            with self.subTest(control=control),self.assertRaises(ValueError):self.gate().run('execute',self.nonce,self.exchange)
        self.control({});db=e.read(self.root/'db.json');db['revision']='same-base-other-update';self.save('db.json',db)
        with self.assertRaisesRegex(ValueError,'base/revision'):self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(self.calls('apply'),0)

    def test_uploaded_and_frozen_scripts_symlinks_hardlinks_or_extra_assets_rejected(self):
        target=self.root/'inbox'/self.nonce/'candidate/evil.py';target.write_text('raise Exception()')
        with self.assertRaises(ValueError):self.preflight()
        target.unlink();target.symlink_to(self.keys['approver'])
        with self.assertRaises(OSError):self.preflight()
        target.unlink();os.link(self.keys['approver'],target)
        with self.assertRaises(ValueError):self.preflight()
        target.unlink();self.preflight()
        frozen=self.root/'frozen'/self.nonce/'release/data.json';frozen.chmod(0o600);frozen.write_text('{}')
        with self.assertRaises(ValueError):self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(self.calls('apply'),0)

    def test_fake_root_boundary_checks_pinned_program_and_modes(self):
        self.ready();operator=self.root/'trusted/operator.py';operator.chmod(0o666)
        with self.assertRaises(ValueError):self.gate().run('execute',self.nonce,self.exchange)
        operator.chmod(0o600);operator.write_text(FAKE+'\n# changed')
        with self.assertRaises(ValueError):self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(self.calls('apply'),0)

    def test_attester_checks_real_receipts_and_changed_evidence(self):
        request=e.cycle.read(self.fixture.args.output/'approval-request.json')
        stamp=e.now();challenge={'schemaVersion':1,'purpose':'receipt-freshness','nonce':self.nonce,'challenge':str(uuid.uuid4()),
            'artifactSha256':request['artifactSha256'],'receiptSetSha256':request['receiptSetSha256'],
            'issuedAt':stamp.isoformat(),'expiresAt':(stamp+e.dt.timedelta(seconds=60)).isoformat()}
        self.assertEqual(a.freshness(self.fixture.f.root,self.fixture.args.output,challenge),challenge)
        receipt=next((self.fixture.f.root/'datasets/manga-collection').glob('accepted-*/acceptance.json'))
        receipt.write_text('{}')
        with self.assertRaises(ValueError):a.freshness(self.fixture.f.root,self.fixture.args.output,challenge)

    def test_worker_lock_conflict_in_real_attestation_client_never_starts_peer(self):
        lock=self.root/'common.lock';lock.touch()
        client=self.root/'client';client.write_text('#!/bin/sh\ntouch '+str(self.root/'peer-started')+'\n');client.chmod(0o700)
        with e.locked(lock):
            result=subprocess.run([sys.executable,str(ROOT/'scripts/publication-attest.py'),'--runtime',str(self.fixture.f.root),
                '--candidate',str(self.fixture.args.output),'--key',str(self.keys['attester']),'--client',str(client),
                '--common-lock',str(lock),'execute',self.nonce],capture_output=True,timeout=10)
        self.assertNotEqual(result.returncode,0);self.assertFalse((self.root/'peer-started').exists())

    def test_installed_root_wrapper_rejects_nonroot_and_arbitrary_args(self):
        result=subprocess.run(['/usr/bin/python3','-I',str(ROOT/'ops/plunode-publication'),'execute',self.nonce],capture_output=True,timeout=10)
        self.assertNotEqual(result.returncode,0);self.assertEqual(self.calls('apply'),0)

    def test_audit_sender_deduplicates_and_never_invokes_apply(self):
        self.ready();self.gate().run('execute',self.nonce,self.exchange);calls=[]
        def run(argv,**kw):
            calls.append(argv);return subprocess.CompletedProcess(argv,0,stdout='<!-- plunode-publication:'+self.nonce+' -->',stderr='')
        self.assertTrue(n.send(self.nonce,self.root/'outbox',run)['deduplicated'])
        self.assertEqual(len(calls),1);self.assertNotIn('apply',str(calls))

    def test_real_wsl_peer_holds_lock_through_gate_process_and_checks_receipts(self):
        lock=self.root/'peer-common.lock';lock.touch()
        client=self.root/'fixed-client'
        client.write_text('#!/usr/bin/python3\nimport os,sys\nos.execv("/usr/bin/python3",'+repr(['/usr/bin/python3','-I',str(ROOT/'scripts/publication-executor.py'),'--sandbox-root',str(self.root)])+'+sys.argv[1:])\n')
        client.chmod(0o700)
        def run(command):
            return subprocess.run([sys.executable,str(ROOT/'scripts/publication-attest.py'),'--runtime',str(self.fixture.f.root),
                '--candidate',str(self.fixture.args.output),'--key',str(self.keys['attester']),'--client',str(client),
                '--common-lock',str(lock),command,self.nonce],capture_output=True,text=True,timeout=30)
        result=run('preflight');self.assertEqual(result.returncode,0,result.stderr)
        self.approve();result=run('execute');self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.calls('apply'),1)
        with e.locked(lock):pass

    def test_nonce_cannot_be_rebound_to_another_request(self):
        self.ready();document=e.read(self.root/'inbox'/self.nonce/'approval.json')
        document['payload']['artifactSha256']='f'*64
        self.save('inbox/'+self.nonce+'/approval.json',s.sign(document['payload'],self.keys['approver']))
        with self.assertRaises(ValueError):self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(self.calls('apply'),0)

    def test_same_release_after_failed_verification_with_wrong_db_receipt_requires_human(self):
        self.ready();self.control({'fault':'verify'});self.gate().run('execute',self.nonce,self.exchange)
        db=e.read(self.root/'db.json');db['receipts'][-1]['digest']='f'*64;self.save('db.json',db);self.control({})
        result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'operator-inspection-required-no-reapply');self.assertEqual(self.calls('apply'),1)

    def test_forced_ssh_has_no_shell_or_arbitrary_arguments(self):
        ssh=fixtures.module('ssh_test',ROOT/'ops/publication-ssh.py')
        self.assertEqual(ssh.arguments('execute '+self.nonce),['execute',self.nonce])
        for value in ['execute '+self.nonce+'; id','execute '+self.nonce+' extra','status ../anything','sudo sh','restore '+self.nonce]:
            with self.subTest(value=value),self.assertRaises(ValueError):ssh.arguments(value)

    def test_noop_published_candidate_cannot_enter_privileged_preflight(self):
        path=self.root/'inbox'/self.nonce/'candidate/approval-request.json';request=e.read(path)
        request['release']=request['baseRelease'];path.write_text(json.dumps(request))
        with self.assertRaises(ValueError):self.preflight()
        self.assertEqual(self.calls('apply'),0)

    def test_required_compatibility_contract_missing_stops_before_apply(self):
        self.config['compatibilityRequired'] = True; self.save_config()
        with self.assertRaisesRegex(ValueError, 'compatibility contract required'):
            self.preflight()
        self.assertEqual(self.calls('apply'), 0)
        self.assertEqual(self.calls('compatibility'), 0)

    def test_new_status_reports_actual_web_image_without_apply(self):
        self.ready(); self.config['compatibilityRequired'] = True; self.save_config()
        status = self.gate().run('status', self.nonce, self.exchange)
        self.assertEqual(status['activeRuntime']['webImage'], 'sha256:' + 'f' * 64)
        self.assertEqual(self.calls('apply'), 0)

    def test_root_web_identity_selects_only_actual_3200_container(self):
        def run(argv, **kwargs):
            if argv[1] == 'ps': body = 'a' * 12 + '\n' + 'b' * 12 + '\n'
            else:
                port = '3200' if argv[-1] == 'b' * 12 else '3201'
                body = json.dumps([{'Image': 'sha256:' + 'e' * 64,
                    'NetworkSettings': {'Ports': {'3000/tcp': [{'HostPort': port}]}}}])
            return subprocess.CompletedProcess(argv, 0, stdout=body.encode(), stderr=b'')
        with patch.object(e.subprocess, 'run', side_effect=run):
            result = e.DockerBackend(self.root, {}).call('web-identity', {'candidate': str(self.root)})
        self.assertEqual(result, {'image': 'sha256:' + 'e' * 64})

    def test_gate_process_crash_after_db_commit_preserves_single_apply(self):
        self.ready();self.control({'afterCommitDelay':True});child=self.start()
        for _ in range(2):
            message=json.loads(child.stdout.readline());child.stdin.write(json.dumps(self.exchange(message['challenge']))+'\n');child.stdin.flush()
        deadline=time.monotonic()+5
        while not (self.root/'committed.marker').exists() and time.monotonic()<deadline:time.sleep(.01)
        self.assertTrue((self.root/'committed.marker').exists())
        child.kill();child.wait(timeout=5);child.stdin.close();child.stdout.close();child.stderr.close()
        time.sleep(1.1);self.control({})
        result=self.gate().run('execute',self.nonce,self.exchange)
        self.assertEqual(result['phase'],'completed');self.assertEqual(self.calls('apply'),1)


if __name__=='__main__':unittest.main()
