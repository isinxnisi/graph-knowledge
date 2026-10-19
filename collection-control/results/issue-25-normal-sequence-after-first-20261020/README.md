# 収集Workerの処理結果

issue-25-normal-sequence-after-first-20261020：**waiting-control**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Execution gate: interval

```json
{
  "status": "sequence-progress",
  "completedGroups": 3,
  "completedDecisionId": "issue-25-utc-recovery-04-normal",
  "sequenceComplete": false,
  "lastGroup": {
    "decisionId": "issue-25-utc-recovery-04-normal",
    "recordedAt": "2026-10-19T18:54:43.932711+00:00",
    "acceptedCounts": {
      "entities": 2,
      "claims": 1,
      "sources": 1,
      "citations": 1
    },
    "releaseAdditions": {
      "entities": 56,
      "claims": 43,
      "sources": 36,
      "citations": 44
    },
    "acceptanceReused": false,
    "publicApply": false
  }
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

