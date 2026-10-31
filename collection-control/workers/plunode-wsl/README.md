# CollectionWorkerの実行制御

確認: 2026-10-31 22:32:38 JST。

反映済みcontrolRevision: 8／最後の操作: pub-13abfb93-ba2d-44f7-a56b-352aa7ab0ab0-resume。

**outside-window**／停止モード: なし

日本時間: 03:00〜07:00、09:00〜12:00、15:00〜18:00。ジョブ間10分休憩。

次の開始候補: 2026-11-01 03:00:00 JST

最後の操作SHA-256: 1cef6cdd4cb0e4eca8b60a3ae51c6b25a96271b01ffcac788f41f36a5439bf79

ChatGPTは[未承認の操作雛形](control-template.json)を読み、運営者が明示した操作だけを controls/plunode-wsl/ID.json に新規登録する。

pause-new: 新規開始だけ停止。pause-running: 実行中もチェックポイントから再開できる形で中断。resume: 停止解除。set-windows: windowsを指定して毎日の時間枠を変更。

操作はworker-execution-control-only。収集・知識受入・公開applyの承認ではない。GitHub権限を信頼し、名前だけを本人認証とは扱わない。Issuesの計画本文と実行キューは分離し、購読先の明示的な収集許可だけをhash付き依頼へ変換する。

Issue確認結果:

```json
{
  "collection-control/issue-sources/25.json": {
    "status": "registered: issue-25-manga23-20261019",
    "checkedAt": "2026-10-31T08:29:46+00:00"
  },
  "collection-control/issue-sources/16.json": {
    "status": "registered: issue-16-adachi-three-20261025",
    "checkedAt": "2026-10-31T09:14:46+00:00"
  },
  "collection-control/issue-sources/5.json": {
    "status": "registered: issue-5-dot-tezuka-adolf-20261025",
    "checkedAt": "2026-10-30T13:35:03+00:00"
  },
  "collection-control/issue-sources/42.json": {
    "status": "registered: issue-42-dot-matsumoto-three-20261026",
    "checkedAt": "2026-10-31T11:10:48+00:00"
  },
  "collection-control/issue-sources/46.json": {
    "status": "registered: issue-46-dot-aoyama-three-20261027",
    "checkedAt": "2026-10-30T13:28:58+00:00"
  },
  "collection-control/issue-sources/47.json": {
    "status": "registered: issue-47-dot-yukimura-two-20261027",
    "checkedAt": "2026-10-30T13:06:52+00:00"
  },
  "collection-control/issue-sources/48.json": {
    "status": "registered: issue-48-dot-toriyama-three-20261027",
    "checkedAt": "2026-10-28T03:37:52+00:00"
  },
  "collection-control/issue-sources/49.json": {
    "status": "registered: issue-49-dot-hara-souten-20261027",
    "checkedAt": "2026-10-31T10:35:53+00:00"
  },
  "collection-control/issue-sources/50.json": {
    "status": "registered: issue-50-dot-endo-tista-20261027",
    "checkedAt": "2026-10-30T06:29:21+00:00"
  },
  "collection-control/issue-sources/51.json": {
    "status": "registered: issue-51-dot-araki-rohan-20261027",
    "checkedAt": "2026-10-27T10:05:12+00:00"
  },
  "collection-control/issue-sources/56.json": {
    "status": "registered: issue-56-dot-urushibara-two-20261028",
    "checkedAt": "2026-10-31T09:39:02+00:00"
  },
  "collection-control/issue-sources/57.json": {
    "status": "registered: issue-57-dot-oshima-two-20261028",
    "checkedAt": "2026-10-31T09:39:04+00:00"
  },
  "collection-control/issue-sources/58.json": {
    "status": "registered: issue-58-dot-takeuchi-two-20261028",
    "checkedAt": "2026-10-31T07:53:01+00:00"
  },
  "collection-control/issue-sources/59.json": {
    "status": "registered: issue-59-dot-kubo-two-20261028",
    "checkedAt": "2026-10-28T01:33:17+00:00"
  },
  "collection-control/issue-sources/60.json": {
    "status": "registered: issue-60-dot-ichikawa-houseki-20261028",
    "checkedAt": "2026-10-28T06:28:19+00:00"
  },
  "collection-control/issue-sources/61.json": {
    "status": "registered: issue-61-dot-gotouge-kimetsu-20261028",
    "checkedAt": "2026-10-31T08:21:15+00:00"
  },
  "collection-control/issue-sources/62.json": {
    "status": "registered: issue-62-dot-akutami-jujutsu-20261028",
    "checkedAt": "2026-10-31T05:21:32+00:00"
  },
  "collection-control/issue-sources/64.json": {
    "status": "registered: issue-64-dot-oda-onepiece-20261029",
    "checkedAt": "2026-10-28T22:20:22+00:00"
  },
  "collection-control/issue-sources/65.json": {
    "status": "registered: issue-65-dot-inoue-three-20261029",
    "checkedAt": "2026-10-29T00:09:25+00:00"
  },
  "collection-control/issue-sources/66.json": {
    "status": "registered: issue-66-dot-togashi-two-20261029",
    "checkedAt": "2026-10-31T08:48:19+00:00"
  },
  "collection-control/issue-sources/67.json": {
    "status": "registered: issue-67-dot-mizuki-two-20261029",
    "checkedAt": "2026-10-31T07:12:22+00:00"
  },
  "collection-control/issue-sources/68.json": {
    "status": "registered: issue-68-dot-fujikoa-two-20261029",
    "checkedAt": "2026-10-31T12:11:15+00:00"
  },
  "collection-control/issue-sources/69.json": {
    "status": "registered: issue-69-dot-ishinomori-three-20261029",
    "checkedAt": "2026-10-31T07:12:31+00:00"
  },
  "collection-control/issue-sources/70.json": {
    "status": "registered: issue-70-dot-fujikof-doraemon-20261029",
    "checkedAt": "2026-10-29T07:33:33+00:00"
  },
  "collection-control/issue-sources/71.json": {
    "status": "registered: issue-71-dot-tezuka-hinotori-com-20261029",
    "checkedAt": "2026-10-31T05:36:25+00:00"
  },
  "collection-control/issue-sources/73.json": {
    "status": "registered: issue-73-dot-murata-onepunch-20261030",
    "checkedAt": "2026-10-29T22:21:36+00:00"
  }
}
```

