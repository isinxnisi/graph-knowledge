#!/usr/bin/env bash
# 管理者による既存Webの更新。KG apply・DB再起動・Caddy変更は行わない。
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'sudoで実行してください。' >&2; exit 1; fi
if [[ $# -ne 2 || ! $1 =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$ ]]; then
  echo 'Usage: sudo bash update-production-web.sh IMAGE_TAG IMAGE_ARCHIVE.tar.gz' >&2; exit 1
fi
image_tag=$1
image_archive=$(realpath -- "$2")
env_file=/opt/graph-knowledge/app.env
test -f "$image_archive"; test -f "$image_archive.sha256"
test -f "$env_file"; test -f /opt/graph-knowledge/compose.yaml
(cd -- "$(dirname -- "$image_archive")" && sha256sum --check -- "$(basename -- "$image_archive").sha256")
docker load --input "$image_archive"
docker image inspect "graph-knowledge-web:$image_tag" "graph-knowledge-ops:$image_tag" >/dev/null
dc=(docker compose --env-file "$env_file" -f /opt/graph-knowledge/compose.yaml)
"${dc[@]}" config --quiet
# 既存operatorでKGを読み取りbackup。Web更新のための再投入はしない。
"${dc[@]}" run --rm --no-deps ops backup "/backups/before-web-$(date -u +%Y%m%dT%H%M%SZ).json"
env_previous=$(mktemp /opt/graph-knowledge/.env-before-web.XXXXXX)
cp -p "$env_file" "$env_previous"
changed=0
finish() {
  local result=$?
  if [[ $result -ne 0 && $changed = 1 ]]; then
    cp -p "$env_previous" "$env_file"
    echo 'Web更新が失敗したため、以前のimage設定へ戻します。' >&2
    "${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 180 web || echo '旧Webのreadinessも要確認です。' >&2
  fi
  rm -f -- "$env_previous"
  exit "$result"
}
trap finish EXIT
changed=1
python3 - "$env_file" "$image_tag" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
lines = path.read_text().splitlines()
assert sum(line.startswith('GRAPH_IMAGE_TAG=') for line in lines) == 1
path.write_text('\n'.join('GRAPH_IMAGE_TAG=' + sys.argv[2] if line.startswith('GRAPH_IMAGE_TAG=') else line for line in lines) + '\n')
PY
chmod 0600 "$env_file"
"${dc[@]}" config --quiet
"${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 180 web
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
"${dc[@]}" ps web graph-neo4j
echo 'Web更新完了。HTTPS・代表操作と既存サービスの継続稼働を確認してください。'
