# Issue25 日時形式不具合の復旧依頼

元の承認・失敗履歴・UUID・根拠・通算89/142試行を保持。同じ時刻のUTC Z表記だけを新しい入力へ固定する。正式受入・公開applyは行わない。

| 新依頼 | 元の停止依頼 | 作品 |
|---|---|---|
| [issue-25-utc-recovery-01](../../results/issue-25-utc-recovery-01/README.md) | [issue-25-manga23-20261019-repair1-batch-03](../../results/issue-25-manga23-20261019-repair1-batch-03/README.md) | 犬夜叉 |
| [issue-25-utc-recovery-02](../../results/issue-25-utc-recovery-02/README.md) | [issue-25-manga23-20261019-repair1-batch-01](../../results/issue-25-manga23-20261019-repair1-batch-01/README.md) | MONSTER / 20世紀少年 / YAWARA! |
| [issue-25-utc-recovery-03](../../results/issue-25-utc-recovery-03/README.md) | [issue-25-manga23-20261019-repair1-batch-04](../../results/issue-25-manga23-20261019-repair1-batch-04/README.md) | ミステリと言う勿れ |
| [issue-25-utc-recovery-04](../../results/issue-25-utc-recovery-04/README.md) | [issue-25-manga23-20261019-repair1-batch-05](../../results/issue-25-manga23-20261019-repair1-batch-05/README.md) | ダンジョン飯 |
| [issue-25-utc-recovery-05](../../results/issue-25-utc-recovery-05/README.md) | [issue-25-manga23-20261019-repair1-batch-06](../../results/issue-25-manga23-20261019-repair1-batch-06/README.md) | 黄泉のツガイ |
| [issue-25-utc-recovery-06](../../results/issue-25-utc-recovery-06/README.md) | [issue-25-manga23-20261019-repair1-batch-07](../../results/issue-25-manga23-20261019-repair1-batch-07/README.md) | 天使なんかじゃない / ご近所物語 / NANA |
| [issue-25-utc-recovery-07](../../results/issue-25-utc-recovery-07/README.md) | [issue-25-manga23-20261019-repair1-batch-08](../../results/issue-25-manga23-20261019-repair1-batch-08/README.md) | フルーツバスケット / 翼を持つ者 |
| [issue-25-utc-recovery-08](../../results/issue-25-utc-recovery-08/README.md) | [issue-25-manga23-20261019-repair1-batch-09](../../results/issue-25-manga23-20261019-repair1-batch-09/README.md) | タッチ / H2 / MIX |
| [issue-25-utc-recovery-09](../../results/issue-25-utc-recovery-09/README.md) | [issue-25-manga23-20261019-repair1-batch-10](../../results/issue-25-manga23-20261019-repair1-batch-10/README.md) | パーマン |

Workerは既存の毎分確認、JST 03–07/09–12/15–18、1件ずつ、ジョブ間10分で処理する。旧blockedは履歴として保持し、新依頼を現在の進捗として読む。0候補や資料・同一性保留を正常な知識取得と数えない。
