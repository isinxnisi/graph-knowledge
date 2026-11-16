# Webb正規英語URLの再発防止（2026-11-17）

**最新状態：正式Web／β反映、正式3ページの実GET・PC／390px描画、既存両Appの35操作への更新まで完了。** 実装5e9794ea／正式build dJLwwh5ypWeIP7go4Rz-Y。新しい検査操作そのものの実ChatGPT呼出し、iPhone実機、Google Index登録は未確認。以下に途中時点の記録も保持する。

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


### 最終β版の確認

source `5e9794ea`／build `rbgG2la6EPIXEYbI2FyWw` へ差替え、日英の実GET検査がともに200・issues空。既存Webb構成9を保持し、正式Webb構成27のデータをβへ投入していない。最終390pxも本文・Graphを描画し、横はみ出しとpageerrorなし。

[β GET結果](assets/webb-locale-20261117/beta-get.json)／[正式の変更前390px](assets/webb-locale-20261117/formal-before-en-390.png)／[最終βの390px](assets/webb-locale-20261117/beta-en-390.png)。βと正式は既存データが違うため、本文の差を実装修正の差としない。

最終本番候補build `dJLwwh5ypWeIP7go4Rz-Y`／Web config ID `sha256:8088ee2294656dc5033f7dc9ddae64f609530c5b35f1c2b3c2bc94a6f3cd0040`。imageのsource label・config／manifest／全レイヤー・archive SHAを照合した。正式切替と適用後GET／描画、既存Appの追加操作の更新・実呼出しは別途残る。


### 正式切替待ちの固定資材

2026-11-17、最終archive `a780b521304eeae6b35604d42565dc9f48911e287a76ded9f56db02df141523e`（124,303,334 bytes）を `/home/develop/plunode-webb-locale-20261117/release-5e9794ea` へ転送し、image／manifest／配置script／helperの現地checksum一致を確認。前の未完了転送は使用しない。

正式のsudo非対話実行はパスワード要求で停止するため、本人terminalで `backups/webb-locale-20261117/run-release.py` を実行する必要がある。wrapperは既存SSH経路を使い、共通ロックを取得し、固定checksumを照合してから既存root権限の入力を要求する。現在fa35377bのWeb・build・image・Compose導出・private設定hash・会員45／知識9のledger・稼働サービスを検査し、Composeと設定をbackupしてWebだけ更新する。DB／訳文／Worker／品質ガイド本文を変更せず、互換旧Webへの復旧だけを用意する。まだ正式切替後のGET・描画を確認した意味ではない。


## 正式Web反映・実URL確認（2026-11-17）

本人terminalの既存sudo入力後、source `5e9794eac52779ea93d39c7fb08e86b9183d008b`／build `dJLwwh5ypWeIP7go4Rz-Y` のWebへ切替。VPSのOCI manifest IDは `sha256:25374e8d7f82c4de543d22666be966f99c3f0da7d3c2fd590152ee91c506e7e7`。開発PCのconfig IDと異なるが、同じarchive内のmanifest/config/全layer照合で同一imageと確認した。exportされたactivated.jsonもSSHで回収・照合済み。

バックアップ `/opt/graph-knowledge/backups/webb-locale-web-20261116T233125Z` に旧Compose／private設定／manifestを保持。Webだけの互換更新で、DBを復元・移行していない。会員45／知識9のchecksum ledger・Worker／設定／KG／AI artifactを保持し、切替時の既存訳文667版が不変。

正式GETはWebb日英（提供／最新27）と対照黒澤英語（12）の3ページすべて200／issues空。実本文・題名・lang・自己canonical・OGP参照版・robots/meta/HTTP header・hreflang・サイトマップを確認し、意図しないnoindexなし。正式Appの既存get_theme_authoring_guideからcanonicalPublicationの新操作・schema／手順と品質ガイド4版を実読取した。

独立したChrome試験contextでPC日英・英語390px・対照PCの4画面を描画し、本文・9 canvas・構成27／12・横はみ出しなし・pageerrorなしを確認。iPhone実機の確認ではない。スクリーンショット撮影時の外部font待ちが長い場合はfont待ちだけを除き、画面の可視本文とGraphを確認した。

[正式GETの検査結果](assets/webb-locale-20261117/formal-get.json)／[描画結果](assets/webb-locale-20261117/formal-browser.json)／[PC英語](assets/webb-locale-20261117/formal-after-en-1440.png)／[390px英語](assets/webb-locale-20261117/formal-after-en-390.png)。Google検索のIndex登録成功を確認した意味ではない。

Appのツール更新・新操作の実呼出しは次の記録で区別する。実Theme／訳文／品質本文の追加更新はこの確認では行っていない。


正式英語OGP画像も `revision=27` を実GETし、200／image/png／1200×630を確認。

本番の既存App「Plunodeテーマ・資料 API（本番）」の「ツールを更新」を実行し、同じApp ID／endpointで `check_theme_publication` の説明とRead14／Write21（合計35）をChatGPT Webの実画面で確認した。接続／権限／予定の変更なし。このCodex会話の呼出可能一覧は旧定義のままで、新操作の実ChatGPT呼出しは未確認として分ける。サーバーの同じGET検査関数による正式3ページの実HTTP合格、既存Appから新技術ガイドを読めたこと、Appに新操作が表示されたこととは区別する。


βの既存App「Plunode資料収集 API（β）」も同じID `6aef2b97439081919c3828f9080c4c6f`／endpointを維持して「ツールを更新」を実行し、Read14／Write21とcheck_theme_publicationの表示を確認。再作成・再同意・接続先／権限／予定変更なし。本番・βともApp側の更新操作は済んでおり、利用者による再更新を完了条件として残していない。

### 完了範囲と残る確認

- データ：既存11訳文を再登録せず、テーマ構成27／対照12、切替時の既存訳文667版、品質ガイド4版本文を保持。
- コード／試験：安全な言語別提供版と対象GET検査を実装。隔離15件・登録32件・訳文30件・UI／SEO／検査66件、追加接続timeoutの14件、型検査／lint／最終両buildが成功。試験群には共通テストの重複があるため単純合計しない。運営AI送信0／一般投稿の既存審査を保持。
- 配置：β rbgG2la6EPIXEYbI2FyWw、正式 dJLwwh5ypWeIP7go4Rz-Y。DB migrationなし、Webだけ更新。
- 正式GET／描画：日英Webbと対照英語の3検査合格、PC日英／英語390px／対照PCの4描画合格、OGP画像200・PNG1200×630。Google Index登録成功とはしない。
- 接続：既存両Appを35操作へ更新し、新操作表示／既存ガイドからの技術契約読取を確認。Codexの呼出可能ツール一覧には旧定義が残るため、新操作の実ChatGPT呼出しは未確認。通常利用時は上の入力例を使う。新規登録や手動復旧を要求する仕組みは追加していない。
- 保守的な制約：既存内容を訂正・削除・非公開化した版をまたいで旧版を出さない。訂正の英訳が未準備の場合は正当な訂正／撤回を優先する。iPhone実機は未確認。
- 復旧：記録したbackupのCompose／旧Web imageを再照合し、同じDB schemaで互換な旧Webだけへ戻す。DB dumpの機械的復元やWorkerの巻戻しは不要で、実施していない。
