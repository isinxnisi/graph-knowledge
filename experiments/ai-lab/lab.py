#!/usr/bin/env python3
"""Explicit one-shot CLI. Common lock required for every operation that writes."""
import argparse
from pathlib import Path
import sys

from core import HERE, check_splits, load_snapshot, read_json, require, wire
from runtime import (activate, compare, decision, execute, export, frozen_write, held,
                     probe, read_sealed, recover, score)
import training


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=HERE / ".runtime")
    parser.add_argument("--token", help="existing autopilot-hold token; never starts or steals a lock")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("diagnose")
    sub.add_parser("validate")
    run = sub.add_parser("run")
    run.add_argument("--run-id", required=True)
    run.add_argument("--task", required=True)
    run.add_argument("--mode", choices=["baseline", "kev"], default="baseline")
    run.add_argument("--policy", choices=["id-order-v1", "purpose-role-v1"], default="id-order-v1")
    run.add_argument("--parent")
    recover_p = sub.add_parser("recover")
    recover_p.add_argument("--run-id", required=True)
    show = sub.add_parser("show")
    show.add_argument("--run-id", required=True)
    scoring = sub.add_parser("score")
    scoring.add_argument("--run-id", required=True)
    scoring.add_argument("--labels", type=Path, default=HERE / "evaluation/development-labels.json")
    comparison = sub.add_parser("compare")
    comparison.add_argument("left", type=Path)
    comparison.add_argument("right", type=Path)
    choosing = sub.add_parser("decision")
    choosing.add_argument("--run-id", required=True)
    choosing.add_argument("--decision-id", required=True)
    choosing.add_argument("--outcome", choices=["candidate", "adopted", "rejected"], required=True)
    choosing.add_argument("--reason", required=True)
    public = sub.add_parser("export")
    public.add_argument("--run-id", action="append", required=True)
    public.add_argument("--output", type=Path, required=True)
    switch = sub.add_parser("activate-local")
    switch.add_argument("--artifact", type=Path, required=True)
    switch.add_argument("--output", type=Path, required=True)
    train = sub.add_parser("training-plan")
    train.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "diagnose":
        print(wire(probe()))
        return
    data, _ = load_snapshot()
    tasks = read_json(HERE / "data/tasks.json")["tasks"]
    split_counts = check_splits(tasks, data)
    if args.command == "validate":
        print(wire({"status": "verified", "splitCounts": split_counts}))
        return
    if args.command == "show":
        from core import uid
        uid(args.run_id)
        print(wire(read_sealed(args.home / "runs" / args.run_id / "result.json")))
        return
    if args.command == "compare":
        print(wire(compare(read_sealed(args.left), read_sealed(args.right))))
        return
    require(args.token, "common_lock_token_required")
    held(args.token)
    if args.command == "run":
        selected = [t for t in tasks if t["id"] == args.task]
        require(len(selected) == 1, "unknown_task")
        require(selected[0]["split"] == "development", "final_evaluation_requires_separate_operator")
        result = execute(args.home, args.run_id, selected[0], args.mode, args.policy, args.parent,
                         before_send=lambda: held(args.token))
        print(wire({"runId": args.run_id, "status": result["status"], "executionKind": result.get("executionKind"),
                    "errorCode": result.get("errorCode"), "selection": result.get("selection")}))
        if result["status"] != "completed":
            sys.exit(2)
    elif args.command == "recover":
        print(wire(recover(args.home, args.run_id)))
    elif args.command == "score":
        print(wire(score(args.home, args.run_id, args.labels)))
    elif args.command == "decision":
        print(wire(decision(args.home, args.run_id, args.decision_id, args.outcome, args.reason)))
    elif args.command == "export":
        print(wire(export(args.home, args.run_id, args.output)))
    elif args.command == "activate-local":
        print(wire(activate(args.home, args.artifact, args.output)))
    elif args.command == "training-plan":
        plan = training.prepare(args.output)
        print(wire({"status": plan["status"], "executionEnabled": plan["executionEnabled"], "blockingConditions": plan["blockingConditions"]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Raw exceptions may contain paths or provider body. Keep them out of console/public data.
        print(wire({"status": "failed", "errorType": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
