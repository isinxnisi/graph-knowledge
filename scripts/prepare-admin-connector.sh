#!/usr/bin/env bash
# Run on the VPS as root, after reviewing existing connectors. Never starts one.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with administrator sudo on the VPS.' >&2; exit 1; }
[[ $(. /etc/os-release; echo "$ID:$VERSION_ID") == ubuntu:24.04 ]] || { echo 'Expected Ubuntu 24.04' >&2; exit 1; }
command -v docker >/dev/null
containers=$(docker ps -a --format '{{.Image}} {{.Names}}')
if command -v cloudflared >/dev/null || pgrep -x cloudflared >/dev/null \
  || systemctl list-unit-files --no-legend 'cloudflared*' | grep -q cloudflared \
  || grep -qi cloudflared <<< "$containers"; then
  echo 'Existing connector detected. Inspect and plan reuse; no changes made.' >&2; exit 1
fi
for file in /usr/share/keyrings/cloudflare-main.gpg /etc/apt/sources.list.d/cloudflared.list /etc/systemd/system/cloudflared-plunode-admin.service; do
  [[ ! -e $file ]] || { echo "Existing path: $file; refusing overwrite" >&2; exit 1; }
done
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ -f $source_dir/ops/cloudflared-plunode-admin.service ]]
free -m
df -h /
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
chmod 0644 /usr/share/keyrings/cloudflare-main.gpg
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
apt-get update -o Dir::Etc::sourcelist=sources.list.d/cloudflared.list -o Dir::Etc::sourceparts=- -o APT::Get::List-Cleanup=0
# --no-upgrade avoids modifying an installation introduced concurrently.
apt-get install --no-install-recommends --no-upgrade -y cloudflared
cloudflared version
cloudflared tunnel run --help | grep -q -- --token-file
install -d -o root -g root -m 0700 /etc/cloudflared
install -o root -g root -m 0644 "$source_dir/ops/cloudflared-plunode-admin.service" /etc/systemd/system/cloudflared-plunode-admin.service
systemd-analyze verify /etc/systemd/system/cloudflared-plunode-admin.service
systemctl daemon-reload
systemctl is-enabled cloudflared-plunode-admin.service || true
free -m
echo 'Prepared only. No token written, service enabled/started, firewall, Caddy or DB changed.'
