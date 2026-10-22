#!/usr/bin/env python3
"""WSL receipt freshness peer prototype. Hold the common lock through the fixed gate client's exit."""
import argparse
import contextlib
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
import uuid

HERE=Path(__file__).resolve().parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

cycle=load('attest_cycle',HERE/'publication-cycle.py')
signer=load('attest_sign',HERE/'publication-sign.py')


def freshness(runtime,candidate,challenge):
    challenge={k:v for k,v in challenge.items() if k!='exclusion'}
    cycle.require(set(challenge)=={'schemaVersion','purpose','nonce','challenge','artifactSha256','receiptSetSha256','issuedAt','expiresAt'},'Unexpected challenge fields')
    for name in ['nonce','challenge']:
        value=uuid.UUID(challenge[name]);cycle.require(value.version==4 and str(value)==challenge[name],'Invalid challenge UUID')
    request=cycle.verify_prepared_artifact(candidate)
    cycle.require(challenge['artifactSha256']==request['artifactSha256'] and challenge['receiptSetSha256']==request['receiptSetSha256'], 'Challenge candidate differs')
    cycle.require(challenge['schemaVersion']==1 and challenge['purpose']=='receipt-freshness','Wrong challenge purpose')
    cycle.require(signer.p.timestamp(challenge['issuedAt'])<=signer.dt.datetime.now(signer.dt.timezone.utc)<signer.p.timestamp(challenge['expiresAt']), 'Challenge expired/future')
    cycle.require(signer.p.timestamp(challenge['expiresAt'])-signer.p.timestamp(challenge['issuedAt'])<=signer.dt.timedelta(seconds=60),'Challenge too long')
    # Only installed/reviewed code beside this program is imported. No runtime/uploaded program is executed.
    w=load('attest_workflow',HERE/'collection-workflow.py');w.ROOT=runtime.resolve()
    inventory=load('attest_inventory',HERE/'collection-inventory.py')
    acceptance=load('attest_acceptance',HERE/'collection-acceptance.py')
    ledger=cycle.read(candidate/'ledger.json')
    base=runtime/'datasets/public-kg/releases'/request['baseRelease']/'data.json'
    cycle.require(cycle.sha(base)==ledger['publishedDataSha256'],'Public base artifact changed')
    public=cycle.read(base)
    inv=inventory.Inventory(w,[('runtime',runtime.resolve())],public,{'release':request['baseRelease'],'revision':request['baseRevision']})
    inv.formal_receipts();cycle.require(not inv.issues,'Formal receipt integrity failed')
    receipts=sorted((runtime/'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    refs=[w.reference(p) for p in receipts]
    cycle.require(w.digest(refs)==request['receiptSetSha256'],'New/missing formal receipt; approval is stale')
    merged,_=acceptance.merge(public,{f:list(inv.accepted[f].values()) for f in w.FIELDS},{f:[] for f in w.FIELDS},w)
    cycle.require(w.index(merged)==w.index(cycle.read(candidate/'release/data.json')),'Candidate includes unaccepted or changed records')
    for path,checksum in inv.readset.items():cycle.require(cycle.sha(path)==checksum,'Evidence changed while attesting')
    cycle.require(refs==[w.reference(p) for p in sorted((runtime/'datasets/manga-collection').glob('accepted-*/acceptance.json'))],'Receipt set advanced')
    return challenge


MAX_FUTURE_WAIT_SECONDS=8

def wait_until_issued(issued,expires,*,now=None,monotonic=time.monotonic,sleep=time.sleep):
    """Wait for small clock lead; never sign before issuedAt or extend expiresAt."""
    now=now or (lambda:signer.dt.datetime.now(signer.dt.timezone.utc))
    cycle.require(signer.dt.timedelta(0)<expires-issued<=signer.dt.timedelta(seconds=60),'Invalid challenge lifetime')
    current=now()
    cycle.require(current<expires and (issued-current).total_seconds()<=MAX_FUTURE_WAIT_SECONDS,'Expired or far-future challenge')
    deadline=monotonic()+MAX_FUTURE_WAIT_SECONDS
    while current<issued:
        remaining=deadline-monotonic()
        cycle.require(remaining>0,'Clock did not reach issuedAt within bounded wait')
        sleep(min(.05,remaining,max(.001,(issued-current).total_seconds())))
        current=now()
    cycle.require(issued<=current<expires,'Expired challenge after clock wait')


def check_challenge(value):
    base={'schemaVersion','purpose','nonce','challenge','artifactSha256','receiptSetSha256','issuedAt','expiresAt','exclusion'}
    cycle.require(value['purpose'] in ['receipt-freshness','worker-pause','worker-resume'], 'Wrong coordination purpose')
    cycle.require(set(value)==base|({'closure'} if value['purpose']=='worker-resume' else set()) and value['schemaVersion']==1,'Unexpected challenge')
    for name in ['nonce','challenge']:
        ident=uuid.UUID(value[name]);cycle.require(ident.version==4 and str(ident)==value[name],'Wrong challenge UUID')
    issued=signer.p.timestamp(value['issuedAt']);expires=signer.p.timestamp(value['expiresAt'])
    cycle.require(all(value[k]==value['exclusion'][k] for k in ['nonce','artifactSha256','receiptSetSha256']),'Ticket binding differs')
    wait_until_issued(issued,expires)


@contextlib.contextmanager
def legacy_lock(path):
    fd=os.open(path,os.O_RDWR|os.O_NOFOLLOW)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
    finally:os.close(fd)


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--runtime',type=Path,required=True);cli.add_argument('--candidate',type=Path,required=True)
    cli.add_argument('--key',type=Path,required=True);cli.add_argument('--client',type=Path,required=True)
    cli.add_argument('--coordination-config',type=Path,help='Required for installed durable-pause gate')
    cli.add_argument('--common-lock',type=Path,default=Path.home()/'.local/share/graph-autopilot/autopilot.lock')
    cli.add_argument('command',choices=['preflight','execute','notify','cancel','finish']);cli.add_argument('nonce')
    a=cli.parse_args()
    coordinator=None
    if a.coordination_config:
        coordination=load('attest_coordination',HERE/'publication-coordination.py')
        coordination.e.trusted(a.coordination_config,os.geteuid())
        coordinator=coordination.Coordinator(coordination.e.read(a.coordination_config))
        cycle.require((Path(coordinator.config['workerHome'])/'runtime').resolve()==a.runtime.resolve(), 'Wrong fixed Worker runtime')
    barrier=coordinator.barrier() if coordinator else legacy_lock(a.common_lock)
    with barrier:
        # The installed client embeds its host/key/fixed wrapper. No shell command comes from a candidate.
        child=subprocess.Popen([str(a.client.resolve()),a.command,a.nonce],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
            env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'},bufsize=0)
        selector=selectors.DefaultSelector();selector.register(child.stdout,selectors.EVENT_READ)
        deadline=time.monotonic()+600;buffer=b''
        try:
            while time.monotonic()<deadline:
                if not selector.select(1):
                    if child.poll() is not None:break
                    continue
                data=os.read(child.stdout.fileno(),16384)
                if not data:break
                buffer+=data;cycle.require(len(buffer)<=65536,'Peer output too large')
                while b'\n' in buffer:
                    line,buffer=buffer.split(b'\n',1);message=json.loads(line)
                    if 'challenge' in message:
                        cycle.require(message['challenge']['nonce']==a.nonce,'Challenge belongs to another job')
                        challenge=message['challenge']
                        if 'exclusion' in challenge:
                            cycle.require(coordinator is not None,'Durable pause coordinator required')
                            check_challenge(challenge)
                            payload=dict(challenge)
                            if challenge['purpose']=='receipt-freshness':
                                freshness(a.runtime,a.candidate,challenge)
                            if challenge['purpose'] in ['receipt-freshness','worker-pause']:
                                payload['workerPause']=coordinator.pause_proof(challenge)
                            else:
                                payload['workerResume']=coordinator.resume_proof(challenge)
                        else:
                            cycle.require(coordinator is None,'Legacy gate cannot bypass durable exclusion')
                            payload=freshness(a.runtime,a.candidate,challenge)
                        cycle.require(signer.p.timestamp(challenge['issuedAt'])<=signer.dt.datetime.now(signer.dt.timezone.utc)<signer.p.timestamp(challenge['expiresAt']),'Challenge expired/future before signing')
                        response=signer.sign(payload,a.key)
                        child.stdin.write(json.dumps(response).encode()+b'\n');child.stdin.flush()
                    else: print(json.dumps(message),flush=True)
            cycle.require(child.wait(timeout=5)==0,'Fixed gate client failed')
        finally:
            selector.close();child.stdin.close()
            if child.poll() is None:child.terminate();child.wait(timeout=5)
        return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,OSError,KeyError,subprocess.SubprocessError):
        print('{"error":"receipt-attestation-stopped","applyRetryAuthorized":false}',file=sys.stderr);sys.exit(1)
