#!/usr/bin/env bash
# Read-only runtime/transport probe; a fake code never creates a user/session.
set -euo pipefail
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash diagnose-production-google.sh' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
credential=/home/develop/graph-production-plunode-20261014/google-web.json
dc=(docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml)
"${dc[@]}" config --quiet
# Only digests cross this private pipe. No secrets in argv, output or temp files.
python3 - "$credential" <<'PY' | "${dc[@]}" exec -T -e PLUNODE_DIAGNOSTIC_RUN=1 web node --input-type=module -e "$(cat "$source_dir/diagnose-google-token.mjs")"
from pathlib import Path
import hashlib,json,sys
try:
    path=Path(sys.argv[1])
    if path.stat().st_mode & 0o077: raise ValueError()
    web=json.loads(path.read_text())['web']
    print(json.dumps({name+'Hash':hashlib.sha256(web[key].encode()).hexdigest() for name,key in [('clientId','client_id'),('clientSecret','client_secret')]}))
except Exception:
    print('private credentialの確認に失敗しました。詳細値は表示しません。',file=sys.stderr)
    sys.exit(1)
PY
