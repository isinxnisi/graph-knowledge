# R6b 正式切替・接続確認（2026-11-08）

## 現在地

**R6b完了。正式アプリの切替・代表操作と、TCP／Caddy補修・正式復帰・backup照合を確認済み。** [Caddy最終結果と別件unit](CADDY_SECURITY_R6_20261108.md)。 [現在の影響と再開手順](LINUX_SECURITY_R6_20261108.md)。 本人の送信許可後、同じChatGPT予定から配送した2関係が通常確認・publisherを通り、Theme構成版3へ追記された。正式の年表／背景／関係図、Capsuleの独自編集保全・比較取込・保存・同じURLへの共有反映まで確認。以下の「待ち」「未確認」は各時点の履歴であり、最終結果は末尾を優先する。全件のAI処理を完遂した保証や、後続構想の年表比較／マージ完成の意味ではない。

## 配置済み

- source `027f89bfc8c2e4605ffce1ca789f814081f18b1b`、正式build `Sf6Myn-qsOSMt8bnqxpE9`。
- Web image manifest `sha256:d70a6aa1ecf562d30b83bb3017927c77246b1a5c644a12fb83751d1eead5b42c`、ops `sha256:f0af81bac0f894c945b4575369d5c9dbfc4c7521e546803b63790405364d1d99`。
- 会員ledger36／知識ledger9。旧行・所有者、KG、既存AI artifact、認証・運営設定を保持。βデータの移入0。
- 最新backup `/opt/graph-knowledge/backups/knowledge-r6-release-20261108T025210Z`。dump SHA256 `2dfc6bf5a463b5a8da9d59180fed884af451e561f0964f7d92bcb2f6688b4d6f`。暗号化backupをPCへ取得し、PCだけの秘密鍵で復号・archiveのdump hash照合に成功。復号時の一時鍵・平文archiveを削除した。
- security metadata再取得後の追加候補0。OSパッケージ変更なし。個別CVEの不在保証ではない。

## 正式サイトで確認した操作

既存Google本人セッションで通常PLUTO探索からCapsuleを保存、限定共有URLを作成、保存版1へコメント、タイトルを編集して保存版2を保存した。保存だけでは共有／OGPは保存版1のまま。明示的に共有へ反映後も同じURLを保持し、OGPタイトル・画像は版2へ変わった。旧タブは版1のまま、更新案内から明示的に版2へ進める。旧版／新版の2コメントは同じ会話へ残り、各投稿時の版へリンクする。

試験用URLは `https://plunode.net/shared/si3p4uAUwMC-AHCyV7xsxIMmIgTQ_R0_7Nz6OUQcF14`。確認後に共有を停止し、所有者画面「有効な共有リンクはありません。」を確認。旧版／新版の画像は404。停止した共有ページの200はエラー案内のHTMLであり、公開継続の意味ではない。

OGPはTwitterbot相当のHTTPで、正式originだけのメタ情報、1200×630 PNG、保存版1/2の画像hash差を確認。SNS上での実表示はこの回では未確認。告知投稿は行っていない。

正式PCの取得Worker／読解Workerを分離したstateで起動。NASAの打上げ・遮熱膜記事2件を正式APIの依頼から取得した。読解・テーマ登録・通常探索までの正式通し確認は未完了。

## 判明した不足と是正

027f89bfは既存テーマの収集・追記を提供するが、ChatGPTから新しいテーマを作るAPIが欠けていた。運営CLIでの初期投入を代替完了にせず、未実行の案を削除した。一般利用者のテーマ投稿機能を追加する合意もない。

[新規テーマ登録契約](../design/KNOWLEDGE_CHATGPT_THEME_REGISTRATION.md)に沿い、別scope・永続受付・共通根拠確認・受理Recordの版固定・作成先URLを実装。新規036のみ追加し、適用済みSQLを変更しない。隔離PGでは旧36 checksum保全・追加37件目・再実行不変、所有者境界・運営停止・取消・再送・共通commit後の応答喪失・根拠確認後の構成・年表key束縛を含む17件と型検査・対象lintに成功。fixtureの確認結果は実Google／実ChatGPT／実AIと区別する。

## 残り

