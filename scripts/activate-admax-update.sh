#!/usr/bin/env bash
# 審査用の掲載URLとSDK描画検出の修正。既存operatorでWebだけ更新する。
set -euo pipefail
[[ ${EUID} -eq 0 && $# -eq 0 ]] || { echo 'Usage: sudo bash activate-admax-update.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '別の本番構成操作が実行中です。未適用です。' >&2; exit 1; }

operator=graph-knowledge-ops:beta-credits-20261014
actual=$(docker image inspect "$operator" --format '{{.Id}} {{.Os}}/{{.Architecture}}')
case "$actual" in
  'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64'|'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64') ;;
  *) echo 'operatorが受入済みdigest／platformと異なります。未適用です。' >&2; exit 1 ;;
esac
docker tag "${actual%% *}" graph-knowledge-ops:beta-admax-review-20261015
# KG backup・readinessと、失敗時の旧Web復帰は既存の更新処理を使う。
bash "$bundle/scripts/update-production-web.sh" beta-admax-review-20261015 "$bundle/images.tar.gz"
echo 'AdMax修正Webを適用しました。Caddy・同意設定・KG・会員PG・認証設定は変更していません。'
echo 'plunode.netで広告を許可し、PC／実スマホでAdMaxのバナー表示と管理画面の審査状況を確認してください。'
