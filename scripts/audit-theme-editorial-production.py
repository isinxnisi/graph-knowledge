#!/usr/bin/env python3
"""Run the interactive VPS audit for the theme editorial release from this PC."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
from uuid import uuid4

from production_release_plan import validate_ledgers
from production_ssh_terminal import run_ssh_terminal

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / '.local/theme-admin-20261120'
CONNECTION = ROOT / '.local/publication-storage-production-20261119/release-inputs.json'
REMOTE_SOURCE = '/home/develop/plunode-knowledge-retention-20261119/f10c99952768'
SOURCE = 'f852a3db642ae91e0b870fe561034e3f648c5f9a'
FILES = ('production_release.py', 'production_release_plan.py',
         'production_release_bundle.py', 'production_image_verification.py')


def audit_command(remote_json):
    checks = []
    for name in FILES:
        source = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{SOURCE}:scripts/{name}'])
        checks.append(f'{hashlib.sha256(source).hexdigest()}  {name}')
    steps = [
        'set -eu',
        'umask 077',
        'stage=$(mktemp -d /root/plunode-theme-audit.XXXXXXXX)',
    ]
    for name in FILES:
        steps.append(f'install -m 0600 {shlex.quote(REMOTE_SOURCE + "/" + name)} "$stage/{name}"')
    steps += ['cd "$stage"', "sha256sum --strict --status --check - <<'CHECKSUMS'",
              *checks, 'CHECKSUMS', 'exec python3 -Es ./production_release.py audit']
    program = shlex.quote('\n'.join(steps))
    return f'set -eu; umask 077; sudo /bin/bash -c {program} > {remote_json}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=LOCAL / 'baseline.json')
    output = parser.parse_args().output
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if output.exists():
        raise ValueError(f'既存の監査JSONがあります。別名に保管してから再実行してください。 {output}')
    connection = json.loads(CONNECTION.read_text())
    options, destination = connection['options'], connection['destination']
    remote_json = f'"$HOME"/plunode-theme-baseline.{uuid4().hex}.json'
    print('VPSのsudoパスワードを、このPowerShellの端末に入力してください。', flush=True)
    run_ssh_terminal(options, destination, audit_command(remote_json))

    # Retrieve stdout without a PTY, keeping terminal prompts out of the JSON.
    fetched = subprocess.run(['ssh', '-T', *options, destination, f'cat -- {remote_json}'],
                             check=True, capture_output=True).stdout
    baseline = json.loads(fetched)
    if set(baseline) != {'build', 'services', 'composeSha256', 'envSha256', 'ledgers'}:
        raise ValueError('監査JSONの形式が共通本番公開手順と異なります。')
    validate_ledgers(baseline['ledgers'])
    with open(output, 'xb', opener=private_file) as stream:
        stream.write(fetched)
    print(f'監査JSONを保存しました。 {output}')


def private_file(path, flags):
    return os.open(path, flags, 0o600)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(f'監査を完了できませんでした。コマンドの終了コード {error.returncode}', file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError) as error:
        print(f'監査を完了できませんでした。 {error}', file=sys.stderr)
        sys.exit(1)
