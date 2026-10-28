#!/usr/bin/env python3
"""Exercise the real Executor source guard locally, preserving the current base pin."""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OLD="973c7b0c599f79905a029b28b524f4924e169376"
def module(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument("--home",type=Path,required=True);args=ap.parse_args()
    h=args.home.resolve();assert h.is_relative_to((ROOT/".local").resolve())
    runtime=h/"runtime";m=module("real_worker_source_guard",runtime/"scripts/collection-worker.py")
    before={str(p.relative_to(runtime)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime/"datasets/manga-collection").glob("accepted-*/acceptance.json")}
    class LocalGit:
        def git(self,*argv):
            mapped=tuple("refs/heads/main" if x=="refs/remotes/source" else x for x in argv)
            r=subprocess.run(["git","-C",str(ROOT),*mapped],capture_output=True)
            if r.returncode:raise RuntimeError("Local fixed source rejected")
            return r.stdout
        def tree(self,commit,prefix):
            return self.git("rev-parse",commit+":"+prefix.rstrip("/")).strip()
    e=m.Executor({"home":str(h),"codeCommit":OLD,"workerId":"ISOLATED"},LocalGit())
    e.sync_inputs(OLD);assert OLD in e.synced
    current=subprocess.check_output(["git","-C",str(ROOT),"rev-parse","refs/heads/main"],text=True).strip()
    try:e.sync_inputs(current)
    except m.Blocked as ex:assert "Installed code differs" in str(ex)
    else:raise AssertionError("Unrelated latest main must not pass the fixed-code guard")
    candidate=subprocess.check_output(["git","-C",str(ROOT),"rev-parse","089ee51922d68b03f2e8a9029a3811babfc3dc67"],text=True).strip()
    try:e.sync_inputs(candidate)
    except m.Blocked as ex:assert "trusted main history" in str(ex)
    else:raise AssertionError("Unintegrated source must not become trusted")
    assert before=={str(p.relative_to(runtime)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime/"datasets/manga-collection").glob("accepted-*/acceptance.json")}
    result={"authority":"isolated-real-executor-source-guard","baseCodeCommit":OLD,"overlaySourceCommit":candidate,
        "existingSourceCommitStillAdmitted":True,"unrelatedMainStillRejected":True,"unintegratedSourceStillRejected":True,
        "configOrRequestRebindingPerformed":False,"receiptBytesUnchanged":True,"networkRequests":0,
        "limit":"Local Git replaces remote transport only; no running Worker, control branch or trust config is changed."}
    (h/"source-guard-result.json").write_text(json.dumps(result,indent=2)+"\n");print(json.dumps(result))
if __name__=="__main__":main()
