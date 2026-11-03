2026-11-04 現在：U5相談・運営例外まで反映。source `d739bf15`、build `Grzh6GQvdhq0j0nBArhr2`、会員000〜026（27件）、知識001/002/004。[最新の実操作・backup・制約](../verification/KNOWLEDGE_APPEALS_U5_20261104.md)。以下の配置番号・残件は各段階時点の記録。

2026-11-03 投稿フォーム追補：現在のWeb sourceは `b204e2b8`、buildは `uZweEcFz-KDdbAVln1V3N`。入力案内・人物の草稿経路・2列表示・通常本人取得5分／通信失敗時の入力保持を3200とHTTPS βへ反映。DB追加なし、ledger23件。復旧互換buildは `rbLDeOtrWsJT7AL8c8eLV`。実操作・トンネル復旧・GitHub認証の記録は[フォームUX修正](../verification/KNOWLEDGE_SUBMISSION_FORM_UX_20261103.md)を優先する。以下のsource／buildは各工程時点の記録。

2026-11-03 U5：本人の新しい公開依頼から、Gemini・原資料の引用照合・現在参照確認・自動受理・公開先表示・元の公開版からの訂正を接続。旧AI確認のみの依頼を自動公開しない。U5全体は未完了で、次は異議・運営例外対応と総合確認。指定β本人のみ、3276はU4、本番VPS・共通Kevは変更しない。[現行契約](../design/KNOWLEDGE_SUBMISSIONS_U5.md)／[最新の実装・検証・配置](../verification/KNOWLEDGE_ACCEPTANCE_U5_20261103.md)。以下は各時点の履歴。

2026-11-03 U5：受付は020、指定β本人のAI確認は追加021を明示適用する。知識DB003は適用しない。AI確認済みは公開済みではない。[最新の配置・実送信・復旧](../verification/KNOWLEDGE_REVIEW_QUEUE_U5_20261103.md)を優先する。

# 知識読取・年表付きCapsuleの段階β

U4の基本接続まで反映。正式VPSへの配置手順ではない。既存3200とHTTPS βのGoogle認証・会員DB・Capsule・コミュニティ・通常KG・AI artifactを保持する。

## 起動・再開

受入済みmainで、共通hold・token確認後に既存launcherを使う。

```sh
python3 scripts/start-local-previews.py beta --node /absolute/path/to/node24
```

既に3200が使用中なら何も停止せず拒否する。所有PID／cwdを確認し、更新時だけ既存β Webを止める。`~/.local/state/plunode-previews/beta-knowledge.json`は0600で既存user所有。ここには専用知識PG・Neo4jとβ origin、任意の投稿受付feature flagを保存する。認証・会員DBは従来のprivate設定を引き継ぐ。launcherは事前構築済みの`plunode-knowledge-beta-postgres`／`plunode-knowledge-beta-neo4j`のlabel・volume・loopback portを照合して起動し、mainの通常publisherを起動する。DB生成・migration・seedは行わない。

Web logは従来の`beta.log`、publisherは同じstateディレクトリの`knowledge-beta-worker.log`／`knowledge-beta-worker.pid`。他のprocessのPIDなら置換しない。Webとworkerを更新する場合は、それぞれのcwd／cmdlineを確認して正常終了させ、同じlauncherで再開する。volume削除で復旧しない。

## 初回構築・明示migration

専用PG 55476 / DB `plunode_knowledge75_beta`、Neo4j 7699を使用。3276の55475／7698、会員55433、通常KG7697と分離する。既存`migrations/knowledge-foundation/001-records.sql`と`002-publication.sql`のchecksumを保持し、明示seedコマンドがschemaを確認・適用する。Webは適用済みchecksumを検査するだけ。

`knowledge-beta-seed.ts FILE SHA256`は選択された公開Theme 3件の固定入力だけを許可する初回移行用。空の専用DBにだけ適用し、同digestの再送は既存結果、別digestは拒否する。別のデータを追加するために既存DBを空にして再実行しない。新しい登録・移行は別操作として設計する。

backupはprivateなfresh directoryへcustom dumpを作り、別名DBへ復元して全tableの行fingerprintとchecksumを照合する。U4読取だけでは会員DB追加migrationは不要。U5受付の有効化時は追加020を明示適用する。Web切替前の会員backupも別名DBへ復元し、会員・コミュニティの保持を確認する。旧dumpでlive DBを上書きしない。

## 更新・復旧境界

検証済み固定SHAをmainへ受け入れ、通常push後にpublic buildを配置する。新形式Capsuleを保存した後は、それを読めない旧Webへ戻さない。知識読取側の障害は設定を無効にして通常探索を維持し、保存済みの新Capsuleは対応版Webで保持する。原記録正本・公開世代・会員DBを一括resetしない。

