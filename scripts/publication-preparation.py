#!/usr/bin/env python3
"""One scheduled step: formally accepted delta -> fixed live plan -> HUMAN approval wait.
Never signs, accepts, collects, executes an apply, restores, or changes a Worker setting.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('preparation_delivery',HERE/'publication-delivery.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
c=d.c;e=d.e;cycle=e.cycle


def receipt_refs(runtime,w):
    return [w.reference(p) for p in sorted((runtime/'datasets/manga-collection').glob('accepted-*/acceptance.json'))]


def unchanged_receipts(previous,current):
    actual={v['file']:v['sha256'] for v in current}
    e.require(all(actual.get(v['file'])==v['sha256'] for v in previous),'Formal receipt removed or changed')
    return previous==current


def fsync_directory(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)


def commit_directory(stage,target):
    for path in stage.rglob('*'):
        e.require(not path.is_symlink(),'Candidate symlink')
        if path.is_file():
            with path.open('rb') as stream:os.fsync(stream.fileno())
    for path in sorted([p for p in stage.rglob('*') if p.is_dir()],key=lambda p:len(p.parts),reverse=True):fsync_directory(path)
    fsync_directory(stage);stage.rename(target);fsync_directory(target.parent)


class DockerNode:
    """Existing pinned ops image, read-only public-data mounts, no DB or network."""
    def __init__(self,image,runtime,home,base):
        e.require(re.fullmatch(r'sha256:[a-f0-9]{64}',image),'Pinned local ops image required')
        self.image=image;self.roots=[((runtime/'datasets').resolve(),'/runtime/datasets'),(home.resolve(),'/preparation'),(base.resolve(),'/published')]
    def __call__(self,args):
        argv=['/usr/bin/docker','run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL',
            '--security-opt=no-new-privileges','--user='+str(os.geteuid())+':'+str(os.getegid()),'--pids-limit=128','--memory=1g']
        for source,target in self.roots:argv+=['--mount','type=bind,src='+str(source)+',dst='+target+',readonly']
        argv+=['--mount','type=bind,src='+str(HERE/'publication-artifact-plan.ts')+',dst=/app/scripts/publication-artifact-plan.ts,readonly']
        def mapped(value):
            value=str(value)
            if value.startswith(str(HERE)+'/'):return 'scripts/'+value[len(str(HERE))+1:]
            for source,target in self.roots:
                if value==str(source) or value.startswith(str(source)+'/'):return target+value[len(str(source)):]
            return value
        result=subprocess.run(argv+[self.image,*map(mapped,args)],capture_output=True,timeout=180,
            env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':str(Path.home())})
        e.require(result.returncode==0,'Pinned offline validation/plan failed')
        return e.parse(result.stdout)


class Preparation:
    def __init__(self,config,gateway,coordinator,*,get=None,workflow=None,node=None):
        self.config,self.gateway,self.co=config,gateway,coordinator
        self.policy=config['preparation'];self.home=Path(self.policy['home']);self.runtime=Path(config['runtime'])
        self.home.mkdir(mode=0o700,parents=True,exist_ok=True);e.trusted(self.home,os.geteuid(),True)
        self.state_path=self.home/'state.json';self.get=get or cycle.getter()
        self.w=workflow or cycle.reviewed_workflow(self.runtime);self.node=node
        c.w.human(self.policy['humanDecision'])
        for name in ['candidates','history']: (self.home/name).mkdir(mode=0o700,exist_ok=True)
    def save(self,state):e.durable(self.state_path,state)
    def health(self,phase,**fields):
        value={'schemaVersion':1,'phase':phase,'publicationApproval':'human-only',**fields}
        path=self.home/'health.json'
        if not path.exists() or e.read(path)!=value:e.durable(path,value)
        return value
    def announce(self,state,request):
        nonce=state['nonce'];candidate=Path(state['candidate']);ledger=e.read(candidate/'ledger.json')
        data=e.read(candidate/'release/data.json');index={f:{v['id']:v for v in data[f]} for f in cycle.FIELDS}
        review={'request':request,'addedRecords':{f:[index[f][i] for i in ledger['pending'][f]] for f in cycle.FIELDS}}
        claim_ids=set(ledger['pending']['claims']);citations=[v for v in data['citations'] if v['claimId'] in claim_ids]
        endpoints={index['claims'][i][k] for i in claim_ids for k in ['subjectId','objectId']}
        review['claimDependencies']={'entities':[index['entities'][i] for i in sorted(endpoints)],'citations':citations,
            'sources':[index['sources'][i] for i in sorted({v['sourceId'] for v in citations})]}
        value={'schemaVersion':1,'phase':'awaiting-human-publication-approval','nonce':nonce,'request':request,'candidatePath':str(candidate),
            'addedCounts':ledger['counts']['acceptedUnpublished'],'operatorCommand':
            'sudo /usr/local/sbin/plunode-publication-approve --nonce '+nonce+' --minutes 30 --operator-approved'}
        text=('# 公開承認待ち\n\nrelease: `'+request['release']+'`\n\n'+
            'base: `'+request['baseRelease']+'` / `'+request['baseRevision']+'`\n\n'+
            '正式受入済みの追加件数: `'+json.dumps(value['addedCounts'],ensure_ascii=False)+'`。既存更新0。\n\n'+
            '[追加レコード本文・Role/scope・根拠・依存関係](review.json)を確認する。固定資材はWSL `'+str(candidate)+'`。\n\n'+
            '固定plan: `'+request['planSha256']+'`\n\nartifact: `'+request['artifactSha256']+'`\n\n'+
            'receipt集合: `'+request['receiptSetSha256']+'`\n\n'+
            'ローカルWSLで次を実行し、表示された固定requestと根拠を確認してrelease IDを入力した場合だけ公開を承認する。\n\n```bash\n'+
            value['operatorCommand']+'\n```\n\n確認入力: `'+request['release']+'`\n\n'+
            '確認後は自動公開・検証・結果記録まで実行。承認前にapplyしない。取り消し/不整合時は同nonceを保全する。\n')
        prefix='collection-control/publication-ready/'+nonce+'/'
        files={prefix+'request.json':e.canonical(value),prefix+'README.md':text.encode(),prefix+'review.json':e.canonical(review),
            'collection-control/publication-ready/current.json':e.canonical(value)}
        # Serialize the independent coordinator Git cache only. Never hold Worker/common here.
        with e.locked(self.co.directory/'coordinator.lock'):self.co.store.publish(files,immutable=[prefix+'request.json',prefix+'README.md',prefix+'review.json'])
        state['announced']=True;self.save(state)
    def published_base(self):
        live=self.get('/api/dataset');e.require(live.get('dataset')=='public-kg','Wrong public dataset')
        found=[]
        for directory in sorted(Path(self.config['queueDir']).iterdir()):
            if directory.name.startswith('.'):continue
            e.trusted(directory,os.geteuid(),True);path=directory/'job.json'
            if not path.exists():continue
            e.trusted(path,os.geteuid());job=e.read(path)
            if job.get('deliveryStage')=='completed' and job.get('publicationResult',{}).get('publishedRevision')==live['revision']:found.append(job)
        e.require(len(found)==1,'No unique completed delivery covers current public revision')
        job=found[0];root=self.gateway.call('status',job['nonce']);base=Path(job['candidate'])
        request=cycle.verify_prepared_artifact(base);verification=root.get('verification',{})
        e.require(root.get('phase')=='completed' and root.get('exclusion',{}).get('phase')=='finished'
            and root.get('request')==job['request'] and root['request']['artifactSha256']==request['artifactSha256']
            and all(root['request'][k]==request[k] for k in e.policy.BINDINGS if k!='planSha256')
            and root.get('release')==verification.get('release')==request['release'] and verification.get('verified') is True
            and root.get('publishedRevision')==verification.get('revision')==live['revision']
            and verification.get('dataSha256')==cycle.sha(base/'release/data.json')
            and verification.get('manifestFileSha256')==cycle.sha(base/'release/manifest.json'),
            'Published artifact is not covered by the completed root verification')
        self.gateway.candidate=str(base)
        return base,root
    def sync_base(self,base,root):
        """Add a verified published artifact; never edit a receipt, old artifact, code or state."""
        release=root['release'];e.require(re.fullmatch('[a-z0-9][a-z0-9-]*',release),'Invalid published release')
        target=self.runtime/'datasets/public-kg/releases'/release
        # Validation happens outside acceptance locks.
        self.w.node(['scripts/public-kg.ts','validate',str(base/'release')])
        with self.co.barrier():
            if target.exists():
                e.require(all(cycle.sha(target/n)==cycle.sha(base/'release'/n) for n in ['data.json','manifest.json']),'Runtime published artifact differs')
                fsync_directory(target.parent)
            else:
                with tempfile.TemporaryDirectory(prefix='.publication-base-',dir=target.parent) as tmp:
                    stage=Path(tmp)/'release';stage.mkdir()
                    for n in ['data.json','manifest.json']:shutil.copyfile(base/'release'/n,stage/n)
                    commit_directory(stage,target)
    def inventory(self,base,root):
        public=e.read(base/'release/data.json');refs=receipt_refs(self.runtime,self.w)
        previous=e.read(base/'ledger.json')['receipts'];unchanged_receipts(previous,refs)
        inventory=self.w.load('preparation_inventory',self.runtime/'scripts/collection-inventory.py')
        inv=inventory.Inventory(self.w,[('runtime',self.runtime)],public,{'release':root['release'],'revision':root['publishedRevision']})
        inv.formal_receipts();e.require(not inv.issues and len(inv.receipts)==len({r['sha256'] for r in refs}),'Formal receipt integrity failure')
        published,pending=cycle.partition(inv.accepted,public,self.w)
        acceptance=self.w.load('preparation_acceptance',self.runtime/'scripts/collection-acceptance.py')
        merged,_=acceptance.merge(public,{f:list(inv.accepted[f].values()) for f in cycle.FIELDS},{f:[] for f in cycle.FIELDS},self.w)
        for row in pending['claims'].values():e.require(any(c['claimId']==row['id'] and c['stance']=='support' for c in merged['citations']),'Accepted Claim lacks support')
        ledger={'schemaVersion':1,'authority':'read-only-preparation-not-publication-approval','release':root['release'],
            'revision':root['publishedRevision'],'publishedDataSha256':cycle.sha(base/'release/data.json'),
            'publishedManifestSha256':cycle.sha(base/'release/manifest.json'),'receiptSetSha256':self.w.digest(refs),'receipts':refs,
            'published':{f:sorted(published[f]) for f in cycle.FIELDS},'pending':{f:sorted(pending[f]) for f in cycle.FIELDS},
            'counts':{'publishedAccepted':{f:len(published[f]) for f in cycle.FIELDS},'acceptedUnpublished':{f:len(pending[f]) for f in cycle.FIELDS}},
            'verification':{'observation':'completed-root-whole-graph-verification-and-current-api-revision','liveWholeGraphBackupVerified':False}}
        return ledger,(self.w,inv,public,pending,refs)
    def build(self,state,base,root):
        self.sync_base(base,root)
        ledger,context=self.inventory(base,root)
        e.require(ledger['receiptSetSha256']==state['receiptSetSha256'],'Receipt set advanced before candidate creation')
        target=Path(state['candidate'])
        if target.exists():
            self.verify_intent(state);fsync_directory(target.parent);return
        with tempfile.TemporaryDirectory(prefix='.candidate-',dir=target.parent) as tmp:
            stage=Path(tmp)/'candidate';stage.mkdir()
            (stage/'ledger.json').write_text(cycle.dump(ledger))
            args=SimpleNamespace(release=state['release'],operator_digest=state['operatorDigest'])
            observed={'release':root['release'],'revision':root['publishedRevision']}
            result=cycle.build_candidate(args,ledger,context,stage,context[2],observed,
                lambda release:self.w.node([str(HERE/'publication-artifact-plan.ts'),str(base/'release'),str(release),root['publishedRevision']]))
            e.require(result['candidateCreated'],'No candidate delta')
            cycle.verify_prepared_artifact(stage)
            for p,checksum in context[1].readset.items():e.require(cycle.sha(p)==checksum,'Formal evidence changed while freezing')
            e.require(receipt_refs(self.runtime,self.w)==ledger['receipts'],'Receipt set advanced while freezing')
            e.require(self.get('/api/dataset')=={'dataset':'public-kg','revision':root['publishedRevision']},'Public revision advanced while freezing')
            commit_directory(stage,target)
    def verify_intent(self,state):
        request=cycle.verify_prepared_artifact(Path(state['candidate']))
        e.require(all(request[k]==state[k] for k in ['release','baseRelease','baseRevision','receiptSetSha256','operatorDigest']),
            'Frozen candidate differs from durable preparation intent')
        return request
    def cancel_stale(self,state):
        # May restart after cancel, CAS resume, or finish response loss. Never re-pause.
        root=self.gateway.call('status',state['nonce']);ticket=root['exclusion']
        if ticket['phase']=='finished':return self.retire(state,'inputs-advanced-after-arm')
        e.require(ticket['phase'] in ['open','cancelled'],'Unexpected stale ticket state; preserve it')
        closure=ticket.get('closure') or self.gateway.call('cancel',state['nonce'])
        self.co.resume(closure,self.policy['humanDecision'])
        finished=self.gateway.call('finish',state['nonce']);e.require(finished['phase']=='finished','Stale exclusion not finished')
        return self.retire(state,'inputs-advanced-after-arm')
    def retire(self,state,reason):
        state.update(phase='retired',reason=reason);e.durable(self.home/'history'/(state['nonce']+'.json'),state)
        self.save({'schemaVersion':1,'phase':'idle'})
        return self.health('retry-next-schedule',reason=reason)
    def step(self,state,phase):state['phase']=phase;self.save(state)
    def _tick(self):
        state=e.read(self.state_path) if self.state_path.exists() else {'schemaVersion':1,'phase':'idle'}
        if state.get('nonce') and state['phase']=='cancelling-stale-unapproved':
            self.gateway.candidate=state['candidate'];return self.cancel_stale(state)
        if state.get('nonce'):
            job=Path(self.config['queueDir'])/state['nonce']/'job.json'
            if job.exists():
                value=e.read(job)
                if value.get('deliveryStage')=='completed':
                    completed=self.gateway.call('status',state['nonce'])
                    e.require(completed.get('phase')=='completed' and completed.get('request')==value['request'] and completed['exclusion']['phase']=='finished',
                        'Completed delivery not confirmed by root')
                    result={'schemaVersion':1,'phase':'completed','nonce':state['nonce'],'release':completed['release'],
                        'publishedRevision':completed['publishedRevision'],'request':value['request']}
                    prefix='collection-control/publication-ready/'
                    with e.locked(self.co.directory/'coordinator.lock'):
                        self.co.store.publish({prefix+state['nonce']+'/result.json':e.canonical(result),prefix+'current.json':e.canonical(result)},
                            immutable=[prefix+state['nonce']+'/result.json'])
                    return self.retire(state,'publication-completed')
                if (job.parent/'approval.json').exists():return self.health('signed-delivery-has-priority',nonce=state['nonce'])
                state['phase']='awaiting-approval';self.save(state)
            if state['phase']=='awaiting-approval':
                unchanged_receipts(state['receipts'],receipt_refs(self.runtime,self.w))
                e.require(state['receipts']==receipt_refs(self.runtime,self.w),'Receipt set changed while approval pending; human inspection required')
                draft=self.verify_intent(state);root=self.gateway.call('status',state['nonce'])
                e.require(root.get('request')==value['request'] and all(draft[k]==root['request'][k] for k in e.policy.BINDINGS if k!='planSha256'),
                    'Registered root approval request changed')
                e.require(root.get('phase')=='awaiting-publication-approval' and root['exclusion']['phase']=='open','Approval wait state changed')
                if not state.get('announced'):self.announce(state,root['request'])
                return self.health('awaiting-human-publication-approval',nonce=state['nonce'],release=state['release'])
        base,root=self.published_base()
        self.w.node=self.node or DockerNode(self.policy['nodeImage'],self.runtime,self.home,base)
        if not state.get('nonce'):
            # A busy manual/Worker lock defers preparation, without any operational pause.
            with self.co.barrier():refs=receipt_refs(self.runtime,self.w)
            self.sync_base(base,root)
            ledger,context=self.inventory(base,root)
            if not any(context[3][f] for f in cycle.FIELDS):
                e.require(receipt_refs(self.runtime,self.w)==ledger['receipts'] and self.get('/api/dataset')=={'dataset':'public-kg','revision':root['publishedRevision']},'Inputs advanced during inventory; retry next schedule')
                for path,checksum in context[1].readset.items():e.require(cycle.sha(path)==checksum,'Formal evidence changed during inventory')
                return self.health('up-to-date',baseRelease=root['release'],baseRevision=root['publishedRevision'],counts=ledger['counts'],receiptSetSha256=ledger['receiptSetSha256'])
            nonce=str(uuid.uuid4());key=e.digest({'baseRevision':root['publishedRevision'],'receipts':ledger['receipts']})
            state={'schemaVersion':1,'phase':'building','nonce':nonce,'release':'publication-'+key[:24],
                'baseRelease':root['release'],'baseRevision':root['publishedRevision'],'receiptSetSha256':ledger['receiptSetSha256'],
                'receipts':ledger['receipts'],'candidate':str(self.home/'candidates'/nonce),'operatorDigest':root['request']['operatorDigest']}
            self.save(state) # Identity is durable before any transfer, arm or pause.
        same=unchanged_receipts(state['receipts'],receipt_refs(self.runtime,self.w))
        stale=not same or (state['baseRelease'],state['baseRevision'])!=(root['release'],root['publishedRevision'])
        if state['phase'] in ['building','uploading']:
            if stale:return self.retire(state,'inputs-advanced-before-arm')
            self.build(state,base,root)
            self.step(state,'uploading');self.gateway.upload_candidate(state['nonce'],Path(state['candidate']))
            self.step(state,'arming')
        self.gateway.candidate=state['candidate']
        if 'ticket' not in state:
            state['ticket']=self.gateway.call('arm',state['nonce']);self.save(state)
        self.co.pause(state['ticket'],self.policy['humanDecision'])
        self.step(state,'waiting-worker')
        ack=e.read(self.co.home/'state.json').get('executionControl',{})
        expected=e.read(self.co.path(state['nonce']))['pause']
        if not (ack.get('revision')==expected['revision'] and ack.get('lastControlId')==expected['id']
            and ack.get('lastControlSha256')==e.digest(expected) and ack.get('pauseMode')=='pause-new' and not ack.get('activeAttempt')):
            return self.health('waiting-worker-acknowledgement',nonce=state['nonce'])
        if stale:
            self.step(state,'cancelling-stale-unapproved')
            return self.cancel_stale(state)
        self.step(state,'live-preflight')
        live=self.gateway.call('status',state['nonce'])
        if live.get('phase')!='awaiting-publication-approval':live=self.gateway.call('preflight',state['nonce'])
        self.step(state,'registering')
        path=Path(self.config['queueDir'])/state['nonce']/'job.json'
        d.register(path,Path(state['candidate']),state['nonce'],self.policy['humanDecision'],self.gateway,self.co)
        self.step(state,'awaiting-approval');self.announce(state,live['request'])
        return self.health('awaiting-human-publication-approval',nonce=state['nonce'],release=state['release'])
    def tick(self):
        e.require(self.policy.get('enabled') is True,'Automatic preparation is disabled')
        with e.locked(self.home/'preparation.lock'):
            try:return self._tick()
            except BlockingIOError:return self.health('waiting-local-lock')
            except Exception as error:
                state=e.read(self.state_path) if self.state_path.exists() else {}
                self.health('preparation-stopped',nonce=state.get('nonce'),step=state.get('phase'),errorType=type(error).__name__)
                raise
