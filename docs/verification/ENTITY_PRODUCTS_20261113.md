# 関係グラフのEntity商品表示（2026-11-13）

## 原因と変更

通常のKG Graph（Explorer）には関連アイテムの表示接続がなく、共通知識Graphもテーマ閲覧中だけを対象としていた。商品取得APIもテーマID・構成版を必須としていた。

- 通常GraphのEntity説明に続けて、テーマと同じ「関連アイテム」カードを表示する。画像・地域選択・購入ボタン・アフィリエイト表示は既存部品を共用。
- 通常Graphでは、現在閲覧可能なテーマが固定している商品版から、明示的なEntity紐付けを持つ商品だけを取得。同名検索や近傍からの推測では広げない。既存の公開・版付き同一性判定を利用する。
- 同じ商品が複数テーマにある場合は最新の公開固定版を一件だけ表示。未公開の商品版を拾わない。テーマ閲覧側は従来どおり、そのテーマが固定した版を使用。
- Entity切替時は旧取得を中止し、前の商品の表示を残さない。Creators API未設定でも登録済みの画像・有効な販売リンクを維持。
- 登録データ・DB schema・Worker・本番VPSは変更していない。

## 検証

- 対象のPLUTOは通常KG・テーマ双方で `2b7c6289-d050-4dc0-93e3-9307681253cc`。別Entityを名前で同一視する必要はなかった。
- 回帰26件成功（Entity取得、公開固定版、混入防止、地域別、切替時の中止、既存カードとテーマ表示）。変更ファイルのeslintはエラー0、KnowledgeReadingの既存未使用import警告1。型検査を含む本番形式build成功。
- main実装 `89b615eb` を3200へ反映。build `gYfqDRtEJb63yrpetYzM3`。Webのみ更新し、既存WorkerのPIDは不変。
- localhostの通常Graph・固定テーマ両APIは200。同じ `book:pluto-complete-8-b002de6u7i`、表紙画像ID `78a271efc475ea4f2d009ca8b5809ad409fd085d2b237e31a8dbc5fd4b4c006e`、ASIN `B002DE6U7I`、確認済み購入URLを返した。浦沢直樹のEntityは商品0件。
- HTTPS βの実Chromeで通常Graphを再読込し、カードと画像読込成功・購入URLを確認。PCのカード幅293px、375px幅で290px、いずれもカード内の横はみ出しなし。スマホ幅は「詳細」へ切替後にスクロールして購入ボタンまで確認。ブラウザ幅設定は終了時に復帰。
- 購入ボタンのリンク先を確認したが、Amazonへの購入操作は実行していない。
- 修正後のiPhone実機は未確認。今回はカード自体のデザイン変更なし。

## 画面記録

保存先：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/entity-products-20261113/`

- `before.png`：変更前の同じ通常Graph。
- `after-desktop.png`：HTTPS β、通常Graphの右ペインに商品表示。
- `after-mobile.png`：375px幅の詳細、商品画像・紹介・購入ボタン・参加者表示。
