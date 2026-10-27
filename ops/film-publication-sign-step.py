#!/usr/bin/python3 -I
"""One-time operator step: restore existing preparation flag, then use protected approver.
The existing approver requires the human to type the exact release before signing.
"""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

NONCE="6b240b18-56e4-4ea4-995f-7be7424c3fb2"
CURRENT_SHA="5dae7bf518d24beda3b38c937dc65fdd417fde0e4ead3de45baab48f58c1e294"
IMAGE="sha256:2bf646a22e867e5aa5fce5a155db45c337c4134ad6c0f337b65617c5799912e9"

def enabled_config(previous):
    import copy
    if previous["sourceCommit"]!="7392d8e343a11644b1047364c71653779ad0c93c" or previous["deliveryEnabled"] is not True or previous["preparation"]["nodeImage"]!=IMAGE or previous["preparation"]["enabled"] is not False:
        raise ValueError("Expected fixed enabled delivery and temporarily disabled preparation")
    value=copy.deepcopy(previous);value["preparation"]["enabled"]=True
    return value

def main():
    if os.geteuid()!=0 or len(sys.argv)!=1:raise ValueError("Fixed human operator step only")
    os.umask(0o077)
    stage=Path(__file__).resolve().parent
    helper=stage/"film-publication-image-update.py"
    for p in [stage,*stage.parents,helper]:
        info=p.lstat()
        if p.is_symlink() or info.st_uid!=0 or info.st_mode&0o022:raise ValueError("Root-private fixed stage required")
    if hashlib.sha256(helper.read_bytes()).hexdigest()!="db670372f43d7ff65ea39b89907dbd494c6cd4fea7090e81d508039efc395ade":raise ValueError("Frozen root helper changed")
    spec=importlib.util.spec_from_file_location("film_frozen_sign_helpers",helper)
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
    meta_path=stage/"web-deployment.json";h.trusted(meta_path);meta=json.loads(meta_path.read_bytes())
    config_path=Path("/etc/plunode-publication/delivery.json");h.trusted(config_path)
    before=config_path.read_bytes()
    if h.sha(config_path)!=CURRENT_SHA:raise ValueError("Delivery config changed; inspect before signing")
    cfg=json.loads(before);after=enabled_config(cfg)
    deadline=time.monotonic()+90
    while True:
        locks=contextlib.ExitStack()
        try:
            locks.enter_context(h.existing_lock(Path("/home/isinxnisi/.local/share/graph-autopilot/autopilot.lock"),1000))
            locks.enter_context(h.existing_lock(Path(cfg["preparation"]["home"])/"preparation.lock",1000))
        except BlockingIOError:
            locks.close()
            if time.monotonic()>=deadline:raise
            print("Waiting for existing locks before preparation flag update (maximum 90 seconds).",flush=True)
            time.sleep(2)
        else:break
    with locks:
        if config_path.read_bytes()!=before:raise ValueError("Concurrent config update")
        queue=Path(cfg["queueDir"])/NONCE
        job=json.loads((queue/"job.json").read_bytes())
        if job["request"]!=meta["publicationRequest"] or job["nonce"]!=NONCE or (queue/"approval.json").exists():raise ValueError("Exact unsigned registered request required")
        runtime=Path(cfg["runtime"])
        refs=[{"file":str(p.relative_to(runtime)),"sha256":h.sha(p)} for p in sorted((runtime/"datasets/manga-collection").glob("accepted-*/acceptance.json"))]
        if refs!=meta["receiptReferences"]:raise ValueError("Formal receipts advanced")
        state=json.loads((Path(cfg["preparation"]["home"])/"state.json").read_bytes())
        if state["nonce"]!=NONCE or state["phase"]!="awaiting-approval" or not state.get("announced"):raise ValueError("Existing preparation must cover this registered request")
        h.save_new(stage/"delivery.before-preparation-enable.json",before)
        mode=stat.S_IMODE(config_path.stat().st_mode)
        h.atomic(config_path,h.body(after),mode)
        try:
            check=subprocess.run(["/usr/local/sbin/plunode-publication-approve","--self-check"],check=True,capture_output=True,text=True,timeout=90)
            result=json.loads(check.stdout)
            if result["signed"] is not False or result["applyCalls"]!=0:raise ValueError("Non-signing installation check required")
        except BaseException:
            h.atomic(config_path,before,mode);raise
        h.save_new(stage/"preparation-enabled.json",h.body({"sourceCommitUnchanged":cfg["sourceCommit"],"nodeImage":IMAGE,
            "preparationEnabled":True,"deliveryEnabled":True,"configSha256":h.sha(config_path),"signed":False,"publicApply":False}))
    # Both locks are released before TTY input and the existing guarded delivery.
    print("Web update succeeded. The protected approver now displays the fixed request; type the release only if you approve production publication.",flush=True)
    subprocess.run(["/usr/local/sbin/plunode-publication-approve","--nonce",NONCE,"--minutes","30","--operator-approved"],check=True)

if __name__=="__main__":
    try:main()
    except Exception as error:
        print(json.dumps({"error":"film-publication-operator-step-stopped","errorType":type(error).__name__,
            "reason":str(error)[:160],"preserveSameNonce":True,"doNotBlindlyResign":True}),flush=True)
        sys.exit(1)
