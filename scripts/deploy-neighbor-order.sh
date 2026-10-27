#!/usr/bin/env bash
# Issue #54: verified Web only. No database writes, migrations, or service grants.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'sudoで実行してください。' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "$0")" && pwd)
app=/opt/graph-knowledge
cd -- "$bundle"
sha256sum --check SHA256SUMS
test -f release.json
tag=$(python3 -c 'import json; print(json.load(open("release.json"))["tag"])')
[[ $tag =~ ^issue54-[a-zA-Z0-9_.-]+$ ]]
dc=(docker compose --env-file "$app/app.env" -f "$app/compose.yaml")
"${dc[@]}" config --quiet
old_container=$("${dc[@]}" ps -q web)
test -n "$old_container"
old_build=$(docker exec "$old_container" cat .next-public/BUILD_ID)
python3 - "$old_build" <<'PY'
import json,sys
assert sys.argv[1] == json.load(open('release.json'))['previousBuild'], 'Production build changed; review before deployment'
PY
receipt=$(mktemp -d "$app/neighbor-order-XXXXXXXX")
chmod 0700 "$receipt"
cp -p "$app/app.env" "$receipt/app.env"
cp -p "$app/compose.yaml" "$receipt/compose.yaml"
docker inspect "$old_container" --format '{{.Image}}' > "$receipt/previous-image"
curl --fail --silent http://127.0.0.1:3200/api/dataset > "$receipt/dataset-before.json"
# Snapshot only identity/start time, never container env/secrets.
snapshot() {
  docker ps -q | while read -r container; do
    [[ $container = "$("${dc[@]}" ps -q web | cut -c1-12)" ]] && continue
    docker inspect "$container" --format '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}}'
  done | sort
}
snapshot > "$receipt/other-containers-before"
"${dc[@]}" config --format json > "$receipt/config-before.json"
docker load -i images.tar.gz
actual=$(docker image inspect "graph-knowledge-web:$tag" --format '{{.Id}}')
python3 - "$actual" <<'PY'
import json,sys
r=json.load(open('release.json'))
assert sys.argv[1] in r['imageDigests'], 'Image identity mismatch'
PY
test "$(docker image inspect "$actual" --format '{{.Os}}/{{.Architecture}}')" = linux/amd64
# GRAPH_IMAGE_TAG is shared by Web/ops. Retag the EXISTING operator bits so its
# resolved image remains identical; never build/execute an operator for this update.
old_ops=$(python3 - "$receipt/config-before.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['services']['ops']['image'])
PY
)
old_ops_id=$(docker image inspect "$old_ops" --format '{{.Id}}')
docker tag "$old_ops_id" "graph-knowledge-ops:$tag"
changed=0
rollback() {
  cp -p "$receipt/app.env" "$app/app.env"
  cp -p "$receipt/compose.yaml" "$app/compose.yaml"
  "${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 180 web
}
finish() {
  result=$?
  if [[ $result -ne 0 && $changed = 1 ]]; then
    echo 'Verification failed; restoring previous Web/configuration.' >&2
    rollback || echo "Rollback failed; inspect $receipt" >&2
  fi
  echo "Receipt: $receipt"
  exit "$result"
}
trap finish EXIT
changed=1
python3 - "$app/app.env" "$app/compose.yaml" "$tag" <<'PY'
from pathlib import Path
import sys
env,compose=map(Path,sys.argv[1:3]); tag=sys.argv[3]
lines=env.read_text().splitlines()
assert sum(s.startswith('GRAPH_IMAGE_TAG=') for s in lines)==1
env.write_text('\n'.join('GRAPH_IMAGE_TAG='+tag if s.startswith('GRAPH_IMAGE_TAG=') else s for s in lines)+'\n')
s=compose.read_text()
anchor='      PUBLIC_PROFILES_ENABLED: "${PUBLIC_PROFILES_ENABLED:-0}"\n'
assert s.count(anchor)==1, 'Unexpected Compose: no mutation of other services allowed'
assert 'GRAPH_NEIGHBOR_ORDER:' not in s, 'Existing operator override requires review'
s=s.replace(anchor,anchor+''.join(f'      {key}: "${{{key}:-{value}}}"\n' for key,value in [('GRAPH_NEIGHBOR_ORDER','bounded'),('GRAPH_NEIGHBOR_CANDIDATES','200'),('GRAPH_NEIGHBOR_CONNECTIONS','50')]))
compose.write_text(s)
PY
chmod 0600 "$app/app.env"
"${dc[@]}" config --quiet
"${dc[@]}" config --format json > "$receipt/config-after.json"
python3 - "$receipt" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); a=json.loads((p/'config-before.json').read_text()); b=json.loads((p/'config-after.json').read_text())
for service in ('web','ops'): b['services'][service]['image']=a['services'][service]['image']
for key,value in [('GRAPH_NEIGHBOR_ORDER','bounded'),('GRAPH_NEIGHBOR_CANDIDATES','200'),('GRAPH_NEIGHBOR_CONNECTIONS','50')]:
    assert b['services']['web']['environment'].pop(key)==value, 'Runtime ranking settings differ from verified release'
assert a==b, 'Unexpected configuration change'
PY
"${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 180 web
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
# Exercise the new read path before accepting the deployment. A cold-query
# timeout is a failed rollout too; do not silently relax the DB timeout.
curl --fail --silent --max-time 20 http://127.0.0.1:3200/api/entities/2b7c6289-d050-4dc0-93e3-9307681253cc/neighbors > "$receipt/neighbors.json"
python3 - "$receipt/neighbors.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p['ranking']['mode']=='bounded' and p['ranking']['candidateLimit']==200 and p['ranking']['connectionLimit']==50
assert p['claims'] and len({c['id'] for c in p['claims']})==len(p['claims'])
PY
curl --fail --silent http://127.0.0.1:3200/api/dataset > "$receipt/dataset-after.json"
new_build=$("${dc[@]}" exec -T web cat .next-public/BUILD_ID)
python3 - "$receipt" "$new_build" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); a=json.loads((p/'dataset-before.json').read_text()); b=json.loads((p/'dataset-after.json').read_text())
assert a==b, 'Dataset changed during Web deployment'
assert sys.argv[2].strip()==json.load(open('release.json'))['build'], 'Wrong Web build'
print(json.dumps({'build':sys.argv[2].strip(),'revision':b['revision'],'datasetUnchanged':True}))
PY
snapshot > "$receipt/other-containers-after"
cmp "$receipt/other-containers-before" "$receipt/other-containers-after"
test "$(docker image inspect "graph-knowledge-ops:$tag" --format '{{.Id}}')" = "$old_ops_id"
systemctl is-active docker caddy cloudflared-plunode-admin resale-ebay-notifications
"${dc[@]}" ps web
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' "$("${dc[@]}" ps -q web)"
cp "$bundle/rollback-neighbor-order.sh" "$receipt/rollback.sh"
sha256sum "$app/app.env" "$app/compose.yaml" > "$receipt/applied.sha256"
echo "Web verified; other containers preserved. HTTPS verification remains."
echo "Rollback: sudo bash $receipt/rollback.sh"
