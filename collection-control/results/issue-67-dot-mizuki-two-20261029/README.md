# 収集Workerの処理結果

issue-67-dot-mizuki-two-20261029：**retry-wait**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

<urlopen error [Errno -3] Temporary failure in name resolution>

```json
{
  "counts": {
    "approvedWorks": 2,
    "preparedWorks": 0,
    "preparedPeople": 0,
    "batches": 0,
    "holds": 2,
    "networkAttempts": 6,
    "reusedWorks": 0,
    "reusedPublishedClaims": 0,
    "reusedHeldWorks": 0
  },
  "status": "prepared-candidates-not-accepted"
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

