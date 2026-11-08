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
