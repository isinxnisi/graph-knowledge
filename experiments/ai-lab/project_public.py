"""Verify sealed private records, emit only the v2 public allowlist (no activation)."""
import argparse
import copy
from pathlib import Path

from core import HERE, candidates, digest, load_snapshot, read_json, require, uid, wire
from runtime import EXPECTED_MODEL, read_sealed


def project(home, initial, run_ids):
    payload = copy.deepcopy(initial["payload"])
    require(payload["schemaVersion"] == 1, "birth_contract_required")
    data, manifest = load_snapshot()
    require(payload["kgSha256"] == manifest["snapshotSha256"], "snapshot_binding")
    existing = {run["runId"] for run in payload["runs"]}
    for run_id in run_ids:
        uid(run_id); require(run_id not in existing, "duplicate_run")
        directory = Path(home) / "runs" / run_id
        result = read_sealed(directory / "result.json")
        start = read_sealed(directory / "start.json")
        spec = result["spec"]
        require(spec == start["spec"] and spec["runId"] == run_id, "spec_binding")
        require(spec["aiId"] == payload["aiId"] and spec["mode"] == "kev", "identity_binding")
        require(spec["kgSha256"] == payload["kgSha256"] and spec["kgRevision"] == payload["kgRevision"], "kg_binding")
        require(spec["taskSha256"] == digest(spec["task"]), "task_binding")
        generated = candidates(data, spec["task"])
        require(spec["candidates"] == generated and spec["model"] == EXPECTED_MODEL, "candidate_model_binding")
        require(result["executionKind"] in {"kev-api", "not-connected", "interrupted"}, "public_execution")
        sent = (directory / "dispatch.json").exists()
        if sent:
            import json
            dispatch = read_sealed(directory / "dispatch.json")
            require(dispatch["requestSha256"] == digest(json.loads(spec["requestWire"])), "dispatch_binding")
        require((result["executionKind"] != "kev-api" or sent) and (result["status"] != "held" or not sent), "dispatch_status")
        if result["status"] == "completed":
            from core import parse_answer
            require(result["machineValid"] and parse_answer(result["response"], generated) == result["selection"], "response_binding")
            require(all(result["response"].get("kev", {}).get(k) == v for k, v in EXPECTED_MODEL.items()), "response_model")
        telemetry_file = Path(home) / "telemetry" / (run_id + ".json")
        if not telemetry_file.exists():
            telemetry_file = Path(home) / "telemetry.json"
        telemetry = read_sealed(telemetry_file)
        require(telemetry["runId"] == run_id, "telemetry_binding")
        samples = [s for s in telemetry["samples"] if all(k in s for k in ("temperatureC", "utilizationPercent", "powerWatts", "usedMiB"))]
        require(samples, "telemetry_required")
        at_send = result.get("resourcesAtSend", {}).get("gpu") if sent else None
        error = result["errorCode"]
        if error and error.startswith("http_"):
            error = "provider_error"
        payload["runs"].append({
            "runId": run_id, "taskId": spec["task"]["id"], "parentRunId": spec["parentRunId"],
            "executionKind": result["executionKind"], "status": result["status"],
            "startedAt": result["startedAt"], "finishedAt": result["finishedAt"],
            "policyVersion": spec["policyVersion"], "modelRevision": EXPECTED_MODEL["model_revision"],
            "codeCommit": spec["code"]["commit"], "resultSha256": digest(result),
            "evaluationDataVersion": spec["evaluationDataVersion"], "scoringVersion": spec["scoringVersion"],
            "semanticReview": "pending-human", "trained": False, "trainingDataVersion": None, "adapterRevision": None,
            "choice": (result["selection"] or {}).get("choice"),
            "completeWithinSnapshot": generated["completeWithinSnapshot"],
            "paths": [{"id": p["id"], "targetId": p["targetId"], "steps": p["path"]} for p in generated["items"]],
            "disposition": None,
            "observation": {"requestSent": sent, "responseValidated": result["status"] == "completed" and result["machineValid"],
                "errorCode": error, "telemetrySha256": digest(telemetry), "sampleCount": len(telemetry["samples"]),
                "wallSeconds": result["metrics"]["wallSeconds"] if result["metrics"] else None,
                "atSend": {"temperatureC": at_send["temperatureC"], "utilizationPercent": at_send["utilizationPercent"], "freeVramMiB": at_send["freeMiB"]} if at_send else None,
                "peak": {target: max(s[source] for s in samples) for target, source in [("temperatureC", "temperatureC"), ("utilizationPercent", "utilizationPercent"), ("powerWatts", "powerWatts"), ("usedVramMiB", "usedMiB")]}}
        })
        existing.add(run_id)
    payload.update(schemaVersion=2, version="first-sortie-20261026-v2", recordedAt=max(payload["runs"], key=lambda r:r["finishedAt"])["finishedAt"])
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--initial", type=Path, required=True)
    parser.add_argument("--run-id", action="append", required=True)
    args = parser.parse_args()
    print(wire(project(args.home, read_json(args.initial), args.run_id)))
