#!/usr/bin/env bash
# Restore the previous preview boundary and Web; no KG/PG restore or restart.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 1 && $1 =~ ^/opt/graph-knowledge/public-rollbacks/beta-[a-zA-Z0-9]+$ ]] || { echo 'Usage: sudo bash rollback-public-beta.sh /opt/graph-knowledge/public-rollbacks/beta-ID' >&2; exit 1; }
saved=$1
for name in app.env compose.yaml site.caddy; do test -f "$saved/$name"; done
[[ $(stat -c %U "$saved") = root && $(stat -c %a "$saved") = 700 ]]
cp -p "$saved/site.caddy" /etc/caddy/graph-knowledge.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
cp -p "$saved/app.env" /opt/graph-knowledge/app.env
cp -p "$saved/compose.yaml" /opt/graph-knowledge/compose.yaml
docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml up -d --no-deps --pull never --wait --wait-timeout 180 web
echo '以前のCaddy境界・Webへ復帰しました。KG／会員PGは復元・再起動していません。HTTPSを確認してください。'
