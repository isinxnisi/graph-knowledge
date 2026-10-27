# CollectionWorkerの実行制御

確認: 2026-10-28 07:46:52 JST。

反映済みcontrolRevision: 7／最後の操作: pub-13abfb93-ba2d-44f7-a56b-352aa7ab0ab0-pause。

**pause-new**／停止モード: pause-new

日本時間: 03:00〜07:00、09:00〜12:00、15:00〜18:00。ジョブ間10分休憩。

次の開始候補: 再開操作／制御修正待ち

最後の操作SHA-256: 4e3110c15c04a17bbcc5418fd2f16c161305db03a383ee4764b1088f49334411

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
  },
  "collection-control/issue-sources/46.json": {
    "status": "registered: issue-46-dot-aoyama-three-20261027",
    "checkedAt": "2026-10-27T04:44:02+00:00"
  },
  "collection-control/issue-sources/47.json": {
    "status": "registered: issue-47-dot-yukimura-two-20261027",
    "checkedAt": "2026-10-27T04:46:03+00:00"
  },
  "collection-control/issue-sources/48.json": {
    "status": "registered: issue-48-dot-toriyama-three-20261027",
    "checkedAt": "2026-10-27T17:20:59+00:00"
  },
  "collection-control/issue-sources/49.json": {
    "status": "registered: issue-49-dot-hara-souten-20261027",
    "checkedAt": "2026-10-27T07:53:07+00:00"
  },
  "collection-control/issue-sources/50.json": {
    "status": "registered: issue-50-dot-endo-tista-20261027",
    "checkedAt": "2026-10-27T08:19:09+00:00"
  },
  "collection-control/issue-sources/51.json": {
    "status": "registered: issue-51-dot-araki-rohan-20261027",
    "checkedAt": "2026-10-27T10:05:12+00:00"
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
