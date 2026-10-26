#!/usr/bin/env python3
"""Bounded development cycle. Replay by default; an explicit execute permits one POST.

No scheduler, model training, label approval, policy adoption or public activation.
All outputs are private append-only records. A started cycle is never resent.
"""
import argparse
import fcntl
from pathlib import Path
import uuid

from core import HERE, baseline, candidates, check_splits, digest, load_snapshot, read_json, require, uid, wire
from runtime import execute, held, now, read_sealed, score, sealed_write

DEFAULT_HOME = Path.home() / ".local/share/plunode-ai-lab/first-sortie-20261026"
VERSION = "education-development-v1"


def classify(result, evaluation):
    if result["status"] != "completed":
        return {"held": "preflight-held", "unknown": "dispatch-outcome-unknown",
                "failed": "execution-failed"}.get(result["status"], "interrupted-no-resend")
    if not result["machineValid"]:
        return "machine-invalid"
    return "draft-match-awaiting-review" if evaluation["draftLabelMatch"] else "draft-mismatch-awaiting-review"


def cycle(home, cycle_id, run_id, token, *, task_id=None, execute_once=False):
    """Versioned finite DAG; durable intent before execute, no automatic retry/re-entry."""
    uid(cycle_id); uid(run_id); held(token)
    home = Path(home)
    require(not home.is_symlink(), "symlink_home")
    home.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (home / ".education.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        directory = home / "cycles" / cycle_id
        intent = {"cycleId": cycle_id, "runId": run_id, "version": VERSION,
                  "mode": "execute-one" if execute_once else "saved-response-replay", "taskId": task_id}
        if (directory / "intent.json").exists():
            require(read_sealed(directory / "intent.json") == intent, "cycle_identity_conflict")
            if (directory / "result.json").exists():
                return read_sealed(directory / "result.json")
            return {"status": "interrupted-no-resend", "cycleId": cycle_id, "retryAllowed": False}
        data, manifest = load_snapshot()
        tasks = read_json(HERE / "data/tasks.json")["tasks"]
        split_counts = check_splits(tasks, data)
        # Freeze generated curriculum and constraints before evaluating any answer.
        curriculum = [{"task": task, "taskSha256": digest(task), "candidates": candidates(data, task)} for task in tasks]
        require(all(t["task"]["split"] == "development" for t in curriculum), "development_only")
        sealed_write(directory / "intent.json", intent)
        sealed_write(directory / "curriculum.json", {"version": VERSION, "kgSha256": manifest["snapshotSha256"],
                     "splitEntityAndClaimCounts": split_counts, "tasks": curriculum,
                     "trainingDataCreated": False, "finalEvaluationPrepared": False})
        if execute_once:
            task = next((t for t in tasks if t["id"] == task_id), None)
            require(task is not None, "unknown_task")
            from monitoring import monitored_execute
            result = monitored_execute(home, run_id, task, token)
            require(result.get("status") != "interrupted_or_unknown", "interrupted_no_resend")
        else:
            result = read_sealed(home / "runs" / run_id / "result.json")
        spec = result["spec"]
        require(spec["kgSha256"] == manifest["snapshotSha256"], "cycle_snapshot_mismatch")
        require(any(spec["taskSha256"] == t["taskSha256"] for t in curriculum), "cycle_task_mismatch")
        require(result["executionKind"] != "test-double", "test_double_cycle_forbidden")
        held(token)
        evaluation = score(home, run_id, HERE / "evaluation/development-labels.json")
        # Initial automatic education never approves semantics, even if a file changes later.
        require(evaluation["reviewStatus"] == "pending-human" and evaluation["semanticAccepted"] is None, "human_review_boundary")
        classification = classify(result, evaluation)
        suggestions = {"version": "curriculum-candidates-v1", "classification": classification,
                       "adopted": False, "trainingExecuted": False,
                       "candidates": [
                           {"kind": "task", "taskId": "pluto-limited", "reason": "Compare HOLD when retrieval is incomplete; development only."},
                           {"kind": "policy", "policyVersion": "purpose-role-v1", "reason": "Retain explicit Role, direction and publication scope; inspect unsupported choices."},
                           {"kind": "evaluation", "reason": "Human review of draft rubric; prepare entity/Claim-disjoint final data before claiming generalization."}]}
        sealed_write(directory / "improvement-candidates.json", suggestions)
        # Offline re-evaluation changes neither weights nor saved AI response. It is not a second inference.
        labels = read_json(HERE / "evaluation/development-labels.json")
        comparisons = []
        for row in curriculum:
            task, generated = row["task"], row["candidates"]
            label = labels["tasks"][task["id"]]
            require(label["reviewStatus"] == "pending-human" and label["taskSha256"] == row["taskSha256"], "draft_binding")
            for policy in ("id-order-v1", "purpose-role-v1"):
                selected = baseline(task, generated, policy)["choice"]
                comparisons.append({"taskId": task["id"], "policyVersion": policy, "executionKind": "rule",
                                    "choice": selected, "draftLabelMatch": selected in label["acceptable"], "semanticAccepted": None})
        reevaluation = {"version": "saved-response-and-rules-v1", "sourceResultSha256": digest(result),
                        "sourceEvaluation": evaluation, "nonAiComparisons": comparisons,
                        "newInferenceCalls": 0, "weightsChanged": False, "generalizationEvidence": False}
        sealed_write(directory / "reevaluation.json", reevaluation)
        output = {"schemaVersion": 1, **intent, "finishedAt": now(), "status": "completed",
                  "classification": classification, "sourceResultSha256": digest(result),
                  "evaluationSha256": digest(evaluation), "reevaluationSha256": digest(reevaluation),
                  "candidateSha256": digest(suggestions), "semanticAccepted": None, "trainingRuns": 0,
                  "newInferenceCalls": int(execute_once and (home / "runs" / run_id / "dispatch.json").exists()),
                  "adoptedPolicy": None, "nextAction": "human-rubric-review-and-disjoint-data"}
        sealed_write(directory / "result.json", output)
        return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=DEFAULT_HOME)
    parser.add_argument("--token", required=True)
    parser.add_argument("--cycle-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--execute-one", action="store_true", help="explicitly authorize at most one real POST, no retry")
    parser.add_argument("--task", choices=["pluto-supervisor", "pluto-no-outgoing", "pluto-limited", "pluto-other-work"])
    args = parser.parse_args()
    require(not args.execute_one or args.task, "execute_requires_task")
    print(wire(cycle(args.home, args.cycle_id, args.run_id, args.token, task_id=args.task, execute_once=args.execute_one)))


if __name__ == "__main__":
    main()
