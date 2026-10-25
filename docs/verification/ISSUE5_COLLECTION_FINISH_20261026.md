# Issue #5 新規候補の判断用下書き・共有後処理（2026-10-26）

対象：`issue-5-dot-tezuka-adolf-20261025-batch-01`。正式受入・公開apply・VPS・会員DB・Web UIは対象外。

## 原因と再現

6回目の通常収集は保存済みjobから1 Entity・1 Claim・1 Source・1 Citation、保留0を生成し、追加通信0で終了した。`executionComplete=true` の後、Worker `finish → Executor.artifacts → decision-template → template → protect_inputs` で `ValueError: Output overlaps frozen review, job, registry or referenced artifacts` となる。

新規出力は `datasets/manga-collection/decisions/issue-5-dot-tezuka-adolf-20261025-batch-01-normal-draft.json`。レビューのacceptedReferencesにある過去の正式承認 `datasets/manga-collection/decisions/issue-25-utc-recovery-01-normal.json` が、その親ディレクトリ全体を保護する。新規ファイルでも同じディレクトリ内なので拒否される。共通ロック待ち・provider通信・意味判断の不足とは別の実装上の衝突。

`tests/check_issue5_decision_drafts.py` で実runtimeの保存review/job/入力を検証し、旧出力先で同じ例外・スタックを再現した。実入力は読み取りのみ、修正版の出力は一時runtimeとメモリ上のGitHub相当storeへ限定する。Issueの再取得は隔離試験内だけで「変更なし」と置換し、providerとcollectorの起動は禁止する。

## 修正

- Workerの新規下書きのみ `datasets/collection-decision-drafts/<request-id>/<review-manifest-sha256>/` へ分離する。normal・identity・allとそれぞれの依頼下書きに共通適用。
- request別・review hash別のディレクトリにすることで、過去の下書きが正式承認に参照された後も、次の候補／新reviewを凍結範囲へ書き込まない。
- decision ID、UUID、本文hash、Role、scope、根拠と元承認は変更しない。旧下書き／正式承認は移動・上書きしない。凍結保護・hash検査は解除しない。
- 後処理内のValueError・KeyError・TypeErrorを、例外名付きblockedへ接続する。未完了の決定的エラーを無意味に再試行しない。I/O・配送障害はexecutionCompleteから再開し、収集を再実行しない。

## 検証

`python3 -B -m unittest discover -s tests -p 'test_collection_worker*.py' -v`：36件成功（新規4件を含む）。既存 `test_collection_sequence_worker.py` 7件も成功、合計43件。

新規4件は、旧保護衝突を再現して異なる2 Claimの新規候補をそれぞれcompleted／未承認下書き共有へ進めること、normal／identity／allの生成と旧下書き参照後の別review、hash改変のblocked・次tick再試行なし、下書き保存後I/O失敗からの再開。既存のロック・時間枠・10分休憩・通信障害・失効・重複排除も成功。

実保存jobの隔離再生：completed、attempts6のまま、未承認下書き1件とaccept-release依頼下書きを共有。実データ／job／cache／正式receipt等1,200ファイルのhash不変。親子共有ledgerは4/30試行、追加provider通信0。Claim `3e652339-e18e-472f-b3bb-8cc375804660`、AUTHORSHIP、ISBN `9784168110139`、第1巻、日本語、Entity／Source／CitationのUUIDを保持。候補であり正式受入ではない。

## 実運用への反映

独立worktreeでの修正・隔離試験は運営者が先行許可。共有mainへの統合と実Worker配置は共通hold取得後、Workerロック・activeAttemptなしを確認した安全な境界で行う。runtimeのWorker moduleだけを原子的に更新し、旧code・前後hashを保全する。state／retryAt／cache／承認／receipt／task／時間帯／休憩は編集しない。

実配置・通常Workerの最終結果は、確認後に追記する。隔離試験のcompletedを実運用完了とは扱わない。
