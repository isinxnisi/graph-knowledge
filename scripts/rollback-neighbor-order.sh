#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'sudoで実行してください。' >&2; exit 1; }
receipt=$(cd -- "$(dirname -- "$0")" && pwd)
[[ $receipt = /opt/graph-knowledge/neighbor-order-* ]] || { echo 'Run the receipt copy only.' >&2; exit 1; }
# Refuse to overwrite a later deployment/operator change.
sha256sum --check "$receipt/applied.sha256"
test -s "$receipt/previous-image"
docker image inspect "$(cat "$receipt/previous-image")" >/dev/null
cp -p "$receipt/app.env" /opt/graph-knowledge/app.env
cp -p "$receipt/compose.yaml" /opt/graph-knowledge/compose.yaml
docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml up -d --no-deps --pull never --wait --wait-timeout 180 web
curl --fail --silent http://127.0.0.1:3200/api/dataset
echo 'Previous Web restored; verify HTTPS. No DB rollback performed.'