βへの補修版配置と本人認証境界の確認、正式用資材と036の実物backup復元検証・反映、ChatGPTの正式接続と新規テーマの実登録、同じ会話／予定の接続先切替、テーマから探索・年表・Capsuleへの利用確認。本人のsudo入力と新しいOAuth同意は必要になった時点で具体的な手順を用意する。既存ベータの接続・スケジュールと正式接続は混同しない。

## 新規テーマの補修版：β配置・正式更新待ち

- アプリsource `14542c7282ef59a2f07a3627f3fb7583d5f1dcfa`。対象17件・lint・型検査込みのβ／正式webpack buildが成功。
- 3200／HTTPS β：build `J8c0xCK92ByIAFgkz3nbx`。実物Member backupを別コンテナのDBへ復元し旧行・所有者を照合、036だけを追加した。旧000〜035のchecksum維持、ledger37、通常migratorの再実行で変更なし。会員・Capsule・既存テーマのテストデータを削除していない。
- 実Googleセッションを保ち、TOP→Webbテーマ→中央の年表／関係図、背景情報・根拠の表示を確認。OAuth metadataは `missions:collect` / `themes:compose` / `offline_access` を広告する。MCPの匿名POSTは3200・HTTPS βで401を確認（外部検査の初回に403応答があり、通常のUser-Agent付き再確認は401。恒常的な接続障害とは判定していない）。実際の新scopeによるTheme登録は、本人の接続同意後に正式側で確認する。
- 正式候補build `wFBq24bSaSp0W-_ZOFaXr`、Web tag `plunode-web:r6-theme-14542c72`／manifest `sha256:7c675fb5dce9f6d55a4cc885823eef6ab5789c1fd4a4435ee9bd34ea18ae1fcb`、ops tag `plunode-knowledge-ops:r6-theme-14542c72`／manifest `sha256:a8c66ce8285140e1a9784347f9da50abffb4635a005ac48b5f99dd24004dfbf7`。
- archive SHA256 `1690db650b2fc25f250dd0fa54df8b1e5f067a707ca1eacc7663827dbe549fcf`。archiveのconfig／manifest／全layerと固定sourceのlabelを照合した。βのDB／秘密値／実験artifactを含めない。
- 既に切替済みのR6へ追加する専用script `scripts/release-knowledge-theme-production.py` を準備。旧構成・image・build・全設定hash・ledgerを照合し、一時停止→最新Member／Knowledge backup→Memberの別DB復元／036／再実行→暗号化backup→036と新imageへ更新する。知識migration9・旧KG・AI artifactは保持する。新scopeを有効化する1設定以外のprivate設定を変えない。
- 本番ではこの補修版はまだ未適用。本人のsudo入力が必要。初回R6 scriptの再実行や、旧dumpへの巻戻しは行わない。

## 補修版の最初の切替試行と復元手順の是正（13:11 JST）

本人のsudo実行はpreflightとMember／Knowledge backupを終え、一時復元DBのロール作成で停止した。`runtimeChanged=false`、本番migration036未実行、旧dumpの復元なし。既存サービスを再起動し、正式 `/api/dataset` とテーマ一覧APIの200、従来dataset revisionを確認した。現在の正式アプリは027f89bfのままである。

詳細な失敗stderrはroot専用stageへ保全され、非特権SSHからは読めない。起動時のUnix socketだけの準備サーバーをready扱いしないようTCPで待つ処理へ修正し、復元先に既にあるロールを再作成しないようにした。元失敗の具体的なエラー行は再実行の冒頭で、秘密値を含む行を除外して取得する。ローカルの小さい起動probe3回では元失敗を再現しておらず、特定の原因を確定したとは扱わない。

同じ本番復元関数を呼ぶ確認で、manifestに初期化専用 `production-init.sql` が混ざっていた照合ミスも検出・修正した。manifestは適用済み000〜035＋036の37件に限定し、未知SQL・欠落・旧checksum変更は停止前に拒否する。3つの回帰検査に成功した。

本番と同じ固定PG image・正式ops image・復元関数を使い、実物βの000〜035 backupを隔離DBへ復元して通常Node migratorで036を適用した。84→85表、ledger37、旧行／所有者・checksum保持、再実行不変に成功。稼働中のβ・正式DBへこの検証の変更は書いていない。正式の最新dumpによる同じ検証と切替は、本人の再実行で行う。

