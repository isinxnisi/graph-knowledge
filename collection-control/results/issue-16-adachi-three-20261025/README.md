# 収集Workerの処理結果

issue-16-adachi-three-20261025：**waiting-lock**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

共通ロック使用中。次回に再確認する。

```json
{
  "counts": {
    "approvedWorks": 3,
    "preparedWorks": 0,
    "preparedPeople": 0,
    "batches": 0,
    "holds": 1,
    "networkAttempts": 1,
    "reusedWorks": 3,
    "reusedPublishedClaims": 2,
    "reusedHeldWorks": 1
  },
  "status": "prepared-candidates-not-accepted"
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

