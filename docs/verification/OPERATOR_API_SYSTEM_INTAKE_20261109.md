# 運営API投入と一般ユーザー投稿の分離

2026-11-09。運営APIの訳文登録を一般ユーザーの公開帰属・活動履歴・通知へ流した実装判断を是正する。APIはシステム運営のデータ投入経路であり、API専用や「Plunode」の投稿者バッジを新設する話ではない。

## 完了条件と現在地

①露出箇所確認・②実装とβ検証・③既存データの限定補修と正式反映／確認の3工程。①・②・③を完了。正式Web／Workerの切替、既存43受付・42公開creditの補修、正式画面・公開API・同一受付の再送、暗号化backupのPC復号照合まで確認済み。

## 境界

- テーマ作成／更新のpackageは既存のsystem importer経路。個人投稿へ接続してしまっていたのは追加した訳文API。接続者の内部所有権を公開名義へ使ったのが問題で、APIであることによる制約ではない。
- 同じ認証・原本固定・同値性確認・予算を使うが、サーバーが私有metadataに経路を記録する。一般フォームからこの経路を名乗る引数は受け付けない。
- システム投入には公開寄与者を作らず、一覧・プロフィール活動・未読通知からも除外する。公開APIにも個人情報や専用のorigin表示は追加しない。通常ユーザーのprofile／anonymousと投稿者表示は維持する。
- 旧APIの入力と段階IDのhashは保持し、再送で新しい受付やAI確認を作らない。私有owner・原文／訳文の版・Theme構成・日付は変更しない。
- 旧API初回受付の固有形式と公開原本pinを現在の運営者範囲だけで照合して既存分を補修する。対象の私有metadata以外の本文・digest・取得断面は一致検査。誤った公開credit行だけを取り除き、内部の投稿／審査決定を保持する。DB schema migrationはない。正式補修には先にbackupと別DB復元検証を行う。

## 検証・配置

- app source `a9f2deaa831992463cdb676d215be4c6bdcc6327`。localhost3200／HTTPS βへbuild `ayda-KKHQdO56T_QdP8ju`を反映。本番候補は `XLE-FT07_ebW1CI2ERHw7`。
- 訳文APIの単体／schema／MCP 11件＋実PostgreSQL統合10件、通知／帰属の実PostgreSQL 16件、計37件に成功。一般ユーザーの記名／匿名、system投入100件と個人草稿容量、未読除外、旧API分補修・再実行・不変digest／owner・同一request再送を検証。関連lint・型検査とβ／正式buildに成功。
- βのmember DB 86表をbackupして別の内部networkの一時PGへ復元し、同じ正式ops image／補修CLIでplan→apply→applyを確認。βの旧API固有形式該当は0件で、通常フォームの訳文投稿は保持。初回の稼働中dumpと取得後fingerprintの比較はWorker更新で一致せず、Web／β Worker停止中の一貫したsnapshotで再検証して成功した。正式も停止後にbackup・fingerprintを採る。
- βは14 private設定と会員39件のmigration checksumを保持。Webとβ Workerを再開。実Googleセッションで年表と個人投稿28件／未読15件の通常表示を確認。HTTPのlocalhost版IDも一致。HTTPS βは実Chromeで確認（Python UAはCloudflare1010で拒否されるため、HTTP確認成功とは扱わない）。
- 正式Web image `plunode-web:operator-intake-a9f2deaa`、manifest `sha256:0c694e8ec2525266e8f7692d40649bea75034d1075cf32791aa737ef0567e981`。ops `plunode-knowledge-ops:operator-intake-a9f2deaa`、manifest `sha256:7f8b3272dd4c05105af7155b457e677af647ad3cdfb4a9c0a46d7a9798cec00d`。archiveの全layer／configを検証し、VPSへの転送hashとrunner `--check`に成功。
- 正式切替scriptは現在のa5b82aae／build vdygDVSqogk2drMutfW3U、Web＋ops5alias、private設定hash、会員39／知識9 checksumを固定。最新member／knowledge backup・別DBで限定補修と再実行・既知16API requestの一致・暗号化復号hash確認を通してから、同じ補修を正式へ適用する。更新対象以外の会員全表の内容fingerprint、知識全表の行version署名と原本／訳文の内容fingerprint、private owner／本文／取得断面digestを比較する。
- `scripts/release-operator-intake-production.py`はWebと3 Workerを切替。元の本文や版を削除せず、schema migration、KG／OS、認証／予算設定を変更しない。失敗時は古いdumpでDBを戻さず、補修開始後は互換の新runtimeへ復帰する。

## 正式反映の再開

開発PCのPowerShellで `wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/operator-intake-20261109-r2/run-release.py`。既存sudoはパスワード要求のため本人入力が必要。完了後はactivated記録、暗号化backup、既知訳文の公開creditなし、プロフィール／未読、同じrequestの再送を正式URLで確認する。現時点では正式の修正完了・個人露出解消とは報告しない。


## 初回正式切替の停止と再開資材（2026-11-09 13:38以降）

