# 知識DBの公開投影入れ替え手順

012個別の移行・復旧記録。今後の通常のアプリ公開では[共通本番公開手順](PRODUCTION_RELEASE.md)を使う。

## 承認後に行う本番切替

1. PG／Neo4j・Web／Workerの現行版、012の前提migration、稼働中の公開世代IDとGraphの稼働、直近の復元確認済みバックアップを照合する。対象は正式originと専用知識DB。別環境に復元して012の適用・再実行、旧公開世代と固定版、失敗後の公開切替、代表検索・Graph・共有を確認する。
2. 同じ固定SHAからWebとknowledge-opsを構築する。通常の配置手順で旧Publisher／巡回Workerの停止を確認し、既存の `scripts/knowledge-migrate.ts --publication-storage-only --confirm-origin https://plunode.net --confirm-database plunode_knowledge75_production` を正式のoperatorプロファイルで実行する。012は既存投影の行を移送せず、参照用ビューと空の投影テーブルを追加する。重複インデックスの取り外しとメタデータ更新だけが既存台帳に触れる。ロック待ちで中断したときはledgerを照合して再実行する。
3. 新Web／Workerで旧現役世代の読取を確認する。次の公開更新で新形式の投影を生成する。即時検証が必要なら新Publisherで `--once --force` を実行する。単一Publisherの排他を守る。検索・隣接ページング・固定Record版・固定共有を確認し、公開内容・根拠・認可を切替前と照合する。
4. 旧形式の現役世代が参照可能な間に切替の受入を完了する。整理を有効にする場合は、既存Workerの設定へ `KNOWLEDGE_PUBLICATION_RETENTION_HOURS=72` と `KNOWLEDGE_INVENTORY_RETENTION_DAYS=7` を独立して追加する。設定がないWorkerは期限による整理を開始しない。

## 011稼働版からの正式切替

固定ソースのWeb／knowledge-ops imageと012を、管理者専用のstageでSHA256照合してから `scripts/release-knowledge-publication-storage-production.py` を実行する。既存の正式配置ロックを使用する。現在の011対応版のbuild・image・既存ledgerを照合し、自動整理の設定がある場合は開始前に停止する。

稼働中に知識DBのバックアップを取り、アーカイブ目次とhashを確認する。旧Worker停止後に公開カーソルと固定Record版を記録し、Web停止中に012を現在のledger所有者で適用する。再適用の冪等性・原本・現役世代を照合してから、Webを起動する。旧形式の読取確認後にPublisherを一度実行し、同数のRecordが新形式になり、旧カーソルと固定版の応答が一致することを確認して通常Workerを再開する。会員DBの移行はこの手順に含まれない。

既存Workerの再開前に切替が失敗した場合は、当該実行が作った現役ポインタだけを検査付きで戻す。旧WebとWorkerを再開し、適用済みの012は保持する。旧現役の参照が確認できれば同一資材で再試行できる。Workerの再開を開始した後の障害は、新版の稼働を復旧して状態を確認する。

## 012切替後の段階整理

正式012とWeb・Workerの切替は承認・適用済み。正式での期限整理はその承認時に保留された。下記の設定はそれぞれの削除範囲を明示して承認を得た後に適用する。残工程の実測と進行は[本番整理の確認記録](../verification/KNOWLEDGE_RETENTION_20261119.md)に記録する。

| 承認する単位 | 対象と保護条件 |
| --- | --- |
| 巡回一覧7日 | 7日を過ぎた完成済み・stale一覧の行。走査中の一覧、実行・完了checkpoint、現行対象が参照する一覧を保護する。台帳と不在監査・巡回タスクは保持する |
| 公開世代72時間 | 現役から外れて72時間を過ぎたready世代と、現役より古く72時間を過ぎた再試行対象外のstaged／failed投影。失効済みで途中の処理も再開する。現役・猶予期間内の世代・読取中のGraphを保護し、未失効世代と共有するGraphも保持する。知識原本・固定版・共有・Capsuleに必要な内容と初回公開文脈を保持する |

