# 収集Workerの処理結果

issue-25-normal-sequence-after-first-20261020：**sequence-progress**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Execution gate: interval

```json
{
  "status": "sequence-progress",
  "completedGroups": 5,
  "completedDecisionId": "issue-25-utc-recovery-07-normal",
  "sequenceComplete": false,
  "lastGroup": {
    "decisionId": "issue-25-utc-recovery-07-normal",
    "recordedAt": "2026-10-19T19:23:52.882654+00:00",
    "acceptedCounts": {
      "entities": 3,
      "claims": 2,
      "sources": 2,
      "citations": 2
    },
    "releaseAdditions": {
      "entities": 63,
      "claims": 48,
      "sources": 41,
      "citations": 49
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
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0006-18bb8d898648582b-review-d38b26ea39279e93/README.md](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0006-18bb8d898648582b-review-d38b26ea39279e93/README.md)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0006-18bb8d898648582b-review-d38b26ea39279e93/decision-request.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0006-18bb8d898648582b-review-d38b26ea39279e93/decision-request.json)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0006-18bb8d898648582b-review-d38b26ea39279e93/exploration-paths.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0006-18bb8d898648582b-review-d38b26ea39279e93/exploration-paths.json)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0007-0b3c13e86c5f069c-review-9cb3e5c8a5348de9/README.md](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0007-0b3c13e86c5f069c-review-9cb3e5c8a5348de9/README.md)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0007-0b3c13e86c5f069c-review-9cb3e5c8a5348de9/decision-request.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0007-0b3c13e86c5f069c-review-9cb3e5c8a5348de9/decision-request.json)
- [.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0007-0b3c13e86c5f069c-review-9cb3e5c8a5348de9/exploration-paths.json](../../artifacts/issue-25-normal-sequence-after-first-20261020/.local/acceptance-sequences/issue-25-normal-sequence-after-first-20261020/reviews/issue-25-utc-recovery-r0007-0b3c13e86c5f069c-review-9cb3e5c8a5348de9/exploration-paths.json)
- [datasets/collection-sequences/reports/issue-25-normal-sequence-after-first-20261020/34636c6befded373d5e0/datasets/manga-collection/accepted-issue-25-utc-recovery-07-normal/preparation.md](../../artifacts/issue-25-normal-sequence-after-first-20261020/datasets/collection-sequences/reports/issue-25-normal-sequence-after-first-20261020/34636c6befded373d5e0/datasets/manga-collection/accepted-issue-25-utc-recovery-07-normal/preparation.md)
