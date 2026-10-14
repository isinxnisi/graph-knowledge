#!/usr/bin/env bash
# beta-ui-balance-20261014専用。受入済みoperatorを再利用してWebだけを更新する。
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'sudoで実行してください。' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "$0")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)

# 受入済みcredits archive（fec70291…）内で両blobのSHA-256と参照を確認済み。
# Dockerのimage storeにより.Idはconfigまたはmanifestを指す。tag名だけでは通さない。
operator=graph-knowledge-ops:beta-credits-20261014
config_digest=sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a
manifest_digest=sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed
actual=$(docker image inspect "$operator" --format '{{.Id}} {{.Os}}/{{.Architecture}}')
case "$actual" in
  "$config_digest linux/amd64"|"$manifest_digest linux/amd64") ;;
  *)
    printf '既存operatorが受入済みのconfig／manifestと一致しません。未適用です。確認値: %s\n' "$actual" >&2
    exit 1
    ;;
esac
printf '受入済みoperatorを確認: %s\n' "$actual"
# 照合後もtagの付替えに影響されないよう、確認した不変IDで再利用する。
docker tag "${actual%% *}" graph-knowledge-ops:beta-ui-balance-20261014
exec bash "$bundle/scripts/update-production-web.sh" beta-ui-balance-20261014 "$bundle/images.tar.gz"
