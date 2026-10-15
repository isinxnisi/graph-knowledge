#!/usr/bin/env bash
# 広告と共通設定・プライバシー入口の配置修正。既存operatorでWebだけ更新する。
set -euo pipefail
[[ ${EUID} -eq 0 && $# -eq 0 ]] || { echo 'Usage: sudo bash activate-privacy-layout.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '別の本番構成操作が実行中です。未適用です。' >&2; exit 1; }
# 地域判定はCaddy既定の上書きXFFを信頼する。独自proxy信頼設定を黙って許容しない。
python3 - <<'PY'
from pathlib import Path
import re
for name in ['/etc/caddy/Caddyfile', '/etc/caddy/graph-knowledge.caddy']:
    text = Path(name).read_text()
    if re.search(r'(?mi)^\s*(?:trusted_proxies\b|header_up\s+[+-]?(?:X-Forwarded-For\b|\*))', text):
        raise SystemExit('地域判定前提と異なるCaddy proxy設定です。未適用です。')
print('接続元IPは既存Caddyの標準XFF上書きを使用します。Caddy変更なし。')
PY

operator=graph-knowledge-ops:beta-credits-20261014
actual=$(docker image inspect "$operator" --format '{{.Id}} {{.Os}}/{{.Architecture}}')
case "$actual" in
  'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64'|'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64') ;;
  *) echo 'operatorが受入済みdigest／platformと異なります。未適用です。' >&2; exit 1 ;;
esac
docker tag "${actual%% *}" graph-knowledge-ops:beta-privacy-layout-20261015
# KG backup・readinessと、失敗時の旧Web復帰は既存の更新処理を使う。
bash "$bundle/scripts/update-production-web.sh" beta-privacy-layout-20261015 "$bundle/images.tar.gz"
echo '広告と共通設定の配置を修正したWebを適用しました。Caddy・KG・会員PG・認証設定は変更していません。'
echo 'plunode.netの日本からの初回訪問で広告の標準表示を確認してください。海外・地域不明は許可後です。以前のOFF設定は維持します。'
