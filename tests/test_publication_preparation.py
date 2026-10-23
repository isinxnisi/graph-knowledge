"""Scheduled preparation with real receipts/Worker control/Git/signatures/root gate.
Only transport, offline Node planning and the DB backend are isolated fakes.
"""
import copy
import json
import os
import tempfile
from pathlib import Path
import shutil
import unittest
import uuid
from unittest.mock import patch
import test_publication_coordination as fixture

c=fixture.c;e=fixture.e;s=fixture.s;a=fixture.a
p=c.load('preparation_test','publication-preparation.py');d=p.d;cycle=p.cycle

class PreparationTests(unittest.TestCase):
    def setUp(self):
        f=fixture.CoordinationTests();f.setUp();self.addCleanup(f.doCleanups)
        self.f=f;self.root=f.root;self.runtime=f.f.fixture.f.root;self.w=f.f.fixture.f.w
        # Finish the fixture's unused ticket. No isolated apply is needed for the base proof.
        f.pause();f.resume(f.terminal('cancel'));f.terminal('finish');f.ack()
        self.queue=self.root/'queue';self.queue.mkdir(mode=0o700)
        self.home=self.root/'preparation';self.base=self.root/'applied-base';self.base.mkdir()
        shutil.copytree(f.f.fixture.bundle/'release',self.base/'release')
        refs=p.receipt_refs(self.runtime,self.w)[:2]
        data=e.read(self.base/'release/data.json')
        ledger={'receipts':refs,'receiptSetSha256':e.digest(refs),'pending':{field:[] for field in cycle.FIELDS},
            'counts':{'acceptedUnpublished':{field:0 for field in cycle.FIELDS}}}
        (self.base/'ledger.json').write_text(cycle.dump(ledger))
        (self.base/'offline-plan.json').write_text('{}')
        assets={v.relative_to(self.base).as_posix():e.sha(v) for v in self.base.rglob('*') if v.is_file()}
        (self.base/'ARTIFACT.json').write_text(cycle.dump(assets))
        req={'schemaVersion':1,'purpose':'public-kg-publication','environment':'production','release':'release-group-2',
            'baseRelease':'base','baseRevision':'isolated-revision','receiptSetSha256':e.digest(refs),
            'artifactSha256':e.sha(self.base/'ARTIFACT.json'),'operatorDigest':'sha256:'+'d'*64,'planSha256':e.digest({})}
        (self.base/'approval-request.json').write_text(cycle.dump(req))
        self.base_nonce=str(uuid.uuid4());bd=self.queue/self.base_nonce;bd.mkdir(mode=0o700)
        e.durable(bd/'job.json',{'nonce':self.base_nonce,'candidate':str(self.base),'request':req,'deliveryStage':'completed',
            'publicationResult':{'publishedRevision':'after-publication'}})
        self.proof={'nonce':self.base_nonce,'request':req,'phase':'completed','release':req['release'],
            'publishedRevision':'after-publication','exclusion':{'phase':'finished'},'verification':{
                'verified':True,'release':req['release'],'revision':'after-publication','dataSha256':e.sha(self.base/'release/data.json'),
                'manifestFileSha256':e.sha(self.base/'release/manifest.json')}}
        self.config={'runtime':str(self.runtime),'queueDir':str(self.queue),'preparation':{'enabled':True,
            'home':str(self.home),'nodeImage':'sha256:'+'d'*64,'humanDecision':f.decision}}
        case=self
        class Gateway:
            candidate=None
            def __init__(self):self.calls=[];self.drop_after=None;self.upload_failure=False
            def verify_approval(self,value):return e.policy.verify_signature(value,case.root/'trusted/approver.pem',case.f.f.config['approverKeySha256'])
            def upload_approval(self,nonce,path):shutil.copyfile(path,case.root/'inbox'/nonce/'approval.json')
            def upload_candidate(self,nonce,path):
                self.calls.append(('upload',nonce));target=case.root/'inbox'/nonce/'candidate'
                target.parent.mkdir(exist_ok=True,mode=0o700);shutil.copytree(path,target,dirs_exist_ok=True)
                if self.upload_failure:self.upload_failure=False;raise OSError('isolated partial/lost SFTP reply')
            def call(self,mode,nonce):
                self.calls.append((mode,nonce))
                if nonce==case.base_nonce:return copy.deepcopy(case.proof)
                result=case.f.f.gate().run(mode,nonce,case.exchange)
                if self.drop_after==mode:self.drop_after=None;raise OSError('isolated lost '+mode+' reply')
                return result
        self.gateway=Gateway();original=self.w.node
        def node(args):
            if args[0].endswith('publication-artifact-plan.ts'):
                new=e.read(Path(args[2])/'data.json');old=e.read(Path(args[1])/'data.json')
                return {'release':e.read(Path(args[2])/'manifest.json')['release'],'updated':[],
                    'added':['Claim:'+r['id'] for r in new['claims'] if r['id'] not in {v['id'] for v in old['claims']}],
                    'relationshipsAdded':4}
            return original(args)
        self.node=node
    def get(self,path):
        self.assertEqual(path,'/api/dataset')
        return {'dataset':'public-kg','revision':e.read(self.root/'db.json')['revision']}
    def prep(self):return p.Preparation(self.config,self.gateway,c.Coordinator(self.f.config),get=self.get,workflow=self.w,node=self.node)
    def tick(self):return self.prep().tick()
    def state(self):return e.read(self.home/'state.json')
    def exchange(self,challenge):
        a.check_challenge(challenge);co=c.Coordinator(self.f.config)
        with co.barrier():
            payload=dict(challenge)
            if challenge['purpose']=='worker-resume':payload['workerResume']=co.resume_proof(challenge)
            else:
                if challenge['purpose']=='receipt-freshness':a.freshness(self.runtime,Path(self.gateway.candidate),challenge)
                payload['workerPause']=co.pause_proof(challenge)
            return s.sign(payload,self.f.f.keys['attester'])
    def ready(self):
        self.assertEqual(self.tick()['phase'],'waiting-worker-acknowledgement');self.f.ack()
        self.assertEqual(self.tick()['phase'],'awaiting-human-publication-approval');return self.state()
    def add_receipt(self):
        f=self.f.f.fixture.f;record={**f.groups[0]['entities'][0],'id':str(uuid.uuid4()),'name':'New accepted entity'}
        proposal=f.save('datasets/external/proposal.json',{'records':{'entities':[record]}})
        f.save('datasets/manga-collection/accepted-new/acceptance.json',{'status':'accepted-for-release-preparation-only',
            'reviewer':'ISOLATED HUMAN','recordedAt':'2026-10-19T00:00:00+00:00','applyAuthorized':f.s.NO_APPLY,
            'referenceArtifacts':[self.w.reference(proposal)],'scopeByClaim':[],
            'acceptedRecordIds':{field:[record['id']] if field=='entities' else [] for field in cycle.FIELDS}})
    def test_complete_to_unsigned_wait_then_human_signature_delivery_and_no_republication(self):
        before={v:e.sha(v) for v in self.runtime.rglob('*') if v.is_file()}
        state=self.ready();nonce=state['nonce'];job=self.queue/nonce/'job.json';value=e.read(job)
        self.assertIsNone(d.pending(self.queue));self.assertFalse((job.parent/'approval.json').exists())
        self.assertEqual(self.f.f.calls('apply'),0)
        self.assertEqual(e.read(Path(state['candidate'])/'ledger.json')['counts']['acceptedUnpublished']['claims'],1)
        self.f.co.store.sync();current=json.loads(self.f.co.store.blob('collection-control/publication-ready/current.json'))
        self.assertEqual(current['nonce'],nonce)
        self.assertEqual(current['request'],value['request'])
        review=json.loads(self.f.co.store.blob('collection-control/publication-ready/'+nonce+'/review.json'))
        self.assertEqual(len(review['addedRecords']['claims']),1)
        self.assertEqual(review['claimDependencies']['citations'][0]['stance'],'support')
        self.tick();self.assertEqual(self.state()['nonce'],nonce)
        self.assertEqual(before,{v:e.sha(v) for v in before})
        # Only the isolated human signer now authorizes the exact live request.
        self.f.f.approve(nonce);shutil.copyfile(self.root/'inbox'/nonce/'approval.json',job.parent/'approval.json')
        d.Delivery(job,self.gateway,self.f.co).run();self.assertEqual(self.f.f.calls('apply'),1)
        self.tick();self.f.co.store.sync()
        self.assertEqual(json.loads(self.f.co.store.blob('collection-control/publication-ready/current.json'))['phase'],'completed')
        self.assertEqual(self.tick()['phase'],'up-to-date')
        self.assertEqual(self.f.f.calls('apply'),1);self.assertEqual(self.f.ack()['executionControl']['pauseMode'],None)
    def test_no_pending_does_not_arm_pause_or_generate_candidate(self):
        original=next((self.runtime/'datasets/manga-collection').glob('accepted-group-3'))
        shutil.rmtree(original) # Isolated fixture starts with only two accepted records.
        self.assertEqual(self.tick()['phase'],'up-to-date')
        self.assertFalse((self.home/'state.json').exists());self.assertFalse(list((self.home/'candidates').iterdir()))
        self.assertFalse(any(m=='arm' for m,n in self.gateway.calls));self.assertEqual(self.f.co.latest()['pauseMode'],None)
    def test_partial_transfer_retries_same_nonce_and_candidate(self):
        self.gateway.upload_failure=True
        with self.assertRaises(OSError):self.tick()
        nonce=self.state()['nonce'];artifact=e.sha(Path(self.state()['candidate'])/'ARTIFACT.json')
        self.tick();self.f.ack();self.tick()
        self.assertEqual(self.state()['nonce'],nonce);self.assertEqual(e.sha(Path(self.state()['candidate'])/'ARTIFACT.json'),artifact)
        self.assertEqual(self.f.f.calls('apply'),0)
    def test_lost_arm_or_preflight_reply_and_registration_publish_restart(self):
        self.gateway.drop_after='arm'
        with self.assertRaises(OSError):self.tick()
        nonce=self.state()['nonce'];self.tick();self.f.ack();self.gateway.drop_after='preflight'
        with self.assertRaises(OSError):self.tick()
        with patch.object(c.w.GitHubStore,'publish',side_effect=OSError('isolated Git outage')):
            with self.assertRaises(OSError):self.tick()
        self.assertTrue((self.queue/nonce/'job.json').exists());self.assertFalse(self.state().get('announced'))
        self.assertEqual(self.tick()['phase'],'awaiting-human-publication-approval')
        self.assertEqual(self.state()['nonce'],nonce);self.assertEqual(self.f.f.calls('apply'),0)
    def test_changed_receipt_is_hard_failure_not_new_nonce(self):
        self.ready();nonce=self.state()['nonce'];r=next((self.runtime/'datasets/manga-collection').glob('accepted-*/acceptance.json'));r.write_text('{}')
        with self.assertRaisesRegex(ValueError,'removed or changed'):self.tick()
        self.assertEqual(self.state()['nonce'],nonce);self.assertEqual(self.f.f.calls('apply'),0)
    def test_changed_evidence_and_unknown_base_fail_before_arm(self):
        self.proof['verification']['dataSha256']='f'*64
        with self.assertRaisesRegex(ValueError,'root verification'):self.tick()
        self.assertFalse(any(m=='arm' for m,n in self.gateway.calls))
    def test_busy_worker_or_common_lock_defers_without_pause(self):
        for path in [self.f.home/'worker.lock',self.f.common]:
            with e.locked(path):self.assertEqual(self.tick()['phase'],'waiting-local-lock')
        self.assertEqual(self.f.co.latest()['pauseMode'],None)
        self.ready()
    def test_added_receipt_after_arm_cancels_unsigned_then_resumes_before_new_nonce(self):
        self.tick();old=self.state()['nonce'];self.add_receipt();self.f.ack()
        self.gateway.drop_after='finish'
        with self.assertRaises(OSError):self.tick()
        self.assertEqual(self.state()['phase'],'cancelling-stale-unapproved')
        revision=self.f.co.latest()['revision'];self.assertEqual(self.f.co.latest()['pauseMode'],None)
        self.assertEqual(self.tick()['phase'],'retry-next-schedule')
        self.assertEqual(self.f.co.latest()['revision'],revision) # Never re-pause after finished response loss.
        self.tick();self.assertNotEqual(self.state()['nonce'],old);self.assertEqual(self.f.f.calls('apply'),0)
    def test_added_receipt_while_human_wait_preserves_fixed_job_and_pause(self):
        state=self.ready();job=self.queue/state['nonce']/'job.json';before=e.sha(job);self.add_receipt()
        with self.assertRaisesRegex(ValueError,'human inspection'):self.tick()
        self.assertEqual(e.sha(job),before);self.assertEqual(self.f.co.latest()['pauseMode'],'pause-new')
        self.assertEqual(self.f.f.calls('apply'),0)
    def test_freeze_fsync_failure_rebuilds_same_intent_before_remote_effect(self):
        original=p.commit_directory
        def fail(stage,target):
            if target.parent==self.home/'candidates':raise OSError('isolated directory fsync failure')
            return original(stage,target)
        with patch.object(p,'commit_directory',side_effect=fail):
            with self.assertRaises(OSError):self.tick()
        nonce=self.state()['nonce'];self.assertFalse(any(m=='arm' for m,n in self.gateway.calls))
        self.tick();self.f.ack();self.tick();self.assertEqual(self.state()['nonce'],nonce)
    def test_receipt_addition_before_transfer_completion_rebuilds_next_schedule(self):
        self.gateway.upload_failure=True
        with self.assertRaises(OSError):self.tick()
        old=self.state()['nonce'];self.add_receipt()
        self.assertEqual(self.tick()['phase'],'retry-next-schedule');self.assertFalse(any(m=='arm' for m,n in self.gateway.calls))
        self.tick();self.assertNotEqual(self.state()['nonce'],old)
    def test_changed_evidence_stops_before_remote_effect(self):
        receipt=next((self.runtime/'datasets/manga-collection').glob('accepted-group-3/acceptance.json'))
        ref=e.read(receipt)['referenceArtifacts'][0];(self.runtime/ref['file']).write_text('{}')
        with self.assertRaises(ValueError):self.tick()
        self.assertFalse(any(m=='arm' for m,n in self.gateway.calls));self.assertEqual(self.f.f.calls('apply'),0)
    def test_real_plan_failure_retains_same_nonce_and_pause_for_retry(self):
        self.tick();nonce=self.state()['nonce'];self.f.ack();self.f.f.control({'fault':'plan'})
        with self.assertRaises(ValueError):self.tick()
        self.assertEqual(self.f.co.latest()['pauseMode'],'pause-new');self.f.f.control({})
        self.assertEqual(self.tick()['phase'],'awaiting-human-publication-approval');self.assertEqual(self.state()['nonce'],nonce)
        self.assertEqual(self.f.f.calls('apply'),0)

