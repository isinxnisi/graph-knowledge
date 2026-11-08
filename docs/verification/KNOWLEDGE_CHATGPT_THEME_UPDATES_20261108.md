# ChatGPTからのテーマ作成・直接更新の是正

## 対象と現在地

新規テーマ登録だけを確認し、Chatから既存テーマを更新できない不足を残していた。収集計画の作成や運営画面の操作を利用者へ追加する説明は撤回する。今回は直接更新を実装し、既存環境への配置と実接続確認を行う。是正は完了。main／3200／HTTPS β／正式VPSへ反映し、同じChatGPT会話と既存正式Appから既存テーマを直接更新・復元して公開結果まで確認した。以下の「未完了」「未更新」は各時点の履歴で、最終結果は末尾を参照する。

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

## 正式反映・同じChatGPT会話の直接更新を完了（23:16〜23:29 JST）

本人が準備済みrunnerを実行。転送資材・現行構成の再照合後、86→86表、会員ledger38→39へ038だけを追加し、分離した復元DBで旧checksum・全行／所有者の保全と再実行不変を確認した。知識DBの9件は変更なし。Web／3 Workerはapp `a2712fc6674294a79e0d666497e442074db2cc8b`、正式build `jGYRGPYTKRpa4o6BWC8cr` へ切替。

- Web tag `plunode-web:theme-updates-a2712fc6`、manifest ID `sha256:5ff39ebcb1b43f091f3bb4888b768ef07c66492c3aa3038cbfbe7de61fe93d05`。ops tag `plunode-knowledge-ops:theme-updates-a2712fc6`、manifest ID `sha256:a4b820ebd50eb33d4285bb1f7a2dc1bd7f78f6aa9c016f5ed6f1ceecee841671`。
- 正式backup `/opt/graph-knowledge/backups/theme-updates-release-20261108T141614Z`。Member dump `8b565da1cc5ba7852ee55eb1cad6a14dd650c8e8b0956ece543b1a6e08703110`、Knowledge dump `c4d6df25718a76230e2059db7a7a40bc41f77422d504a8685f8315e226bc2665`。暗号化archive `328f4cf0fccec35729ab4765834d39d8ddcede3a62b668eb602bc2c8ee46dff4`、wrapped key `1e9cd0e780870ee5a336b8a1a8032c208e88a3373968531dd46f346c763e7c0e`。PCでRSA/AES復号し、tarをstream読取して両dumpのSHA256一致を確認。平文archive・設定・鍵の追加保存はしていない。
- 既存の認証・設定・会員／Capsule・旧KGコンテナ・AI artifactを保持。OS／Caddy／共有Kev、既存予定の変更はなし。

### 実ChatGPTの受入

既存App `plugin_asdk_app_6aeffba90628819181cfb1d6eb54a8d0`、同じ会話 `https://chatgpt.com/c/6aef440d-ceac-83ee-b59b-163349281c60` を継続した。App管理の「ツールを更新」は初回に一般エラーが表示されたが、次の試行後に新操作が利用でき、実際の読取・更新を確認した。初回の原因は特定していない。App作成／OAuth再接続／scope追加、収集計画の新設はしていない。

1. `get_theme_authoring_guide` と `read_theme` で正式Theme `theme:915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1` の構成版3を取得。4 Record／3 Entity／3 Source／3年表配置と、NASAの原資料URLを確認。
2. `update_theme` で説明末尾へ「関係図と年表を並べて読める。」だけを追加。requestId `8c55fd4a-6e81-4db4-a19d-49fa9c06e2e8`、同じIDの構成版4として `published`。`get_theme_registration` と `read_theme`、正式公開APIで反映を確認した。
3. 取得した構成版4から同じ更新操作で元の説明全文へ復元。requestId `6d0a48be-7db5-40e2-8e45-39cbdd76c71e`、構成版5として `published`。Chatから再取得し、正式公開APIでも確認した。
4. 元の構成版3・中間版4が不変で取得でき、最終版5のcontentが元の版3と完全一致することを比較した。snapshot・4 Recordの詳細、3原資料URL・言語・年表構成・既存pinsは3→4→5で不変。公開世代は `pending:false`、`lastFailure:null`。

今回は説明の構成編集なので、新しい知識・原資料やGemini呼出しは発生しない。資料URL付き新規項目、背景の通常確認・競合・取消・再送・掲載解除などは前述の隔離DBテストで確認した範囲であり、今回すべてを実ChatGPT／実AIで再実施した意味ではない。保存済みCapsuleの断面保全は移行時の全行比較と隔離検証で確認し、今回あらためて個人のCapsuleを保存・共有し直してはいない。

### 最終の閲覧・配置状態

- 正式Chromeで構成版3を再読込し、固定版が突然5へ切り替わらないことを確認。最終構成版5で年表／関係図・元の説明・既存Googleセッションを確認した。確認URLは `https://plunode.net/?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=5&kview=split`。
- localhost3200は同source、β build `5XPEJUNPcGXW1WRVI4TlF`。dataset／theme-homeは200。HTTPS βも実ChromeでTOP→紹介テーマ→年表／関係図と既存Googleを確認。Python既定UAでのβ再照合はCloudflare 1010・403だったため、ブラウザでの確認と区別し、保護設定を変更していない。
- 正式dataset／theme-home／固定版APIは200、未認証MCPは401。誤った `/api/knowledge/theme-home` を試した際の404は存在しない検証URLによるもので、実API `/api/knowledge/public?mode=theme-home` へ修正して確認した。
- 今回の専用tmpfsテストコンテナだけを検証後に削除。実DB・既存volume・旧backup・private設定は保持。
- 実画面記録：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/theme-updates-formal-v5.png`。非公開のactivation・復号照合・版比較は `.local/theme-updates-20261108/` に保持した。

是正全3工程（不足照合／実装／接続確認・反映）を完了。既存テーマへの直接更新に、利用者が運営画面で収集計画を作成する手順はない。Chat側ではテーマURLと変更内容・資料URLを伝えれば、取得した固定版を対象に更新できる。
