# R6b 正式切替・接続確認（2026-11-08）

## 現在地

R6b切替済み・接続補修中。新規テーマをChatGPTから登録する経路を補修し、正式受入を続ける。R6全体は未完了。

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