再開用資材は別stage `release-14542c72-r2`。最初の失敗stageとbackupを残し、同じアプリ14542c72・build wFBq24bSaSp0W-_ZOFaXr・image archiveを再利用する。PCの入口は `backups/knowledge-theme-20261108-r2/run-release.py`。新しいschema、Web、本人OAuthの接続とChatGPT登録はまだ本番未確認。

## 補修版の正式反映に成功（13:22 JST）

r2の本人sudo実行で正式反映を完了した。元の失敗は `psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory`。復元先の起動完了をTCPで待つ修正後はロール作成を通過した。

- source `14542c7282ef59a2f07a3627f3fb7583d5f1dcfa`、build `wFBq24bSaSp0W-_ZOFaXr`、Web manifest `sha256:7c675fb5dce9f6d55a4cc885823eef6ab5789c1fd4a4435ee9bd34ea18ae1fcb`。
- 正式の最新backupを分離DBへ復元し84→85表、会員ledger37。036だけを追加し旧行・所有者・checksumを維持、再実行で変更なし。知識ledger9は不変。Theme flag以外の設定、KG container、AI artifactを維持した。
- backup `/opt/graph-knowledge/backups/theme-api-release-20261108T042241Z`。
- Member dump SHA256 `07647af53b2c578fff1a535f13826aa926263f6817dde31b2b466126f2046d03`、Knowledge dump SHA256 `808a7f43a9871cba80c4c9ec8d98d920607c2d62a9a19d03a781488b88e54eab`。
- 暗号化archive SHA256 `70fa4c2c0ffc42a2f8434a5a47d9a1537710af93e47e2ab77d7a16e63e0a98de`、暗号化された鍵 SHA256 `fbb708e722be92c3218353f5488767fff293b9b96bccbe6f9c4bf7424c2a5b8f`。
- PCへ取得し、PC限定の秘密鍵で復号、両dump hashを照合した。復号時の一時鍵・平文archiveは削除済み。
- 正式 `/api/dataset` は200で従来revision `f5dbf83f-c89e-4e40-95ee-57957016089f`。OAuth metadataは `missions:collect` / `themes:compose` / `offline_access`、resourceは正式origin。正式テーマ一覧は200・0件で、手動のDB初期投入を行っていない。

ChatGPTの正式OAuth同意・同じ会話での実Theme登録・探索利用は未確認。Chromeの操作と接続一覧が3回timeoutし、本人へ再起動を依頼した。利用できるPlugin Creatorの操作はarchiveの作成／更新で、既存App所有のMCP URLを変更する操作はないため、β接続を維持した別の正式App接続を準備する方針を継続する。本人のOAuth同意を省略したり、CodexからのDB投入を代替実証にしたりしない。

### Chrome復旧後の正式接続準備

本人のChrome再起動後、同じChrome接続から操作を再開できた。ChatGPTのカスタムMCPフォームへ「Plunodeテーマ・資料 API（本番）」を入力し、正式endpoint、CIMD、正式の認可／token URL、resourceを実画面で検出した。デフォルトscopeは `missions:collect` と `themes:compose`、継続接続の基本scopeは `offline_access`。本人の作成・OAuth同意を依頼した。β接続は変更していない。新しい接続のツール利用・実Theme登録・予定の本番切替はまだ未確認。

## 本番MCP接続と実登録で検出したWorker設定漏れ

本人の作成・OAuth同意後、本番App `plugin_asdk_app_6aeffba90628819181cfb1d6eb54a8d0` で新規テーマ3操作と既存収集5操作を確認した。同じ専用会話 `6aef440d-ceac-83ee-b59b-163349281c60` から本番Appを明示し、NASAの打上げ記事と遮熱膜の展開記事をChatGPTが読み、4項目・3年表配置・split表示のテーマを送信した。一般利用者のテーマ作成UIやCLIのDB投入ではない。

requestId `9d8e337a-64d0-4b7d-9f1a-a345c38b2d12` は `saved` の後、Workerが「運営権限が停止されたため」と `cancelled` にした。receiptと公開Themeはなく、公開成功とは扱わない。接続済みMCPの同じIDの読取でも確認した。

