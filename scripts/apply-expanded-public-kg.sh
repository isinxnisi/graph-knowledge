#!/usr/bin/env bash
# Run only after human approval of this exact release and its additive scope.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash apply-expanded-public-kg.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
app=/opt/graph-knowledge
exec 9>"$app/.member-activation.lock"
flock -n 9 || { echo '別の構成操作が実行中です。' >&2; exit 1; }
dc=(docker compose --env-file "$app/app.env" -f "$app/compose.yaml")
"${dc[@]}" config --quiet
identity() { docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$("${dc[@]}" ps -q "$1")"; }
neo4j_before=$(identity graph-neo4j)
pg_before=$(identity graph-member-postgres)
web_before=$(identity web)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
record=$(mktemp -d "$app/expanded-release.XXXXXXXX")
ops=("${dc[@]}" run --rm --no-deps --volume "$bundle/release:/incoming:ro" ops)
"${ops[@]}" validate /incoming
"${ops[@]}" plan /incoming > "$record/plan.json"
python3 - "$record/plan.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x['release']=='20261014-expanded-001' and x['updated']==[]
assert x['unchanged'] or (len(x['added'])==9889 and x['relationshipsAdded']==9710)
print(json.dumps({'release':x['release'],'unchanged':x['unchanged'],'addedKnowledgeNodes':len(x['added']),'updatedKnowledgeNodes':len(x['updated']),'relationshipsAdded':x['relationshipsAdded']}))
PY
backup="/backups/before-expanded-$stamp.json"
"${ops[@]}" backup "$backup" > "$record/backup.json"
cat "$record/backup.json"
"${ops[@]}" apply /incoming > "$record/apply.json"
"${ops[@]}" apply /incoming > "$record/reapply.json"
python3 - "$record/reapply.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]));assert x['unchanged'] and x['added']==[] and x['updated']==[] and x['relationshipsAdded']==0
assert x['counts']['nodes']['Entity']==2099 and x['counts']['nodes']['Claim']==1822
print(json.dumps({'reapplyUnchanged':True,'counts':x['counts']}))
PY
[[ $(identity graph-neo4j) = "$neo4j_before" && $(identity graph-member-postgres) = "$pg_before" && $(identity web) = "$web_before" ]]
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
"${dc[@]}" exec -T web node --input-type=module -e 'const r=await fetch("http://127.0.0.1:3000/api/dataset");if(!r.ok)throw Error("KG unavailable");console.log(JSON.stringify({dataset:(await r.json())}));'
echo "追加release適用・再適用無変更・全container再起動なし。private記録: $record"
echo "KG単独の復旧控え: $backup（会員PGは書込・復元しません）"
echo '検索・Graph・出典を確認してください。表示上の軽微な問題だけで自動復元はしません。'
