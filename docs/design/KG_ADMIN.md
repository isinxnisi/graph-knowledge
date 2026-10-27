# 現行KGの管理検索（Issue #52）

2026-10-27。現行public-kgの全Entityと弱連結Islandを、Cloudflare Access許可管理者が読み取る。正式VPSへの配置・有効化は別承認。公開Web・3200/betaでは `KG_ADMIN_ENABLED` を設定しない。

## 構成

同じ検証済みNext standalone imageを、専用runtime `kg-admin` として利用する。既存Webを共有する案では公開経路とのホスト分岐・認証誤設定の影響が大きいため、約4GiB VPSの余裕を実測した上で専用384MiB／0.5 CPUに限定する。会員PG・Better Auth・AI providerは接続しない。新DB、migration、GDSは不要。

`plunode-admin.isinxnisi.com` → Access → VPS cloudflared（Protect with Access）→ `127.0.0.1:3210` → 専用Next → 同じDocker network内 `bolt://graph-neo4j:7687`。Caddyの経路追加とBoltの公開は不要。本番接続guardは既存のまま。資格情報はVPSの既存root限定envから起動時に渡し、外へ複製しない。

`KG_ADMIN_ENABLED=1`、public-kg・試験映画データでないこと、固定管理Host、Access team/AUD設定、`Cf-Access-Jwt-Assertion` のRS256署名・iss・aud・exp・iat・sub・email・app typeを検証する。メール文字列や転送Hostだけでは許可しない。Proxyは専用runtimeの全経路（静的assetを含む）を保護し、管理画面・管理API・Next静的asset以外の経路を拒否。画面とAPI自身でも再検証する。公開runtimeの管理経路はHost偽装・JWTありでも無効。JWKSは固定Cloudflare team URLから有限時間で取得し鍵cacheを利用。no-store／noindex／no-referrerを使用する。

## 集計・ページング

- 物理的に同一KGに存在する全Entityを含め、公開Claimに繋がる対象だけへ絞らない。別DBや未受入artifact、映画試験DBを混ぜない。
- 接続はpublished・affirmed・support Citation経由の非demo SourceありのClaim。除外は未公開→否定→支持根拠なしの優先順で重複せず集計。否定を肯定の接続にしない。未知polarity・端点欠損・重複ID等は失敗とする。
- 弱連結成分を反復探索する。singletonも1 Island。多重ClaimはClaim数を保持、接続数は相異なる他Entity数。自己ClaimはClaim1件・接続0。Island IDはdataset・revision・ソート済み全構成UUIDのSHA-256。
- 50,000 Entity／200,000 Claimを安全上の集計容量とし、超過・取得件数不一致・DB時間切れは全体失敗。Graphの100/200表示上限とは独立。これは検索の島規模入力上限ではない。
- 1 processで全件取得は同時1本、Neo4j READ transactionと15秒の全体期限。各transactionは既存設定5〜15秒、本番候補10秒。開始・終了revisionを照合。結果cacheは60秒、各要求時に現在revisionをDBで確認して変更・障害時は破棄。部分cacheを保存しない。
- APIは標準40／最大100行。第二ソートなし可、同一キーは第二を省略、最後に安定ID昇順。ソート定義はUI/API共用。続きと詳細はrevision必須。revision変更は409で先頭再取得。offsetは固定snapshot内の順序に適用し、レスポンスへ全件を返さない。
- 島の名前検索・種別・接続数は該当する構成Entityを持つ島を探す。規模は全構成Entity数で最小／最大自由指定。代表Entityは最小UUIDで安定化し、名前はその表示名。各行に種別内訳を表示。

## 画面

日英の `/kg-admin`／`/en/kg-admin` と `/api/kg-admin`。概況・Entity一覧・Island一覧を同格にする。PC左ナビ、スマホは必要時だけ開くメニュー。通常一覧では検索・適用・フィルター開閉と短い現在条件だけを表示する。フィルターはラジオ楕円、数値入力・検索入力は16px以上。高密度tableは必要時だけ横スクロール。巨大なグラフの強制描画はしない。

詳細は元EntityのUUID・種類・接続・Claim数・所属Islandと、正式公開サイトの既存詳細／Graphへのリンク。リンク先は別originの現在公開KGであり、管理snapshotの再現を保証しない。公開サイトに存在しない／非公開の内容はリンク先の既存制限に従う。

導入・切戻しは[運用手順](../runbooks/KG_ADMIN.md)、実機と検証の状態は[検証記録](../verification/KG_ADMIN_20261027.md)を参照。