1. 承認前でも`knowledge_storage_retention.py audit`を実行できる。正式の設定と実際のWorker環境、対象数・次の期限・現役・巡回checkpoint、原本版数・論理行・PG relation／WAL／Neo4j／host空き容量を取得する。Read Onlyと時間制限を付け、集計だけを取得する。正式HTTPSの代表検索・固定Record版と旧カーソル、現役の隣接を同じ端末から事前採取する。
2. 承認された対象を一つずつ`enable inventory`または`enable publication`で有効にする。現在の完全なWorker sourceを`--expect-source`、正式Web buildを`--expect-build`で渡す。VPS管理者用の検証済み資材に`production_release*.py`、`production_image_verification.py`、`production-release-probe.cjs`と`database-capacity-report.py`を含める。既存の正式配置ロックを使い、適用済み012、現役の新形式、正式版と対象Workerを照合する。知識PGのカスタム形式バックアップの目次とSHA-256を確認し、設定の退避後に対象Workerだけを再起動する。
3. 巡回は1分ごとに各originの一覧を1件選び、行を最大1万件処理する。公開は1分ごとに1世代を選び、固定文脈を保全してPGで失効、参照のないNeo4j投影を最大5,000ノードずつ整理し、その後PGの各投影を最大1万行ずつ処理する。途中の単位は次の周期に引き継ぐ。012で付けた当初の72時間は短縮しない。
4. 初回周期で`audit`を再取得し、処理数・リトライ、現役とcheckpoint、原本・固定版を確認する。旧カーソルが実際に対象になった後は、410／`GENERATION_EXPIRED`と最新世代での再検索を確認する。未到来の期限を成功として扱わず、残りがなくなるまで既存Workerの進捗を別時点で採取する。連続するリトライ、通常読取の継続的な悪化、checkpointや現役世代の異常があれば次の有効化を保留し、該当する方を停止する。

```bash
# 運用端末から事前と整理後の同じ経路を計測
python3 scripts/knowledge_storage_retention.py sample-https --old-generation "$old_generation" > formal-before.json
python3 scripts/knowledge_storage_retention.py sample-https --compare formal-before.json > formal-after.json

# 承認後にVPSの既存管理者権限下で、対象を一つずつ実行
python3 -Es knowledge_storage_retention.py audit
python3 -Es knowledge_storage_retention.py enable inventory --expect-source "$active_source" --expect-build "$active_build"
python3 -Es knowledge_storage_retention.py audit
```

Search・続き・隣接の各p50／p95を同条件で比較する。DBの論理行数、PG relationの割当とautovacuum、WAL・Neo4jの割当、VPSの空き容量は別々に記録する。普通のautovacuumで再利用可能になった領域は、OSに戻った空き容量とは区別する。バックアップ追加や他サービスの変動もhost差分に含まれる。通常のautovacuumの観測を先に行い、`VACUUM FULL`などのテーブル書き直しや別の物理圧縮は独立した判断とする。

停止には管理者が`knowledge_storage_retention.py disable inventory`または`disable publication`を使う。該当の設定だけを戻し、対象Workerを更新する。反映に失敗した場合はそのWorkerを停止して調べる。現役投影の異常は権限を照合した原本から再構築する。バックアップは別DBへの復元・調査に使う。既に失効した旧カーソルは、設定を戻しても新しい検索が必要になる。

## 切替失敗からの復帰

- 012で失敗した場合は適用結果を再照合し、現役世代の稼働を確認する。staged投影やNeo4j生成途中の失敗は、元の現役世代を提供しながら既存Publisherで再試行する。
- 切替後に旧版Webへの復帰が必要な場合は整理とPublisherを停止し、切替直前に記録した旧世代が未失効・readyでGraphも完了していることを確認する。管理者の1トランザクションで現役ポインタをその世代に戻し、旧Webで読み取れることを確認する。次の処理で見落としを避けるため、旧Publisherを `--once --force` で実行して現時点の原本から再投影してから通常運転へ戻す。
- 整理開始後に投影が壊れた場合は、現在の公開権限を適用して原本から強制再構築する。固定版は保存した初回公開文脈と原本版を読む。独立した会員DBと知識原本を戻す作業は、この投影の復帰と切り離す。
