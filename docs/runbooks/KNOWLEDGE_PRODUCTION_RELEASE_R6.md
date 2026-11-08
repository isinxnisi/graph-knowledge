# R6 共通知識・年表・投稿・自動処理の正式反映

2026-11-08。R5の確認済みアプリ `48ab1d7f`、記録 `374125f1` を起点にする。今回の「進めてください」をR6の公開実行指示として受け、過去のβ限定の作業区切りを新しい公開を止める理由にしない。R6aは実物監査・資材／移行準備、R6bは切替・正式URLの確認。現時点で公開済みという意味ではない。

## 現在の配置と再開点（2026-11-08）

正式はapp `14542c7282ef59a2f07a3627f3fb7583d5f1dcfa`／build `wFBq24bSaSp0W-_ZOFaXr`、会員37／知識9。3200／HTTPS βは同app／build `J8c0xCK92ByIAFgkz3nbx`。後続の文書・Compose補修commitはWeb再buildを必要としない。最新の実物復元／暗号化backup hashは[正式切替の検証記録](../verification/KNOWLEDGE_PRODUCTION_R6B_20261108.md)を参照する。

review Workerは既存Webの `COMMUNITY_ENABLED` / `SITE_OPERATIONS_ENABLED` / `SITE_OPERATOR_USER_IDS` を引き継ぐ必要がある。初回に未指定でテーマ受付が取消になったため、`e0371f7f` の専用補修を正式適用済み。補修backupは `/opt/graph-knowledge/backups/theme-worker-flags-20261108T054606Z`、Compose SHA256 `a10c984aee7d65cb7d30e522c12c1b1184b7ead27aaf5a8014207c62c3d7cf3b`。Web／DB／image不変、運営資格・有効会員・capabilityはすべてtrue。旧取消受付をDBで開き直さない。

正式アプリ受入・TCP補修確認済み、Caddy補修は未完了（[Linux実測](../verification/LINUX_SECURITY_R6_20261108.md)／[Caddy固定補修](../verification/CADDY_SECURITY_R6_20261108.md)）。本人の本番送信許可後、同じChatGPT予定→正式API→通常確認・公開で2関係がTheme構成版3へ追加された。既存Capsuleへ比較取込・保存し、同じ共有URLの明示更新も確認した。日常運用の再開は[ChatGPT予定runbook](KNOWLEDGE_CHATGPT_SCHEDULE.md)の同じ会話・予定から行う。初回公開scriptの再実行や新しい同名Themeの作成は不要。

## 起点と守る境界

- SSH先・host鍵検証・develop＋既存sudoはそのまま。現在の `/opt/graph-knowledge/compose.yaml` と `app.env` を実物で読み、古い一回用公開runnerを再実行しない。
- 既存KGの再投入・削除、KG ops／収集公開Worker／AI教育・artifact／Kevの変更は行わない。新しい知識は別PostgreSQL DBを正本とし、既存Neo4jの専用世代labelへ投影する。R5で旧Entity labelの保持と世代切替の失敗境界を検証済み。
- β DB・会員・実験テーマ・秘密値のdumpを本番へコピーしない。本番の会員DBをbackup・復元検証して追加migrationを適用する。新規の知識DBは空の正式DBとして明示準備し、実資料の登録経路から内容を作る。
- 既存Google認証・運営権限・コミュニティ・会員保存・正式origin・AIラボ公開artifactは保持する。新機能の認可はproductionのprivate deployment profileで明示し、beta allowlistを使わない。

## 1. 読み取り監査

`scripts/inspect-knowledge-production.py` を転送・SHA256照合して既存sudoで実行する。Compose／envのhash、Web image／build、既存全サービス、会員migrationのchecksum・表、DB一覧、OS／kernel／更新候補を採取する。秘密値・会員行は出力しない。結果はprivate領域へ保存する。

`sudo -n` とDockerが権限不足の場合は、本人へ監査コマンドを渡す。これは公開許可の再確認ではなく、管理者パスワードの入力操作である。監査が成立する前に本番のDB・Web・OSを変更しない。

## 2. 正式資材