個別処理・根拠・代表Graph経路は[結果一覧](../../results/)を参照。収集候補／正式受入済み未公開／公開済みを混同しない。

## 不具合復旧

旧blockedは変更しない失敗履歴。下記の新規依頼の状態を現在の復旧進捗として確認する。

- [issue-25-utc-recovery-01](../../results/issue-25-utc-recovery-01/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-03）
- [issue-25-utc-recovery-02](../../results/issue-25-utc-recovery-02/README.md): waiting-control（旧 issue-25-manga23-20261019-repair1-batch-01）
- [issue-25-utc-recovery-03](../../results/issue-25-utc-recovery-03/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-04）
- [issue-25-utc-recovery-04](../../results/issue-25-utc-recovery-04/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-05）
- [issue-25-utc-recovery-05](../../results/issue-25-utc-recovery-05/README.md): waiting-control（旧 issue-25-manga23-20261019-repair1-batch-06）
- [issue-25-utc-recovery-06](../../results/issue-25-utc-recovery-06/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-07）
- [issue-25-utc-recovery-07](../../results/issue-25-utc-recovery-07/README.md): waiting-control（旧 issue-25-manga23-20261019-repair1-batch-08）
- [issue-25-utc-recovery-08](../../results/issue-25-utc-recovery-08/README.md): waiting-control（旧 issue-25-manga23-20261019-repair1-batch-09）
- [issue-25-utc-recovery-09](../../results/issue-25-utc-recovery-09/README.md): completed（旧 issue-25-manga23-20261019-repair1-batch-10）
