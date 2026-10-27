#!/usr/bin/env python3
"""Read-only Worker/request/update inventory. No Git fetch, locks, config or Worker state writes."""
import argparse,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--home",type=Path,required=True)
    ap.add_argument("--candidate",default="089ee51922d68b03f2e8a9029a3811babfc3dc67")
    ap.add_argument("--output",type=Path,required=True)
    a=ap.parse_args();h=a.home.resolve();runtime=h/"runtime";cfg=read(h/"config.json");state=read(h/"state.json")
    def git(*args):return subprocess.check_output(["git","-C",str(ROOT),*args],text=True).strip()
    fixed=git("rev-parse",a.candidate);baseline=git("rev-parse",fixed+"^")
    paths=git("diff","--name-only",baseline,fixed).splitlines()
    changes=[{"file":p,"installedSha256":sha(runtime/p),"candidateSha256":hashlib.sha256(subprocess.check_output(
        ["git","-C",str(ROOT),"show",fixed+":"+p])).hexdigest()} for p in paths]
    req=[]
    for ident,row in state.get("requests",{}).items():
        q=row.get("request",{});kind=q.get("kind");target=q.get("target",{});execution=target.get("execution",{})
        recipe_refs=[ref for ref in execution.get("inputs",[]) if ref["file"].endswith("/recipe.json")]
        recipes=[]
        for ref in recipe_refs:
            path=runtime/ref["file"]
            recipes.append({"file":ref["file"],"sha256":ref["sha256"],"presentAndUnchanged":path.is_file() and sha(path)==ref["sha256"],
                "baseRelease":read(path).get("baseRelease") if path.is_file() else None})
        decision=q.get("decision",{})
        result=row.get("result",{});context=None;review=result.get("reviewDirectory")
        if review and Path(review,"context.json").is_file():context=read(Path(review,"context.json"))
        affected=kind in ["collect-review","accept-release","accept-sequence"]
        req.append({"id":ident,"kind":kind,"phase":row.get("phase"),"requestSha256":row.get("requestSha256"),
            "sourceCommit":q.get("sourceCommit"),"collectorCodeSha256":execution.get("codeSha256"),"recipes":recipes,
            "fixedDecisionBase":decision.get("baseRelease"),"lastReviewBase":context.get("public",{}).get("release") if context else None,
            "lastReviewRevision":context.get("public",{}).get("revision") if context else None,
            "technicalWaits":[{"category":t.get("category"),"provider":t.get("provider"),
                "httpStatus":t.get("lastDiagnostic",{}).get("httpStatus")} for t in result.get("technicalWaits",[])],
            "updateDisposition":"completed-record-preserve-no-replay" if row.get("phase")=="completed" else
                "old-request-preserve-no-rebinding" if affected else "preparation-recovery-preserve-existing-permission",
            "candidateSyncInputsNeedsNewSourceReview":affected and bool(q.get("sourceCommit"))})
    receipts=[{"file":str(p.relative_to(runtime)),"sha256":sha(p),"baseRelease":read(p).get("baseRelease"),
               "sourceReviewKind":read(p).get("sourceReviewKind")} for p in sorted((runtime/"datasets/manga-collection").glob("accepted-*/acceptance.json"))]
    coordinator=Path("/home/isinxnisi/.local/share/plunode-publication/coordinator.json")
    co=read(coordinator)
    # Source pin is bound in all coordination tickets. Installed root peer's private config is not read.
    value={"authority":"read-only-update-candidate-not-installation-approval","mainCommit":git("rev-parse","refs/heads/main"),
        "worker":{"workerId":cfg["workerId"],"installedCodeCommit":cfg["codeCommit"],"configSha256":sha(h/"config.json"),
                  "collectorFileSha256":sha(runtime/"scripts/collect-manga-v2.py"),
                  "collectorExecutionCodeSha256":hashlib.sha256(json.dumps({p:sha(runtime/p) for p in
                      ['scripts/collection-themes.py','scripts/collect-manga.py','scripts/collect-manga-v2.py']},
                      ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()},
        "candidate":{"baselineSnapshotCommit":baseline,"codeCommit":fixed,"changedFiles":changes,
            "preservedInstalledBackports":["scripts/collection-issues.py","scripts/collection-worker.py","scripts/collection-workflow.py","scripts/collection-transport.py"],
            "recommendedMode":"explicitly-reviewed-five-file-backport-on-existing-base-pin",
            "baseCodeCommitToPreserve":cfg["codeCommit"],
            "fullRuntimeReplacementIsSeparate":True,
            "candidateIsInCurrentMain":subprocess.run(["git","-C",str(ROOT),"merge-base","--is-ancestor",fixed,"refs/heads/main"]).returncode==0},
        "requests":req,"formalReceipts":receipts,
        "coordination":{"configSha256":sha(coordinator),"workerId":co["workerId"],"codeCommit":co["codeCommit"],
            "recommendedBackport":{"workerCodeCommitUnchanged":True,"coordinatorConfigUnchanged":True,
                "receiptPeerIdentityUnchanged":True,"basis":"Only five recognition/vocabulary/label files change; execution/control handlers and collector code hash are unchanged. Isolated real Executor guard tested."},
            "fullReplacementRequiredReview":["Worker config codeCommit","Coordinator codeCommit","VPS fixed receipt-peer/exclusion Worker identity",
                              "Pending unsigned publication tickets and active exclusion state","New request sourceCommit trust and code tree guard"]},
        "humanBoundaries":["Review exact candidate and existing-request disposition before any installation.",
            "Do not change old request sourceCommit, collectorCodeSha256, human decisions or receipts.",
            "Approve the exact five-file overlay before applying it. Preserve existing base codeCommit and peer tuple for the recommended backport.",
            "If choosing full replacement, candidate source is not in trusted main: a reviewed integration and peer/config change are required; never weaken sync_inputs.",
            "Current main differs broadly from installed Worker. Do not install whole latest main as this minimal update."],
        "changedRunningWorker":False}
    value["candidate"]["overlayManifestSha256"]=hashlib.sha256(json.dumps({
        "baseCodeCommit":cfg["codeCommit"],"overlaySourceCommit":fixed,"changes":changes},
        ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    assert a.output.resolve().is_relative_to((ROOT/"docs/research/film-worker-pilot-20261028").resolve())
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"requests":len(req),"receipts":len(receipts),"changedFiles":len(changes),"candidate":fixed,"written":str(a.output)}))
if __name__=="__main__":main()
