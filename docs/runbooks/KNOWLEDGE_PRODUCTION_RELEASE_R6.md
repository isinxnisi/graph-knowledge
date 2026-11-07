# R6 共通知識・年表・投稿・自動処理の正式反映

2026-11-08。R5の確認済みアプリ `48ab1d7f`、記録 `374125f1` を起点にする。今回の「進めてください」をR6の公開実行指示として受け、過去のβ限定の作業区切りを新しい公開を止める理由にしない。R6aは実物監査・資材／移行準備、R6bは切替・正式URLの確認。現時点で公開済みという意味ではない。

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
2. 復旧用に旧Compose／env／private runtime／image識別情報を保存する。Webと書込Workerを同じ区切りで停止し、会員・知識DBの整合したbackupを確保する。別名DBへ復元し、旧行と所有者／ledgerを照合して移行・再実行を検証する。失敗時に旧dumpを本番へ上書きしない。
3. LinuxはUbuntuのsecurity pocketと実際の更新候補を照合する。通常の機能更新や無関係なサービスの更新を一括実行しない。適用内容・再起動要否を記録し、必要な再起動後は既存サービスを復帰する。パッケージの新旧だけで未修正CVEと断定しない。
4. 固定資材・private profileを再照合し、新Webと対象Workerを起動する。新しい保存形式を書いた後に、それを読めない旧Webへ機械的に戻さない。障害時は書込を止め、現行DBを保って修復／対応版へ切り替える。

## 4. 正式確認と完了

`https://plunode.net` で、通常探索→テーマ／年表、直接・選択投稿、結果／帰属、原資料、訂正、Capsule保存・再訪・破棄、同URL共有更新・旧版コメント・停止、OGPを確認する。PC Workerの本番API接続とChatGPT API直送、通常の自動再開・全件巡回の代表境界も確認する。全件AI完了待ちや通常の管理者承認は追加しない。

実Google・fixture・HTTP／OGP画像・外部SNSプレビューを区別して記録する。Geminiの一般公開条件（年齢・提供地域・無料APIの範囲）、β／本番の同一projectの利用量を公開前に確定する。新しい課金や別キーでの上限迂回は行わない。

文書・検証記録を日本語commit・通常pushし、3200／HTTPS β／本番のsource・buildを個別に報告する。Autopilot holdを解放する。最新の実施結果を本書へ追記し、準備完了だけを公開完了としない。

Ubuntuの確認元：[Security updates](https://documentation.ubuntu.com/security/security-updates/)（2026-11-08参照）。Geminiの確認元：[Additional Terms](https://ai.google.dev/gemini-api/terms)（同日参照）。

## 2026-11-08 R6aの資材検証まで

正式候補ソース `12273b17`／build `4HA4J9PvlJxJdsWuxlIBA`。Webとknowledge-ops、空DBの全migration／再実行、checksum拒否、初回の空公開、standalone HTTPを確認した。候補imageはVPSへ転送しただけで、load・起動していない。3200／HTTPS βはセキュリティ更新 `999df702`／build `GKCLvKsSR-vkRGVFw_sJ5`。本番監査と一般提供条件／利用量配分は回答待ち。[実測と残り](../verification/KNOWLEDGE_PRODUCTION_R6A_20261108.md)。
