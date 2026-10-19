#!/usr/bin/env bash
# Prepared operator procedure. This script is not run by CollectionWorker or during preparation.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && ( $# = 1 || $# = 2 ) ]] || { echo 'Usage: sudo env PUBLICATION_EXPECTED_REVISION=... bash publication-operator.sh preflight|apply [--operator-approved]' >&2; exit 1; }
mode=$1
[[ ( $mode = preflight && $# = 1 ) || ( $mode = apply && $# = 2 && ${2:-} = --operator-approved ) ]] || { echo 'Explicit operator publication approval required for apply' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS >/dev/null)
: "${PUBLICATION_EXPECTED_REVISION:?Supply the freshly confirmed production revision}"
if [[ $mode = apply ]]; then
  : "${PUBLICATION_RECEIPTS_CONFIRMED:?Supply the approved publication receiptSetSha256}"
  : "${PUBLICATION_WORKER_SETTLED:?Confirm the adopted Worker receipts are settled; no conflicting acceptance can start}"
  python3 - "$bundle/publication.json" "$PUBLICATION_RECEIPTS_CONFIRMED" "${PUBLICATION_ALLOW_PARTIAL:-0}" "$PUBLICATION_WORKER_SETTLED" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));assert r['receiptSetSha256']==sys.argv[2], 'Approved receipt set differs'
assert r['issue25Complete'] or sys.argv[3]=='1', 'Partial publication needs explicit separate approval'
assert sys.argv[4]=='1', 'Worker receipt set must be settled before publication'
PY
fi
app=/opt/graph-knowledge
exec 9>>"$app/.member-activation.lock"
flock -n 9 || { echo 'Another production operation holds the common lock' >&2; exit 1; }
dc=(docker compose --env-file "$app/app.env" -f "$app/compose.yaml")
image=$("${dc[@]}" config --format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["services"]["ops"]["image"])')
# Both IDs were verified in the accepted credits archive; Docker stores expose config or manifest.
actual=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$image")
case "$actual" in
  'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64'|'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64') ;;
  *) echo 'Operator image differs from the tested image; review compatibility again' >&2; exit 1 ;;
esac
ops=("${dc[@]}" run --rm --no-deps --pull never --volume "$bundle/release:/incoming:ro" --volume "$bundle/compat/contribution.ts:/app/lib/domain/contribution.ts:ro" ops)
record=$(mktemp -d "$app/publication.XXXXXXXX")
current_revision() { curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3200/api/dataset | python3 -c 'import json,sys;r=json.load(sys.stdin);assert r["dataset"]=="public-kg";print(r["revision"])'; }
[[ $(current_revision) = "$PUBLICATION_EXPECTED_REVISION" ]] || { echo 'Production revision changed; stop and re-plan' >&2; exit 1; }
"${ops[@]}" validate /incoming > "$record/validate.json"
backup="/backups/before-publication-$(date -u +%Y%m%dT%H%M%SZ)-${record##*.}.json"
"${ops[@]}" backup "$backup" > "$record/backup.json"
python3 -c 'import json,sys; b,r=(json.load(open(f)) for f in sys.argv[1:3]); assert b["backedUp"] and b["release"]==r["baseRelease"] and b["revision"]==sys.argv[3], "KG backup base/revision differs from approved preflight"' "$record/backup.json" "$bundle/publication.json" "$PUBLICATION_EXPECTED_REVISION"
"${ops[@]}" plan /incoming > "$record/plan.json"
python3 - "$record/plan.json" "$bundle/publication.json" <<'PY'
import json,sys
p,r=(json.load(open(f)) for f in sys.argv[1:]);assert p['release']==r['release'] and p['updated']==[] and not p['unchanged']
assert len([x for x in p['added'] if x.startswith('Claim:')])==r['additions']['claims']
for field,label in [('entities','Entity'),('sources','Source'),('citations','Citation')]:
 assert len([x for x in p['added'] if x.startswith(label+':')])==r['additions'][field]
assert len([x for x in p['added'] if x.startswith('ExternalIdentifier:')])==r['externalIdentifiersAdded']
assert len(p['added'])==r['expectedAddedNodes'] and p['relationshipsAdded']==r['expectedRelationshipsAdded']
print(json.dumps({'release':p['release'],'newClaims':r['additions']['claims'],'updated':0,'relationshipsAdded':p['relationshipsAdded']}))
PY
[[ $(current_revision) = "$PUBLICATION_EXPECTED_REVISION" ]] || { echo 'Production changed during plan; stop' >&2; exit 1; }
echo "Prepared plan and KG backup: $record / $backup"
if [[ $mode = preflight ]]; then echo 'Preflight only. No apply, restore, service switch or member DB operation.'; exit 0; fi
# This branch is reserved for a later, separately approved human sudo invocation.
"${ops[@]}" apply /incoming > "$record/apply.json"
"${dc[@]}" exec -T web node scripts/production-readiness.mjs
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3200/api/dataset > "$record/api-after.json"
echo "Apply finished. Verify API, names, Graph and evidence with verification-cases.json. Records: $record"
