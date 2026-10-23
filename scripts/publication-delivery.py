#!/usr/bin/env python3
"""One-shot, restartable delivery of an ALREADY signed publication approval.
No signing key, new nonce, Worker execution, automatic cancel, restore or activation.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('delivery_coordination',HERE/'publication-coordination.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
e=c.e


class Delivery:
    def __init__(self,path,gateway,coordinator):
        self.path,self.gateway,self.coordinator=path,gateway,coordinator

    def save(self,job,stage):
        job['deliveryStage']=stage;e.durable(self.path,job)

    def run(self):
        # The delivery lock is independent of Worker/common locks; never hold either
        # acceptance lock while transferring, notifying, waiting or retrying later.
        with e.locked(self.path.with_suffix('.delivery.lock')):
            job=e.read(self.path);nonce=e.nonce_id(job['nonce']);request=job['request']
            e.require(job['schemaVersion']==1 and set(request)==set(e.policy.BINDINGS),'Fixed delivery job required')
            draft=e.cycle.verify_prepared_artifact(Path(job['candidate']))
            e.require(all(draft[k]==request[k] for k in e.policy.BINDINGS if k!='planSha256'),'Prepared candidate changed')
            # root live plan hash is deliberately NOT replaced by the offline draft hash.
            e.require(job['ticket']==self.coordinator.ticket(job['ticket']) and all(job['ticket'][k]==request[k] for k in ['artifactSha256','receiptSetSha256']),'Ticket rebound')
            e.require(job['ticket']['nonce']==nonce,'Wrong job nonce')
            decision=job['humanDecision'];c.w.human(decision)
            state=self.gateway.call('status',nonce)
            e.require(state.get('nonce')==nonce and state.get('request')==request,'Root live request changed')
            ticket=state['exclusion'];e.require(self.coordinator.ticket(ticket)==job['ticket'],'Root ticket changed')
            if ticket['phase']=='open' and state['phase']!='completed':
                approval=e.read(self.path.parent/'approval.json')
                payload=self.gateway.verify_approval(approval)
                e.require(set(payload)==set(request)|{'nonce','issuedAt','expiresAt'} and payload['nonce']==nonce
                    and all(payload[k]==request[k] for k in request),'Approval does not cover this live request')
                # Root alone decides expiry/consumption and verify-only recovery. An
                # expired signature cannot start apply, but must not block consumed recovery.
                self.save(job,'transferring-approval')
                self.gateway.upload_approval(nonce,self.path.parent/'approval.json')
                self.save(job,'executing-or-verifying-same-nonce')
                state=self.gateway.call('execute',nonce)
                e.require(state.get('nonce')==nonce and state.get('request')==request,'Execute result changed')
            e.require(state['phase']=='completed' and state['artifactSha256']==request['artifactSha256']
                and state['release']==request['release'] and state.get('publishedRevision'),'Publication not verified; retain pause, inspect/retry same nonce only')
            # Persist result before any release of the durable exclusion. On an unknown
            # response the next invocation always re-reads root status, never trusts this marker.
            job['publicationResult']={k:state[k] for k in ['nonce','phase','release','artifactSha256','publishedRevision']}
            self.save(job,'published-verified')
            if ticket['phase']!='finished':
                self.save(job,'closing-exclusion')
                closure=self.gateway.call('close',nonce)
                self.coordinator.closure(closure,e.read(self.coordinator.path(nonce)))
                self.save(job,'resuming-own-control')
                self.coordinator.resume(closure,decision)
                self.save(job,'finishing-exclusion')
                finished=self.gateway.call('finish',nonce)
                e.require(finished['phase']=='finished' and self.coordinator.ticket(finished)==job['ticket'],'Exclusion not finished')
            self.save(job,'notifying')
            final=self.gateway.call('notify',nonce)
            e.require(final['phase']=='completed' and final['nonce']==nonce and final['artifactSha256']==request['artifactSha256'],'Audit result changed')
            e.require(final.get('pendingAudit') is False,'Audit pending; retry notification only')
            self.save(job,'completed')
            return {'nonce':nonce,'phase':'completed','release':request['release'],'publishedRevision':state['publishedRevision']}


class Gateway:
    """Only installed fixed clients/code; candidate or job cannot supply executable argv."""
    def __init__(self,config):
        self.config=config
        for key in ['client','clientConfig','coordinationConfig','approverPublicKey']:
            path=Path(config[key])
            for item in [path,*path.parents]:
                st=item.lstat();e.require(not item.is_symlink() and st.st_uid==0 and not st.st_mode&0o022,'Fixed delivery installation required')
        self.client_config=e.read(Path(config['clientConfig']))
        e.require(self.client_config['uid']==os.geteuid(),'Wrong delivery account')

    def verify_approval(self,approval):
        return e.policy.verify_signature(approval,Path(self.config['approverPublicKey']),self.config['approverKeySha256'])

    def call(self,mode,nonce):
        e.require(mode in ['status','execute','close','finish','notify'],'Fixed delivery operation required')
        if mode in ['execute','finish']:
            argv=['/usr/bin/python3','-B',str(HERE/'publication-attest.py'),'--runtime',self.config['runtime'],
                '--candidate',self.candidate,'--key',self.config['attesterKey'],'--client',self.config['client'],
                '--coordination-config',self.config['coordinationConfig'],mode,nonce]
        else:argv=[self.config['client'],mode,nonce]
        result=subprocess.run(argv,capture_output=True,timeout=660,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':str(Path.home())})
        e.require(result.returncode==0 and len(result.stdout)<=1024*1024,'Fixed publication channel failed; preserve nonce')
        messages=[e.parse(line) for line in result.stdout.splitlines() if line.strip()]
        e.require(len(messages)==1 and set(messages[0])=={'result'},'Unexpected fixed channel result')
        return messages[0]['result']

    def upload_approval(self,nonce,path):
        cfg=self.client_config
        key=Path(cfg['identity']).with_name('upload-ed25519')
        # Restrict batch grammar rather than interpolating shell commands. No shell is used.
        for value in [str(path),str(key),cfg['knownHosts']]:
            e.require(re.fullmatch(r'/[A-Za-z0-9_./-]+',value),'Unsupported fixed upload path')
        e.require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*',cfg['host']),'Fixed upload host required')
        argv=['/usr/bin/sftp','-F','/dev/null','-q','-b','-','-i',str(key),'-o','BatchMode=yes','-o','IdentitiesOnly=yes',
            '-o','StrictHostKeyChecking=yes','-o','GlobalKnownHostsFile=/dev/null','-o','UserKnownHostsFile='+cfg['knownHosts'],
            '-o','ClearAllForwardings=yes','-o','ConnectTimeout=15','plunode-upload@'+cfg['host']]
        # Re-upload identical signed bytes after interrupted transfer. Root verifies its
        # own separately opened bounded regular file; partial upload never authorizes apply.
        batch='put '+str(path)+' /inbox/'+e.nonce_id(nonce)+'/approval.json\n'
        result=subprocess.run(argv,input=batch.encode(),capture_output=True,timeout=60)
        e.require(result.returncode==0,'Approval transfer incomplete; preserve same nonce')


def installation(config_path):
    for item in [config_path,*config_path.parents]:
        st=item.lstat();e.require(not item.is_symlink() and st.st_uid==0 and not st.st_mode&0o022,'Fixed delivery configuration required')
    config=e.read(config_path);gateway=Gateway(config)
    e.require(type(config['deliveryEnabled']) is bool and config['uid']==os.geteuid(),'Wrong delivery identity/activation')
    queue=Path(config['queueDir']);e.trusted(queue,os.geteuid(),True)
    return config,gateway


def describe(path,gateway,coordinator):
    e.trusted(path,os.geteuid());e.trusted(path.parent,os.geteuid(),True)
    job=e.read(path);nonce=e.nonce_id(job['nonce']);request=job['request']
    e.require(path.parent.name==nonce and set(request)==set(e.policy.BINDINGS),'Fixed job identity required')
    draft=e.cycle.verify_prepared_artifact(Path(job['candidate']))
    e.require(all(draft[k]==request[k] for k in request if k!='planSha256'),'Candidate changed')
    state=gateway.call('status',nonce)
    e.require(state.get('nonce')==nonce and state.get('request')==request
        and state['phase']=='awaiting-publication-approval' and state['exclusion']['phase']=='open','Fresh unconsumed preflight required')
    e.require(coordinator.ticket(state['exclusion'])==job['ticket'],'Fixed exclusion changed')
    e.require(e.read(coordinator.path(nonce))['ticket']==job['ticket'],'Durable pause journal differs')
    c.w.human(job['humanDecision'])
    return {'nonce':nonce,'request':request}


def accept_approval(path,document,gateway):
    e.trusted(path,os.geteuid());e.trusted(path.parent,os.geteuid(),True)
    job=e.read(path);payload=gateway.verify_approval(document);request=job['request']
    e.require(set(payload)==set(request)|{'nonce','issuedAt','expiresAt'} and payload['nonce']==job['nonce']
        and all(payload[k]==request[k] for k in request),'Signed approval/job changed')
    target=path.parent/'approval.json'
    if target.exists() or target.is_symlink():
        e.trusted(target,os.geteuid());e.require(e.read(target)==document,'Existing approval cannot be rebound')
    else:e.durable(target,document)
    return target


def register(path,candidate,nonce,decision,gateway,coordinator):
    e.nonce_id(nonce);c.w.human(decision)
    state=gateway.call('status',nonce)
    e.require(state.get('nonce')==nonce and state['phase']=='awaiting-publication-approval'
        and state['exclusion']['phase']=='open','Live preflight required before registration')
    job={'schemaVersion':1,'nonce':nonce,'candidate':str(candidate),'request':state['request'],
        'ticket':coordinator.ticket(state['exclusion']),'humanDecision':decision}
    e.require(path.parent.name==nonce and candidate.is_absolute(),'Wrong queue directory/candidate path')
    draft=e.cycle.verify_prepared_artifact(candidate)
    e.require(all(draft[k]==job['request'][k] for k in e.policy.BINDINGS if k!='planSha256'),'Candidate/live request differs')
    e.require(e.read(coordinator.path(nonce))['ticket']==job['ticket'],'Pause journal differs')
    path.parent.mkdir(mode=0o700,exist_ok=True);e.trusted(path.parent,os.geteuid(),True)
    if path.exists():e.require(all(e.read(path)[k]==v for k,v in job.items()),'Existing job cannot be rebound')
    else:e.durable(path,job)
    describe(path,gateway,coordinator)
    return {'phase':'awaiting-operator-signature','nonce':nonce,'request':job['request']}


def pending(queue):
    # Scan only bounded, owned per-nonce directories. Invalid entries are visible as
    # errors, never passed as command text. Unsigned preparation never starts SSH.
    e.trusted(queue,os.geteuid(),True)
    paths=sorted(queue.iterdir());e.require(len(paths)<=4096,'Delivery queue limit reached')
    for directory in paths:
        if directory.name.startswith('.'):continue
        e.nonce_id(directory.name);e.trusted(directory,os.geteuid(),True)
        path=directory/'job.json';approval=directory/'approval.json'
        if not approval.exists():continue
        e.trusted(path,os.geteuid());e.trusted(approval,os.geteuid())
        job=e.read(path);e.require(job['nonce']==directory.name,'Queue identity changed')
        if job.get('deliveryStage')!='completed':return path
    return None


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--config',type=Path,required=True);cli.add_argument('--job',type=Path)
    modes=cli.add_mutually_exclusive_group();modes.add_argument('--describe',action='store_true')
    modes.add_argument('--accept-approval',action='store_true');modes.add_argument('--queue',action='store_true')
    modes.add_argument('--installation-check',action='store_true');modes.add_argument('--register',action='store_true')
    cli.add_argument('--candidate',type=Path);cli.add_argument('--nonce');cli.add_argument('--human-decision',type=Path)
    args=cli.parse_args();e.require(os.geteuid()!=0,'Delivery must never run as root')
    config,gateway=installation(args.config)
    if args.installation_check:
        print(json.dumps({'uid':os.geteuid(),'sourceCommit':config['sourceCommit'],'deliveryEnabled':config['deliveryEnabled'],
            'queuePending':pending(Path(config['queueDir'])) is not None,'installationChecked':True}));return
    # An inactive installation never opens a remote channel, signs or touches Worker.
    if not config['deliveryEnabled']:
        print('{"phase":"delivery-disabled","applyCalls":0}');return
    if args.register:
        e.require(args.candidate and args.nonce and args.human_decision,'Registration fields required')
        path=Path(config['queueDir'])/e.nonce_id(args.nonce)/'job.json'
        coordinator=c.Coordinator(e.read(Path(config['coordinationConfig'])))
        print(json.dumps(register(path,args.candidate,args.nonce,e.read(args.human_decision),gateway,coordinator)));return
    path=pending(Path(config['queueDir'])) if args.queue else args.job
    if path is None:
        e.require(args.queue,'Job required');print('{"phase":"no-signed-pending-job"}');return
    e.require(path==Path(config['queueDir'])/e.nonce_id(path.parent.name)/'job.json','Job outside fixed queue')
    coordinator=c.Coordinator(e.read(Path(config['coordinationConfig'])))
    if args.describe:print(json.dumps(describe(path,gateway,coordinator)));return
    if args.accept_approval:
        raw=sys.stdin.buffer.read(16385);e.require(len(raw)<=16384,'Oversized approval handoff')
        accept_approval(path,e.parse(raw),gateway)
    gateway.candidate=e.read(path)['candidate']
    print(json.dumps(Delivery(path,gateway,coordinator).run()))

if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,RuntimeError,subprocess.SubprocessError):
        print('{"error":"publication-delivery-stopped","newNonceAuthorized":false,"autoRestore":false}');raise SystemExit(1)
