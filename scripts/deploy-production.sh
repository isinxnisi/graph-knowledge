#!/usr/bin/env bash
# VPSで管理者が実行する初回配置。既存Caddyのsiteは残し、graphだけ追加する。
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'sudoで実行してください。' >&2; exit 1; fi
if [[ $# -ne 2 || ! $1 =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$ ]]; then
  echo 'Usage: sudo bash deploy-production.sh IMAGE_TAG IMAGE_ARCHIVE.tar.gz' >&2; exit 1
fi
deployment_source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image_tag=$1
image_archive=$(realpath -- "$2")
test -f "$image_archive"
test -f "$image_archive.sha256"
(cd -- "$(dirname -- "$image_archive")" && sha256sum --check -- "$(basename -- "$image_archive").sha256")
test -f "$deployment_source/compose.production.yaml"
test -f /etc/caddy/Caddyfile
command -v caddy >/dev/null
test "$(. /etc/os-release; echo "$ID:$VERSION_ID")" = 'ubuntu:24.04'
getent passwd develop >/dev/null
test "$(id -u develop)" = 1000
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y docker.io docker-compose-v2
fi
docker compose version >/dev/null
systemctl enable --now docker
install -d -o root -g root -m 0755 /opt/graph-knowledge
install -d -o develop -g develop -m 0700 /opt/graph-knowledge/backups
# 初回だけ生成。再実行でDB password・preview passwordを変えない。
if [[ ! -f /opt/graph-knowledge/app.env ]]; then
  python3 - "$image_tag" <<'PY'
import os, secrets, sys
from pathlib import Path
path = Path('/opt/graph-knowledge/app.env')
with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as out:
    out.write('NEO4J_PASSWORD=' + secrets.token_hex(24) + '\n')
    out.write('GRAPH_IMAGE_TAG=' + sys.argv[1] + '\nGRAPH_BACKUP_DIRECTORY=/opt/graph-knowledge/backups\n')
PY
fi
# imageのtag以外は既存設定を維持する。
python3 - "$image_tag" <<'PY'
import sys
from pathlib import Path
path = Path('/opt/graph-knowledge/app.env')
lines = path.read_text().splitlines()
assert sum(line.startswith('GRAPH_IMAGE_TAG=') for line in lines) == 1
path.write_text('\n'.join('GRAPH_IMAGE_TAG=' + sys.argv[1] if line.startswith('GRAPH_IMAGE_TAG=') else line for line in lines) + '\n')
PY
chmod 0600 /opt/graph-knowledge/app.env
install -m 0644 "$deployment_source/compose.production.yaml" /opt/graph-knowledge/compose.yaml
docker load --input "$image_archive"
dc=(docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml)
"${dc[@]}" config --quiet
"${dc[@]}" up -d --wait --wait-timeout 360 graph-neo4j
"${dc[@]}" run --rm ops validate
"${dc[@]}" run --rm ops plan
# 更新前backup。空DBではまだDatasetStateがないため初回は不要。
state_count=$("${dc[@]}" exec -T graph-neo4j bash -c 'cypher-shell --format plain -u neo4j -p "${NEO4J_AUTH#neo4j/}" "MATCH (s:DatasetState {id:\"public-kg\"}) RETURN count(s)"' | tail -n 1)
if [[ "$state_count" != 0 && "$state_count" != 1 ]]; then echo 'DatasetStateの確認に失敗しました。' >&2; exit 1; fi
if [[ "$state_count" = 1 ]]; then
  "${dc[@]}" run --rm ops backup "/backups/before-$(date -u +%Y%m%dT%H%M%SZ).json"
fi
"${dc[@]}" run --rm ops apply
"${dc[@]}" run --rm ops apply
"${dc[@]}" up -d --wait --wait-timeout 180 web
"${dc[@]}" run --rm ops backup "/backups/ready-$(date -u +%Y%m%dT%H%M%SZ).json"
# 初回site追加だけ。本公開のために認証を外す操作はこのscriptには含めない。
if [[ ! -f /etc/caddy/graph-knowledge.caddy ]]; then
  python3 <<'PY'
import os, pwd, secrets, subprocess
from pathlib import Path
password = secrets.token_urlsafe(24)
hashed = subprocess.run(['caddy', 'hash-password'], input=password + '\n', text=True, capture_output=True, check=True).stdout.strip()
assert hashed.startswith('$2')
snippet = 'graph.isinxnisi.net {\n    tls {\n        ca https://acme-v02.api.letsencrypt.org/directory\n    }\n    basicauth {\n        preview ' + hashed + '\n    }\n    header X-Robots-Tag "noindex, nofollow, noarchive"\n    reverse_proxy 127.0.0.1:3200\n}\n'
target = Path('/etc/caddy/graph-knowledge.caddy')
with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640), 'w') as out:
    out.write(snippet)
os.chown(target, 0, pwd.getpwnam('caddy').pw_gid)
login = Path('/home/develop/graph-preview-login.txt')
with os.fdopen(os.open(login, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as out:
    out.write('https://graph.isinxnisi.net\nUser: preview\nPassword: ' + password + '\n')
user = pwd.getpwnam('develop')
os.chown(login, user.pw_uid, user.pw_gid)
PY
fi
if ! grep -Fxq 'import /etc/caddy/graph-knowledge.caddy' /etc/caddy/Caddyfile; then
  if grep -q 'graph.isinxnisi.net' /etc/caddy/Caddyfile; then
    echo '既存graph siteを自動変更しません。Caddyfileを確認してください。' >&2; exit 1
  fi
  caddy_backup="/etc/caddy/Caddyfile.before-graph-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p /etc/caddy/Caddyfile "$caddy_backup"
  caddy_candidate=$(mktemp /etc/caddy/Caddyfile.graph.XXXXXX)
  cat /etc/caddy/Caddyfile > "$caddy_candidate"
  printf '\nimport /etc/caddy/graph-knowledge.caddy\n' >> "$caddy_candidate"
  caddy validate --config "$caddy_candidate" --adapter caddyfile
  chmod --reference=/etc/caddy/Caddyfile "$caddy_candidate"
  chown --reference=/etc/caddy/Caddyfile "$caddy_candidate"
  mv "$caddy_candidate" /etc/caddy/Caddyfile
  if ! systemctl reload caddy; then
    cp -p "$caddy_backup" /etc/caddy/Caddyfile
    systemctl reload caddy
    echo 'Caddyを元の設定へ戻しました。' >&2; exit 1
  fi
fi
"${dc[@]}" ps
echo '試験起動済み。previewログインは /home/develop/graph-preview-login.txt を確認してください。'
echo 'HTTPS・既存サービス・ブラウザを確認するまではstep7を完了扱いにしません。'
