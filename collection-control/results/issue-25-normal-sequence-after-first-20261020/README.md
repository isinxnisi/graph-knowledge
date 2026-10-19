# 収集Workerの処理結果

issue-25-normal-sequence-after-first-20261020：**waiting-control**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Execution gate: interval

```json
{
  "status": "sequence-progress",
  "completedGroups": 6,
  "completedDecisionId": "issue-25-utc-recovery-08-normal",
  "sequenceComplete": false,
  "lastGroup": {
    "decisionId": "issue-25-utc-recovery-08-normal",
    "recordedAt": "2026-10-19T19:38:57.087154+00:00",
    "acceptedCounts": {
      "entities": 3,
      "claims": 2,
      "sources": 2,
      "citations": 2
    },
    "releaseAdditions": {
      "entities": 66,
      "claims": 50,
      "sources": 43,
      "citations": 51
    },
    "acceptanceReused": false,
    "publicApply": false
  }
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

