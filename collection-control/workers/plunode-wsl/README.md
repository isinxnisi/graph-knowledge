# CollectionWorkerの実行制御

確認: 2026-10-27 06:00:28 JST。

反映済みcontrolRevision: 4／最後の操作: pub-b36af1ba-d283-412e-aa29-465d360928b7-resume。

**ready**／停止モード: なし

日本時間: 03:00〜07:00、09:00〜12:00、15:00〜18:00。ジョブ間10分休憩。

次の開始候補: 開始可能

最後の操作SHA-256: 58c6e70ebf2ccd9b4d23bb15fc60e419f08d3df5df107ad26f6ff533e47681f6

ChatGPTは[未承認の操作雛形](control-template.json)を読み、運営者が明示した操作だけを controls/plunode-wsl/ID.json に新規登録する。

pause-new: 新規開始だけ停止。pause-running: 実行中もチェックポイントから再開できる形で中断。resume: 停止解除。set-windows: windowsを指定して毎日の時間枠を変更。

操作はworker-execution-control-only。収集・知識受入・公開applyの承認ではない。GitHub権限を信頼し、名前だけを本人認証とは扱わない。Issuesの計画本文と実行キューは分離し、購読先の明示的な収集許可だけをhash付き依頼へ変換する。

Issue確認結果:

```json
{
  "collection-control/issue-sources/25.json": {
    "status": "registered: issue-25-manga23-20261019",
    "checkedAt": "2026-10-18T18:35:58+00:00"
  },
  "collection-control/issue-sources/16.json": {
    "status": "registered: issue-16-adachi-three-20261025",
    "checkedAt": "2026-10-25T03:39:57+00:00"
  },
  "collection-control/issue-sources/5.json": {
    "status": "registered: issue-5-dot-tezuka-adolf-20261025",
    "checkedAt": "2026-10-25T07:09:00+00:00"
  },
  "collection-control/issue-sources/42.json": {
    "status": "registered: issue-42-dot-matsumoto-three-20261026",
    "checkedAt": "2026-10-26T03:42:01+00:00"
  }
}
```

個別処理・根拠・代表Graph経路は[結果一覧](../../results/)を参照。収集候補／正式受入済み未公開／公開済みを混同しない。

## 不具合復旧

旧blockedは変更しない失敗履歴。下記の新規依頼の状態を現在の復旧進捗として確認する。

- [issue-25-utc-recovery-01](../../results/issue-25-utc-recovery-01/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-03）
- [issue-25-utc-recovery-02](../../results/issue-25-utc-recovery-02/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-01）
- [issue-25-utc-recovery-03](../../results/issue-25-utc-recovery-03/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-04）
- [issue-25-utc-recovery-04](../../results/issue-25-utc-recovery-04/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-05）
- [issue-25-utc-recovery-05](../../results/issue-25-utc-recovery-05/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-06）
- [issue-25-utc-recovery-06](../../results/issue-25-utc-recovery-06/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-07）
- [issue-25-utc-recovery-07](../../results/issue-25-utc-recovery-07/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-08）
- [issue-25-utc-recovery-08](../../results/issue-25-utc-recovery-08/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-09）
- [issue-25-utc-recovery-09](../../results/issue-25-utc-recovery-09/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-10）
