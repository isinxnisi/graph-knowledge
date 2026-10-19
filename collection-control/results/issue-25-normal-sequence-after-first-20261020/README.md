# 収集Workerの処理結果

issue-25-normal-sequence-after-first-20261020：**sequence-progress**

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

- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0003-4e7b3edf51e9545b-review-c1ab7772b1b72fea/README.md](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0003-4e7b3edf51e9545b-review-c1ab7772b1b72fea/README.md)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0003-4e7b3edf51e9545b-review-c1ab7772b1b72fea/decision-request.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0003-4e7b3edf51e9545b-review-c1ab7772b1b72fea/decision-request.json)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0003-4e7b3edf51e9545b-review-c1ab7772b1b72fea/exploration-paths.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0003-4e7b3edf51e9545b-review-c1ab7772b1b72fea/exploration-paths.json)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0004-b96c712262173821-review-d9500d40636871b4/README.md](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0004-b96c712262173821-review-d9500d40636871b4/README.md)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0004-b96c712262173821-review-d9500d40636871b4/decision-request.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0004-b96c712262173821-review-d9500d40636871b4/decision-request.json)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0004-b96c712262173821-review-d9500d40636871b4/exploration-paths.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0004-b96c712262173821-review-d9500d40636871b4/exploration-paths.json)
- [datasets/collection-sequences/reports/issue-25-normal-sequence-after-first-20261020/b08ef3d4932ac2703886/datasets/manga-collection/accepted-issue-25-utc-recovery-04-normal/preparation.md](../../artifacts/issue-25-normal-sequence-after-first-20261020/datasets/collection-sequences/reports/issue-25-normal-sequence-after-first-20261020/b08ef3d4932ac2703886/datasets/manga-collection/accepted-issue-25-utc-recovery-04-normal/preparation.md)
