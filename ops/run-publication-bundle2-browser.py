import json
import os
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1]).resolve()
assert target.is_relative_to(root / '.local')
value = json.loads(target.read_text()); assert value['baseURL'] == 'http://127.0.0.1:3296'
env = {**os.environ, 'PUBLICATION_TEST_REVISION': value['revision'], 'PUBLICATION_TEST_RESULTS': str(target.parent / 'browser'),
       'LD_LIBRARY_PATH': '/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu'}
subprocess.run(['/home/isinxnisi/.nvm/versions/node/v24.15.0/bin/node', 'node_modules/@playwright/test/cli.js',
                'test', '--config', 'playwright.publication-bundle2.config.ts'], env=env, cwd=root, check=True)
