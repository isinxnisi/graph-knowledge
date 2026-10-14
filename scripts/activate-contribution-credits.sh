#!/usr/bin/env bash
# Exact approved credit release; update the enum-capable Web before KG application.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash activate-contribution-credits.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
app=/opt/graph-knowledge
exec 9>"$app/.member-activation.lock"
flock -n 9 || { echo '別の構成操作が実行中です。' >&2; exit 1; }
dc=(docker compose --env-file "$app/app.env" -f "$app/compose.yaml" --profile member)
identity() { docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$("${dc[@]}" ps -q "$1")"; }
neo4j_before=$(identity graph-neo4j)
pg_before=$(identity graph-member-postgres)
# Existing helper backs up the current KG and rolls back a failed Web update.
# No new-role data exists yet at that rollback boundary.
bash "$bundle/scripts/update-production-web.sh" beta-credits-20261014 "$bundle/images.tar.gz"
record=$(mktemp -d "$app/credit-release.XXXXXXXX")
ops=("${dc[@]}" run --rm --no-deps --volume "$bundle/release:/incoming:ro" ops)
"${ops[@]}" validate /incoming
"${ops[@]}" plan /incoming > "$record/plan.json"
python3 - "$record/plan.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x['release']=='20261014-credits-001' and x['updated']==[]
assert (x['unchanged'] and not x['added'] and x['relationshipsAdded']==0) or (len(x['added'])==25 and x['relationshipsAdded']==40)
print(json.dumps({'release':x['release'],'unchanged':x['unchanged'],'addedKnowledgeNodes':len(x['added']),'updatedKnowledgeNodes':len(x['updated']),'relationshipsAdded':x['relationshipsAdded']}))
PY
backup="/backups/before-credits-$(date -u +%Y%m%dT%H%M%SZ).json"
"${ops[@]}" backup "$backup" > "$record/backup.json"
cat "$record/backup.json"
echo "KG復旧控え: $backup / private記録: $record"
echo '以後の失敗時は新Role対応Webを維持し、KGを確認・復旧してから旧Webへ戻してください。'
"${ops[@]}" apply /incoming > "$record/apply.json"
"${ops[@]}" apply /incoming > "$record/reapply.json"
python3 - "$record/reapply.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x['unchanged'] and not x['added'] and not x['updated'] and x['relationshipsAdded']==0
assert x['counts']['nodes']=={'Entity':2109,'Claim':1844,'Source':1751,'Citation':1880,'ExternalIdentifier':2478}
print(json.dumps({'release':x['release'],'reapplyUnchanged':True,'counts':x['counts']}))
PY
[[ $(identity graph-neo4j) = "$neo4j_before" && $(identity graph-member-postgres) = "$pg_before" ]]
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
"${dc[@]}" exec -T web node --input-type=module -e 'const r=await fetch("http://127.0.0.1:3000/api/dataset");if(!r.ok)throw Error("KG unavailable");console.log(JSON.stringify({dataset:await r.json()}));'
echo '制作Role対応Webと10限定Claimを反映。DB／会員PG再起動なし、会員PG書込なし。HTTPSの実表示を確認してください。'
