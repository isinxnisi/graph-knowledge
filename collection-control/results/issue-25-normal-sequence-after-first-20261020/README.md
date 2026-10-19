# 収集Workerの処理結果

issue-25-normal-sequence-after-first-20261020：**running**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Execution gate: interval

```json
{
  "status": "sequence-progress",
  "completedGroups": 2,
  "completedDecisionId": "issue-25-utc-recovery-03-normal",
  "sequenceComplete": false,
  "lastGroup": {
    "decisionId": "issue-25-utc-recovery-03-normal",
    "recordedAt": "2026-10-19T18:39:45.450652+00:00",
    "acceptedCounts": {
      "entities": 1,
      "claims": 1,
      "sources": 1,
      "citations": 1
    },
    "releaseAdditions": {
      "entities": 54,
      "claims": 42,
      "sources": 35,
      "citations": 43
    },
    "acceptanceReused": false,
    "publicApply": false
  }
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

