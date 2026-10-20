# Community study — local only

ユーザー提供 v0.1 を具体化した隔離プレビュー。製品コード・実APIではありません。

```sh
node prototypes/community/server.mjs
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
