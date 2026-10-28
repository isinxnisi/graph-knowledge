#!/usr/bin/env python3
"""Resume only the approved WSL update; wait for existing activity without holding locks."""
import base64
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / '.local/publication-pipeline/operator-package-approved-installation-preflight-fix2'
RUNNER_SHA = '2bc74c5e98e3b51533c6d3ea806b2c023def48792af414fd31171f4840ab81e8'
APPLIER_SHA = '74a2bb1a3abe79c897b74f56a0b9e4db1ba1d9a97e8ef0520f9e48dcb9fd50e9'
PAYLOAD_SHA = '9955a6dbf84ccb53d0a4e3daa18e7c967746267785426e2926ec0aff13354215'
LOCKS = [Path('/home/isinxnisi/.local/share/graph-autopilot/autopilot.lock'),
         Path('/home/isinxnisi/.local/share/plunode-publication/preparation/preparation.lock'),
         Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/worker.lock')]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path); value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value); return value


def require(value, reason):
    if not value: raise ValueError(reason)


def busy_lock(helper, paths=LOCKS, uid=1000):
    # Release every successfully acquired lock even if a later one is busy. Never wait holding one.
    with contextlib.ExitStack() as stack:
        for path in paths:
            try: stack.enter_context(helper.existing_lock(path, uid))
            except BlockingIOError: return str(path)
    return None


def task_busy():
    # Read the existing task through its current ACL; no Task update, trigger or permission change.
    code = "$ErrorActionPreference='Stop';$s=New-Object -ComObject Schedule.Service;$s.Connect();$t=$s.GetFolder('\\').GetTask('Plunode-Publication-Delivery');@{state=[int]$t.State;enabled=[bool]$t.Enabled}|ConvertTo-Json -Compress"
    encoded = base64.b64encode(code.encode('utf-16-le')).decode()
    result = subprocess.run(['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        capture_output=True, check=True, timeout=30)
    state = json.loads(result.stdout.decode('utf-8-sig'))
    require(state['enabled'] is True and state['state'] in [2, 3, 4], 'Task disabled/unknown; preserve and inspect')
    return state['state'] != 3  # TASK_STATE_READY; queued/running must finish normally.


def safe_lock_failure(result):
    return (result.get('error') == 'bundle2-update-stopped' and result.get('errorType') == 'BlockingIOError'
        and result.get('diagnostics', {}).get('operation') == 'wsl-before-identities-and-locks'
        and result.get('signed') is False and result.get('applyCalls') == 0
        and bool(result.get('traceFrames'))
        and result['traceFrames'][-1].get('file') == 'film-publication-image-update.py'
        and result['traceFrames'][-1].get('function') == 'existing_lock'
        and any(frame.get('function') == 'wsl' for frame in result['traceFrames']))


def child_result(output):
    found = []
    for line in output.splitlines():
        try: value = json.loads(line)
        except ValueError: continue
        if isinstance(value, dict): found.append(value)
    require(bool(found), 'No structured WSL result; inspect without retry')
    return found[-1]


def public_vps_check():
    def get(path):
        request = urllib.request.Request('https://plunode.net' + path, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response: return json.load(response)
    require(get('/api/dataset') == {'dataset': 'public-kg', 'revision': 'f5dbf83f-c89e-4e40-95ee-57957016089f'}, 'Published revision advanced; preserve and inspect')
    web = get('/api/publication/compatibility')
    digest = hashlib.sha256(json.dumps(web['capabilities'], sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    require(web['buildId'] == 'lNabFN3qBIdd5U2lV6e6A' and digest == 'a10cc7e0746b83272dccb99293b1f26754c8b860626f9a6208bf40525b11aa16', 'Public Web identity/capabilities advanced')


def wait_and_resume(helper, runner, *, wait_limit=900, pause=time.sleep, clock=time.monotonic,
                    probe_task=task_busy, probe_locks=None, invoke=None):
    deadline = clock() + wait_limit; next_notice = 0
    probe_locks = probe_locks or (lambda: busy_lock(helper))
    def update():
        public_vps_check()
        # The unchanged root applier repeats all before hashes, receipts and state under locks.
        # Avoid a second slow Task/CIM query between observing the idle window and taking them.
        return subprocess.run(['sudo', '/bin/bash', '-c', runner.operation(PACKAGE, 'wsl', PACKAGE, os.environ.get('WSL_INTEROP', ''))],
                              stdout=subprocess.PIPE, text=True)  # stdin/stderr stay on the operator terminal.
    invoke = invoke or update
    while clock() < deadline:
        busy = probe_locks()
        if busy or probe_task():
            if clock() >= next_notice:
                print(json.dumps({'waiting': 'existing-activity', 'lock': busy, 'locksHeldWhileWaiting': False,
                    'vpsRepeated': False, 'maximumWaitSeconds': wait_limit}), flush=True); next_notice = clock() + 30
            pause(min(2, max(0, deadline - clock()))); continue
        completed = invoke(); print(completed.stdout, end='', flush=True)
        result = child_result(completed.stdout)
        if completed.returncode == 0:
            require(result.get('target') == 'wsl' and result.get('signed') is False and result.get('applyCalls') == 0, 'Unexpected success result; inspect')
            return result
        require(completed.returncode == 1 and safe_lock_failure(result), 'WSL stopped outside the pre-update lock boundary; do not retry')
        print(json.dumps({'waiting': 'pre-update-lock-race', 'locksHeldWhileWaiting': False, 'vpsRepeated': False}), flush=True)
        pause(min(2, max(0, deadline - clock())))
    raise TimeoutError('Existing activity did not finish within 15 minutes; no forced stop or lock removal')


def main():
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    require(sha(ROOT / 'ops/run-publication-bundle2-update.py') == RUNNER_SHA, 'Runner fixed bytes differ')
    require(sha(PACKAGE / 'apply-publication-bundle2-update.py') == APPLIER_SHA
            and sha(PACKAGE / 'payload/OPERATOR_SHA256SUMS') == PAYLOAD_SHA, 'Existing fixed package differs')
    runner = load('bundle2_fixed_runner', ROOT / 'ops/run-publication-bundle2-update.py')
    # The fixed payload manifest binds the helper; verify its bytes before importing any payload code.
    applier = load('bundle2_fixed_applier', PACKAGE / 'apply-publication-bundle2-update.py')
    applier.checksum_set(PACKAGE / 'payload', PACKAGE / 'payload/OPERATOR_SHA256SUMS')
    helper = load('bundle2_existing_lock_helpers', PACKAGE / 'payload/film-publication-image-update.py')
    wait_and_resume(helper, runner)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'error': 'wsl-resume-stopped', 'errorType': type(error).__name__, 'reason': str(error)[:180],
                          'vpsRepeated': False, 'signed': False, 'applyCalls': 0}), flush=True)
        sys.exit(1)