正式の暗号化backupから構成だけを照合すると、Webには有効化フラグ2つと運営者IDがある一方、最小化したWorkerの環境には `COMMUNITY_ENABLED` / `SITE_OPERATIONS_ENABLED` / `SITE_OPERATOR_USER_IDS` がないことが判明した。既存Webの本人権限は正常。補修前の実imageはこの設定で運営判定false、同じWeb設定を与えるとtrue、停止設定ではfalseとなる3例を、ネットワークなしで確認した。

修正は既存Webのこの3設定だけをreview Workerへ引き継ぐ。Google秘密値を追加せず、既存権限の判定を緩めない。Composeの有効構成比較で3項目以外の差分なし、補修関数の保全・停止設定・未指定拒否3テストに成功した。初回の確認ではComposeの未解決canonical JSONが可変bindパスをvolumeと誤分類したため、元の固定YAMLから変数を展開せず候補を作り、有効構成で差分を再検査する方式にした。

専用 `scripts/repair-knowledge-theme-worker-production.py` は固定の現行ファイルhash・image・buildを照合し、Composeのbackup後にWorkerだけを再起動する。DB migration、Web／PG／Neo4jの再起動、image変更は行わない。取消済みの受付をDBで開き直さず、修正後に同じChatGPT会話から新しい受付として登録する。正式適用と再登録はまだ未完了。

### Worker設定補修の準備結果

修正・保全検査を `e0371f7f` でmainと作業branchへ通常push済み。実imageの運営判定3例、保全3テスト、Composeの有効差分比較に成功した。修正script・候補構成・固定manifestをVPSの別stageへ転送し、checksumを照合した。PCの入口は `backups/knowledge-theme-worker-20261108/run-repair.py`。既存sudoの本人入力を依頼中で、まだ本番へ適用していない。

同時点のlocalhost:3200／HTTPS β／正式 `/api/dataset` はすべて200。3200とβのrevisionは `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`、正式は `f5dbf83f-c89e-4e40-95ee-57957016089f`。アプリsource／build／imageとDB migrationは補修版14542c72のまま。今回のCompose／手順修正ではWebの再buildを行わない。

### 今回の画面確認の停止点

既存予定の編集画面で、名前・旧β向け指示、毎時、同じチャットを使う設定を確認した。予定の本文や接続先はまだ保存変更していない。ChromeのDOM経路は操作後の状態取得が遅れる場面があったため、ネイティブのアクセシビリティ表示で実URLと予定画面を確認した。その後、Windowsウィンドウの取得で操作ツールが現在URLを十分な確度で判定できず、このturnのComputer Useを停止した。Plunodeのリンク安全機能が原因と確認したものではない。画面記録もCDPのcapture timeoutとなり、今回の新しいスクリーンショットは取得できていない。

sudo実行後はWorkerの補修結果を読んでから、同じChatGPT会話の本番Appで新しいrequestIdのテーマを再登録する。既存の取消済み受付・既存予定IDを保持する。正式テーマの公開、同じ予定の本番接続への切替、正式テーマからのGraph／年表／Capsule利用が残る。

## Workerの運営判定設定を正式適用（14:46 JST）

本人のsudo実行で既存Webの運営判定3設定をreview Workerへ引き継いだ。実機probeは `operator=true` / `active=true` / `capabilities=true`。Web／DBの再起動・DB変更・image変更はなく、旧取消済み受付も開き直していない。

backupは `/opt/graph-knowledge/backups/theme-worker-flags-20261108T054606Z`、配置Compose SHA256は `a10c984aee7d65cb7d30e522c12c1b1184b7ead27aaf5a8014207c62c3d7cf3b`。転送stageのactivation logをPCへ取得して本人の実行結果と照合した。正式アプリsource14542c72／build wFBq24bSaSp0W-_ZOFaXrを維持する。

同じChatGPT会話で、新しいrequestIdによる本番再登録を依頼した。登録・公開・既存予定の本番切替・テーマの正式利用は継続確認中。

### 修正後の実受付：Entityの説明を分離