- 初回はmember／knowledgeの照合のうち、知識DB全体の一括fingerprint SQLで停止。dataRepairStarted=falseで、本文・公開credit・DB schema・runtime切替は未実行。正式HTTP200と従来build vdygDVSqogk2drMutfW3Uの復帰を確認した。失敗stageとbackup /opt/graph-knowledge/backups/operator-intake-20261109T043807Zを保持。
- 初回helperが失敗コマンドのstderrを捨てていたため、本番PostgreSQLの元エラーは断定しない。ローカルでは描画投影2.2GB・全巡回inventory約130万行を含む一括集計の高負荷を確認し、自分が起動した確認queryだけを中止。サービス／通常Workerは止めていない。
- 確認SQLを表ごとの独立statementへ分け、原文を行hashへ変換してから集約する。jit／parallelをこの確認sessionだけで無効化し、docker execはまとめて余計な往復を避ける。知識DBでは巨大な派生投影の本文を展開せず、全表のctid／xmin署名（行追加・更新・削除を検出）と原本／訳文6表の内容hashを照合する。知識DBへの書込処理はない。
- 修正版で会員86表2.51秒、知識29表27.52秒の照合に成功。1MB text、行順変更で同値、重複行追加で相違、同値UPDATEでもtuple-version署名が変わることを、rollbackする一時表で確認。会員補修・復元検証、所有者／原本の保全契約は維持する。
- コマンド失敗時のstderrはrootの0600診断へ残し、非公開のdevelop所有directoryへ回収できるようにした。秘密値やコマンド全文を公開ログへ出さない。preflight／保全baselineの進捗eventも追加。
- 再開資材はrelease-a9f2deaa-r2へ転送・hash照合済み。同じapp a9f2deaa／build XLE-FT07_ebW1CI2ERHw7／Web・ops imageで、再buildなし。再開runnerはbackups/operator-intake-20261109-r2/run-release.py。正式反映・個人露出解消は引き続き未完了。


## 正式反映・受入を完了

2026-11-09、r2の本人sudo実行を受領し、正式URLの確認まで完了。

- 正式app `a9f2deaa831992463cdb676d215be4c6bdcc6327`／build `XLE-FT07_ebW1CI2ERHw7`。Web manifest `sha256:0c694e8ec2525266e8f7692d40649bea75034d1075cf32791aa737ef0567e981`、ops `plunode-knowledge-ops:operator-intake-a9f2deaa`。localhost3200／HTTPS βは同app／build `ayda-KKHQdO56T_QdP8ju`で、今回の全環境反映を完了。
- 正式の会員86表・知識33表を保全確認。別DBへの復元とplan→apply→applyで旧API固有形式の43受付を識別し、誤った公開credit42件を除去。正式でも同じ候補・原本digestを照合して補修し、私有owner・本文／訳文・取得断面・一般投稿・それ以外の表を保持した。会員39／知識9 migration checksum、private設定、KG・AI artifactは不変。実機の知識DBはβの29表より多い33表だが、全表を対象に保全照合している。
- 正式backup `/opt/graph-knowledge/backups/operator-intake-20261109T064409Z`。PCで暗号化ファイルhash、RSA公開鍵の対応、RSA-OAEP鍵復号→AES復号→tarの内容を確認し、member.dump 4,130,127 bytes／knowledge.dump 231,463,696 bytesと旧設定hashを照合。平文tar・一時復号鍵は検証後に削除。暗号化SHA256 `64015956340b32ccf947036ca307d1d669bebccca967ef8c6e00227d1679309d`。
- 正式互換API HTTP200とbuildを確認。実Chromeの既存Googleログインで、API分が個人の投稿一覧・未読通知へ出ないことを確認（該当アカウントの通常一覧は0件）。公開プロフィールの「知識への投稿」にAPI分がなく、訳文詳細にも個人バッジがない。一般投稿の記名／匿名は先述の実PGテストとβの通常投稿表示で検証したもので、正式へ検証用の新規一般投稿は作っていない。
- 既知の公開訳文16件（タイトル1／補足6／年表9）を公開contributors APIから読み、全てHTTP200・contributors空配列。旧API requestのstatusは公開済みのまま取得できる。年表見出しの同じrequestId・payloadを接続済みAPIから再送し、公開版1・確認attempts1のままであること、再送後も公開creditが付かないことを確認。新しいAI確認や公開テストデータは追加していない。
- 現在の正式Theme構成版8（14記録・5対象・7資料）と、旧版6（12記録・4対象・7資料）の読取を確認。今回の補修で、利用者がその後更新した版8を版6へ戻していない。
- 既存ChatGPT Appの「ツールを更新」を実行し、案内APIからsystem-data intake／個人表示なしの新契約を取得した。この実行中チャットの既に読み込まれたtool説明には旧member-attribution文言が残っていたため、説明キャッシュの即時更新までは保証しない。サーバーの帰属判定・guide・公開表示は新契約である。OAuth権限や接続先・予定を変更していない。
- 画面記録：`C:/Users/nishr/.codex/tmp/operator-intake-formal-list-20261109.png`、β通常投稿 `C:/Users/nishr/.codex/tmp/operator-intake-beta-20261109.png`。私有な実行・復号・公開API照合の原記録は、PCのignored `backups/operator-intake-20261109-r2/`へ保存。

確認先：[正式訳文](https://plunode.net/translations?id=translation%3Aea7faf611345bbaffb6f4ffe3261da69ce095656b4f8168e&revision=1)／[個人の知識投稿](https://plunode.net/member/submissions)。訳文を開いて個人の寄与者リンクが出ないことを確認できる。一般ユーザーによる通常の訳文投稿は、従来の公開帰属を維持する。

今回の3工程を完了とする。初回切替scriptの失敗・修正は履歴として保持する。公開済み本文や過去の正常なユーザー投稿を消す作業には広げていない。
