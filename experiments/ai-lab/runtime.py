"""Local immutable runs and the shared Kev public HTTP boundary (stdlib only)."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import resource
import signal
import re
import shutil
import socket
import subprocess
import tempfile
import time

from core import (AI_ID, HERE, baseline, candidates, digest, file_hash, load_snapshot,
                  parse_answer, read_json, request_payload, require, uid, validate_choice, wire)

EXPECTED_MODEL = {"run": "jaredpalmer/kev-0.8b@bf75a6a8848ea6960ff2ed108d9ed44c2941174f",
                  "model_revision": "bf75a6a8848ea6960ff2ed108d9ed44c2941174f",
                  "base": "Qwen/Qwen3.5-0.8B-Base",
                  "base_revision": "dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68",
                  "kev_commit": "5e42a7a03f28134853dd3ff77461457e921e5ec1"}
LIMITS = {"maxRequestBytes": 12000, "httpSeconds": 45, "calls": 1,
          "startBelowC": 75, "minFreeVramMiB": 2048, "minAvailableRamMiB": 4096,
          "minDiskMiB": 1024, "maxGpuUtilPercent": 5}


def now():
    return datetime.now(timezone.utc).isoformat()


def frozen_write(path, data):
    """Complete durable bytes first, then atomic no-clobber link; never partial JSON."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    contents = (wire(data) + "\n").encode()
    fd, temp = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(contents)
            out.flush()
            os.fsync(out.fileno())
        try:
            os.link(temp, path)
        except FileExistsError:
            require(not path.is_symlink() and path.read_bytes() == contents, "immutable_conflict")
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        os.unlink(temp)


def sealed_write(path, payload):
    frozen_write(path, {"sha256": digest(payload), "payload": payload})


def read_sealed(path):
    value = read_json(path)
    require(value["sha256"] == digest(value["payload"]), "record_hash")
    return value["payload"]


