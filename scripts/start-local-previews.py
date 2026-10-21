#!/usr/bin/env python3
"""Start existing read-only preview servers outside the invoking terminal (WSL/Linux)."""
import argparse
import fcntl
import os
from pathlib import Path
import shutil
import socket
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / '.local/state/plunode-previews'
SERVICES = {
    'beta': (3200, ['--import', 'tsx', 'scripts/public-kg.ts', 'start']),
    'community': (3275, ['prototypes/community/server.mjs', '--tunnel']),
}


def listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            return True
    except OSError:
        return False


def start(name, node):
    port, args = SERVICES[name]
    if listening(port):
        raise SystemExit(f'{port} is already occupied; inspect its owner. Nothing stopped.')
    if name == 'beta' and not (ROOT / '.next-public/BUILD_ID').is_file():
        raise SystemExit('Verified .next-public build required; no automatic build or DB action.')
    log = STATE / f'{name}.log'
    pidfile = STATE / f'{name}.pid'
    pid = os.fork()
    if pid == 0:
        os.setsid()
        if os.fork() != 0:
            os._exit(0)
        os.chdir(ROOT)
        os.umask(0o077)
        with open('/dev/null', 'rb') as stdin, open(log, 'ab', buffering=0) as output:
            os.dup2(stdin.fileno(), 0)
            os.dup2(output.fileno(), 1)
            os.dup2(output.fileno(), 2)
        pidfile.write_text(str(os.getpid()) + '\n')
        env = dict(os.environ)
        env['NEO4J_READ_TIMEOUT_MS'] = '10000'
        try:
            os.execve(node, [node, *args], env)
        except Exception as error:
            print(str(error), flush=True)
            os._exit(1)
    os.waitpid(pid, 0)
    for _ in range(100):
        if listening(port):
            print(f'{name}: listening on 127.0.0.1:{port}; log={log}')
            return
        time.sleep(0.1)
    raise SystemExit(f'{name}: did not start; inspect {log}. No processes were killed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=[*SERVICES, 'all'])
    parser.add_argument('--node', default=shutil.which('node') or '/tmp/graph-knowledge-node/bin/node')
    options = parser.parse_args()
    node = str(Path(options.node).resolve())
    if not os.access(node, os.X_OK):
        raise SystemExit('Provide an executable Node 24 path with --node.')
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Serialize this launcher's starts. Lock FD is closed by exec; no service lock persists.
    with open(STATE / 'start.lock', 'w') as gate:
        fcntl.flock(gate, fcntl.LOCK_EX)
        for service in SERVICES if options.service == 'all' else [options.service]:
            start(service, node)
