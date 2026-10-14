#!/usr/bin/env bash
# Human-approved additive releases only; preserve Web, KG and member PG containers.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash apply-expanded-pluto-public-kg.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
app=/opt/graph-knowledge
exec 9>"$app/.member-activation.lock"
flock -n 9 || { echo '別の構成操作が実行中です。' >&2; exit 1; }
dc=(docker compose --env-file "$app/app.env" -f "$app/compose.yaml" --profile member)
"${dc[@]}" config --quiet
identity() { docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$("${dc[@]}" ps -q "$1")"; }
neo4j_before=$(identity graph-neo4j)
pg_before=$(identity graph-member-postgres)
web_before=$(identity web)
record=$(mktemp -d "$app/expanded-pluto-release.XXXXXXXX")
ops=("${dc[@]}" run --rm --no-deps --volume "$bundle/releases:/incoming:ro" ops)
"${ops[@]}" validate /incoming/20261014-expanded-001
"${ops[@]}" validate /incoming/20261014-pluto-001
backup="/backups/before-expanded-pluto-$(date -u +%Y%m%dT%H%M%SZ).json"
"${ops[@]}" backup "$backup" > "$record/backup.json"
cat "$record/backup.json"
current=$(python3 - "$record/backup.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x['release'] in ['20261011-001','20261014-expanded-001','20261014-pluto-001']
print(x['release'])
PY
)
echo "KG単独復旧控え: $backup / private記録: $record"
for release in 20261014-expanded-001 20261014-pluto-001; do
  if [[ $current = 20261014-pluto-001 && $release = 20261014-expanded-001 ]]; then continue; fi
  "${ops[@]}" plan "/incoming/$release" > "$record/$release-plan.json"
  python3 - "$record/$release-plan.json" "$release" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]));release=sys.argv[2]
assert x['release']==release and x['updated']==[]
added,rels=(9889,9710) if release=='20261014-expanded-001' else (43,48)
assert (x['unchanged'] and x['added']==[] and x['relationshipsAdded']==0) or (len(x['added'])==added and x['relationshipsAdded']==rels)
print(json.dumps({'release':release,'unchanged':x['unchanged'],'addedKnowledgeNodes':len(x['added']),'updatedKnowledgeNodes':len(x['updated']),'relationshipsAdded':x['relationshipsAdded']}))
PY
  "${ops[@]}" apply "/incoming/$release" > "$record/$release-apply.json"
  "${ops[@]}" apply "/incoming/$release" > "$record/$release-reapply.json"
  python3 - "$record/$release-reapply.json" "$release" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]));release=sys.argv[2]
assert x['unchanged'] and x['added']==[] and x['updated']==[] and x['relationshipsAdded']==0
expected=(2099,1822) if release=='20261014-expanded-001' else (2109,1834)
assert (x['counts']['nodes']['Entity'],x['counts']['nodes']['Claim'])==expected
print(json.dumps({'release':release,'reapplyUnchanged':True,'counts':x['counts']}))
PY
  current=$release
done
[[ $(identity graph-neo4j) = "$neo4j_before" && $(identity graph-member-postgres) = "$pg_before" && $(identity web) = "$web_before" ]]
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
"${dc[@]}" exec -T web node --input-type=module -e 'const r=await fetch("http://127.0.0.1:3000/api/dataset");if(!r.ok)throw Error("KG unavailable");console.log(JSON.stringify({dataset:(await r.json())}));'
echo '大量拡充＋PLUTO補充を適用・再適用無変更。Web／KG／会員PG再起動なし。会員PGへの書込なし。'
echo "復旧控え: $backup / 記録: $record"
