#!/usr/bin/env bash
# Caddyのみの管理者適用。KG／PG／Web／他site／preview認証は保持する。
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash activate-plunode-origin.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '会員構成の別操作が実行中です。' >&2; exit 1; }
python3 - <<'PY'
import socket
addresses = {entry[4][0] for entry in socket.getaddrinfo('plunode.net', 443, type=socket.SOCK_STREAM)}
if addresses != {'153.115.17.82'}:
    raise SystemExit('plunode.net のA/AAAAが対象VPSだけを指すことを確認してください。Caddyは未変更です。')
PY
site=/etc/caddy/graph-knowledge.caddy
config=/etc/caddy/Caddyfile
test -f "$site"
[[ $(grep -Fxc 'import /etc/caddy/graph-knowledge.caddy' "$config") = 1 ]]
! grep -q 'plunode.net' "$config" || { echo '既存のPlunode設定を自動変更しません。' >&2; exit 1; }
candidate=$(mktemp -d /etc/caddy/plunode-candidate.XXXXXXXX)
trap 'rm -rf -- "$candidate"' EXIT
python3 "$bundle/scripts/prepare-plunode-caddy.py" "$site" "$candidate/site.caddy"
sed "s|^import /etc/caddy/graph-knowledge.caddy$|import $candidate/site.caddy|" "$config" > "$candidate/Caddyfile"
caddy validate --config "$candidate/Caddyfile" --adapter caddyfile
if cmp -s "$site" "$candidate/site.caddy"; then echo 'Plunode siteは適用済みです。'; exit 0; fi
backup=$(mktemp /etc/caddy/graph-knowledge.before-plunode.XXXXXXXX)
cp -p "$site" "$backup"
chmod --reference="$site" "$candidate/site.caddy"
chown --reference="$site" "$candidate/site.caddy"
mv -f "$candidate/site.caddy" "$site"
if ! systemctl reload caddy; then
  cp -p "$backup" "$site"
  systemctl reload caddy
  echo 'Caddy reload失敗。以前のpreview設定へ戻しました。' >&2
  exit 1
fi
echo "Plunode siteを追加しました。旧site控え: $backup"
echo 'HTTPS証明書／未認証401／認証後KGと既存serviceを確認してください。Google・会員PGはまだ有効化していません。'
