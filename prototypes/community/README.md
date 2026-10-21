# Community study — isolated preview

ユーザー提供 v0.1 を具体化した隔離プレビュー。製品コード・実APIではありません。

```sh
node prototypes/community/server.mjs
# 運営者承認済みTunnel用（loopbackのまま、Hostを1件追加）
node prototypes/community/server.mjs --tunnel
# http://127.0.0.1:3275/
node --test prototypes/community/model.test.mjs
node prototypes/community/ui.test.mjs
```

Node 24と既存の`@playwright/test`／Chromiumを使用。WSLの既存検証ライブラリが必要な場合：

```sh
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu node prototypes/community/ui.test.mjs
```

`COMMUNITY_SCREENSHOT_DIR`で画面記録先を変更可能（既定`/tmp/plunode-community-preview`）。テストは起動済み3275だけを使用し、3200／beta／本番へ接続しません。

- `model.mjs`: 架空データ、読取投影、操作の意味、世代による遅着拒否の設計モデル。
- `app.mjs` / `style.css`: JA/EN、PC／狭幅、管理とアカウント往復。
- `server.mjs`: loopback・Host検査・4ファイルのみGET・CSPでAPI／外部送信禁止。
- このサーバーには認証がなくfixture全体がJavaScriptとして配信されます。**実在のprivate情報・credentialを置かないこと。** UIのロール切替は本番認可を代替しません。
- 状態はタブ内のみ。reload／リセットで初期化。Graphは架空SVG。実通知・招待配送・共同編集・AI・課金・通報送信は未接続。
- 試作のjob世代は保守的に全体へ一つ。実装では関連scopeごとの世代にし、無関係な変更による取消を避けます。

[体験と操作手順](../../docs/design/COMMUNITY_IMPLEMENTATION_PLAN.md)／[基礎設計](../../docs/design/COMMUNITY_FOUNDATION.md)。このディレクトリをNextの公開routeや本番配信へそのまま組み込まないでください。

## Tunnelと起動・復旧（2026-10-21）

`--tunnel` は `graph-com.isinxnisi.com` を完全一致の許可Hostへ追加するだけです。
待受は引き続き `127.0.0.1:3275`。Docker Desktop内のcloudflaredから
`host.docker.internal:3275` へ到達できることを実測しています。
Cloudflareの登録済み転送を使用し、DNS・Access・他のingressは変更しません。
同ポートで既に動いている場合は所有プロセスを確認し、無断で終了しないでください。

WSLのrepoで、既存Nodeを使う場合：

```sh
/tmp/graph-knowledge-node/bin/node prototypes/community/server.mjs --tunnel
```

起動terminalは保持してください。PC／WSL終了後の自動起動は追加していません。
Nodeの/tmp配置が消えた場合は、Node 24を準備して同じコマンドを実行します。
別の構成で到達しなくても、安易に0.0.0.0やワイルドカードHostへ変更しません。

- ローカル： http://127.0.0.1:3275/
- 承認済み試作： https://graph-com.isinxnisi.com/
- 既存beta： https://graph-beta.isinxnisi.com/ （独立した3200）

ロゴからトップ試作、上部からコミュニティ・アカウントへ移動できます。
トップのGraphは架空Capsuleを開きます。Graph→コミュニティ→「Graphへ戻る」で
枝の開閉を復元。アカウントの自分全体のメニューは、個別コミュニティのタブ／管理と別です。
復帰先・スクロール・Graphの状態はタブ内メモリだけ。再読み込みを越える永続保存は未接続。
既存betaへのリンクは別タブで開き、既存アプリから試作への入口は変更していません。

```sh
# 既定はローカルのみ
node prototypes/community/navigation.test.mjs
# 承認済みTunnelも明示して確認
COMMUNITY_TEST_ORIGINS=http://127.0.0.1:3275,https://graph-com.isinxnisi.com node prototypes/community/navigation.test.mjs
```

配信は4ファイルのGETだけ、CSPのconnect-src noneを維持。Host検査は認証ではなく、
架空fixture全体を配信する試作です。実情報を置かず、既存のAccess保護も解除しません。
