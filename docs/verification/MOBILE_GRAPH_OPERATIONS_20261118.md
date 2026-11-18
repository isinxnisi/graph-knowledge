# Graph上部・隣接関係・テーマ制作一覧の表示修正

## 対象と変更

2026-11-18の本番iPhone画像3点への対応。登録内容、制作案件、予定、AI経路、DB schemaは変更しない。

- 共通GraphCanvas内の通知の右端に、鍵44px＋右余白12px＋間隔8pxを予約する。本線・テーマ・その他のGraphに共通。鍵は控えめな既存表示を維持し、スクロールロック／解除・ズームを変更しない。
- 隣接関係は大きいカードとアクション下部の区切りをコンパクトな行へ変更。関係名、両対象、限定・期間・出典数と既存2操作を保持し、順位説明は小さい開閉にする。短い操作ラベルにも完全なアクセシブル名を残す。
- 素のHTMLだった `/operations/themes` を認証後 `/operations#themes` へ案内し、既存OperationsPageのヘッダ・運営メニューへ統合する。状態・作業版／公開版、検索、状態フィルタ、読取再取得を提供する。長い残作業と阻害理由は初期状態で閉じ、全文を保持する。
- `GET /api/site-operations/themes` は既存運営者認証と一覧取得を再利用する読取専用API。activeな運営者限定、X-Member-Userの不一致を拒否し、private/no-store/noindexを付す。画面に必要な状態・版・残作業だけを返す。別運営者の案件、保存済み送信、原稿・素材は返さない。
- MCPの新ツール・定義更新は不要。制作・公開制御の実処理は変更しない。

## 検証

- 既存UI・preview・新API／一覧試験：初回122件中121件成功。既存Capsule一覧の初回描画待ち1件だけtimeout、同じコードの対象再実行8件成功。新しい運営メニュー統合を含む最終12件も成功。
- ESLintとTypeScript成功。
- 独立した一時ソースの検証専用画面＋専用headless Chromeで390／320／1280pxを確認。実コンテンツへの書込みなし。通知右端と鍵左端の間隔8px、横はみ出しなし。隣接関係は例示データで各112px、制作一覧は残作業を閉じて各110px未満、ヘッダあり。
- 画面検証はPC Chromeのスマホ幅／タッチ設定。iPhone実機の結果とは区別する。

## 反映・復旧

固定source `af9d4fb89a022a9d4a67370599fd084aafcaccb6`、β build `T3HIaHnqjkEkRXH4phch5`、本番候補 build `lIpkQZTjUgXMU7eEDBDk1`。βは反映済み。本番はまだ未反映。Webのみ更新し、DB migrationとWorker更新は不要。現行2f2dbfafは同じschema47/10と非公開境界を扱える直前版であり、失敗時はそのWebに限って戻せる。DB dumpの復元や古い非互換Webへのdowngradeはしない。


β実確認：HTTPSのdataset／公開catalogue／operationsは200、匿名の制作一覧・新APIは404とprivate/no-store/noindexを確認。ログイン済み実Chromeで `/operations/themes` → `/operations#themes`、実一覧8件（制作中1・公開済み7）、ヘッダ・運営メニュー・作業／公開版を確認した。

本番資材：Web imageをOCI archiveにして全blob・sourceラベル・buildを検証し、ローカルで再loadしてidentity照合。VPSへ転送して全4ファイルのsha256を現地検証済み。本番preflightは互換直前2fのimage/build、既知backupから導出したCompose、private設定、ledger47/10、既存HTTP Host到達を照合する。変更候補のComposeはWeb image以外が同一であることを比較する。

`sudo -n true` は既存パスワード要求で終了1。本人入力用 `backups/mobile-ui-20261118/run-release.py` は準備済み（ignored/private、Gitには配置ロジックだけ）。公開許可の再確認ではなく既存認証の本人入力が残る。切替後の正式URL・実Chromeは未確認。

β反映版の実公開データ：独立Chromeの390pxタッチ／1280pxでPLUTO本線Graphを確認。表示中のoverlayと鍵（非表示の同名要素は除外）のbboxがともに非0で、間隔は8px。隣接関係6行は各112.17px、横はみ出し・pageerrorなし。長文の閉枝メッセージは隔離画面で320／390pxを確認済み。検証用ページはignoredな一時ソースにだけ置き、受入source・imageには含めない。

## 正式反映後の確認と戻り導線の追補

最初のWeb更新af9d4fb8／build lIpkQZTjUgXMU7eEDBDk1は本番へ反映済み。backup `/opt/graph-knowledge/backups/mobile-ui-web-20261118T144515Z`。ledger47/10、Worker・設定・KG・AI artifactと既存訳文850版を保持。正式HTTP5経路と390／1280pxのGraph・隣接6行は合格。

実Chromeの正式一覧は9件（制作中1、見直し中1、公開7）。375pxでもヘッダ・一覧・状態フィルタを確認できた。ただしプレビューの旧一覧リンクをNext Linkで辿ると、リダイレクト先のfragmentが重複して `/operations#themes#themes` になり、受信箱へfallbackする不具合を発見。Explorerの戻りリンクを `/operations#themes` へ直接指定し、この導線を再検証して追加Web反映する。DB・内容・旧URLの認証契約は変更しない。