確認先は `/api/knowledge/public?mode=status`、TOP紹介／新着、テーマ検索、年表から会員Capsule保存・再訪、通常Graphから任意年表追加。βで `/api/knowledge` と `/api/themes` が無効であり、別Hostや正式originへ誤接続しないことも確認する。新形式共有は有効。指定版と原本の照合、現在の取得元停止、会話・履歴・固定掲載・通報・年表OGPまで確認する。知識側の確認障害は公開面を閉じ、既存の本人保存は保持する。実Googleとfixture、HTTP・実画面・iPhone実機は区別して記録する。

## 訂正比較と今回の復旧用接続

最新source／buildは[U4共有の検証・配置](../verification/KNOWLEDGE_CAPSULE_U4_SHARING_20261103.md)を照合する。Capsule下部「取得元の更新」は参照IDだけのPOST読取で、保存・共有・原記録訂正を行わない。原記録と固定Theme構成の両比較、Undo・破棄、実会員再訪を確認する。新しいthemeRecordIds／excludedRecordIdsを保存した後は、そのフィールドを読めない前段buildへ戻さない。訂正工程時の復旧build `beta-build-bcd926e3` は残すが、新共有の対応版として機械的に戻さない。現行の復旧資材はprivate `.local/u4-beta/beta-build-37ef826c`（source 37ef826c／build UV072kqFJC_JqEMIyOme6）。原本停止の確認を外して共有を再開しない。

