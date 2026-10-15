#!/usr/bin/env bash
# M2の日英SEO・OGP・faviconをWebのみ更新する。認証・DB・Caddyは維持。
set -euo pipefail
[[ ${EUID} -eq 0 && $# -eq 0 ]] || { echo 'Usage: sudo bash activate-m2-discovery.sh' >&2; exit 1; }
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
docker tag "${actual%% *}" graph-knowledge-ops:beta-m2-discovery-20261015
bash "$bundle/scripts/update-production-web.sh" beta-m2-discovery-20261015 "$bundle/images.tar.gz"
echo 'M2 Web更新とreadinessに成功しました。DB・会員PG・Caddy・認証設定は変更していません。'
if python3 - <<'PY'
import urllib.request, struct
origin='https://plunode.net'
entity='2b7c6289-d050-4dc0-93e3-9307681253cc'
for path in ['/en', '/en/explore/'+entity, '/en/support']:
    with urllib.request.urlopen(origin+path, timeout=30) as response:
        html=response.read().decode()
    assert 'lang="en"' in html and origin+path in html
    assert 'name="robots" content="index, follow' in html
    assert ('https://buymeacoffee.com/plunode' if path.endswith('/support') else 'data-testid="public-discovery"') in html
for path in ['/opengraph-image','/en/opengraph-image','/en/explore/'+entity+'/opengraph-image']:
    with urllib.request.urlopen(origin+path, timeout=30) as response:
        header=response.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', header[16:24])==(1200,630)
with urllib.request.urlopen(origin+'/favicon.ico', timeout=30) as response:
    assert response.read(4)==b'\0\0\1\0'
print('正式HTTPSの英語SSR・支援導線・共有PNG・faviconを確認しました。')
PY
then
  :
else
  echo 'Web更新済みですが正式HTTPSの事後確認に失敗しました。旧Webへ戻した状態ではありません。HTTPSと該当URLを確認してください。' >&2
  exit 1
fi
echo 'PC・スマホの探索と、Search Consoleの英語URL検査を確認してください。SNS各社のキャッシュ・検索掲載は別確認です。'
