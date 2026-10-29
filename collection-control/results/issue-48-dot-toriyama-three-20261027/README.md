# 収集Workerの処理結果

issue-48-dot-toriyama-three-20261027：**retry-wait**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Command '['git', '-c', 'http.version=HTTP/2', '-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=20', '-c', 'credential.helper=!"/mnt/c/Program Files/Git/mingw64/libexec/git-core/git-credential-manager.exe"', '-c', 'credential.interactive=never', '--git-dir=/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/control.git', 'credential', 'fill']' timed out after 90 seconds

```json
{
  "counts": {
    "approvedWorks": 3,
    "preparedWorks": 1,
    "preparedPeople": 1,
    "batches": 1,
    "holds": 2,
    "networkAttempts": 14,
    "reusedWorks": 0,
    "reusedPublishedClaims": 0,
    "reusedHeldWorks": 0
  },
  "status": "prepared-candidates-not-accepted"
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

