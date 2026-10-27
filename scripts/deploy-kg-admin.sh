#!/usr/bin/env bash
# Issue #52 first installation of the fixed, independently tested admin image.
# Run on the VPS as root from the reviewed deployment bundle; no public restart.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Administrator sudo is required.' >&2; exit 1; }
[[ $# -eq 0 ]] || { echo 'This fixed deployment does not accept arguments.' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
app=/opt/graph-knowledge
tag=issue52-20261027
image=sha256:2f9f970e38b72e0bd6b9770b9408c37f7e67fa2f96a19147f94fb1071f6daffa
manifest=sha256:a98290ac6ef75473e219f604058d7e68120f2ba250fd83d8418894987c4a9c31
archive=$bundle/graph-knowledge-web-issue52-20261027.tar.gz
assert_image() {
  local actual
  actual=$(docker image inspect "graph-knowledge-web:$tag" --format '{{.Id}}')
  # Docker's classic image store reports the config digest; its containerd
  # store can report the OCI manifest digest. Both are pinned from this archive.
  [[ $actual == "$image" || $actual == "$manifest" ]] || { echo "Unexpected image identity: $actual" >&2; exit 1; }
  [[ $(docker image inspect "graph-knowledge-web:$tag" --format '{{.Os}}/{{.Architecture}}') == linux/amd64 ]]
  echo "Verified image identity: $actual"
}
[[ -f $app/app.env && -f $app/compose.yaml && -f $archive ]]
[[ ! -e $app/compose.kg-admin.yaml && ! -e $app/kg-admin.env ]] || {
  echo 'Existing management configuration detected; inspect it before retrying.' >&2; exit 1;
}
[[ -z $(ss -H -ltn 'sport = :3210') ]] || { echo 'Port 3210 is already occupied.' >&2; exit 1; }
systemctl is-active --quiet cloudflared-plunode-admin
exec 9>"$app/.kg-admin-deployment.lock"
flock -n 9 || { echo 'Another management deployment is running.' >&2; exit 1; }
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
printf '%s  %s\n' e4c7ca77bd92f5cecbe08cc7c702b238fab9e88ad4e8b2b13cb6784841606e48 "$archive" | sha256sum --check
[[ $(sha256sum "$bundle/compose.kg-admin.yaml" | cut -d ' ' -f1) == e3e4a5ebc7d24ea35dbe1b96826d734e41a1f252efe59b11e3d68a02da0bee27 ]]
python3 - "$bundle/kg-admin.env" <<'PY'
import re, sys
from pathlib import Path
values = dict(line.split('=', 1) for line in Path(sys.argv[1]).read_text().splitlines() if line)
assert values == {
    'KG_ADMIN_IMAGE_TAG': 'issue52-20261027',
    'KG_ADMIN_ACCESS_TEAM': 'isinxnisi',
    'KG_ADMIN_ACCESS_AUD': 'e6e1f9a366c95729f65103b47bd1a3287e09aa26e3c50f663b393eae3554693c',
}, 'Unexpected Access configuration'
assert re.fullmatch(r'[a-f0-9]{64}', values['KG_ADMIN_ACCESS_AUD'])
PY
if docker image inspect "graph-knowledge-web:$tag" >/dev/null 2>&1; then
  assert_image
else
  docker load --input "$archive"
fi
assert_image
base=(docker compose --env-file "$app/app.env" -f "$app/compose.yaml")
dc=(docker compose --env-file "$app/app.env" --env-file "$bundle/kg-admin.env" -f "$app/compose.yaml" -f "$bundle/compose.kg-admin.yaml" --profile kg-admin)
"${base[@]}" config --quiet
"${dc[@]}" config --quiet
[[ -z $("${dc[@]}" ps -aq kg-admin) ]] || { echo 'An existing kg-admin container requires review.' >&2; exit 1; }
# Compare resolved service definitions in memory. Never print credential-bearing config.
python3 - "$app" "$bundle" <<'PY'
import json, subprocess, sys
app, bundle = sys.argv[1:]
base = ['docker','compose','--env-file',app+'/app.env','-f',app+'/compose.yaml']
admin = ['docker','compose','--env-file',app+'/app.env','--env-file',bundle+'/kg-admin.env','-f',app+'/compose.yaml','-f',bundle+'/compose.kg-admin.yaml','--profile','kg-admin']
before = json.loads(subprocess.check_output(base+['config','--format','json']))
after = json.loads(subprocess.check_output(admin+['config','--format','json']))
assert before['services'] == {k:v for k,v in after['services'].items() if k != 'kg-admin'}, 'Existing service definition changed'
service = after['services']['kg-admin']
assert service['image'] == 'graph-knowledge-web:issue52-20261027'
assert service['environment']['KG_ADMIN_ENABLED'] == '1'
assert service['environment']['NEO4J_URI'] == 'bolt://graph-neo4j:7687'
assert service['environment']['GRAPH_DEPLOYMENT'] == 'production'
assert service['environment']['MEMBER_STORAGE_ENABLED'] == '0'
assert len(service['ports']) == 1 and service['ports'][0]['host_ip'] == '127.0.0.1' and str(service['ports'][0]['published']) == '3210'
print('Existing services unchanged; dedicated origin and production guard validated.')
PY
receipt=$(mktemp -d "$app/kg-admin-install-XXXXXXXX")
sha256sum "$app/app.env" "$app/compose.yaml" > "$receipt/existing-files.sha256"
mapfile -t preserved < <("${base[@]}" ps -q web graph-neo4j graph-member-postgres)
[[ ${#preserved[@]} -ge 2 ]] || { echo 'Expected existing production services are not running.' >&2; exit 1; }
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' "${preserved[@]}" > "$receipt/existing-containers.before"
kg_read() {
  "${base[@]}" exec -T graph-neo4j bash -c '
    export NEO4J_USERNAME="${NEO4J_AUTH%%/*}" NEO4J_PASSWORD="${NEO4J_AUTH#*/}"
    exec cypher-shell -a bolt://localhost:7687 -d neo4j --access-mode read --format plain --non-interactive \
      "MATCH (s:DatasetState {id: '\''public-kg'\''}) CALL { MATCH (e:Entity) RETURN count(e) AS entities } CALL { MATCH (c:Claim) RETURN count(c) AS claims } RETURN s.revision AS revision, entities, claims"
  '
}
kg_read > "$receipt/kg.before.csv"
free -m
systemctl show cloudflared-plunode-admin -p ActiveState -p MemoryCurrent -p CPUUsageNSec
install -o root -g root -m 0600 "$bundle/kg-admin.env" "$app/kg-admin.env"
install -o root -g root -m 0644 "$bundle/compose.kg-admin.yaml" "$app/compose.kg-admin.yaml"
dc=(docker compose --env-file "$app/app.env" --env-file "$app/kg-admin.env" -f "$app/compose.yaml" -f "$app/compose.kg-admin.yaml" --profile kg-admin)
started=0
finish() {
  result=$?
  if [[ $result -ne 0 && $started == 1 ]]; then
    "${dc[@]}" stop kg-admin || true
    echo "Management verification failed; only kg-admin stopped. Receipt: $receipt" >&2
  fi
  exit "$result"
}
trap finish EXIT
started=1
"${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 120 kg-admin
for path in /kg-admin /en/kg-admin /api/kg-admin; do
  for host in plunode-admin.isinxnisi.com plunode.net; do
    [[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -H "Host: $host" "http://127.0.0.1:3210$path") == 404 ]]
  done
done
[[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -H 'Host: plunode-admin.isinxnisi.com' -H 'Cf-Access-Jwt-Assertion: invalid' http://127.0.0.1:3210/api/kg-admin) == 404 ]]
kg_read > "$receipt/kg.after.csv"
cmp "$receipt/kg.before.csv" "$receipt/kg.after.csv"
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' "${preserved[@]}" > "$receipt/existing-containers.after"
cmp "$receipt/existing-containers.before" "$receipt/existing-containers.after"
sha256sum --check "$receipt/existing-files.sha256"
"${dc[@]}" ps kg-admin
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' "$("${dc[@]}" ps -q kg-admin)"
cat "$receipt/kg.after.csv"
free -m
echo "Management origin started with JWT validation. Protected browser checks remain. Receipt: $receipt"
echo 'Connector enable/restart must follow successful real Access and bypass verification.'
