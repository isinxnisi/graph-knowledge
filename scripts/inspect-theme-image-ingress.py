#!/usr/bin/env python3
"""Read only aggregate Caddy and Web attachment diagnostics over the production SSH profile."""
import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path
import shlex

from production_ssh_terminal import run_ssh_terminal

ROOT = Path(__file__).resolve().parent.parent
CONNECTION = ROOT / '.local/publication-storage-production-20261119/release-inputs.json'
REMOTE = r'''
from collections import Counter
from datetime import datetime
import json
import subprocess
import sys

since, until = sys.argv[1:3]

def run(args):
    return subprocess.run(args, capture_output=True, text=True, errors='replace', timeout=60)

config = run(['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
access_configured = None
if config.returncode == 0:
    servers = json.loads(config.stdout).get('apps', {}).get('http', {}).get('servers', {})
    access_configured = any('logs' in server for server in servers.values())

start_epoch = str(int(datetime.fromisoformat(since).timestamp()))
end_epoch = str(int(datetime.fromisoformat(until).timestamp()))
journal = run(['journalctl', '--no-pager', '-q', '-u', 'caddy',
               '--since', '@'+start_epoch, '--until', '@'+end_epoch, '-o', 'cat'])
requests = Counter()
for line in journal.stdout.splitlines():
    try:
        row = json.loads(line)
    except ValueError:
        continue
    req = row.get('request', {})
    if (row.get('logger', '').startswith('http.log.access') and req.get('host') == 'plunode.net'
        and req.get('method') == 'POST' and req.get('uri', '').split('?')[0] == '/api/knowledge-collection/mcp'):
        status = row.get('status')
        if isinstance(status, int):
            requests[str(status)] += 1

web = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.service=web',
           '--filter', 'label=com.docker.compose.project.working_dir=/opt/graph-knowledge'])
containers = []
keys = ('Editorial image MCP received', 'Editorial image MCP stored', 'Editorial image MCP rejected',
        'Editorial attachment origin rejected', 'FILE_REFERENCE_INVALID', 'FILE_DOWNLOAD_UNAVAILABLE',
        'BLOCKED_FILE_REFERENCE')
for cid in web.stdout.splitlines():
    inspect = run(['docker', 'inspect', '--format', '{{.Created}}', cid])
    logs = run(['docker', 'logs', '--since', since, '--until', until, cid])
    lines = (logs.stdout + logs.stderr).splitlines() if logs.returncode == 0 else []
    containers.append({'created': inspect.stdout.strip() if inspect.returncode == 0 else None,
                       'logsReadable': logs.returncode == 0, 'lines': len(lines),
                       'matches': {key: sum(key in line for line in lines) for key in keys}})
print(json.dumps({'since': since, 'until': until,
                  'accessConfigured': access_configured,
                  'journalReadable': journal.returncode == 0,
                  'mcpPostsByStatus': dict(requests),
                  'webInventoryReadable': web.returncode == 0, 'web': containers},
                 ensure_ascii=False))
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--since', required=True, type=datetime.fromisoformat)
    parser.add_argument('--until', required=True, type=datetime.fromisoformat)
    args = parser.parse_args()
    if args.since.tzinfo is None or args.until.tzinfo is None or not timedelta(0) < args.until - args.since <= timedelta(days=4):
        parser.error('Specify a time zone and a window up to four days.')
    config = json.loads(CONNECTION.read_text())
    command = shlex.join(['sudo', 'python3', '-Es', '-c', REMOTE, args.since.isoformat(), args.until.isoformat()])
    print('VPSのsudoパスワードを端末へ入力してください。出力は集計だけです。', flush=True)
    run_ssh_terminal(config['options'], config['destination'], command)

if __name__ == '__main__':
    main()
