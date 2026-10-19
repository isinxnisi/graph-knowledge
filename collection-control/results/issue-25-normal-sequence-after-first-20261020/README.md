# 収集Workerの処理結果

issue-25-normal-sequence-after-first-20261020：**running**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Execution gate: interval

```json
{
  "status": "sequence-progress",
  "completedGroups": 4,
  "completedDecisionId": "issue-25-utc-recovery-06-normal",
  "sequenceComplete": false,
  "lastGroup": {
    "decisionId": "issue-25-utc-recovery-06-normal",
    "recordedAt": "2026-10-19T19:09:31.481880+00:00",
    "acceptedCounts": {
      "entities": 4,
      "claims": 3,
      "sources": 3,
      "citations": 3
    },
    "releaseAdditions": {
      "entities": 60,
      "claims": 46,
      "sources": 39,
      "citations": 47
    },
    "acceptanceReused": false,
    "publicApply": false
  }
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