@contextmanager
def local_lock(home):
    home = Path(home)
    require(not home.is_symlink(), "symlink_home")
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(home / ".lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def held(token):
    # Use the real project's shared lock, including from a separate worktree.
    subprocess.run(["python3", str(HERE.parents[1] / "scripts/autopilot.py"),
                    "assert-held", "--token", token], check=True, capture_output=True, timeout=10)


def code_identity():
    root = HERE.parents[1]
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    names = ("core.py", "runtime.py", "lab.py", "training.py")
    files = {name: file_hash(HERE / name) for name in names}
    return {"commit": sha, "sourceSha256": digest(files), "files": files}


def probe():
    result = {"observedAt": now(), "system": "local-wsl", "gpu": None,
              "availableRamMiB": None, "freeDiskMiB": shutil.disk_usage(HERE).free // 2**20,
              "loadAverage": list(os.getloadavg())}
    try:
        mem = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
        result.update(availableRamMiB=int(mem["MemAvailable"].split()[0]) // 1024,
                      totalRamMiB=int(mem["MemTotal"].split()[0]) // 1024,
                      swapFreeMiB=int(mem["SwapFree"].split()[0]) // 1024,
                      swapTotalMiB=int(mem["SwapTotal"].split()[0]) // 1024)
    except (OSError, ValueError, KeyError):
        pass
    try:
        raw = subprocess.check_output(["nvidia-smi", "--query-gpu=temperature.gpu,memory.total,memory.used,memory.free,utilization.gpu",
                                       "--format=csv,noheader,nounits"], text=True, timeout=5)
        require(len(raw.strip().splitlines()) == 1, "gpu_count")
        values = [int(x.strip()) for x in raw.strip().split(",")]
        result["gpu"] = dict(zip(("temperatureC", "totalMiB", "usedMiB", "freeMiB", "utilizationPercent"), values))
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return result


def resource_gate(observation):
    gpu = observation.get("gpu")
    if not gpu or observation.get("availableRamMiB") is None:
        return "resources_unknown"
    if gpu["temperatureC"] >= LIMITS["startBelowC"]:
        return "gpu_too_warm"
    if gpu["freeMiB"] < LIMITS["minFreeVramMiB"]:
        return "vram_insufficient"
    if gpu["utilizationPercent"] > LIMITS["maxGpuUtilPercent"]:
        return "gpu_busy"
    if observation["availableRamMiB"] < LIMITS["minAvailableRamMiB"]:
        return "ram_insufficient"
    if observation["freeDiskMiB"] < LIMITS["minDiskMiB"]:
        return "disk_insufficient"
    return None


class Kev:
    """Fixed loopback endpoint; no redirects, retries, proxy env, or fallback provider."""
    def http(self, method, path, payload=None):
        body = wire(payload).encode() if payload is not None else None
        if body is not None:
            require(len(body) <= LIMITS["maxRequestBytes"], "request_too_large")
        connection = http.client.HTTPConnection("127.0.0.1", 8009, timeout=LIMITS["httpSeconds"])
        def expired(_signum, _frame):
            raise TimeoutError("http_deadline")
        previous_handler = signal.signal(signal.SIGALRM, expired)
        previous_timer = signal.setitimer(signal.ITIMER_REAL, LIMITS["httpSeconds"])
        try:
            connection.request(method, path, body, {"Content-Type": "application/json"})
            response = connection.getresponse()
            raw = response.read(65537)
            require(len(raw) <= 65536, "response_too_large")
            if response.status != 200:
                raise ProviderError("http_" + str(response.status))
            return json.loads(raw)
        finally:
            connection.close()
            signal.setitimer(signal.ITIMER_REAL, *previous_timer)
            signal.signal(signal.SIGALRM, previous_handler)

    def runtime(self):
        value = self.http("GET", "/v1/runtime")
        require(all(value.get(k) == v for k, v in EXPECTED_MODEL.items()), "model_mismatch")
        require(value.get("device") == "cuda" and value.get("dtype") == "float32", "runtime_mismatch")
        return value

    def infer(self, payload):
        return self.http("POST", "/v1/systemone", payload)


class ProviderError(Exception):
    pass


def execute(home, run_id, task, mode, policy, parent=None, *, provider=None, observe=probe, before_send=lambda: None):
    uid(run_id)
    if parent is not None:
        uid(parent)
    require(mode in {"baseline", "kev"}, "mode")
    data, manifest = load_snapshot()
    generated = candidates(data, task)
    payload = request_payload(data, task, generated, policy)
    code = code_identity()
    spec = {"schemaVersion": 1, "aiId": AI_ID, "runId": run_id, "parentRunId": parent,
            "task": task, "taskSha256": digest(task), "mode": mode, "policyVersion": policy,
            "model": EXPECTED_MODEL if mode == "kev" else None, "adapterRevision": None,
            "trainingDataVersion": None, "evaluationDataVersion": "development-v1",
            "scoringVersion": "relation-choice-v1", "kgRevision": manifest["revision"],
            "kgSha256": manifest["snapshotSha256"], "code": code, "limits": LIMITS,
            "candidates": generated, "requestWire": wire(payload)}
    with local_lock(home):
        run_dir = Path(home) / "runs" / run_id
        require(not run_dir.is_symlink(), "symlink_run")
        if parent:
            previous = read_sealed(Path(home) / "runs" / parent / "result.json")
            require(previous["spec"]["aiId"] == AI_ID, "parent_identity")
        if (run_dir / "start.json").exists():
            old = read_sealed(run_dir / "start.json")
            # Exact identity check; new code is a new deliberate run, never an implicit retry.
            # A later documentation-only commit must not trigger another inference.
            comparable = {**spec, "code": {**spec["code"], "commit": old["spec"]["code"]["commit"]}}
            require(old["spec"] == comparable, "run_identity_conflict")
            if (run_dir / "result.json").exists():
                return read_sealed(run_dir / "result.json")
            return {"status": "interrupted_or_unknown", "runId": run_id, "retryAllowed": False}
        observation = observe()
        start = {"spec": spec, "startedAt": now(), "resourcesBefore": observation}
        sealed_write(run_dir / "start.json", start)
        started, cpu = time.monotonic(), time.process_time()
        result = {**start, "status": "failed", "executionKind": "rule" if mode == "baseline" else "not-connected",
                  "selection": None, "errorCode": None, "runtime": None, "response": None}
        try:
            if mode == "baseline":
                result["selection"] = baseline(task, generated, policy)
                result["status"] = "completed"
            else:
                error = resource_gate(observation)
                if error:
                    result.update(status="held", errorCode=error)
                elif len(wire(payload).encode()) > LIMITS["maxRequestBytes"]:
                    result.update(status="held", errorCode="request_too_large")
                else:
                    client = provider or Kev()
                    result["runtime"] = client.runtime()
                    # Recheck lock/resource state immediately before the only inference call.
                    before_send()
                    final_observation = observe()
                    result["resourcesAtSend"] = final_observation
                    error = resource_gate(final_observation)
                    if error:
                        result.update(status="held", errorCode=error)
                    else:
                        result["executionKind"] = "test-double" if provider is not None else "kev-api"
                        sealed_write(run_dir / "dispatch.json", {"at": now(), "requestSha256": digest(payload)})
                        response = client.infer(payload)
                        result["response"] = response
                        # Public service returns a deployment stamp. Check it when present.
                        stamp = response.get("kev", {})
                        require(all(stamp.get(k) == v for k, v in EXPECTED_MODEL.items()), "response_model_mismatch")
                        result["selection"] = parse_answer(response, generated)
                        result["status"] = "completed"
            if result["selection"]:
                validate_choice(result["selection"]["choice"], generated)
        except (TimeoutError, socket.timeout, ConnectionError, OSError):
            result.update(status="unknown" if (run_dir / "dispatch.json").exists() else "failed", errorCode="transport_error")
        except ProviderError as error:
            result.update(status="failed", errorCode=str(error))
        except (ValueError, KeyError, TypeError, subprocess.SubprocessError):
            result.update(status="failed", errorCode="validation_or_lock_error")
        result.update(finishedAt=now(), metrics={"wallSeconds": time.monotonic() - started,
                      "clientCpuSeconds": time.process_time() - cpu,
                      "clientPeakRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss},
                      resourcesAfter=observe(), machineValid=result["status"] == "completed")
        sealed_write(run_dir / "result.json", result)
        return result


def recover(home, run_id):
    uid(run_id)
    with local_lock(home):
        directory = Path(home) / "runs" / run_id
        if (directory / "result.json").exists():
            return read_sealed(directory / "result.json")
        start = read_sealed(directory / "start.json")
        result = {**start, "status": "unknown", "executionKind": "interrupted",
                  "selection": None, "errorCode": "interrupted_no_retry", "runtime": None,
                  "response": None, "finishedAt": now(), "metrics": None,
                  "resourcesAfter": None, "machineValid": False}
        sealed_write(directory / "result.json", result)
        return result


def score(home, run_id, labels_path):
    uid(run_id)
    result = read_sealed(Path(home) / "runs" / run_id / "result.json")
    spec = result["spec"]
    labels = read_json(labels_path)
    require(labels["version"] == spec["evaluationDataVersion"] and labels["split"] == spec["task"]["split"], "evaluation_split")
    label = labels["tasks"][spec["task"]["id"]]
    require(label["taskSha256"] == spec["taskSha256"], "label_binding")
    require(label["reviewStatus"] in {"pending-human", "human-reviewed"}, "label_review")
    choice = (result["selection"] or {}).get("choice")
    passed = choice in label["acceptable"] if result["machineValid"] else None
    evaluation = {"schemaVersion": 1, "runId": run_id, "resultSha256": digest(result),
                  "taskSha256": spec["taskSha256"], "kgSha256": spec["kgSha256"],
                  "scoringVersion": "relation-choice-v1", "labelsSha256": file_hash(labels_path),
                  "labelOrigin": label["origin"], "reviewStatus": label["reviewStatus"],
                  "machineValid": result["machineValid"], "draftLabelMatch": passed,
                  "semanticAccepted": passed if label["reviewStatus"] == "human-reviewed" else None}
    with local_lock(home):
        sealed_write(Path(home) / "evaluations" / (run_id + "-" + evaluation["labelsSha256"] + ".json"), evaluation)
    return evaluation


def compare(left, right):
    for key in ("taskSha256", "kgSha256", "scoringVersion", "labelsSha256", "reviewStatus"):
        require(left[key] == right[key], "incomparable_" + key)
    a, b = left["draftLabelMatch"], right["draftLabelMatch"]
    outcome = "not-evaluable" if a is None or b is None else "unchanged" if a == b else "improved" if b else "worsened"
    return {"leftRunId": left["runId"], "rightRunId": right["runId"], "outcome": outcome,
            "metric": "draft-label-match", "generalizationEvidence": False,
            "humanReviewed": left["reviewStatus"] == "human-reviewed"}


def decision(home, run_id, decision_id, outcome, reason):
    uid(run_id)
    uid(decision_id)
    require(outcome in {"candidate", "rejected", "adopted"} and 1 <= len(reason) <= 500, "decision_input")
    run = read_sealed(Path(home) / "runs" / run_id / "result.json")
    record = {"runId": run_id, "decisionId": decision_id, "outcome": outcome,
              "reason": reason, "resultSha256": digest(run)}
    with local_lock(home):
        target = Path(home) / "decisions" / (decision_id + ".json")
        if target.exists():
            previous = read_sealed(target)
            require({k: v for k, v in previous.items() if k != "decidedAt"} == record, "immutable_conflict")
            return previous
        record["decidedAt"] = now()
        sealed_write(target, record)
    return record


def public_projection(home, run_ids):
    """IDs, fixed model versions and generated references only; no raw provider strings."""
    data, manifest = load_snapshot()
    tasks = read_json(HERE / "data/tasks.json")["tasks"]
    known = {digest(t): t for t in tasks}
    runs = []
    for run_id in run_ids:
        uid(run_id)
        result = read_sealed(Path(home) / "runs" / run_id / "result.json")
        spec = result["spec"]
        require(spec["taskSha256"] in known and spec["task"] == known[spec["taskSha256"]], "not_public_task")
        require(spec["kgSha256"] == manifest["snapshotSha256"] and spec["aiId"] == AI_ID, "not_public_snapshot")
        generated = candidates(data, spec["task"])
        require(spec["candidates"] == generated, "candidate_tampering")
        require(spec["policyVersion"] in {"id-order-v1", "purpose-role-v1"}, "public_policy")
        require(spec["mode"] in {"baseline", "kev"}, "public_mode")
        require(result["status"] in {"completed", "failed", "unknown", "held"}, "public_status")
        require(result["executionKind"] in {"rule", "kev-api", "not-connected", "interrupted"}, "public_execution")
        for timestamp in (result["startedAt"], result["finishedAt"]):
            datetime.fromisoformat(timestamp)
        selection = result["selection"]
        if selection:
            validate_choice(selection["choice"], generated)
            if spec["mode"] == "kev":
                require(selection == parse_answer(result["response"], generated), "selection_tampering")
            else:
                require(selection == baseline(spec["task"], generated, spec["policyVersion"]), "selection_tampering")
        require(re.fullmatch(r"[a-f0-9]{40}", spec["code"]["commit"]) and
                re.fullmatch(r"[a-f0-9]{64}", spec["code"]["sourceSha256"]), "public_code_version")
        dispositions = []
        for path in sorted((Path(home) / "decisions").glob("*.json")):
            record = read_sealed(path)
            if record["runId"] == run_id:
                require(record["resultSha256"] == digest(result), "decision_binding")
                require(record["outcome"] in {"candidate", "adopted", "rejected"}, "public_decision")
                uid(record["decisionId"])
                datetime.fromisoformat(record["decidedAt"])
                dispositions.append({k: record[k] for k in ("decisionId", "outcome", "decidedAt")})
        entries = []
        for c in generated["items"]:
            entries.append({"id": c["id"], "entityId": c["targetId"], "name": c["targetName"],
                            "graphPath": "/explore/" + c["targetId"],
                            "claimPaths": ["/?read=claim&dataset=public-kg&id=" + p["claimId"] for p in c["path"]],
                            "path": c["path"]})
        runs.append({"runId": run_id, "taskId": spec["task"]["id"], "objective": spec["task"]["objective"],
                     "parentRunId": uid(spec["parentRunId"]) if spec["parentRunId"] else None,
                     "status": result["status"], "executionKind": result["executionKind"],
                     "startedAt": result["startedAt"], "finishedAt": result["finishedAt"],
                     "policyVersion": spec["policyVersion"], "model": EXPECTED_MODEL if spec["mode"] == "kev" else None,
                     "codeVersion": {k: spec["code"][k] for k in ("commit", "sourceSha256")},
                     "evaluationDataVersion": "development-v1", "scoringVersion": "relation-choice-v1",
                     "trainingDataVersion": None, "adapterRevision": None, "dispositions": dispositions,
                     "trained": False, "semanticReview": "pending-human", "selection": selection,
                     "candidates": entries, "completeWithinSnapshot": generated["completeWithinSnapshot"],
                     "resultSha256": digest(result)})
    return {"schemaVersion": 1, "aiId": AI_ID, "displayName": {"ja": "Plunode 関係探索ラボ", "en": "Plunode Relation Lab"},
            "operator": "plunode", "kgRevision": manifest["revision"], "kgSha256": manifest["snapshotSha256"],
            "observedAt": manifest["observedAt"], "liveStatus": "not-monitored", "runs": runs,
            "notice": "Fixed published subset; draft evaluation; no evidence of trained-model improvement."}


def export(home, run_ids, destination):
    artifact = public_projection(home, run_ids)
    sealed_write(destination, artifact)
    return {"artifactSha256": digest(artifact), "runs": len(artifact["runs"])}


def activate(home, artifact_path, destination):
    """Local artifact directory only. Atomic current pointer and retained releases allow rollback."""
    artifact = read_sealed(artifact_path)
    require(artifact["schemaVersion"] == 1 and artifact["aiId"] == AI_ID, "public_artifact")
    # Accept only byte-identical output of the allowlist projector, with no extra fields.
    require(set(artifact) == {"schemaVersion", "aiId", "displayName", "operator", "kgRevision", "kgSha256", "observedAt", "liveStatus", "runs", "notice"}, "public_fields")
    expected = public_projection(home, [row["runId"] for row in artifact["runs"]])
    # Later append-only decisions must not prevent rollback to a prior projection.
    for old, current in zip(artifact["runs"], expected["runs"]):
        require(all(d in current["dispositions"] for d in old["dispositions"]), "projection_mismatch")
        require(len({d["decisionId"] for d in old["dispositions"]}) == len(old["dispositions"]), "projection_mismatch")
        current["dispositions"] = old["dispositions"]
    require(artifact == expected, "projection_mismatch")
    version = digest(artifact)
    destination = Path(destination)
    with local_lock(destination):
        frozen_write(destination / "releases" / (version + ".json"), artifact)
        previous = read_json(destination / "current.json") if (destination / "current.json").exists() else None
        if previous and previous["sha256"] == version:
            return previous
        pointer = {"sha256": version, "previous": previous["sha256"] if previous else None}
        fd, temporary = tempfile.mkstemp(prefix=".pointer-", dir=destination)
        try:
            with os.fdopen(fd, "w") as out:
                out.write(wire(pointer) + "\n")
                out.flush()
                os.fsync(out.fileno())
            os.replace(temporary, destination / "current.json")
            directory_fd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return pointer
