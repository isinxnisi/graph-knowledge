#!/usr/bin/env bash
# User-authorized public launch. Only Plunode loses Basic auth; legacy preview stays protected.
set -euo pipefail
umask 077
[[ ${EUID} = 0 && $# = 0 ]] || { echo 'Usage: sudo bash activate-public-beta.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '別の本番構成操作が実行中です。' >&2; exit 1; }
python3 - <<'PY'
import socket
try: addresses={entry[4][0] for entry in socket.getaddrinfo('ads.plunode.net',443,type=socket.SOCK_STREAM)}
except socket.gaierror: addresses=set()
if addresses!={'153.115.17.82'}: raise SystemExit('ads.plunode.net のCNAMEをplunode.netへ追加し、DNS反映後に再実行してください。まだ未適用です。')
PY
env_file=/opt/graph-knowledge/app.env
compose=/opt/graph-knowledge/compose.yaml
site=/etc/caddy/graph-knowledge.caddy
config=/etc/caddy/Caddyfile
[[ $(grep -Fxc 'import /etc/caddy/graph-knowledge.caddy' "$config") = 1 ]]
config_checksum=$(sha256sum "$config" | cut -d' ' -f1)
operator=$(docker image inspect graph-knowledge-ops:beta-credits-20261014 --format '{{.Id}} {{.Os}}/{{.Architecture}}')
case "$operator" in
 'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64'|'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64') ;;
 *) echo 'operatorが受入済みdigest／platformと異なります。未適用です。' >&2; exit 1;;
esac
dc=(docker compose --env-file "$env_file" -f "$compose")
db_before=$("${dc[@]}" ps -q graph-neo4j graph-member-postgres)
[[ $(printf '%s\n' "$db_before" | wc -l) = 2 ]]
revision_before=$(curl -fsS http://127.0.0.1:3200/api/dataset | python3 -c 'import sys,json; print(json.load(sys.stdin)["revision"])')
install -d -m 0700 /opt/graph-knowledge/public-rollbacks
saved=$(mktemp -d /opt/graph-knowledge/public-rollbacks/beta-XXXXXXXX)
cp -p "$env_file" "$saved/app.env"
cp -p "$compose" "$saved/compose.yaml"
cp -p "$site" "$saved/site.caddy"
python3 "$bundle/scripts/prepare-public-beta.py" caddy "$site" "$saved/candidate.caddy"
python3 "$bundle/scripts/prepare-public-beta.py" compose "$compose" "$saved/candidate.compose.yaml"
python3 "$bundle/scripts/prepare-public-beta.py" env "$env_file" "$saved/candidate.env"
sed "s|^import /etc/caddy/graph-knowledge.caddy$|import $saved/candidate.caddy|" "$config" > "$saved/Caddyfile"
caddy validate --config "$saved/Caddyfile" --adapter caddyfile
docker compose --env-file "$saved/candidate.env" -f "$saved/candidate.compose.yaml" config --quiet
changed=0
finish() {
  local result=$?
  trap - EXIT
  if [[ $result -ne 0 && $changed = 1 ]]; then
    echo '公開切替に失敗したため、以前の境界とWebへ戻します。' >&2
    bash "$bundle/scripts/rollback-public-beta.sh" "$saved" || echo "自動復帰の確認が必要です。復旧控え: $saved" >&2
  fi
  exit "$result"
}
trap finish EXIT
docker tag "${operator%% *}" graph-knowledge-ops:beta-public-20261015
changed=1
cp -p "$saved/candidate.env" "$env_file"
cp -p "$saved/candidate.compose.yaml" "$compose"
bash "$bundle/scripts/update-production-web.sh" beta-public-20261015 "$bundle/images.tar.gz"
python3 - "$revision_before" <<'PY'
import json, re, sys, urllib.request, urllib.error
def get(path):
    req=urllib.request.Request('http://127.0.0.1:3200'+path,headers={'Host':'plunode.net'})
    return urllib.request.urlopen(req,timeout=20)
with get('/api/dataset') as response: assert json.load(response)['revision']==sys.argv[1]
with get('/') as response:
    html=response.read().decode()
    assert 'name="robots" content="index, follow' in html
    assert re.search(r'rel="canonical" href="https://plunode\.net/?"', html)
with get('/api/member/status') as response: assert json.load(response)['provider']=='google'
try: get('/api/member/profile'); raise RuntimeError('Anonymous member access')
except urllib.error.HTTPError as error: assert error.code==401
print('公開候補Web: index／canonical／KG revision／Google有効／匿名会員401を確認。')
PY
[[ $("${dc[@]}" ps -q graph-neo4j graph-member-postgres) = "$db_before" ]]
[[ $(sha256sum "$config" | cut -d' ' -f1) = "$config_checksum" ]]
chmod --reference="$site" "$saved/candidate.caddy"
chown --reference="$site" "$saved/candidate.caddy"
cp -p "$saved/candidate.caddy" "$site"
systemctl reload caddy
python3 - "$revision_before" <<'PY'
import json, sys, time, urllib.request, urllib.error
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30)
with get('https://plunode.net/') as response:
    assert response.status==200 and 'noindex' not in response.headers.get('X-Robots-Tag','')
with get('https://plunode.net/api/dataset') as response: assert json.load(response)['revision']==sys.argv[1]
with get('https://plunode.net/robots.txt') as response: assert b'Sitemap: https://plunode.net/sitemap.xml' in response.read()
with get('https://plunode.net/sitemap.xml') as response: assert b'https://plunode.net/explore/' in response.read()
for attempt in range(30):
    try:
        req=urllib.request.Request('https://ads.plunode.net/integrations/ad/mobile',headers={'Sec-Fetch-Dest':'iframe'})
        with urllib.request.urlopen(req,timeout=10) as response: assert response.status==200 and b'93ba1c5c8d797794cf1c721bce01ff42' in response.read()
        break
    except (OSError, AssertionError):
        if attempt==29: raise
        time.sleep(2)
for path in ['/','/member','/api/member/profile']:
    try: get('https://ads.plunode.net'+path); raise RuntimeError('Advertisement origin exposes application routes')
    except urllib.error.HTTPError as error: assert error.code==404
for url in ['https://plunode.net/api/member/profile','https://graph.isinxnisi.net/']:
    try: get(url); raise RuntimeError('Unexpected anonymous access')
    except urllib.error.HTTPError as error: assert error.code==401
print('正式HTTPSは匿名200、旧previewは401、会員保護・robots・sitemap・KG revisionを確認。')
PY
[[ $("${dc[@]}" ps -q graph-neo4j graph-member-postgres) = "$db_before" ]]
systemctl is-active caddy docker resale-ebay-notifications
changed=0
echo "Plunode公開βへ切替完了。KG／会員PGの再起動・書込なし。復旧控え: $saved"
echo "復旧: sudo bash $bundle/scripts/rollback-public-beta.sh $saved"
echo '実Google再ログイン・GA4実受信・AdMax実配信・Search Consoleは利用者の確認を行ってください。'
