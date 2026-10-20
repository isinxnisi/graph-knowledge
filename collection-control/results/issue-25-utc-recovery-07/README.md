# 収集Workerの処理結果

issue-25-utc-recovery-07：**retry-wait**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

復旧元: [issue-25-manga23-20261019-repair1-batch-08](../issue-25-manga23-20261019-repair1-batch-08/README.md)。旧依頼・承認・失敗履歴は保持し、日時の表記だけをUTC Zへ修正。同じ取得cache・通算予算を使用する。

Command '['git', '-c', 'http.version=HTTP/2', '-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=20', '-c', 'credential.helper=!"/mnt/c/Program Files/Git/mingw64/libexec/git-core/git-credential-manager.exe"', '-c', 'credential.interactive=never', '--git-dir=/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/control.git', 'credential', 'fill']' timed out after 90 seconds

```json
{
  "counts": {
    "entities": 3,
    "claims": 2,
    "sources": 2,
    "citations": 2
  },
  "heldClaims": 0
}
```

収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。

