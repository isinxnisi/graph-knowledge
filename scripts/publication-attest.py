#!/usr/bin/env python3
"""WSL receipt freshness peer prototype. Hold the common lock through the fixed gate client's exit."""
import argparse
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


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--runtime',type=Path,required=True);cli.add_argument('--candidate',type=Path,required=True)
    cli.add_argument('--key',type=Path,required=True);cli.add_argument('--client',type=Path,required=True)
    cli.add_argument('--common-lock',type=Path,default=Path.home()/'.local/share/graph-autopilot/autopilot.lock')
    cli.add_argument('command',choices=['preflight','execute','notify']);cli.add_argument('nonce')
    a=cli.parse_args();fd=os.open(a.common_lock,os.O_RDWR|os.O_NOFOLLOW)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
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
                        response=signer.sign(freshness(a.runtime,a.candidate,message['challenge']),a.key)
                        child.stdin.write(json.dumps(response).encode()+b'\n');child.stdin.flush()
                    else: print(json.dumps(message),flush=True)
            cycle.require(child.wait(timeout=5)==0,'Fixed gate client failed')
        finally:
            selector.close();child.stdin.close()
            if child.poll() is None:child.terminate();child.wait(timeout=5)
        return 0
    finally:os.close(fd)

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,OSError,KeyError,subprocess.SubprocessError):
        print('{"error":"receipt-attestation-stopped","applyRetryAuthorized":false}',file=sys.stderr);sys.exit(1)
