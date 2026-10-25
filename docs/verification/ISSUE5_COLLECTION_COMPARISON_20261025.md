# Issue #5 保存済み子収集の比較集合修復（2026-10-25）

対象：`issue-5-dot-tezuka-adolf-20261025-batch-01`。正式受入・公開apply・VPS・会員DB・UIを変更しない。

## 原因の確定

実Worker runtimeの保存済みjob `issue-5-dot-tezuka-adolf-20261025-r0001-b32d95e12ce276b5` は `candidate-ready`。親はcompleted、子は5回失敗後、時間帯制御でwaiting-control。旧workflowと実入力で `review_job` → `exploration_paths` → Claimのsubject Entity参照時に `KeyError: d5e39491-5a5f-423c-9222-2eb3c18db9a8` を再現した。収集対象の手塚治虫の同定・通信エラーではない。

実際の比較元はローカル公開snapshot `20261014-credits-001` / revision `82b01515-594c-48ca-b4b6-515eefac83ca`。正式receipt10件を検証した最新累積release `manga-issue-34-obata-drawing-20261023` は、直前の50 Claim releaseをbaseにしており、旧APIが返したのはEntity0・Claim1・Source1・Citation1の差分だけだった。この1 Claim（小畑健）のEntityは新しいbaseに移っているが古いsnapshotにはなく、比較から欠落した。

保存jobのcacheは親の `request-cache` へのsymlinkで、親子合計 **4/30試行**。5回の失敗でprovider通信は追加されていない。Issue #25の89/142台帳とは別であり、履歴をリセットしない。

## 最小修正

- レビュー用に明示した `comparison=True` のみ、全receiptの原記録・hash・Role・scope・根拠から検証した66 Entity・51 Claim・44 Source・52 Citationを返す。
- 公開準備・正式受入・受入sequence等の既存呼出しには従来のrelease差分を返す。旧base不変・未承認差分拒否・既存validatorを維持する。
- Claim→Entity、Citation→Claim／Sourceの参照欠落を明示して停止する。推測作成・黙った除外をしない。
- レビューの未想定KeyError／TypeErrorは例外名と `humanReviewRequired` を返し、既存Workerのblocked分類へ接続する。I/O失敗の再開は維持する。

## 検証

57テスト成功：新規比較6、既存workflow16、受入16、sequence19。公開差分互換、改変された承認／凍結根拠の拒否、参照欠落の停止、Workerが論理エラーを再試行せずblockedにすることを含む。

`tests/check_issue5_comparison.py` を実runtimeの保存済みjob・read-only snapshotで実行。provider送信とcollector起動を禁止し、レビューを2回再生して一致した。1 Entity・1 Claim・1 Source・1 Citationを候補とし、保留0、通信追加0、累積4/30。Claim `3e652339-e18e-472f-b3bb-8cc375804660`、AUTHORSHIP、ISBN `9784168110139`、第1巻／日本語、根拠「手塚治虫 著」を保持。正式受入ではない。

欠落Entityを再び取り除いた負試験は明示的に停止した。1127の既存データ・保存job・cache・成果物をhash比較し不変。正式receipt10件も不変。

## 実運用への配置と確認

配置の実測は後続の追記を参照。互換基準973c7b0・CollectionWorker本体・Issue adapter・collector・config・taskは維持し、検証済みworkflow moduleだけを共通ロックとWorkerロックの安全な境界で原子的に差し替える。旧版・取得元commit・前後SHAを専用保全先へ保存する。state、retryAt、承認、receipt、通信cacheを編集しない。

調査時は18:00枠終了後で、通常次回枠は **2026-10-26 03:00 JST**（PC稼働・他の制御条件充足時）。時間帯を変更せず、通常実行前の状態を完了として報告しない。レビューの新規候補を正式受入するかは別の人間判断として残る。
