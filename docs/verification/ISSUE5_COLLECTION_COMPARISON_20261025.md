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


### 配置実測・最終状態（18:27 JST時点）

コード `7952e08` をmain・専用branchへ通常push済み。共通holdとWorkerの非待機flockを取り、activeAttemptなしの地点で配置した。通常tick中は変更せず、解放後の隙間で取得した。pause-new、強制終了、lock削除、設定変更は行わない。

main全体を初回配置したCLI smokeで、既存mainにだけある `collection-evidence.py` 依存の不足を検出した。重い処理は共通holdと時間帯により開始されておらず、データ変更・追加収集はなかった。固定973c7b0（元workflow SHA `1caee6a1b45dc836b4c6a4c3b11476e5b53ca1183ea9076ed9d271a70ca5f485`）へ **7952e08の今回のdiffだけ** を適用したmoduleへ置き換え、CLI起動成功・同じ新規6試験成功・実保存job再生成功を確認した。mainにある無関係なevidence CLI機能はruntimeへ追加していない。

実配置workflow SHA：`4cf976114b8b4f79bdb3f5e8f1573db91cbfd395080f4fae75e79fafbc1e704e`。これはruntime全体の更新ではない。互換基準973c7b0、Issue adapter SHA `9e0231ab0f444e181e6672d28759b729c108ae2d7816915789a794ba1465656e`、core/control/collector、configを不変比較した。

最終配置receipt・前段moduleの保全先：
`/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/issue5-workflow-backport-ak42oh8_`

**正常な旧版への切戻し元**は初回保全先の `issue5-workflow-backport-9revyd4a/collection-workflow-before.py`。後段保全先のbeforeは依存不一致を検出した中間版なので復旧に使わない。切戻しも共通hold＋Workerロック・activeAttemptなしで旧正常SHAを検証してmoduleだけを原子的に戻し、state／receipt／cacheを過去へ戻さない。旧版では当該子の同じ論理エラーが再発するため、通常継続には修正版を使う。

配置済みmoduleそのものを `--workflow` で指定した保存job再生は、候補1 Claim・保留0・追加通信0・正式受入なし・公開applyなし。provider送信／collector起動は禁止したまま、保存入力からのレビュー経路を確認した。1127の既存成果・通信台帳・job・正式receiptは不変。現在の公開APIもrevision `b74a4b00-9454-412f-af5d-1317713a543c` のまま。

配置後の通常Worker tickでhealth online・activeAttemptなし・子waiting-control／attempts5／outside-windowを確認した。Windowsの既存毎分taskは継続、task設定は未変更。**通常Workerでの子の最終終了は未確認**であり、完了条件を達成済みとはしない。次は2026-10-26 03:00 JST以降に保存済みjobから通常再試行する（PC・通信・共通ロック等の条件による）。手動起動・時間帯やretryAtの書換えで前倒ししない。GitHubの共有statusも時間帯外待機で、完了成果の登録を待つ。

残る人間判断は、生成される1 Claimの正式受入を行うかどうか。今回これを代行しない。修正の稼働・再開に追加の承認や手動収集は不要だが、実Workerのcompleted／根拠付きheld到達の観測は次の実行枠に残る。