2026-11-03に既存共有Docker connectorでQUIC timeoutが継続し、追加の `plunode-beta-http2-recovery`（label `plunode.scope=beta-tunnel-recovery`）をHTTP/2で起動した。同じ既存image・接続資格・remote routeを再利用し、既存connectorやDNS／Accessを変更していない。HTTP/2への切替は[Cloudflareの接続トラブル対処](https://developers.cloudflare.com/tunnel/troubleshooting/)にもあるが、今回のネットワーク根本原因は未確定。

再開時は既存containerのlabel・image・protocol=http2・公開portなしを確認し、必要なら `docker start plunode-beta-http2-recovery`。restart policyはnoで、PC再起動後の自動起動は保証しない。新しいtokenを作る・ログへ出す・別のtokenへ置換する手順ではない。通常shared connectorが安定した後、復旧用だけを `docker stop plunode-beta-http2-recovery` で止め、HTTPS βを再確認できる。停止で悪化した場合は同じcontainerを再開する。共有connector／他プロジェクトのcontainerをまとめて再起動しない。

## U5受付の追加移行・Web切替

会員020を適用する前に既存の適用済みchecksumを実物と照合する。fresh custom dumpを別DBへ復元し、そのDBのownerと復元roleを実際のWeb role（現在のβはgk_member）に合わせ、行fingerprintの一致・追加020・再実行不変を確認する。復元試験の権限不足をliveの権限拡張で回避しない。CLIは既存設定を引き継ぎ `scripts/member-migrate.ts --knowledge-submissions --confirm-origin https://graph-beta.isinxnisi.com` を明示実行する。秘密値をコマンド履歴や記録へ埋め込まない。

buildは検証対象の固定SHAをexportした別directoryで作り、稼働Webをbuild中ずっと停止しない。既存private runtime・同じ依存を使い、BUILD_IDとAPI routeのfile traceに020が含まれることを確認してからWebだけを短く切り替える。DBを戻さず互換Webを保管する。無効化時は受付flagを0にして入口／APIを閉じ、投稿schema・会員DBを消さない。最新の対応buildとbackupは[U5記録](../verification/KNOWLEDGE_SUBMISSION_INTAKE_U5_20261103.md)を優先し、U4復旧buildへ機械的に戻さない。

匿名401だけで完了とせず、HTTPS βの実会員で一覧・草稿保存・再訪・受付・編集・取消・Capsule選択を確認する。Google既存sessionでの確認と、新しいOAuthログイン、fixtureの停止／退会は区別する。


## U5永続AI確認の起動・停止・利用量

020と同じbackup／実Web roleへの別DB復元の後、`scripts/member-migrate.ts --knowledge-review --confirm-origin https://graph-beta.isinxnisi.com`をNode24で明示実行し、021と既存checksum／行の保持、再実行不変を確認する。Webの両投稿API route traceに021が含まれることを確認する。過去のreceiptを自動送信しない。

`~/.local/state/plunode-previews/beta-review.json`は既存user所有0600のprivate設定。実評価した無料project／model、RPM／TPM／日次・月次回数／入力・出力上限、APIkeyの絶対path、許可する実会員UUIDを設定する。APIkeyも0600で別ファイルとし、本文や秘密値をGit・公開logへ残さない。現在は指定β本人1人だけ。一般公開・有料fallback・自動model変更はしない。

通常launcherはこの任意profileがあると既存認証・会員接続を引き継ぎ、独立した`knowledge-review-worker.ts`を起動する。PID／logは同じstateディレクトリの`knowledge-review-worker.pid`／`.log`。Web起動前に先行評価の使用量を`--import-evaluation <private-ledger-file>`で一度取り込み、その後は旧live評価CLIと並行運用しない。既存profileの設定digestと異なる変更はworkerが拒否するため、上限・モデルの変更は台帳を保持した別の明示手順として扱う。

利用量は、同じprivate runtimeと`KNOWLEDGE_REVIEW_CONFIG`／許可user設定を引き継いでNode24から`--import tsx scripts/knowledge-review-worker.ts --status`を実行する。これはAPI送信や残量リセットを行わない。応答の実測token内訳と、欠測の予約を区別する。provider側の正確な残量は不明であり、ローカル上限だけで無料枠を保証しない。

停止・復旧時はPIDのcwd／cmdlineが受入済みmainのreview workerであることを確認してSIGTERMする。profileをprivateな退避名へ移し、同workerだけを停止し、既存launcherでWebを再開するとAI入口を閉じられる。既存publisher・共通Kev・他projectを停止しない。ジョブと台帳を消さず同profile／対応Webへ戻すと、未確定送信を間隔・回数上限付きで回復する。取得済み応答が残る場合は再推論せず反映を再開する。取消や停止済みの投稿を再開しない。DBを旧dumpで上書きせず、021対応Webを保持する。


## U5原資料照合・公開の追加022

現在は指定されたβ本人だけ。`beta-knowledge.json`の`KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED=1`と既存の`beta-review.json`を使い、旧AI確認だけの同意は自動公開へ上げない。Webの知識接続は読取専用のまま、review workerだけが内部の受理処理へ接続する。Webから任意の受理コマンドを実行できるAPIは開かない。

会員DBと専用知識DBの両方をfresh custom dumpし、実owner／roleで別DBへ復元して全既存tableのfingerprintを照合する。Node24から`scripts/member-migrate.ts --knowledge-acceptance --confirm-origin https://graph-beta.isinxnisi.com`を明示実行する。000〜022の23件となり、既存checksumを変えない。知識DBは既存operations／changesを使い、003等は適用しない。別DBとliveで追加移行・再実行不変・既存行保持を確認する。heartbeat等の通常運用更新を移行による破損と混同しない。

固定SHAで別directoryにbuildし、022のAPI file traceとBUILD_IDを確認する。切替時だけ、自分のmain由来のWeb／review worker／knowledge publisherをcwd・cmdlineで照合して終了し、既存launcherで再起動する。共通Kev・他project・3276・VPSには触れない。実AI送信の範囲・無料project／model・利用量profileは既存設定を引き継ぐ。

公開前の`reviewed`、原資料の`verifying/source-retry`、受理済み`accepted`、公開generation反映済み`published`は別。結果linkは反映を確認したrecord版だけへ出す。原資料の取得は匿名HTTPS HTML/textに限定し、内部IP・redirect先を再検査する。取得失敗は時間・回数を限定して待機し、引用不一致・非対応資料は補足へ戻す。

復旧は同じdecision IDで再送し、公開正本のreceiptから結果を回復する。022と新しい受理decisionを読めるWeb／workerを使う。受理済みdecisionがある状態で旧AI-only Webへ機械的に戻さず、DBを旧dumpで上書きしない。私有草稿の取消・退会後も受理済みの公開向け断面は残り得る。公開知識の停止は別の訂正／運営操作で行う。現在の受理対応buildと両DB backupは[今回の記録](../verification/KNOWLEDGE_ACCEPTANCE_U5_20261103.md)を参照する。


## 投稿対象・通知・投稿者の追加023〜025／知識004（2026-11-04）

現在の両DBとprivate runtimeを照合し、fresh custom dumpを別DBへ復元して既存行・既存checksumを確認する。知識の復元先も既存の安全境界 `plunode_knowledge75_` で始まる別名を使う。Node24から専用知識DBの `ensureKnowledgeFoundationSchema` を明示実行すると001＋追加004を照合・適用する（既存002は保持、先行prototype用003は適用しない）。会員側は `scripts/member-migrate.ts --knowledge-repair --confirm-origin https://graph-beta.isinxnisi.com` を使い、000〜025の26件になる。旧行は新列追加と既知の同意版に対するprovider profile IDの補完以外は保持する。既存の終了結果から未読通知を作るが、旧投稿のAI送信や再公開は起こさない。

新しい023 reference_context、024 receipt結果・既読cursor・同意profile、025公開貢献帰属を使う。これらを読めない旧Web／workerへ機械的に戻さない。停止するときは既存の受入済みmainのWeb／review worker／publisherだけをcwdとcmdlineで確認する。新sourceのbuildを事前作成し、切替直前のbackup、明示migration、再実行不変、対応Webとworkerの再開を行う。会員・コミュニティ・旧Capsule・通常KGをresetしない。

新規対象／既存対象への関係／テーマへの出来事／根拠追加／訂正、明示のプロフィール・匿名選択、上部の結果カードと未読、公開活動を確認する。固定receipt linkは本人用であり共有URLではない。公開貢献APIは現在閲覧できる原記録からだけ作者を返し、匿名の内部owner／投稿IDを公開しない。private profile活動の追読時も既存表示を消すことを確認する。


## U5の相談・運営例外：追加026

前段の最新配置は[申請修正のβ総合記録](../verification/KNOWLEDGE_SUBMISSION_REPAIR_BETA_20261104.md)。会員DB000〜025と知識001/002/004を保全し、相談・監査・公開処置outboxの追加026を明示適用する。Node24から `scripts/member-migrate.ts --knowledge-appeals --confirm-origin https://graph-beta.isinxnisi.com` を使う。適用後の会員ledgerは27件。既存checksumを変更しない。

fresh dumpを別名DBへ復元し、全既存tableの旧列fingerprintと、追加適用・再実行不変を確認する。切替前にもbackupする。新Webとreview workerを同時に対応させる。新workerは026の明示適用を検査し、通常のキューと公開処置の配達・通知を処理する。project利用量・失敗予約・既存Gemini profile・鍵・共通Kevを変更しない。

Webは既存運営許可リストで私有相談だけへアクセスする。共通知識の公開状態変更は、会員側の確定outboxをreview workerが既存foundationへ配達する。処置がpendingなら通知まで再開する。同じrequest IDのまま配達し、公開側commit後に停止した場合も内容変更を繰返さず通知を再開する。blockedは状態競合として運営画面で再確認する。解除は元案件と現在の状態版を照合する。

復旧時は026対応の資材を保持する。旧dumpで公開状態や相談を上書きしない。緊急に相談APIを止める場合も既存の私有DBと、確定したpublic commandを消さない。全件の手動承認化・無料枠のリセット・既存収集Workerの停止によって回避しない。


## U6a：資料取得Worker

既存会員DB000〜026と知識001/002/004を保ち、追加027を明示適用する。Node24から `scripts/member-migrate.ts --knowledge-collection --confirm-origin https://graph-beta.isinxnisi.com`。別DB復元で旧列fingerprint・migration再実行不変を確認してからliveへ適用する。追加後のledgerは28件。公開DBのmigrationは増やさない。

profileの初回準備は `python3 scripts/knowledge-collection-config.py --directory ~/.local/state/plunode-previews`。既存profileがあれば生成し直さない。serverのbeta-collection.json、clientのbeta-collection-client.jsonを0600、state directoryを0700で保持する。tokenをチャットやGitへ出さない。資格を失効する場合はcapture Workerを止めてserver profileを取り外す。pending commandと取得artifactは削除せず、再発行した資格での再開は現在job・leaseを照合する。

既存起動入口 `python3 scripts/start-local-previews.py beta --node <Node24絶対パス>` はprofileがあると収集Workerも起動する。Webが既に3200を使用中なら重複起動しない。Worker単独の再開は同じNodeで `--import tsx scripts/knowledge-collection-worker.ts --config ~/.local/state/plunode-previews/beta-collection-client.json`。一回だけの確認は `--once`。自動起動は既存beta launcherの範囲だけで、Windows予定を新設しない。

運営確認先は `/operations#collection`。現在の段階は資料取得までであり、「取得済み」を知識の公開成功と呼ばない。raw artifactはprivate DB、PC checkpointはprivate collection-state。復旧は027対応のWeb・Workerを使い、古いdumpでliveを上書きしない。VPSへの接続はU8の別工程。

2026-11-04のU6資料取得の現在配置：source `384e7d52e2f385e3ef79e07b56110c20d4254bbc`／3200・HTTPS β build `j_2dRaRyCWvs0g0ek5zx7`。会員027、知識001/002/004、3276は既存U4、本番未変更。[実取得・取消・復元と制約](../verification/KNOWLEDGE_COLLECTION_U6_CAPTURE_20261104.md)。
