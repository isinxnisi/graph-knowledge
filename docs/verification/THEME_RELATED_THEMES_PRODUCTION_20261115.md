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

構築・転送照合まで完了。本番切替と正式画面確認は本人sudo入力後に続ける。PCスマホ幅とiPhone実機は区別して記録する。
