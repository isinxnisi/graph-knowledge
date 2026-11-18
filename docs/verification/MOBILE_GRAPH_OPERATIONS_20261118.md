# Graph・隣接一覧・テーマ制作画面の表示修正

2026-11-19、βと正式への反映・確認完了。iPhone実機は未確認。PC Chromeのスマホ幅試験とは区別する。

## 最終反映版

- アプリsource：`a1ca2e7b765a2bc946b00ec16b17be5c1902925d`。
- 正式build：`b-6Zi81Rn4b42IMUe8Mew`。image manifest：`sha256:235b1f22dfbd9bea5ac15694f265848ae1da4dc5862bb12a4016af923acccb3c`。
- β build：`YsdByjjz6tjlDvSmTAKce`。
- 正式確認URL：`https://plunode.net/operations#themes` とPLUTO本線Graph。
- 戻り導線の追補backup：`/opt/graph-knowledge/backups/mobile-ui-return-web-20261118T150840Z`。初回表示更新backup：`/opt/graph-knowledge/backups/mobile-ui-web-20261118T144515Z`。

## 変更

1. 共通GraphCanvasの通知右端に、鍵44px・右余白12px・間隔8pxを予約した。本線・テーマ・その他のGraphで共有する。鍵は既存の控えめな表示を維持し、ロック／解除・ズーム・スクロール操作は変更しない。
2. 隣接関係の大きいカードと余白を、区切り線のあるコンパクトな行へ変更した。関係名、両対象、限定・期間・出典数と既存2操作を保持。表示順の説明は小さい開閉とし、操作ラベルを短くして完全なアクセシブル名も保持する。
3. 素のHTMLだった制作一覧を既存OperationsPageへ統合した。サイトヘッダ、運営メニュー、制作／見直し／公開状態、作業・公開版、検索、状態フィルタ、再取得を提供する。長い残作業・阻害理由は初期閉状態で、開くと全文を読める。通常のプレビューへ移動できる。

`GET /api/site-operations/themes` は既存運営者認証と一覧取得を再利用する読取専用API。activeな運営者限定、X-Member-User不一致を拒否し、private/no-store/noindexを付す。画面に必要な状態・版・残作業だけを返し、別運営者の案件・保存済み送信・原稿・素材は返さない。MCP操作・Appツール定義の変更はない。

旧一覧URL `/operations/themes` は認証後に既存運営画面へ案内する。初回正式確認中に、プレビューのNext Linkが旧入口を経由するとfragmentが重複して `/operations#themes#themes` となり、受信箱へfallbackする不具合を発見した。この戻りリンクを直接 `/operations#themes` へ指定する1行の追補を行い、β・正式で実クリックによる戻りを確認した。

## 検証

- ESLint、TypeScript、β／正式用webpack buildは成功。
- 初回の既存UI・preview・新API試験122件中121件成功。既存Capsule一覧の初回描画待ち1件がtimeoutしたため、同一コードの対象再実行8件で成功。運営一覧の権限・切替・古い応答拒否を含む最終12件と、戻り導線追補時の関連経路10件も成功。
- 運営登録やAI処理を変更するAPIではなく、書込操作は行っていない。
- 長い閉枝メッセージは独立した一時ソースの検証専用画面＋専用headless Chromeで320／390／1280pxを確認。横はみ出しなし、鍵と通知の間隔8px。検証用ページはignoredな一時ソースのみに置き、受入source・imageには含めない。
- 正式の最新反映版を独立Chromeの390pxタッチ／1280pxで確認。表示中のoverlay・鍵のbboxは非0、間隔8px、隣接6行は各112.17px、横はみ出し・pageerrorなし。
- β／正式HTTPSでdataset・公開catalogue・operationsは200。匿名の制作一覧と新APIは404、private/no-store/noindexを確認。
- 実Chromeで正式の制作一覧9件（確認時：制作1・見直し1・公開7）を取得。PCと375px表示、状態フィルタ、残作業の開閉・全文保持、運営者プレビューを確認した。
- βは直接プレビューから戻る操作と「一覧→プレビュー→一覧」の再往復で成功。正式の追補反映後も、プレビューの戻りリンクが正しいURLであることと、実クリックでテーマ制作一覧へ戻ることを確認した。
- iPhone実機・Safari実機は未確認。実Chromeのエミュレーションを実機試験とは報告しない。

## 配置と保全

固定sourceからβ buildと正式imageを構築。OCI全blob・sourceラベル・build・再load後identityと、VPS転送後の全4ファイルのsha256を照合した。Webのみ更新し、DB migration、Worker更新、正式設定の変更はない。

本番preflightは直前Web image/build、検証済みCompose backupのhash、private設定、migration ledgerと、明示Hostを使う既存HTTP到達を照合する。候補ComposeはWeb image以外が同一であることを比較する。Node fetchがHostを無視する既知問題を避け、実HTTP試験3件で検証したNode HTTPの同一probeを使用した。

正式反映の記録でmember ledger47／knowledge ledger10、Worker・設定・KG・AI artifactと既存訳文850版の保持を確認。DB dumpの復元はしていない。テーマ・制作案件・共通知識・品質ガイド・予定の変更操作も行っていない。共通Kev、一般投稿のAI審査や運営AI経路は変更していない。

直前af9d4fb8は同じschemaと非公開境界を扱える互換Webで、必要時は検証済みbackupのComposeとそのimageを使うWebだけの復旧が可能。DB dumpへの巻戻し、非互換な旧Webへのdowngradeは行わない。既存sudoの本人入力を使い、権限設定を緩めていない。
