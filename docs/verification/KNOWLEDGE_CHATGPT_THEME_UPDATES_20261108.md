# ChatGPTからのテーマ作成・直接更新の是正

## 対象と現在地

新規テーマ登録だけを確認し、Chatから既存テーマを更新できない不足を残していた。収集計画の作成や運営画面の操作を利用者へ追加する説明は撤回する。今回は直接更新を実装し、既存環境への配置と実接続確認を行う。現在は実装・隔離検証・β配置と処理系の復旧まで。本番切替と実ChatGPTの更新確認は未完了。

## 実装

- 同じ `themes:compose` の運営接続に、完全な入力schema・資料URL例、テーマの検索／取得、公開共通参照の検索／取得、`update_theme` を追加する。collection-onlyの既存5操作を拡張しない。
- テーマ名・説明・原語・初期表示・年表構成、既存／新規知識の追加・内容版選択、掲載解除・順序を更新できる。省略は保持し、同じテーマIDの新しい内容版とする。
- URLは資料原本へ保存し、引用・箇所と結ぶ。新しい事実と根拠は共通の検証・意味重複確認を通す。テーマ自身の背景も対応し、構成だけ先に変わることを避ける。
- 取得版の競合を黙って上書きしない。再送・取消・権限失効、共通commit後の応答喪失は永続受付で扱う。既存Capsule／旧版／共通知識を削除しない。
- 038は受付対象の一意制約の変更と索引だけ。036／037等の適用済みchecksumは保持。知識DBの追加migrationなし。

## 隔離検証

PostgreSQL17の専用tmpfsコンテナ、専用 `graph_member_test` と `plunode_knowledge75_test_capsule_share` を使用。本番／βのDBは変更していない。

既存6件＋新規5件の実DB検証に成功。同じIDでの編集、原資料URLの保持、旧テーマ版保持、既存Recordの追加／並べ替え／掲載解除、競合・取消・ACK喪失と再送、通常の確認を通るテーマ固有背景を確認した。会員000〜036のchecksumを保持し、037／038追加後39件・再実行不変を確認。

MCP・入力契約・既存収集／認可の19件も成功。新規作成／更新の14操作と、collection-onlyの5操作を区別した。型検査・変更対象lintを確認済み。受理モデルの応答と原資料本文はfixtureで、実Gemini・実ChatGPTの成功を意味しない。

最初の実DB試行は運営feature flag不足、次は使い回したfixture DBのmigration比較が原因で失敗。テスト環境を修正後、背景ケースで既存の原本受理制約との不足を検出して補修した。その再実行のquota待ちはfixtureの分単位枠によるもので、テストのthroughputだけを調整。正式・βの利用量枠や認可は緩めていない。

## 配置前の状態（履歴）

配置前の3200／HTTPS βはapp4dd8af25／buildT0in9w8OdeSYUhnlpc_gK。本番はapp4dd8af25／buildVhZydgGnOKI5nCb9w6khBのまま。最新のβ配置は次節に記載し、正式反映・実ChatGPT確認とは区別する。


## β配置と正式資材の照合（22:52 JST以降）

アプリsource `a2712fc6674294a79e0d666497e442074db2cc8b`。変更コードd74f3c37、接続同意文言a2712fc6、公開手順be29be1c。β／正式webpack buildとも型検査込みで成功。

- 3200／HTTPS β build `5XPEJUNPcGXW1WRVI4TlF` へ反映。実物Member backupを分離DBへ復元し、86→86表・ledger38→39、038だけを追加。旧checksum・全行・所有者の保持、再実行不変を確認。private runtime16設定のファイルhashを保持した。
- backup `.local/theme-updates-20261108/beta-backup-20261108T225210`、Member dump SHA256 `cdef8b9184e8de627d712fbacc0aa3a2b71de1611f52e3102768a4d0388c6e65`。
- localhost／HTTPS βでdataset200・テーマhome200（既存3テーマ）・MCP未認証401。実Googleセッションの既存年表／関係図・行の展開・NASA資料URLと右詳細の対応を確認。これは既存閲覧の回帰確認であり、βの既存collection-only Appから新しいcompose操作を実行した記録ではない。
- 正式build `jGYRGPYTKRpa4o6BWC8cr`。Web／ops source labelと038を照合し、image archiveをVPSへ直接転送した。開発PCのCドライブ空き不足を避けるため、約581MBのarchiveをPCへ重複保存していない。VPS側でarchiveのconfig／manifest／全layerを固定SHAへ照合。archive SHA256は非公開manifestに保存し、RELEASE-SHA256SUMSで全資材を照合済み。
- 正式の直前構成は、検証済みの前回暗号化backupからcomposeを再構成し、配置済み4dd8af25のimage tag・build・設定hash・会員38／知識9に固定。新scriptは実機の設定・image・ledgerが相違すれば停止前に中止する。
- 本番は未更新。`sudo -n true` はパスワード要求で失敗。本人用入口は `backups/theme-updates-20261108/run-release.py`。既存の端末継承helper・共通guardを使う。公開後の実ChatGPTからのテーマ取得・直接更新は未確認で、是正全体を完了扱いにしていない。

追加の確認観点：現在の接続には `themes:compose` があるためAppは維持する。ツール一覧の更新を確認し、scope追加や別App作成へ無断で変更しない。実ChatGPTの確認では、既存テーマの対象版を読み、同じIDへの小さな説明更新と復元、旧版・資料URLの保持を確認する。別更新との競合時には上書きせず停止する。

## β確認Workerの復旧（23:14 JST）

最終稼働確認で、review Workerだけが起動後に終了していた。実設定schema・資格・キー所有者の確認と、送信前heartbeatでの診断から、既存の `review_projects.config_digest` が承認済みβ設定と不一致で停止していたことを確認。β設定は100回／日・3100回／月・gemini-3.1-flash-liteで、ファイルの変更や利用量枠の拡大はしていない。最初の復旧probeは月次値を3000と仮定したassertで停止し、DB／プロセス変更前に終了したため、実物3100を確認して修正した。

同じβ設定を利用するreview／reader／patrolだけを正常停止し、旧識別値との条件付き更新で現在の承認済み設定を採用。review_attemptsの全行hashが採用操作の前後で不変であることを確認した。既存の台帳・送信履歴・cooldownを削除／resetしていない。3 callerを同じvalidated launcherから再開し、publisherを含む4プロセスのmain cwd・稼働、設定digest一致、2.35秒前のheartbeatと通常iterationを確認した。旧reader／patrolには既存のretryログがあり、これを全件成功と扱わない。正式環境・共有Kevは変更していない。

非公開記録は `.local/theme-updates-20261108/beta-review-recovery.json`。この補修は既に承認された実行設定の整合回復で、Chatからのテーマ更新に運営者の手作業を追加する仕様ではない。038適用時の旧行保全とは、後続のこの明示補修を区別する。アプリsource／build／imageは変更なし。
