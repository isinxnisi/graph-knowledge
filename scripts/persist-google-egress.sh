#!/usr/bin/env bash
# Add a project-scoped egress bridge; recreate Web only, preserve both DBs.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash persist-google-egress.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
app=/opt/graph-knowledge
compose=$app/compose.yaml
env_file=$app/app.env
exec 9>"$app/.member-activation.lock"
flock -n 9 || { echo '別の会員構成操作が実行中です。' >&2; exit 1; }
cmp -s "$compose" "$bundle/compose.before-egress.yaml" || cmp -s "$compose" "$bundle/compose.production.yaml" || {
  echo '稼働Composeに独自変更があります。上書きせず停止します。' >&2; exit 1;
}
api=$(docker version --format '{{.Server.APIVersion}}')
python3 -c 'import sys; assert tuple(map(int,sys.argv[1].split("."))) >= (1,48)' "$api"
dc=(docker compose --env-file "$env_file" -f "$compose" --profile member)
"${dc[@]}" config --quiet
docker compose --env-file "$env_file" -f "$bundle/compose.production.yaml" --profile member config --quiet
interface() {
  python3 -c 'import json,re,sys; x=json.load(sys.stdin); assert len(x)==1; n=x[0]["dev"]; assert re.fullmatch(r"[a-zA-Z0-9_.:-]{1,15}",n); print(n)'
}
host_if=$(ip -j -4 route show default | interface)
host_mtu=$(ip -j link show dev "$host_if" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["mtu"])')
target_mtu=$(python3 - "$env_file" <<'PY'
from pathlib import Path
import sys
values=[x.partition('=')[2] for x in Path(sys.argv[1]).read_text().splitlines() if x.startswith('GRAPH_EGRESS_MTU=')]
assert len(values)<=1
value=values[0] if values else '1442'
assert value.isdecimal() and 1280<=int(value)<=1500
print(value)
PY
)
[[ $host_mtu = "$target_mtu" ]] || { echo '回線MTUと永続設定が一致しません。未変更です。' >&2; exit 1; }
if docker network inspect graph-knowledge-production_web-egress >/dev/null 2>&1; then
  [[ $(docker network inspect --format '{{index .Options "com.docker.network.driver.mtu"}}' graph-knowledge-production_web-egress) = "$target_mtu" ]] || {
    echo '既存egress networkのMTUが異なります。作り直さず停止します。' >&2; exit 1;
  }
fi
identity() { docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$("${dc[@]}" ps -q "$1")"; }
neo4j_before=$(identity graph-neo4j)
pg_before=$(identity graph-member-postgres)
web_pid=$(docker inspect --format '{{.State.Pid}}' "$("${dc[@]}" ps -q web)")
web_if=$(nsenter -t "$web_pid" -n ip -j -4 route show default | interface)
web_mtu=$(nsenter -t "$web_pid" -n ip -j link show dev "$web_if" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["mtu"])')
revision() {
  "${dc[@]}" exec -T web node --input-type=module -e 'const r=await fetch("http://127.0.0.1:3000/api/dataset");if(!r.ok)throw Error("KG unavailable");console.log((await r.json()).revision);'
}
revision_before=$(revision)
install -d -m 0700 "$app/member-rollbacks"
backup=$(mktemp -d "$app/member-rollbacks/egress-XXXXXXXX")
cp -p "$compose" "$backup/compose.yaml"
"${dc[@]}" run --rm --no-deps ops backup "/backups/before-$(basename "$backup").json"
"${dc[@]}" exec -T graph-member-postgres pg_dump -U postgres -d graph_member -Fc > "$backup/member-before.dump"
test -s "$backup/member-before.dump"
changed=0
finish() {
  local result=$?
  if [[ $result -ne 0 && $changed = 1 ]]; then
    install -m 0644 "$backup/compose.yaml" "$compose"
    if "${dc[@]}" up -d --no-deps --force-recreate --pull never --wait --wait-timeout 180 web; then
      local restored_pid restored_if
      restored_pid=$(docker inspect --format '{{.State.Pid}}' "$("${dc[@]}" ps -q web)")
      restored_if=$(nsenter -t "$restored_pid" -n ip -j -4 route show default | interface)
      nsenter -t "$restored_pid" -n ip link set dev "$restored_if" mtu "$web_mtu" || echo '一時MTUの復元を要確認です。' >&2
    else echo '旧Webのreadinessも要確認です。' >&2; fi
    echo '失敗したため以前のComposeへ戻し、Webと一時MTUの復旧を試みました。上記エラーがあれば要確認です。DB・volumeは保持しています。' >&2
  fi
  exit "$result"
}
trap finish EXIT
changed=1
install -m 0644 "$bundle/compose.production.yaml" "$compose"
"${dc[@]}" up -d --no-deps --force-recreate --pull never --wait --wait-timeout 180 web
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
[[ $(revision) = "$revision_before" ]]
[[ $(identity graph-neo4j) = "$neo4j_before" && $(identity graph-member-postgres) = "$pg_before" ]]
"${dc[@]}" exec -T web node --input-type=module -e 'import fs from "node:fs"; const r=fs.readFileSync("/proc/net/route","utf8").trim().split("\n").slice(1).map(x=>x.trim().split(/\s+/)).filter(x=>x[1]==="00000000");if(r.length!==1||fs.readFileSync("/sys/class/net/"+r[0][0]+"/mtu","utf8").trim()!==process.argv[1])throw Error("Egress MTU mismatch");console.log("Web default-route MTU:",process.argv[1]);' "$target_mtu"
probe=$(bash "$bundle/scripts/diagnose-production-google.sh")
printf '%s\n' "$probe"
printf '%s\n' "$probe" | python3 -c 'import json,sys; x=json.loads(sys.stdin.readline()); assert all(x.get(k) is True for k in ["originMatches","clientIdMatches","clientSecretMatches"]); assert x.get("jwks",{}).get("status")==200; assert x.get("token",{}).get("status")==400 and x["token"].get("error")=="invalid_grant"'
echo "専用egress MTUの永続設定を適用。DB再起動なし・KG revision維持・Google疎通を確認。private控え: $backup"
echo 'HTTPSでログイン状態・保存したCapsuleの再訪を確認してください。'
