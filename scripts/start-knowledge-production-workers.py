#!/usr/bin/env python3
"""Resume the two PC workers against the formal HTTPS API, without DB access."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import stat
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / '.local/state/plunode-previews/production'


def private_json(file):
    value = file.lstat()
    if file.is_symlink() or not stat.S_ISREG(value.st_mode) or value.st_uid != os.getuid() or stat.S_IMODE(value.st_mode) != 0o600 or value.st_size > 32000:
        raise ValueError('Private formal worker file ownership or mode differs')
    return json.loads(file.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True)
    parser.add_argument('--check', action='store_true', help='Validate local files only; send no API or AI requests')
    options = parser.parse_args()
    node = Path(options.node).resolve()
    if not os.access(node, os.X_OK):
        raise SystemExit('Provide an executable Node 24 path')
    profile_file = STATE / 'deployment.json'
    if not profile_file.exists():
        raise SystemExit('Formal PC workers are not configured')
    profile = private_json(profile_file)
    if profile['environment'] != 'production' or profile['origin'] != 'https://plunode.net' or set(profile['capabilities']) != {'collector', 'reader'}:
        raise ValueError('Expected the two formal outbound-only worker capabilities')
    if STATE.is_symlink() or STATE.stat().st_uid != os.getuid() or stat.S_IMODE(STATE.stat().st_mode) != 0o700:
        raise ValueError('Private formal worker directory required')
    # Do not inherit the beta or member DB environment from its launcher.
    env = {k: v for k, v in os.environ.items() if not k.startswith(('KNOWLEDGE_', 'MEMBER_', 'NEO4J_', 'GRAPH_'))}
    env.update(NODE_ENV='production', GRAPH_DEPLOYMENT='production', KNOWLEDGE_RUNTIME='production',
               KNOWLEDGE_PUBLIC_ORIGIN='https://plunode.net', KNOWLEDGE_DEPLOYMENT_CONFIG=str(profile_file))
    services = [
        ('collection', 'scripts/knowledge-collection-worker.ts', 'collection-client.json', 'capture'),
        ('reader', 'scripts/knowledge-collection-reader.ts', 'collection-reader-client.json', 'reader'),
    ]
    for _, _, name, directory in services:
        config = private_json(STATE / name)
        if config['origin'] != profile['origin'] or config['stateDirectory'] != str(STATE / directory):
            raise ValueError('Formal endpoint or checkpoint directory differs')
    if options.check:
        print('Formal PC profiles validated. No API, AI, DB or process changes.')
        return
    with (STATE / 'start.lock').open('w') as gate:
        fcntl.flock(gate, fcntl.LOCK_EX)
        for name, script, config, _ in services:
            pidfile = STATE / (name + '.pid')
            if pidfile.exists():
                proc = Path('/proc') / pidfile.read_text().strip()
                if (proc / 'cmdline').exists() and (proc / 'cmdline').read_bytes():
                    command = (proc / 'cmdline').read_bytes()
                    if (proc / 'cwd').resolve() != ROOT or script.encode() not in command or str(STATE / config).encode() not in command:
                        raise ValueError('Existing PID belongs to another worker')
                    print(name + ': already running')
                    continue
            log = STATE / (name + '.log')
            with log.open('ab') as output:
                log.chmod(0o600)
                child = subprocess.Popen([str(node), '--import', 'tsx', script, '--config', str(STATE / config)],
                                         cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                         stdout=output, stderr=output, start_new_session=True)
            pidfile.write_text(str(child.pid))
            pidfile.chmod(0o600)
            time.sleep(0.2)
            if child.poll() is not None:
                raise RuntimeError(name + ' did not start; inspect the private worker log')
            print(name + ': started against https://plunode.net')


if __name__ == '__main__':
    main()
