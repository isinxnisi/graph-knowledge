#!/usr/bin/env python3
"""Start existing read-only preview servers outside the invoking terminal (WSL/Linux)."""
import argparse
import fcntl
import json
import stat
import os
from pathlib import Path
import shutil
import socket
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / '.local/state/plunode-previews'
SERVICES = {
    'beta': (3200, ['--import', 'tsx', 'scripts/public-kg.ts', 'start']),
    'community': (3275, ['prototypes/community-connected/run.mjs']),
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
    if name == 'community' and not (Path.home() / '.local/share/plunode-community-connected/.next/BUILD_ID').is_file():
        raise SystemExit('Build the isolated community-connected preview first; see its README.')
    film = {}
    film_config = STATE / 'beta-film.json'
    confirmation_config = STATE / 'beta-confirmation.json'
    if name == 'beta' and film_config.exists() and confirmation_config.exists():
        raise ValueError('Choose trial or formal confirmation configuration, never both')
    if name == 'beta' and confirmation_config.exists():
        film_config = confirmation_config
    if name == 'beta' and film_config.exists():
        value = film_config.lstat()
        if film_config.is_symlink() or value.st_uid != os.getuid() or stat.S_IMODE(value.st_mode) != 0o600:
            raise ValueError('Private beta film configuration must be owned by this user and mode 0600')
        film = json.loads(film_config.read_text())
        if (set(film) != {'GRAPH_FILM_BETA','NEO4J_URI','NEO4J_USER','NEO4J_PASSWORD','NEO4J_DATABASE'}
            or (film['GRAPH_FILM_BETA'], film['NEO4J_URI']) !=
                (('0', 'bolt://127.0.0.1:7697') if film_config == confirmation_config else ('1', 'bolt://127.0.0.1:7696'))
            or film['NEO4J_USER'] != 'neo4j' or film['NEO4J_DATABASE'] != 'neo4j'
            or not isinstance(film['NEO4J_PASSWORD'], str) or not film['NEO4J_PASSWORD']):
            raise ValueError('Unexpected isolated film beta configuration')
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
        env.update(film)
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
