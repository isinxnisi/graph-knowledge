#!/usr/bin/env bash
# 暫定採用したDiscoveryを正式検索へ統合。Webだけを更新する。
set -euo pipefail
[[ ${EUID} -eq 0 && $# -eq 0 ]] || { echo 'Usage: sudo bash activate-discovery-search.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tag=beta-m3-discovery-20261017
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '別の本番構成操作が実行中です。未適用です。' >&2; exit 1; }
operator=graph-knowledge-ops:beta-credits-20261014
actual=$(docker image inspect "$operator" --format '{{.Id}} {{.Os}}/{{.Architecture}}')
case "$actual" in
  'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64'|'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64') ;;
  *) echo 'operatorが受入済みdigest／platformと異なります。未適用です。' >&2; exit 1 ;;
esac
docker load --input "$bundle/images.tar.gz"
web=$(docker image inspect "graph-knowledge-web:$tag" --format '{{.Id}} {{.Os}}/{{.Architecture}}')
python3 - "$bundle/manifest.json" "$tag" "$web" <<'PY'
import json, sys
meta=json.load(open(sys.argv[1]))
identity, platform=sys.argv[3].split()
assert meta['tag']==sys.argv[2] and platform=='linux/amd64'
assert identity in meta['allowedWebImageIds'], '検証済みWeb imageと一致しません。未適用です。'
PY
docker tag "${actual%% *}" "graph-knowledge-ops:$tag"
dc=(docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml)
"${dc[@]}" config --quiet
mapfile -t db_ids < <("${dc[@]}" ps -q graph-neo4j graph-member-postgres | sort)
[[ ${#db_ids[@]} -eq 2 ]] || { echo '既存DBを確認できません。未適用です。' >&2; exit 1; }
before_db=$(docker inspect --format '{{.Id}} {{.State.StartedAt}}' "${db_ids[@]}")
revision() { curl -fsS --max-time 30 https://plunode.net/api/dataset | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["dataset"]=="public-kg"; print(d["revision"])'; }
before_revision=$(revision)
before_member=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' https://plunode.net/api/member/status)
[[ "$before_member" = 200 ]] || { echo '既存会員statusが正常ではありません。未適用です。' >&2; exit 1; }
applied=0
finish() {
  result=$?
  if [[ $result -ne 0 && $applied = 1 ]]; then
    echo 'Webは更新済みですが事後確認に失敗しました。旧Webへ戻った状態ではありません。確認が必要です。' >&2
  fi
  exit "$result"
}
trap finish EXIT
bash "$bundle/scripts/update-production-web.sh" "$tag" "$bundle/images.tar.gz"
applied=1
mapfile -t after_ids < <("${dc[@]}" ps -q graph-neo4j graph-member-postgres | sort)
[[ "${db_ids[*]}" = "${after_ids[*]}" ]]
[[ "$before_db" = "$(docker inspect --format '{{.Id}} {{.State.StartedAt}}' "${after_ids[@]}")" ]]
[[ "$before_revision" = "$(revision)" ]] || { echo 'KG revisionが変化しています。確認が必要です。' >&2; exit 1; }
[[ "$before_member" = "$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' https://plunode.net/api/member/status)" ]]
python3 - "$bundle/manifest.json" <<'PY'
import json, sys, urllib.request
meta=json.load(open(sys.argv[1]))
for path in ['/', '/en', '/member']:
    with urllib.request.urlopen('https://plunode.net'+path, timeout=30) as response:
        html=response.read().decode()
    assert meta['buildId'] in html, path+' build mismatch'
    if path!='/member':
        assert 'data-discovery-launch="home"' in html and 'data-testid="discovery-search-entry"' in html
        assert 'data-testid="discovery-prototype-entry"' not in html
    else:
        assert 'name="robots" content="noindex' in html
print('正式HTTPSの日英検索入口・build一致・会員noindexを確認しました。')
PY
[[ $(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' https://graph.isinxnisi.net/api/dataset) = 401 ]]
systemctl is-active --quiet docker caddy resale-ebay-notifications
printf 'Web更新完了。KG revision維持: %s。Neo4j／会員PGのcontainer・起動時刻を維持しました。\n' "$before_revision"
echo '日英・PC／スマホの検索→条件変更→結果→Graph→Backは、配置後にブラウザで確認してください。'