class QueueIntegrationTests(unittest.TestCase):
    def test_signed_delivery_has_priority_over_enabled_preparation(self):
        import io
        import contextlib
        import sys
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);nonce=str(uuid.uuid4());queue=root/'queue';directory=queue/nonce;directory.mkdir(parents=True,mode=0o700)
            e.durable(directory/'job.json',{'nonce':nonce,'candidate':'/isolated/candidate'});e.durable(directory/'approval.json',{})
            co=root/'coordinator.json';e.durable(co,{})
            config={'deliveryEnabled':True,'queueDir':str(queue),'coordinationConfig':str(co),'preparation':{'enabled':True}}
            gateway=type('Gateway',(),{})()
            with patch.object(sys,'argv',['delivery','--config','/fixed/config','--queue']),patch.object(d,'installation',return_value=(config,gateway)),patch.object(d.c,'Coordinator'),patch.object(d,'Delivery') as delivery,contextlib.redirect_stdout(io.StringIO()):
                delivery.return_value.run.return_value={'phase':'completed'};d.main()
                delivery.assert_called_once();delivery.return_value.run.assert_called_once()

class OfflineImageTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('PUBLICATION_TEST_IMAGE') and os.environ.get('PUBLICATION_TEST_FIXTURE'),'Explicit pinned offline image/fixture required')
    def test_actual_pinned_image_validates_and_plans_without_network_or_db(self):
        data=e.read(Path(os.environ['PUBLICATION_TEST_FIXTURE']))
        selected=[next(v for v in data['claims'] if (v.get('contribution') or {}).get('roleId')==r) for r in ['AUTHORSHIP','ORIGINAL_STORY']]
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'runtime/datasets').mkdir(parents=True);(root/'preparation').mkdir();(root/'base').mkdir()
            def release(path,claims,ident,base):
                path.mkdir(exist_ok=True);ids={v['id'] for v in claims};endpoints={v[k] for v in claims for k in ['subjectId','objectId']}
                citations=[v for v in data['citations'] if v['claimId'] in ids];sources={v['sourceId'] for v in citations}
                value={'schemaVersion':4,'entities':[v for v in data['entities'] if v['id'] in endpoints],'claims':claims,
                    'sources':[v for v in data['sources'] if v['id'] in sources],'citations':citations}
                (path/'data.json').write_text(cycle.dump(value))
                (path/'manifest.json').write_text(cycle.dump({'dataset':'public-kg','release':ident,'baseRelease':base,'reason':'ISOLATED OFFLINE TEST',
                    'dataSha256':e.sha(path/'data.json'),'inputs':[{'dataset':'isolated','file':'fixture','sha256':'a'*64}],
                    'claimOrigins':[{'claimId':v['id'],'dataset':'isolated','sourceClaimId':v['id']} for v in claims]}))
            release(root/'base',selected[:1],'isolated-base',None);candidate=root/'preparation/candidate'
            release(candidate,selected,'isolated-next','isolated-base')
            node=p.DockerNode(os.environ['PUBLICATION_TEST_IMAGE'],root/'runtime',root/'preparation',root/'base')
            self.assertTrue(node(['scripts/public-kg.ts','validate',str(candidate)])['valid'])
            result=node([str(p.HERE/'publication-artifact-plan.ts'),str(root/'base'),str(candidate),'isolated-revision'])
            self.assertEqual(result['updated'],[]);self.assertEqual(sum(v.startswith('Claim:') for v in result['added']),1)
            # Existing-body drift must fail even though the manifest hash is consistent.
            changed=e.read(candidate/'data.json');changed['claims'][0]['polarity']='denied'
            (candidate/'data.json').write_text(cycle.dump(changed));manifest=e.read(candidate/'manifest.json');manifest['dataSha256']=e.sha(candidate/'data.json')
            (candidate/'manifest.json').write_text(cycle.dump(manifest))
            with self.assertRaises(ValueError):node([str(p.HERE/'publication-artifact-plan.ts'),str(root/'base'),str(candidate),'isolated-revision'])

if __name__=='__main__':unittest.main()
