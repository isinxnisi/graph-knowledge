#!/usr/bin/env bash
# Reviewed first-member activation. Keep preview auth, KG data and existing services.
set -euo pipefail
umask 077
if [[ ${EUID} -ne 0 ]]; then echo 'sudoで実行してください。' >&2; exit 1; fi
if [[ $# -ne 3 || ! $1 =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$ ]]; then
  echo 'Usage: sudo bash activate-production-member.sh IMAGE_TAG IMAGE_ARCHIVE.tar.gz GOOGLE_WEB_JSON' >&2; exit 1
fi
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image_tag=$1
image_archive=$(realpath -- "$2")
google_json=$(realpath -- "$3")
app=/opt/graph-knowledge
env_file=$app/app.env
candidate=$app/member-candidate.env
compose=$app/compose.yaml
for required in "$env_file" "$compose" "$google_json" "$image_archive" "$image_archive.sha256" "$bundle/compose.production.yaml" "$bundle/db/member/production-init.sql" "$bundle/scripts/prepare-production-member.py" "$bundle/SHA256SUMS"; do test -f "$required"; done
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>"$app/.member-activation.lock"
flock -n 9 || { echo '会員接続の別操作が実行中です。' >&2; exit 1; }
# Do not enable credentials while the formal host still points at parking DNS
# or lacks verified TLS/preview protection. No secret is read by this preflight.
python3 - <<'PY'
import socket
import urllib.request
import urllib.error
origin = 'https://plunode.net'
addresses = {entry[4][0] for entry in socket.getaddrinfo('plunode.net', 443, type=socket.SOCK_STREAM)}
if addresses != {'153.115.17.82'}:
    raise SystemExit('正式hostのDNSが対象VPSと一致しません。会員は未有効化です。')
try:
    urllib.request.urlopen(origin + '/api/dataset', timeout=20)
except urllib.error.HTTPError as response:
    if response.code != 401 or response.url != origin + '/api/dataset' or 'noindex' not in response.headers.get('X-Robots-Tag', ''):
        raise SystemExit('正式hostのHTTPS／preview認証を先に確認してください。')
else:
    raise SystemExit('正式hostのpreview認証が維持されていません。会員は未有効化です。')
print('正式hostのDNS／検証済みHTTPS／preview認証を確認しました。')
PY
# First initialization refuses an unexplained existing volume. Retry requires the
# original private candidate, then verifies the app DB password by real migration.
if [[ ! -f $candidate ]]; then
  if docker volume inspect graph-knowledge-production_member_data >/dev/null 2>&1; then
    echo '既存の会員volumeがあります。候補envなしで初期化・password生成を続けません。' >&2; exit 1
  fi
  python3 "$bundle/scripts/prepare-production-member.py" "$env_file" "$google_json" "$candidate" "$image_tag"
fi
python3 "$bundle/scripts/prepare-production-member.py" --check "$env_file" "$google_json" "$candidate" "$image_tag"
(cd -- "$(dirname -- "$image_archive")" && sha256sum --check -- "$(basename -- "$image_archive").sha256")
docker load --input "$image_archive"
docker image inspect "graph-knowledge-web:$image_tag" "graph-knowledge-ops:$image_tag" >/dev/null
old_dc=(docker compose --env-file "$env_file" -f "$compose")
"${old_dc[@]}" config --quiet
"${old_dc[@]}" run --rm --no-deps ops backup "/backups/before-member-$(date -u +%Y%m%dT%H%M%SZ).json"
install -d -m 0700 "$app/member-rollbacks"
rollback=$(mktemp -d "$app/member-rollbacks/activation-XXXXXXXX")
cp -p "$env_file" "$rollback/app.env"
cp -p "$compose" "$rollback/compose.yaml"
had_init=0
if [[ -f $app/db/member/production-init.sql ]]; then
  cp -p "$app/db/member/production-init.sql" "$rollback/production-init.sql"; had_init=1
fi
changed=0
web_changed=0
finish() {
  local result=$?
  if [[ $result -ne 0 && $changed = 1 ]]; then
    install -m 0600 "$rollback/app.env" "$env_file"
    install -m 0644 "$rollback/compose.yaml" "$compose"
    if [[ $had_init = 1 ]]; then install -m 0644 "$rollback/production-init.sql" "$app/db/member/production-init.sql"; fi
    if [[ $web_changed = 1 ]]; then
      "${old_dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 180 web || echo '旧Webのreadinessも要確認です。' >&2
    fi
    echo '接続に失敗したため、稼働env／Composeを以前の設定へ戻しました。会員volume・候補env・退避は保持しています。' >&2
  fi
  exit "$result"
}
trap finish EXIT
changed=1
install -m 0644 "$bundle/compose.production.yaml" "$compose"
install -d -m 0755 "$app/db/member"
install -m 0644 "$bundle/db/member/production-init.sql" "$app/db/member/production-init.sql"
dc=(docker compose --env-file "$candidate" -f "$compose" --profile member)
"${dc[@]}" config --quiet
"${dc[@]}" up -d --wait --wait-timeout 180 graph-member-postgres
role_flags=$("${dc[@]}" exec -T graph-member-postgres psql -U postgres -d graph_member -Atc "SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='gk_member'")
[[ $role_flags = f ]] || { echo '会員DB Userの権限を確認してください。' >&2; exit 1; }
"${dc[@]}" exec -T graph-member-postgres pg_dump -U postgres -d graph_member -Fc > "$rollback/member-before.dump"
test -s "$rollback/member-before.dump"
# Explicit migrations; the second run also verifies checksums and idempotence.
"${dc[@]}" run --rm --no-deps member-ops
"${dc[@]}" run --rm --no-deps member-ops
migration_count=$("${dc[@]}" exec -T graph-member-postgres psql -U postgres -d graph_member -Atc 'SELECT count(*) FROM member_migration')
[[ $migration_count = 5 ]] || { echo 'migration件数が期待値と違います。' >&2; exit 1; }
install -m 0600 "$candidate" "$env_file"
web_changed=1
"${old_dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 180 web
"${old_dc[@]}" exec -T web node scripts/production-readiness.mjs
"${old_dc[@]}" exec -T web node --input-type=module <<'JS'
const origin = "https://plunode.net";
const response = await fetch("http://127.0.0.1:3000/api/member/status", { signal: AbortSignal.timeout(15000) });
if (response.status !== 200 || (await response.json()).provider !== "google") throw Error("Member capability check failed");
const profile = await fetch("http://127.0.0.1:3000/api/member/profile", { signal: AbortSignal.timeout(15000) });
if (profile.status !== 401) throw Error("Anonymous profile must be denied");
const start = await fetch("http://127.0.0.1:3000/api/auth/sign-in/social", {
  method: "POST", signal: AbortSignal.timeout(15000), headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ provider: "google", callbackURL: `${origin}/member`, disableRedirect: true }),
});
if (start.status !== 200) throw Error("Member auth start failed");
const url = new URL((await start.json()).url);
if (url.origin !== "https://accounts.google.com" || url.searchParams.get("redirect_uri") !== `${origin}/api/auth/callback/google`
  || url.searchParams.get("scope")?.split(" ").sort().join(",") !== "email,openid,profile") throw Error("OAuth contract check failed");
console.log("会員status=200／匿名profile=401／Google認証開始・最小scopeを確認。本人ログインは未確認です。");
JS
systemctl is-active caddy docker
"${old_dc[@]}" ps web graph-neo4j graph-member-postgres
echo "会員構成の適用完了。private退避: $rollback"
echo 'preview認証は維持しています。HTTPSでGoogle本人ログイン・保存・再訪・共有停止を確認してください。'
