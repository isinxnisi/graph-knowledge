#!/usr/bin/env bash
# M3 Discovery Searchの体験試作をWebのみ更新する。
set -euo pipefail
[[ ${EUID} -eq 0 && $# -eq 0 ]] || { echo 'Usage: sudo bash activate-m3-discovery-play.sh' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
(cd -- "$bundle" && sha256sum --check SHA256SUMS)
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || { echo '別の本番構成操作が実行中です。未適用です。' >&2; exit 1; }
operator=graph-knowledge-ops:beta-credits-20261014
actual=$(docker image inspect "$operator" --format '{{.Id}} {{.Os}}/{{.Architecture}}')
case "$actual" in
  'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64'|'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64') ;;
  *) echo 'operatorが受入済みdigest／platformと異なります。未適用です。' >&2; exit 1 ;;
esac
docker tag "${actual%% *}" graph-knowledge-ops:beta-m3-discovery-play-20261016
bash "$bundle/scripts/update-production-web.sh" beta-m3-discovery-play-20261016 "$bundle/images.tar.gz"
echo 'Web更新とreadinessに成功しました。KG・会員PG・Caddy・認証設定は変更していません。'
if python3 - <<'PY'
import re, urllib.request
origin='https://plunode.net'
for path in ['/', '/en', '/member', '/explore/2b7c6289-d050-4dc0-93e3-9307681253cc']:
    with urllib.request.urlopen(origin+path, timeout=30) as response:
        html=response.read().decode()
    assert re.search(r'<footer[^>]*data-testid="site-footer"[^>]*>\s*<div', html), path
    if path in ['/', '/en']:
        assert 'data-testid="discovery-home"' in html and 'data-testid="discovery-featured"' in html
        assert 'data-testid="public-discovery"' not in html
        assert 'data-testid="featured-connections"' in html and 'data-testid="featured-credit"' in html
        assert 'name="robots" content="index, follow' in html and 'PLUTO' in html
    if path == '/en':
        assert 'lang="en"' in html and 'Recently added knowledge' in html
    if path == '/':
        css_paths=set(re.findall(r'href="([^"\s]+\.css(?:\?[^"\s]*)?)"', html))
        css=''
        for asset in css_paths:
            with urllib.request.urlopen(origin+asset, timeout=30) as response:
                css+=response.read().decode()
        assert css.count('overscroll-behavior:contain auto') >= 2, '探索ペインの縦スクロール連鎖CSS'
        assert 'data-testid="discovery-search-entry"' in html
    if path == '/member':
        assert 'name="robots" content="noindex' in html
    if path.startswith('/explore/'):
        assert 'data-testid="public-discovery"' in html and 'data-testid="discovery-home"' not in html
import json
with urllib.request.urlopen(origin+'/api/discovery/entities?around=2b7c6289-d050-4dc0-93e3-9307681253cc', timeout=30) as response:
    result=json.load(response)
assert 0 < len(result['items']) <= 20 and any(e['name']=='PLUTO' for e in result['items'])
assert isinstance(result['starts'], list) and 'nextCursor' in result
with urllib.request.urlopen(origin+'/api/discovery/entities?theme=manga&predicates=INFLUENCED_BY', timeout=30) as response:
    focused=json.load(response)
assert focused['total'] >= 2 and any(e['name']=='浦沢直樹' for e in focused['items'])
assert 'manga' in focused['themes'] and any(f['predicate']=='CONTRIBUTED_TO' for f in focused['facets'])
print('正式HTTPSの日英Home検索入口・テーマ／切り口検索API・探索直接URL・会員noindexを確認しました。')
PY
then
  :
else
  echo 'Web更新済みですが正式HTTPSの事後確認に失敗しました。旧Webへ戻した状態ではありません。該当URLを確認してください。' >&2
  exit 1
fi
echo 'Home検索入口→テーマ→関係を複数選択／解除→名前絞込→Graphの条件引継ぎ、日英・PC／スマホ、閉じる・Backと復元を確認してください。'
