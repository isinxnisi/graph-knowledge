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


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--config',type=Path,required=True);cli.add_argument('--job',type=Path,required=True)
    args=cli.parse_args();e.require(os.geteuid()!=0,'Delivery must run as the existing Worker identity, never root')
    for item in [args.config,*args.config.parents]:
        st=item.lstat();e.require(not item.is_symlink() and st.st_uid==0 and not st.st_mode&0o022,'Fixed delivery configuration required')
    e.trusted(args.job,os.geteuid());e.trusted(args.job.parent,os.geteuid(),True)
    config=e.read(args.config);gateway=Gateway(config);gateway.candidate=e.read(args.job)['candidate']
    coordination=Path(config['coordinationConfig']);coordinator=c.Coordinator(e.read(coordination))
    print(json.dumps(Delivery(args.job,gateway,coordinator).run()))

if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,RuntimeError,subprocess.SubprocessError):
        print('{"error":"publication-delivery-stopped","newNonceAuthorized":false,"autoRestore":false}');raise SystemExit(1)
