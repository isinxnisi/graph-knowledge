"""GPU observation around one explicit request; never controls the shared server."""
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

from runtime import execute, held, now, probe, read_sealed, resource_gate, sealed_write


def gpu_sample():
    raw = subprocess.check_output(["/usr/lib/wsl/lib/nvidia-smi",
          "--query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used,memory.free,memory.total",
          "--format=csv,noheader,nounits"], text=True, timeout=5)
    rows = raw.strip().splitlines()
    if len(rows) != 1:
        raise ValueError("single_gpu_required")
    return dict(zip(("temperatureC", "utilizationPercent", "powerWatts", "usedMiB", "freeMiB", "totalMiB"),
                    [float(value.strip()) for value in rows[0].split(",")]))


def monitored_execute(home, run_id, task, token):
    # Existing run identity belongs to its original source version; never resubmit it.
    directory = Path(home) / "runs" / run_id
    if (directory / "result.json").exists():
        return read_sealed(directory / "result.json")
    if directory.exists():
        return {"status": "interrupted_or_unknown", "retryAllowed": False}
    held(token)
    samples, incidents = [], []
    stop = threading.Event()
    sending = threading.Event()
    phase = ["baseline-before"]

    def observe():
        while not stop.is_set():
            try:
                row = {"at": now(), "phase": phase[0], **gpu_sample()}
                samples.append(row)
                if sending.is_set() and row["temperatureC"] >= 80 and not incidents:
                    incidents.append({"at": now(), "code": "client_guard_80C", "serverCancellationGuaranteed": False})
                    os.kill(os.getpid(), signal.SIGUSR1)
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                samples.append({"at": now(), "phase": phase[0], "probeError": type(error).__name__})
                if sending.is_set() and not incidents:
                    incidents.append({"at": now(), "code": "monitor_lost", "serverCancellationGuaranteed": False})
                    os.kill(os.getpid(), signal.SIGUSR1)
            stop.wait(.5)

    def abort(_signal, _frame):
        raise OSError("client_safety_guard")

    def before_send():
        held(token)
        # Missing power/temperature telemetry is a hold, never an unobserved POST.
        gpu_sample()
        phase[0] = "dispatch-pending"
        sending.set()

    previous = signal.signal(signal.SIGUSR1, abort)
    thread = threading.Thread(target=observe, daemon=True)
    thread.start()
    try:
        time.sleep(3)
        phase[0] = "preflight-and-inference"
        return execute(home, run_id, task, "kev", "purpose-role-v1", observe=probe, before_send=before_send)
    finally:
        sending.clear()
        phase[0] = "baseline-after"
        time.sleep(10)
        stop.set(); thread.join(6)
        signal.signal(signal.SIGUSR1, previous)
        sealed_write(Path(home) / "telemetry" / (run_id + ".json"), {
            "schemaVersion": 1, "runId": run_id, "sampleIntervalSeconds": .5,
            "samples": samples, "safetyIncidents": incidents, "automaticRetry": False})