同じChatGPT会話から本番へ `bda93c74-4b31-4df4-8e64-f4821e0bd294` を送信し、receipt `307f8f28-4cc3-4558-b05b-9c8d8363836c` を取得。権限停止は解消した。4項目はすべて、新規Entityに説明・別名を含めた入力が共通の機械検査で要修正となった（各requests=0）。受付は `needs-changes`、公開Record0、Theme未発行。

新しい対象はname／kindを基本とし、aliasesを空・descriptionを空にして、事実・時期・根拠はRecordへ残すようChatGPTへ依頼した。新しいrequestIdで再送し、旧受付の原本・結果は保持する。原資料や公開条件の検査を迂回していない。

## 正式テーマの初回公開と既存予定の本番切替（15:00 JST）

新しいrequestId `e7341f2a-8c36-4d95-8be2-0935a743b68e`、receipt `ee6e89a4-2af1-4738-804b-af55a3e323d5` は通常の根拠確認・Gemini・publisherを通り、`published-with-issues` に到達した。テーマ「Webbが宇宙でひらくまで」は `theme:915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1` 構成版1として公開。期間と、時期を置かない背景の2件を受理した。打上げは日時／場所を裏付ける引用の不足、展開完了は具体的な関係名の不足で要修正。受理できない項目を公開したり、検査を弱めたりしていない。

