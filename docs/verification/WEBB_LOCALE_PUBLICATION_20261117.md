# Webb正規英語URLの再発防止（2026-11-17）

## 確認とデータ保全

開始時の正式Appのread_themeはWebb構成27。共通品質ガイドは保存4版／本文1.6を読み、本文を改訂していない。先行した11訳文の登録を再実施していない。Webb日英・対照黒澤英語の実GETはすべて200、題名・実本文・lang・自己canonical・index/follow・サイトマップ掲載を確認した。開始時点の404は再現しておらず、以前の報告を独立に観測したとはしない。Windows NodeのHTTPS取得で確認し、Web取得ツールの到達失敗とは区別する。

## 変更

[事前設計](../design/THEME_LOCALE_PUBLICATION_20261117.md)。既存の公開Theme版・参照版・訳文履歴から、正規ページの言語別提供版を解決する。既存部分を維持した追加だけの場合に、当時すでに必要訳文が公開されていた直近の安全な版を提供する。翻訳充足後は新しい版へ進む。初回未翻訳・原文訂正・削除・差替え・参照版更新・公開撤回・訳文撤回は旧版で迂回しない。未翻訳追加がある提供版にはその旨を表示する。

本文、Graph、metadata、OGP、sitemap、hreflangの提供版を揃える。通常のread_theme・探索・Capsule・明示した版固定は変更しない。DB migration・新Worker・定期巡回・LLM送信は追加しない。

既存運営MCPへ読取専用 `check_theme_publication` を追加。入力例：

```json
{"theme":"theme:915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1","expectedRevision":27,"languages":["ja","en"]}
```

通常の登録成功を確認してからこの操作で対象正規URLをGETする。固定正式／β origin、最大2言語だけを検査する。HTTP・題名／本文・lang・提供版・canonical・OGP版・robots/meta/HTTPヘッダー・hreflang・sitemapを照合し、DNS／timeout／HTTP／本文／noindex／sitemapの問題を区別する。βのnoindexを合格条件として保持する。`translationPending` と最新／提供版を返し、Google Index成功は返さない。共通品質ガイド本文ではなくget_theme_authoring_guideの技術手順・入力schemaに接続した。

## 試験

- 隔離PG：言語提供15件成功。英語公開→日本語日時Record追加→翻訳待ち→英訳反映、検索入口、初回未翻訳、訂正・edit/revert、削除・再追加、訳文／原資料／Record／Theme撤回、日英差、存在しないID、版固定を確認。
- 登録32件・訳文30件成功。既存冪等性・権限・原文照合・運営AI送信0・一般投稿の上限／審査を維持。
- 対象HTTP検査14件、metadata6件、sitemap1件、Workspace30件、読取更新14件、画像生成1件、計66件成功。保持言語版のOGP／本文marker、βnoindex、soft404、エラー種別も確認。
- TypeScript・対象ESLint・git diff --check成功。

## 反映と未検証

実装commit・build、3200／HTTPS β、正式配置、App更新、実GET／ブラウザの結果は反映後に追記する。現時点ではコード試験だけを本番反映完了と扱わない。

中間確認：source6c3b2456／β build c53YHMqff31vFUo8BIHm6で、βに元からあるWebb構成9の日英正規GET検査は合格。本文・題名・提供版・OGP版・canonical・βnoindexを照合した。PC／390pxの描画も確認。最初の接続試行はUND_ERR_CONNECT_TIMEOUTでHTTP応答なし、後の再試行は200。接続timeoutの分類を5e9794eaで補正し、最終資材を再構築する。本番へ6c3b2456を配置していない。

既存Appの画面更新は、Computer UseがChromeの現在URLを確定できず安全停止したため未実施。βの既存get_theme_authoring_guideから新しいcanonicalPublication操作／schema／手順は実読取済みだが、新しいcheck_theme_publicationの実ChatGPT呼出しとは区別する。

制約：既存本文や構成の明示的訂正をまたいで過去版へ戻さない保守的な方式。訂正後の英訳が不足すれば、正当な訂正／撤回の優先によりその言語は準備中となる。Google検索エンジンの実Index登録、iPhone実機は別途未検証。実際のテーマ・訳文・品質本文を書き換える試験は行わない。
