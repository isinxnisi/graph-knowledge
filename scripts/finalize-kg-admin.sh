#!/usr/bin/env bash
# Enable persistence only after real Access/UI and origin-bypass checks passed.
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 0 ]] || { echo 'Run this reviewed script with administrator sudo, without arguments.' >&2; exit 1; }
app=/opt/graph-knowledge
[[ -f $app/kg-admin.env && -f $app/compose.kg-admin.yaml ]]
exec 9>"$app/.kg-admin-deployment.lock"
flock -n 9 || { echo 'Another management deployment is running.' >&2; exit 1; }
# Read root-only journal in memory. Print only the management route's protection
# booleans, never whole configuration, connection tokens or request headers.
python3 - <<'PY'
import json, shlex, subprocess
configs = []
raw = subprocess.check_output(['journalctl','-u','cloudflared-plunode-admin','--no-pager','-n','2000','-o','json'], text=True)
for line in raw.splitlines():
    message = json.loads(line).get('MESSAGE','')
    if not isinstance(message, str):
        continue
    candidate = None
    try:
        data = json.loads(message)
        candidate = data.get('config') if isinstance(data, dict) else None
    except (ValueError, TypeError):
        try:
            for field in shlex.split(message):
                if field.startswith('config='):
                    candidate = field[len('config='):]
        except ValueError:
            continue
    try:
        config = json.loads(candidate) if isinstance(candidate, str) else candidate
    except ValueError:
        continue
    if isinstance(config, dict) and 'ingress' in config:
        configs.append(config)
assert configs, 'No applied Tunnel ingress configuration in journal; do not enable yet'
config = configs[-1]
routes = [r for r in config['ingress'] if r.get('hostname') == 'plunode-admin.isinxnisi.com']
assert len(routes) == 1, 'Management ingress is missing or ambiguous'
route = routes[0]
access = route.get('originRequest',{}).get('access',config.get('originRequest',{}).get('access',{}))
proof = {
    'managementOrigin': route.get('service') == 'http://127.0.0.1:3210',
    'protectWithAccess': access.get('required') is True,
    'teamMatches': access.get('teamName') == 'isinxnisi',
    'audienceMatches': 'e6e1f9a366c95729f65103b47bd1a3287e09aa26e3c50f663b393eae3554693c' in access.get('audTag',[]),
    'catchAll404': config['ingress'][-1].get('service') == 'http_status:404',
}
print(json.dumps(proof))
assert all(proof.values()), 'Tunnel protection configuration must be corrected before persistence'
PY
dc=(docker compose --env-file "$app/app.env" --env-file "$app/kg-admin.env" -f "$app/compose.yaml" -f "$app/compose.kg-admin.yaml" --profile kg-admin)
"${dc[@]}" config --quiet
mapfile -t preserved < <("${dc[@]}" ps -q web graph-neo4j graph-member-postgres kg-admin)
[[ ${#preserved[@]} -ge 3 ]]
receipt=$(mktemp -d "$app/kg-admin-finalize-XXXXXXXX")
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' "${preserved[@]}" > "$receipt/containers.before"
[[ $(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:20252/ready) == 200 ]]
[[ $(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -H 'Host: plunode-admin.isinxnisi.com' http://127.0.0.1:3210/api/kg-admin) == 404 ]]
systemctl enable cloudflared-plunode-admin
systemctl restart cloudflared-plunode-admin
ready=0
for attempt in $(seq 1 40); do
  if [[ $(curl -s --max-time 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:20252/ready || true) == 200 ]]; then ready=1; break; fi
  sleep 1
done
[[ $ready == 1 ]] || { echo 'Connector did not reconnect; inspect its protected journal.' >&2; exit 1; }
systemctl is-enabled cloudflared-plunode-admin
systemctl show cloudflared-plunode-admin -p ActiveState -p SubState -p MemoryCurrent -p CPUUsageNSec -p Restart -p MemoryMax
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' "${preserved[@]}" > "$receipt/containers.after"
cmp "$receipt/containers.before" "$receipt/containers.after"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' "$("${dc[@]}" ps -q kg-admin)"
free -m
echo "Connector enabled, restarted and reconnected; application/DB containers preserved. Receipt: $receipt"
echo 'Repeat the real authenticated management request after this restart.'