[正式テーマ構成版1](https://plunode.net/?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=1)。実Googleで中央の年表・関係図、期間の開始／終了、時期を置かない背景と原文の根拠を開いた。旧Themeを作り直すのではなく、このThemeに収集を継続する。

正式運営画面で「Webbの打上げと遮熱膜展開を追う」を保存した。1日ごと、1回最大3資料／3項目、NASA・ESAの3ホスト、追加先をこのThemeに固定。未受理の打上げ・展開完了を優先し、既存期間／背景を重複登録せず、訂正や削除はしない計画とした。

既存のChatGPT予定 `6aef47b34ad481919005e81857c13f1a` の指示だけを正式Appへ変更・保存した。同じ会話 `6aef440d-ceac-83ee-b59b-163349281c60`、毎時20分、Asia/Tokyo、同じチャットを使う設定を維持。新規Theme作成は個別の運営依頼に限り、通常予定はclaimした既存計画だけを処理する。新しい予定・会話、Codex予定への置換、AI教育予定の変更はない。

「今すぐ実行」から同じ予定を開始し、正式運営画面は配送元の最終接続15:00:02と「資料を探索中」を表示した。正式のclaimまで接続できたことを確認。配送receipt・通常公開・Theme更新とCapsule利用は続けて確認する。

## 同じ予定の本番実行と送信承認の境界

15:00の実行は本番計画 `Webbの打上げと遮熱膜展開を追う` revision1をclaimし、NASA一次資料3件を `observe_collection_sources` で確認した。runId `7bbcf653-767e-493b-ae8d-f4051cbfb096`。期間・背景を再作成せず、打上げと遮熱膜展開完了の2関係を同じTheme版1へ追加するpackageを作成した。

`deliver_collection` 直前でChatGPT側の送信承認が出た。表示された理由は、ツール説明が入力の修正・再試行や受付と公開の区別を規定しているという「不審な指示」判定。NASA本文に攻撃指示があったことを確認したものではない。画面の配送詳細は公開NASAのURL・引用・関係・公開IDで、秘密値・会員情報は含まない。本番の継続許可はβ接続とは別であり、今後の定期実行にも作用するため、本人へ「常に許可」の操作を依頼した。許可の検査を無効化したり、Codexから代わりに配送したりしていない。

この時点のreceiptは未発行、継続2項目の公開は未確認。既存予定の保存・claim・原文観測と、配送・公開完了を区別する。本人操作後は同じrunの受付結果と正式Themeの構成版を調べる。新しい予定や新しい同名Themeを作らない。

## 正式ThemeからCapsuleの利用（実Google・PC／390px）

- 正式Theme構成版1を開き、期間の開始2021-12-28／終了2022-01-04、途中停止を含む説明、時期を置かない5層遮熱膜の背景、NASA原文・資料版1を確認。
- Themeから `公開確認｜Webbの工程と背景` をアカウントへ保存（2Entity・2関係）。既存PLUTO由来のテストではなく、今回の共通知識DBから生成したCapsuleである。
- 内容一覧→関係の編集で表示名を「遮熱膜を展開した」から「遮熱膜をひらいた」へ変更。年表の関係表記も変わり、時期・原文・背景は保ったまま保存版2へ保存した。元Themeは元の表記・構成版1を保持。
- 仮の未保存タイトルを適用→破棄確認→変更を破棄し、保存済みタイトルへ復帰。My Capsulesから同じ保存版2へ再訪できた。
- PCと390×844幅で表示・年表／関係図の切替を確認。viewport overrideは元へ戻した。実iPhoneのSafari／Chromeのスクロールやキーボードは今回未検証。
- 保存版2の限定共有を作成し、[正式共有URL](https://plunode.net/shared/e7DmydnrC0xOg77CwLnvb7pqTDg-AQDEqP6eFbJFgjo)で期間・背景・独自ラベルを確認。この確認用共有は有効なまま残す。
- Twitterbot相当HTTPは200、OGP／Twitterのtitleは `公開確認｜Webbの工程と背景`、画像altは年表、画像は1200×630 PNG（91,731bytes、SHA256 `5f4786d7788e01c2363727f5c3c7e81be545a4da52fcaccd87080b3a53046514`）。OGP／代表URL／画像URLはすべて正式origin。SNS実プレビューは未確認、告知投稿なし。

PC証跡は `C:/Users/nishr/.codex/visualizations/2026/11/08/plunode-r6/` の `formal-collection-plan.png` / `formal-delivery-approval.png` / `formal-theme-capsule-pc.png` / `formal-theme-capsule-mobile.png`。安全なHTTP結果は作業treeの `.local/theme-worker-flags-repair/formal-theme-ogp.json`。秘密値や会員DBを検証資材へ含めない。

## 送信許可後の継続配送と正式受入を完了

### 実ChatGPTからの配送・自動公開

本人の送信許可後、同じ会話・既存予定から `deliver_collection` が成功した。run `7bbcf653-767e-493b-ae8d-f4051cbfb096`、receipt `bcb87c64-56ae-4b7a-a519-684b0b5b15d1`。15:17 JSTのChatGPT報告はprocessing／2項目queuedであり、それ自体を公開完了の根拠にはしない。

通常の原資料照合・Gemini・原本受理・publisherにより、以下の2Recordが内容版1で公開された。正式運営画面は同じ計画を「反映済み」と表示し、公開APIはTheme構成版3の4Record・3Entity・3年表配置を返す。

- 打上げ `import:mission.1ff1495d-eda2-4fd2-80c5-52d839805e79:record:4a1d48d413e6ae768e0ffbcb9074e939`。NASA打上げ記事の原文に加え、NASA Launchページにある日付・場所・時刻の明記を根拠にした。
- 展開完了 `import:mission.1ff1495d-eda2-4fd2-80c5-52d839805e79:record:e2890b1c1b98f8649aa4dbd5dd1baa29`。1月4日の遮熱膜展開完了を、NASA原文と具体的な関係名で登録した。全望遠鏡の展開完了や連続稼働と混同しない。

[正式Theme構成版3](https://plunode.net/?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=3)。旧構成版1は2Recordのまま読み戻せ、元の2Record pinが構成版3にも保持されている。テーマ専用コードやDBの手書き投入、公開条件の緩和は使わなかった。

16:21・17:21 JSTの予定実行は対象なしで正常終了。18:34には終了済みrunへの再操作が `MISSION_ALREADY_FINISHED` で拒否された記録があり、これを新しい配送成功とは扱わない。許可のタイミング等の直接原因は未特定。18:37に同じ既存予定の「今すぐ実行」から再確認し、claim1回→ok true／lease null／replayed false→対象なしで正常終了、追加承認なしを実画面で確認した。公開済み2件を再配送していない。

既存予定は毎時20分・Asia/Tokyo・同じ会話を継続。正式計画は1日ごと、次回2026-11-09 14:59:47 JST、最大3資料／3項目。通常分の収集ごとに管理者の対象選択・承認を要求しない。初回OAuth同意・送信の継続許可と、例外時の任意運営操作は別。Codex収集予定はPAUSED、AI教育予定は不変。

### 正式Theme更新からCapsule・同一共有URLへの接続

正式Theme構成版3を通常Graph領域で開き、12月25日の点、12月28日〜1月4日の期間、1月4日の完了点、時期を置かない背景1件と対応する関係図を確認した。

既存 `公開確認｜Webbの工程と背景` は保存版2・2関係のままで、元Themeの更新だけでは差し替わらない。「取得元の更新」→「テーマの構成」で1→3、追加Record2・Entity1・Source2を含む6差分と「独自に編集した1項目を保持」を確認。草稿に取り込む→保存し、独自ラベル「遮熱膜をひらいた」と既存根拠・背景を保って保存版3・3Entity／4関係となった。

保存後も共有は保存版2・OGP image/2のまま。共有画面の「保存した変更を共有へ反映」で、[同じURL](https://plunode.net/shared/e7DmydnrC0xOg77CwLnvb7pqTDg-AQDEqP6eFbJFgjo)を保存版3へ更新した。既に開いた共有タブは保存版2を保持し、リンク再確認の更新案内→「更新された図を読む」で明示的に保存版3へ進めた。

OGPはTwitterbot相当HTTPで200、1200×630 PNG、112,843bytes、SHA256 `676b8e65cc1466b65c54dcc73f6bd9833a965de09cf96e2c5546b1e7ea90e17d`。代表・画像URLは正式originのまま、image/2→image/3でhashも変わった。SNS上のカード再取得・実表示はこの受入では未確認、告知投稿なし。

### 配置・保全・制約

- 3200／HTTPS βはapp14542c72・build `J8c0xCK92ByIAFgkz3nbx`、正式は同app・build `wFBq24bSaSp0W-_ZOFaXr`。最終 `/api/dataset` は3環境すべて200で旧dataset revisionを保持。新共通知識は専用API／投影で提供され、旧KGの件数／revisionを書き換えない。
- 今回は実操作と記録だけでWeb再build・image変更・追加migration・DB resetはない。既存の移行／別DB復元／再実行とbackup復号照合は前節の結果を再利用した。
- 全件巡回・自動整理は初版の通常機能として常駐し順次処理する。全対象が一度AI確認・整理を終えたかを待つ全量テストへは広げない。構造・排他・再開・停止・代表の実AI／実公開の既存検証を用いる。
- 実Googleと実ChatGPT・実NASA原文で確認した経路と、過去のfixtureによる境界検証を区別する。実iPhoneのキーボード／スクロール、SNS実プレビュー、正式PC読解Workerの別の実資料jobは今回未実施。PCの取得・読解Workerは起動／再開接続済みで、代表の実取得は前節で確認済み。
- 年表同士の比較／マージ、年表の直接作図、全件訳文の先行生成は既に後続へ分けた構想。今回の完成に合わせて新しく範囲を縮小したものではない。

最終証跡：`formal-theme-current.json`、`formal-theme-append-result.json`、`formal-theme-share-before-update.json`、`formal-theme-ogp-v3.json`、`final-health.json` は作業tree `.local/theme-worker-flags-repair/`。画面はPCのvisualizations内 `formal-theme-v3.png`、`formal-share-v3.png`、`formal-schedule-normal.png`。アプリの利用接続はこの時点で確認済み。ただし後刻、LinuxのTCP脆弱性未修正を確認したため、R6の残りはkernel更新・再起動と正式サービス復帰確認へ訂正した。

## Linux補修後の最終受入（20:14以降 JST）

初回の「security候補0だから完了」という誤判定を訂正したうえで、修正kernel149の再起動とCaddy公式2.11.9を実際に適用・起動し、標準／ESM security更新0、正式HTTPS／HTTP2、旧KG検索／Theme3／共有3／OGP不変、3 Workerとbackup復号・既存TLS証明書保持を確認した。アプリsource14542c72／build wFBq24bSaSp0W-_ZOFaXr、Docker／DB／会員／認証設定は保持。3200／HTTPS β／正式のdatasetはいずれも200。

これをもってR1〜R6で合意した本運用初版の残りを閉じる。全件AI処理を既に終えた保証や、年表比較／マージ等の後続構想、VPS全サービスの無障害保証には広げない。別プロジェクトeBay監視unitの20:06失敗は未変更・原因未調査で[記録](CADDY_SECURITY_R6_20261108.md#本件外のfailed-unit)へ分ける。
