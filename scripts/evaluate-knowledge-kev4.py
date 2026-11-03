"""Use the already-built, stopped Kev 4B experiment, with explicit shared pause.

No build/download/config changes; original Kev reports remain read-only.
Requires the user's approval for the temporary loss of the shared 0.8B API.
"""
import argparse
import datetime
import hashlib
import json
import signal
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEV = ROOT.parents[1] / "9.kev-service"
PROD = "kev-service-kev-1"
EXPERIMENT = "kev4-nf4-experiment-api-1"
OLD_REV = "bf75a6a8848ea6960ff2ed108d9ed44c2941174f"
NEW_REV = "6cfce5c2fa4b4bd64026336ab649c5ca78857d52"


def command(*args, timeout=120):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


def inspect(name):
    return json.loads(command("docker", "inspect", name))[0]


def identity(value):
    protected = {k: value[k] for k in ["Id", "Image", "Config", "HostConfig", "Mounts"]}
    digest = hashlib.sha256(json.dumps(protected, sort_keys=True).encode()).hexdigest()
    return {"id": value["Id"], "image": value["Image"], "config_sha256": digest}


def runtime(port):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/runtime", timeout=10) as response:
        return json.load(response)


def protected_hashes():
    files = [p for p in (KEV / "experiments/kev4-nf4").rglob("*") if p.is_file() and "__pycache__" not in str(p)]
    files += [p for p in (KEV / "reports/kev4-nf4").rglob("*") if p.is_file()]
    files += [KEV / p for p in ["kev/service.py", "kev/admission.py", "kev/Dockerfile", "docker-compose.yml", "docker-compose.override.yml", "compose.cpu.yml"]]
    return {str(p.relative_to(KEV)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def wait_runtime(port, revision, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = runtime(port)
            if result["model_revision"] != revision:
                raise RuntimeError("Unexpected model revision")
            return result
        except (OSError, TimeoutError):
            time.sleep(3)
    raise TimeoutError("Model readiness deadline exceeded")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-shared-pause", action="store_true")
    parser.add_argument("--output", default=".local/u5-kev4-evaluation")
    args = parser.parse_args()
    old, exp = inspect(PROD), inspect(EXPERIMENT)
    assert old["State"]["Running"] and not exp["State"]["Running"], "Expected 0.8B running and 4B stopped"
    assert exp["HostConfig"]["PortBindings"] == {"8008/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8010"}]}, "Experiment must stay loopback-only"
    assert len(exp["Mounts"]) == 1 and exp["Mounts"][0]["Destination"] == "/models", "Unexpected experiment access"
    original = runtime(8009)
    assert original["model_revision"] == OLD_REV
    before = {"production": identity(old), "experiment": identity(exp), "runtime": original, "files": protected_hashes()}
    if not args.allow_shared_pause:
        print(json.dumps({"preflight": "ok", "shared_pause_required": True, "production": before["production"], "experiment": before["experiment"]}))
        return
    out = (ROOT / args.output).resolve()
    assert out.is_relative_to((ROOT / ".local").resolve()), "Keep private run files in this worktree"
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    (out / "before.json").write_text(json.dumps(before, indent=2))
    report = {"startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "state": "running", "restored": False}
    stop = threading.Event()
    overheated = threading.Event()

    def monitor():
        with (out / "resources.jsonl").open("x") as log:
            while not stop.is_set():
                try:
                    gpu = command("nvidia-smi", "--query-gpu=memory.used,memory.free,temperature.gpu", "--format=csv,noheader,nounits", timeout=10)
                    log.write(json.dumps({"at": time.time(), "gpu": gpu}) + "\n")
                    log.flush()
                    if int(gpu.split(",")[-1]) >= 92:
                        overheated.set()
                except (OSError, ValueError, subprocess.SubprocessError):
                    pass
                stop.wait(5)

    thread = threading.Thread(target=monitor, daemon=True)
    thread.start()
    try:
        print(json.dumps({"stage": "pausing-0.8b", "output": str(out)}), flush=True)
        command("docker", "stop", "-t", "100", PROD)
        command("docker", "start", EXPERIMENT)
        loaded = wait_runtime(8010, NEW_REV, 600)
        assert loaded.get("quantization") == "bitsandbytes-nf4-double"
        report["runtime4b"] = loaded
        print(json.dumps({"stage": "4b-ready", "revision": NEW_REV}), flush=True)
        for profile in ["categorical-v1", "binary-v2"]:
            with (out / (profile + ".log")).open("x") as log:
                args = [str(ROOT / ".local/issue75/node"), "--import", "tsx", "scripts/evaluate-knowledge-review.ts", "--endpoint", "http://127.0.0.1:8010/v1/systemone", "--profile", profile, "--output", str(out / profile)]
                child = subprocess.Popen(args, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + 900
                    while child.poll() is None:
                        if overheated.is_set() or time.monotonic() > deadline:
                            raise TimeoutError("Temperature or bounded evaluation deadline reached")
                        time.sleep(1)
                    if child.returncode:
                        raise RuntimeError(f"Evaluation {profile} exited {child.returncode}; see retained log")
                finally:
                    if child.poll() is None:
                        child.terminate()
                        child.wait(timeout=15)
            print(json.dumps({"stage": "profile-completed", "profile": profile}), flush=True)
        report["state"] = "completed"
    except BaseException as error:
        report["state"], report["error"] = "failed", str(error)
        raise
    finally:
        try:
            command("docker", "stop", "-t", "40", EXPERIMENT)
            assert not inspect(EXPERIMENT)["State"]["Running"], "4B still running; never load both models"
            command("docker", "start", PROD)
            restored = wait_runtime(8009, OLD_REV, 600)
            for key in ["run", "model_revision", "base_revision", "dtype", "device", "kev_commit"]:
                assert restored[key] == original[key], "Restoration mismatch: " + key
            assert identity(inspect(PROD)) == before["production"], "Original container/config changed"
            assert identity(inspect(EXPERIMENT)) == before["experiment"], "Experimental config changed"
            assert protected_hashes() == before["files"], "Kev source/assets/reports changed"
            report["restored"], report["protectedFiles"] = True, len(before["files"])
        finally:
            stop.set()
            thread.join(timeout=15)
            report["completedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            (out / "session.json").write_text(json.dumps(report, indent=2))
            print(json.dumps({"stage": "finished", "state": report["state"], "restored": report["restored"]}), flush=True)


if __name__ == "__main__":
    def terminate(signum, frame):
        raise SystemExit("Interrupted; restoring original Kev")
    signal.signal(signal.SIGTERM, terminate)
    main()
