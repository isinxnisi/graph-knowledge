#!/usr/bin/env bash
# Controlled runtime experiment: lower only the current Web interface MTU.
# No host firewall/daemon changes, no DB/container restart. Undo on failed probe.
set -euo pipefail
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash repair-google-egress-mtu.sh' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
dc=(docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '別の会員構成操作が実行中です。' >&2; exit 1; }
"${dc[@]}" config --quiet
container=$("${dc[@]}" ps -q web)
[[ $container =~ ^[a-f0-9]{12,64}$ ]]
pid=$(docker inspect --format '{{.State.Pid}}' "$container")
[[ $pid =~ ^[0-9]+$ && $pid -gt 1 ]]
interface() {
  python3 -c 'import json,re,sys; rows=json.load(sys.stdin); assert len(rows)==1; name=rows[0]["dev"]; assert re.fullmatch(r"[a-zA-Z0-9_.:-]{1,15}",name); print(name)'
}
mtu() {
  python3 -c 'import json,sys; rows=json.load(sys.stdin); assert len(rows)==1; value=rows[0]["mtu"]; assert isinstance(value,int); print(value)'
}
host_if=$(ip -j -4 route show default | interface)
host_mtu=$(ip -j link show dev "$host_if" | mtu)
web_if=$(nsenter -t "$pid" -n ip -j -4 route show default | interface)
web_mtu=$(nsenter -t "$pid" -n ip -j link show dev "$web_if" | mtu)
[[ $host_mtu -ge 1280 && $host_mtu -le 1500 && $web_mtu -gt $host_mtu ]] || {
  echo 'この手順の対象となるMTU不一致がありません。変更していません。' >&2; exit 1;
}
changed=0
accepted=0
finish() {
  local result=$?
  if [[ $changed = 1 && $accepted = 0 ]]; then
    if [[ $(docker inspect --format '{{.State.Pid}}' "$container") = "$pid" ]]; then
      nsenter -t "$pid" -n ip link set dev "$web_if" mtu "$web_mtu"
      echo "Google疎通／readinessが成立しなかったため、Web MTUを$web_mtuへ戻しました。" >&2
    else
      echo 'Webが入れ替わったため旧namespaceへの復元は行いません。新Webの状態を確認してください。' >&2
    fi
  fi
  exit "$result"
}
trap finish EXIT
[[ $(docker inspect --format '{{.State.Pid}}' "$container") = "$pid" ]]
changed=1
nsenter -t "$pid" -n ip link set dev "$web_if" mtu "$host_mtu"
echo "現在のWebだけMTUを$web_mtu → $host_mtuに変更して疎通を検証します。"
probe=$(bash "$source_dir/diagnose-production-google.sh")
printf '%s\n' "$probe"
printf '%s\n' "$probe" | python3 -c 'import json,sys; x=json.loads(sys.stdin.readline()); assert all(x.get(k) is True for k in ["originMatches","clientIdMatches","clientSecretMatches"]); assert x.get("jwks",{}).get("status")==200; assert x.get("token",{}).get("status")==400 and x["token"].get("error")=="invalid_grant"'
[[ $(docker inspect --format '{{.State.Pid}}' "$container") = "$pid" ]]
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
accepted=1
echo 'Google疎通とKG readinessが成功しました。現在のWebのMTU変更を維持します。'
echo 'これは一時修正です。Web再作成後にも維持するネットワーク設定は別途適用が必要です。'
