# 運営API投入と一般ユーザー投稿の分離

2026-11-09。運営APIの訳文登録を一般ユーザーの公開帰属・活動履歴・通知へ流した実装判断を是正する。APIはシステム運営のデータ投入経路であり、API専用や「Plunode」の投稿者バッジを新設する話ではない。

## 完了条件と現在地

①露出箇所確認・②実装とβ検証・③既存データの限定補修と正式反映／確認の3工程。①・②を完了し、③は本番資材の転送・照合まで完了。本番の公開帰属はまだ是正前で、既存sudoの本人入力が残る。

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
- 正式切替scriptは現在のa5b82aae／build vdygDVSqogk2drMutfW3U、Web＋ops5alias、private設定hash、会員39／知識9 checksumを固定。最新member／knowledge backup・別DBで限定補修と再実行・既知16API requestの一致・暗号化復号hash確認を通してから、同じ補修を正式へ適用する。更新対象以外の全表fingerprintと知識全表、private owner／本文／取得断面digestを比較する。
- `scripts/release-operator-intake-production.py`はWebと3 Workerを切替。元の本文や版を削除せず、schema migration、KG／OS、認証／予算設定を変更しない。失敗時は古いdumpでDBを戻さず、補修開始後は互換の新runtimeへ復帰する。

## 正式反映の再開

開発PCのPowerShellで `wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/operator-intake-20261109/run-release.py`。既存sudoはパスワード要求のため本人入力が必要。完了後はactivated記録、暗号化backup、既知訳文の公開creditなし、プロフィール／未読、同じrequestの再送を正式URLで確認する。現時点では正式の修正完了・個人露出解消とは報告しない。