2026-11-08のregistry監査でNext 16.3.8、fflate 0.8.2、Vite 8.3.2にadvisoryが検出された。Next／eslint-config-next 16.4.5、fflate 0.8.3、Vite 8.3.6へ更新し、runtime dependency監査の検出は0、既存の変更境界81件は成功した。使用中の機能から実際に攻撃可能だったという実証ではない。更新後のbuild・β実操作・正式image検証は別に確認する。[Next advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw)／[fflate advisory](https://github.com/advisories/GHSA-px8p-9vwx-vf98)。

既存Dockerfileの `web` と、新設 `knowledge-ops` targetを同じ固定SHAから作る。後者はmember migrationと知識migration・3常駐Workerを含む。Webにも実行時に検査する知識migrationを同梱する。秘密値はbuildしない。source SHA・build ID・platform・image config／manifest・archive SHA256を固定する。

`compose.knowledge-production.yaml` は既存構成へのoverlayで、Web／member-opsを更新し、publisher・review・patrolを追加する。KG用opsは更新しない。配置先に生成する `knowledge.env` と `knowledge-runtime/` はprivateとし、コンテナのnode UIDと0600所有条件を満たす。プロファイルはread-only bind。新Workerはnon-root・read-only filesystem・権限追加なしで動かす。

MCP clientの `checkpointDirectory` はWeb専用bindの `/run/plunode-knowledge-state` とし、ホスト側 `knowledge-state/` はUID1000・0700にする。設定や配送資格のファイルは `knowledge-runtime/` のread-only領域を使う。checkpointも同じ書込停止境界でbackupする。再起動で再送／leaseの文脈を失わせない。全Workerへ旧KGのURI・user・databaseを明示継承し、コンテナ内localhostへ誤接続しない。

候補overlayを検査するときは、既存app.envと新しいknowledge.envの両方をComposeのinterpolationへ渡す。最終切替では、既存の常用起動コマンドが再び旧Webを起動しないよう、固定imageと新サービスを含む正式な `compose.yaml` を保存する方式を実物監査後に確定する。秘密値を展開した `docker compose config` を一般の記録やGitへ出さない。overlayを一度だけ指定して起動したことだけを永続反映と扱わない。

4GB VPSの余地を残すため、新規Neo4jを常駐させず、専用label／世代を既存Neo4jへ投影する。PostgreSQLは会員DBと別DB・別roleに分離し、hostへ新しいDB portを公開しない。実機のconnection上限・メモリ使用量を照合してから配置を確定する。

資料取得Worker／読解Workerは開発PCから専用HTTPS APIへ接続し、DB portを開けない。review・原本受理・publisher・全件巡回はVPS内で動かす。ChatGPT資料収集は既存の同じ専用会話・API直送を維持し、本番用OAuth接続への切替は本人の同意を含めて確認する。新たなCodex予定へ置き換えない。

## 3. DB・OSと切替

1. 本番の実ledgerから未適用migrationを確定する。既存checksumは変更しない。知識DBは `scripts/knowledge-migrate.ts --confirm-origin https://plunode.net --confirm-database EXACT_DATABASE` で明示適用する。既存関数を再利用し、seedはしない。
2. 復旧用に旧Compose／env／private runtime／image識別情報を保存する。準備段階ではexported snapshotによりWeb稼働中にMember dumpと同じ断面の表・所有者・行を得る。scripts/prepare-knowledge-production.pyで隔離PGへ復元し、追加移行・再実行を検証する。正式切替時にはWebと書込Workerを同じ区切りで停止し、最新の会員・知識DBとcheckpointのbackupを確保する。失敗時に旧dumpを本番へ上書きしない。
3. Linuxは実稼働kernel・導入済みkernel・追従meta-package・保持／保留を記録し、現在の重要CVEに対するUbuntu公式の修正状況と配布packageのchangelogを照合する。-securityだけでなく-updates側の修正・新ABIの依存packageも確認する。候補0件・reboot-required不在・install成功だけでは対応完了としない。固定版のAPT planをsimulateし、対象外更新／削除を拒否して、backup後に必要なpackageを適用する。再起動後のuname・package版・Web／DB／Worker／正式URLの復帰まで確認する。通常の機能更新・release-upgrade・proposed追加・有料ESMの有効化は一括実行しない。
4. 固定資材・private profileを再照合し、新Webと対象Workerを起動する。新しい保存形式を書いた後に、それを読めない旧Webへ機械的に戻さない。障害時は書込を止め、現行DBを保って修復／対応版へ切り替える。

## 4. 正式確認と完了

`https://plunode.net` で、通常探索→テーマ／年表、直接・選択投稿、結果／帰属、原資料、訂正、Capsule保存・再訪・破棄、同URL共有更新・旧版コメント・停止、OGPを確認する。PC Workerの本番API接続とChatGPT API直送、通常の自動再開・全件巡回の代表境界も確認する。全件AI完了待ちや通常の管理者承認は追加しない。

実Google・fixture・HTTP／OGP画像・外部SNSプレビューを区別して記録する。Geminiの一般公開条件（年齢・提供地域・無料APIの範囲）、β／本番の同一projectの利用量を公開前に確定する。新しい課金や別キーでの上限迂回は行わない。

文書・検証記録を日本語commit・通常pushし、3200／HTTPS β／本番のsource・buildを個別に報告する。Autopilot holdを解放する。最新の実施結果を本書へ追記し、準備完了だけを公開完了としない。

Ubuntuの確認元：[Security updates](https://documentation.ubuntu.com/security/security-updates/)（2026-11-08参照）。Geminiの確認元：[Additional Terms](https://ai.google.dev/gemini-api/terms)（同日参照）。

## 2026-11-08 R6aの資材検証まで

正式候補ソース `12273b17`／build `4HA4J9PvlJxJdsWuxlIBA`。Webとknowledge-ops、空DBの全migration／再実行、checksum拒否、初回の空公開、standalone HTTPを確認した。候補imageはVPSへ転送しただけで、load・起動していない。3200／HTTPS βはセキュリティ更新 `999df702`／build `GKCLvKsSR-vkRGVFw_sJ5`。本番監査と一般提供条件の整理は未完了。利用量配分は下記の本人回答で確定した。[実測と残り](../verification/KNOWLEDGE_PRODUCTION_R6A_20261108.md)。

### 本人回答後の更新

利用量は本番300回・β100回で確定。月次・token・速度も同じ共通上限を3対1に分けたprivate候補を準備し、稼働中設定と台帳はまだ変更していない。[配分と切替条件](../design/KNOWLEDGE_AI_BUDGET.md#2026-11-08-本番βの配分を確定)。本番のAI起動前にβの設定と全利用processを揃え、切替前消費・未確定送信も確認する。

本人の最初の監査実行はSSH認証前のconnection resetで停止し、sudoも監査scriptも実行されていない。こちらでも断続的な切断と接続成功を確認。既存SSH接続を再利用するPC側の `backups/knowledge-production-20261108/run-audit.py` を準備し、`--check`で接続と転送済みscriptのSHA256を確認した。引数なしの本人実行だけが既存sudoを呼ぶ。パスワードをファイルやチャットへ保存しない。監査結果の受領は別に確認する。

年齢・地域の方針は了承されたが、「バックエンドでの利用にも特別な実装が必要か」という確認がある。公式条件は組込先のAPI Clientにも言及するため、内部利用なら対象外と決めつけない。一方で専用の身分証確認・生年月日収集を必須とする記載は確認しておらず、そのような基盤は追加しない。利用条件の明記と既存送信同意へ反映する最小案を基本に整理する。AI機能だけの制限でサービス全体の条件を満たすと公式に確認できた意味にはせず、公開Graph全体の年齢制限へ勝手に広げない。現時点でそのUI／同意更新を実装済みとは扱わない。


### 実物監査の受領後

会員ledgerは000〜019の20件・checksum一致、追加は020〜035の16件。知識001〜009の9件は新DBへ適用する。旧会員34表とGoogle／コミュニティ設定を保護する。APTの旧キャッシュだけでsecurity更新不要とせず、準備helperのmetadata更新・simulate結果を確認して適用内容を固定する。

準備helperは別のroot-private stageを使い、既存の失敗資材や稼働構成を消さない。実物backup／復元・再実行と暗号化の確認は、本番migration／正式切替と区別する。PCで暗号化backupを復号してdump hashを照合後、最終資材・設定・復旧を揃えて切替helperを提示する。


### 最終切替候補（準備完了、まだ未実行）

app `027f89bf`／正式build `Sf6Myn-qsOSMt8bnqxpE9`。会員16追加・知識9新規を確定し、実物Member dumpの分離復元と再実行、暗号化backupのPC復号を完了した。noble-security metadataの更新と配布元を確認し、追加候補は0件。

常用compose.yaml自体へ固定image・新3 Workerを反映し、将来の通常起動でも旧Webへ戻らないようにする。PGは既存volumeを保ってmax_connectionsを60へ変更。既存Neo4j／KG ops・Google／会員／コミュニティ設定とAI artifactを維持する。正本は別DB plunode_knowledge75_production。betaを100回／日へ切替済みで、正式の300回／日と合計400回／日、台帳は保持した。

切替は`scripts/release-knowledge-production.py`をchecksum固定のroot-private stageから実行する。実行用helperはPCの`backups/knowledge-production-20261108/run-release.py`。Web停止前に再照合し、最新backup→16／9 migration→空の初回投影→Web／3 Workerへ進む。新形式適用後は旧DB上書きや旧Webへの自動downgradeをしない。結果を受領してから正式URLのGoogle／代表操作、PCの2 Worker、同一ChatGPT会話の正式OAuthを確認する。


### PCの取得・読解Workerの再開

`scripts/start-knowledge-production-workers.py --node NODE24_PATH`は、本人所有0700の`~/.local/state/plunode-previews/production/`から正式用の2つのprivate clientを読み、PCの独立PID・log・checkpointで再開する。正式origin以外を拒否し、β／Member DB／Neo4jの環境変数を継承しない。PCへVPSのDB資格は渡さない。`--check`はローカル検査だけでAPI／AIへ送らない。

正式profileを設置した後は、既存の`start-local-previews.py beta`／`all`でPC・WSLを復帰すると、この2 Workerも再開する。未設定なら既存のβ起動に影響しない。正式Workerの起動失敗でβの起動を止めない。定期収集の調査は同じChatGPT会話・API直送を維持し、PC Workerは資料の安全な取得・配送と、VPSの予約済み読解だけを担う。

現在はprivate資材の準備と`--check`・β origin拒否まで確認済みで、正式用profileの設置と実接続は本番切替後に行う。新しいCodex予定は作らない。


### guard配下の端末入力

PC helperは制御端末 /dev/tty を開き直さない。guardは子を別sessionへ分けるため、scripts/production_ssh_terminal.pyで既存の標準入出力を引き継ぎ、SSHは -tt を使う。guardやsudoの認証条件を緩めない。run-release.py --terminal-check はsudoなしの固定文字列probeであり、本番切替とは別。標準入力をpipeから渡す場合も、公開用sudoパスワードをpipe／ファイル／チャットへ保存してはならない。通常の公開実行では本人がterminalへ直接入力する。

## 既存R6へChatGPT新規テーマ受付を追加する（2026-11-08）

027f89bfの正式切替後に欠けていた運営Themeの新規受付を補修する。一般ユーザーのTheme投稿UIや手動DB投入への変更ではない。[接続契約](../design/KNOWLEDGE_CHATGPT_THEME_REGISTRATION.md)と[R6b記録](../verification/KNOWLEDGE_PRODUCTION_R6B_20261108.md)を参照。

固定アプリ14542c72・正式build wFBq24bSaSp0W-_ZOFaXrを使い、専用 `scripts/release-knowledge-theme-production.py` と照合済みmanifestで更新する。旧R6の初回配置scriptは再実行しない。追加Member SQLは036だけ、既存checksumを変更しない。Knowledgeは9のまま。

PCの本人用入口は `backups/knowledge-theme-20261108/run-release.py`。既存SSH／sudoと共通holdを使い、パスワードはterminal内だけへ入力する。既存構成が変われば停止し、最新backupを作成して別DB復元・追加migration・再実行と旧行／所有者保全を確認する。影響範囲はWebと3つの知識Worker、036の受付台帳、Themeの有効化flag。KG用ops、会員・認証・旧KGのデータ、収集PCの資格、AIラボ資材は維持する。

切替後は新しい正式MCP接続で `missions:collect themes:compose offline_access` の本人同意を得る。既存のβ接続は維持し、同じ「Plunode資料収集」会話・予定へ正式接続を指定する。ChatGPTの資料付きTheme受付→通常確認／公開→元の受付IDの結果URL→探索・年表・Capsuleを実際に確認してからR6完了を判断する。共通原本の版と既存の保存・共有を勝手に更新しない。

13:11 JSTの最初の補修切替は復元用一時DBで停止し、本番構成・036は変更されていない。手順是正後の入口は `backups/knowledge-theme-20261108-r2/run-release.py`。古い入口を再実行せず、失敗stageを保全した別root stageへ同一アプリ資材と修正版の復元手順をコピーする。移行manifestは適用済み36件＋036だけに限定し、初期化専用SQLを含めない。TCPで初期化完了を待ち、既存ロールを再作成しない。同じ復元関数での実物βbackupの84→85表・37件・旧行／所有者・再実行確認は成功済み。正式の最新backupでの検証と切替、正式接続は本人操作後に確認する。
