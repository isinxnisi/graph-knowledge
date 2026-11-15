# 関連テーマ一覧の本番反映（2026-11-15）

## 許可と対象

ユーザーの「これはもう本番にあげよう」に従い、受入済みの関連テーマ一覧だけを正式Webへ反映する。β登録コンテンツを移さず、既存本番のテーマ・Entity・Recordの関連から表示する。新しいDB形式・AI処理・Worker更新はない。

## 監査と固定資材

- 本人sudoで読み取り専用監査を実行。現行source `4ccb98f5e6e074d9c604024bc84d1d20f3a22323`／build `fqo_VSttPZ8pGBpd4b-Ih`。会員migration44件・知識9件、各checksumを固定。
- 現行Web healthy、PG・KG・3 Worker稼働。Compose・app.env・knowledge.envのhashを固定し、更新直前も再照合する。
- アプリsource `0267d4ef544f5dba3c28b80d1637a32dbde57f36`をgit archiveから構築。βで確認した`e1646615`とのアプリ差分なし（後続は記録・保管先整理のみ）。本番build `2FcaArM19tKbeklfDHexd`、Web tag `plunode-web:related-themes-0267d4ef`。
- Dockerfileの正式用入力を維持。theme-discoveryのfeaturedThemeIds、商品・推薦・offer、読み物挿絵、Entity補足の同梱初期値が空であることをimage内で確認。β素材を持ち込まない。
- 型検査込みDocker build成功。アプリ関連25件はβ受入時に成功。image同一性・改竄検出の既存5件成功。archiveのtag／config／manifest／layerを検証。
- archive119,024,215 bytes、SHA256 `64f3cb754f5a66ac715e55d6eee495f6e97200e8c32743f31cd75ed4e2b35a7e`。SSH転送後の全ファイルSHA一致。SHAは同一性確認であり、署名や受入判断の代替ではない。
- 本番の既存5テーマ（ゴジラ10版・ウォークマン7版・PLUTO13版・黒澤11版・Webb23版）のtheme＋固定snapshotを切替前にhash記録。本文・画像・商品や公開Recordへの書込操作は行わない。

## 切替手順

`scripts/release-related-themes-production.py`を使用。既存R6初回scriptは再実行しない。

1. 既存の本番共通ロックを取得。現在の設定・Web identity・build・台帳・サービス稼働を再照合。
2. archive全体とOCI config／layers・source label・image内build・AI教育artifactを検証。新旧の差がWeb imageだけであることをCompose正規化結果で確認。
3. Compose・private envをroot-private backupへ保存。旧imageは保持。
4. Webだけを`up --no-deps --pull never --wait`で切替。readiness・build・設定hash・台帳・他container ID不変を確認。
5. 完了receiptを保存。再実行時は先に完了receiptと現行buildを確認し、完了済みを旧Composeとの差異として誤判定しない。

不具合時に戻すのは同一schemaの旧WebとComposeのみ。DB dumpの復元・一般投稿審査やWorker変更は行わない。

作業用資材・監査・private補助コマンドはignoredの`backups/related-themes-production-20261115/`に保持。sudo入力用の`run-release.py`は共通hold内で動作し、別タイミングの実行時は共通guardを取得する。

## 現在地

本番切替・正式URLのPC／375px確認まで完了。iPhone実機は未確認。


## 本番反映・正式画面確認の結果

- 本人sudo実行による切替完了receiptを取得。2026-11-15 20:45 JST、source `0267d4ef544f5dba3c28b80d1637a32dbde57f36`／build `2FcaArM19tKbeklfDHexd`へ切替済み。正式外側HTTPSの`/api/publication/compatibility`も同じbuild。
- 配置imageのconfig ID `sha256:d4571420b7dfc601af3375735b6c361f0ef7983252c3c40eba5fabe2d201a375`と、VPSのcontainerd manifest ID `sha256:f794b4e2219fbb2384ae97bfa8c850c8e3bdeffa6ec8b50beaaa1dcef364fe21`をarchiveからそれぞれ照合した。
- readiness成功。会員44／知識9のmigration名・checksum、private設定、PG／KG／3 Workerのcontainer ID、AI教育artifactが不変。Compose差分はWeb imageのみ。本番KGのrevision `f5dbf83f-c89e-4e40-95ee-57957016089f`を維持。
- 切替前に記録した既存5テーマのtheme＋固定snapshotは、切替後も全件hash一致。テーマ版、本文、Entity／Record／根拠／画像・商品参照を変更せず保持。βコンテンツの投入なし。
- 新しい公開カタログ5件すべてにRecord索引あり。ゴジラと黒澤テーマが互いに関連し、その他3テーマは関連0件。自テーマを除外。
- 正式URLのChromeで、ゴジラの中央下部とテーマ詳細の両方に「関連するテーマ」→「関連アイテム」の順で既存の一覧が表示された。右欄のリンクから黒澤テーマ構成版11へ遷移成功し、逆方向の関連先も表示。戻る操作を保持。
- 375×812pxで中央下部と右から重なる詳細サイドバーの両方を確認。横はみ出しなし、既存の商品画像・購入先・資料・詳細の閉じる操作を保持。iPhone実機での試験ではない。
- 新規登録・編集・購入・一般投稿・AI送信の操作は行っていない。ChatGPT Appの操作定義は変更不要であり、今回更新していない。
- 設定backupは `/opt/graph-knowledge/backups/related-themes-web-20261115T114525Z`。旧Web imageと旧Composeを保持し、DBは戻さず旧Webのみへ復旧できる。今回復旧処理は実行していない。
- 最新mainへの変更はリリース手順と記録だけで、ローカル3200／HTTPS βのアプリbuild `2N-66lxS1DhXzfVk9aKYP`は保持。βの`/api/dataset`は`public-kg`、revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`を確認。不要な再build・Worker再起動なし。

画面記録：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/related-themes-production-20261115/` の `before-pc.png`、`after-pc.png`、`after-mobile-center.png`、`after-mobile-detail.png`。

手順・準備記録は`0c2c6e17`でcommit・push済み。最終確認の記録も日本語メッセージでcommitし、同じupstreamへ通常pushする。署名・認証・権限・Git設定を緩めない。
