# 収集Workerの処理結果

issue-25-utc-recovery-03：**waiting-control**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

復旧元: [issue-25-manga23-20261019-repair1-batch-04](../issue-25-manga23-20261019-repair1-batch-04/README.md)。旧依頼・承認・失敗履歴は保持し、日時の表記だけをUTC Zへ修正。同じ取得cache・通算予算を使用する。

Execution gate: interval

```json
{
  "counts": {
    "entities": 1,
    "claims": 1,
    "sources": 1,
    "citations": 1
  },
  "heldClaims": 0
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

