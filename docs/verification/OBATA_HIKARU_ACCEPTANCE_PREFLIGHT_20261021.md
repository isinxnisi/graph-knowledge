# 小畑健→ヒカルの碁：正式受入前の整合性検証と停止記録

2026-10-21 JST。[Issue #34の正式受入承認](https://github.com/isinxnisi/graph-knowledge/issues/34#issuecomment-6292911753)に従い、ad79a57の原文証跡に対応する1命題を完全なレコードとUUID／hashへ固定した。**正式受入は0 Claim、receipt未作成、次回release未作成。既存Worker／受入workflowとの不整合を検出したため、依頼された停止条件に従って実受入前に停止した。** 意味の承認を取り消したり、受入済みと表示したりしていない。

## 保存した候補と承認の対応

対象は既存person小畑健 `d5e39491-5a5f-423c-9222-2eb3c18db9a8` → 既存workヒカルの碁 `0c29d0e2-685f-4c56-9805-6bf1baf40e7c`。`CONTRIBUTED_TO`／affirmed／DRAWING／scope=null／period from,to=nullに限定する。新規Entityは0件、Claimはhiddenのまま。

| 種類 | 固定した新UUID（未受入） | recordSha256 |
| --- | --- | --- |
| Claim | `7ae1c51b-9ba0-46fb-a070-41ac310e8c94` | `56bfc8a80c5c5feb22568d6699b327f4e0a9589430bfb067a914fedb56a9f6a5` |
| Source | `932fb74b-9292-4fb9-9f8a-29ce35d83823` | `0c118862f33fb5c754cc26597aa3afed6ee29ea6bfbddd2afa6da78d194a1018` |
| Citation | `995e3891-aa9c-4af6-a2ba-3114dfb61fec` | `172212acdde04d1a5691873f02f6e497124337de4e119a1a36b667a686061ebe` |

hashは既存`collection-themes.py`の`content_hash`と同じ、UTF-8・キー順正規化・空白なしのcanonical JSON SHA-256。レコードファイル全体のbyte SHA-256は`79ba556db26f0c48ce79c3ed1dda2e65dae1d0b72fd560a2a861131a496b72c0`。再開時もこのUUID／本文を維持し、別の命題へ承認を付け替えない。

- [proposed-records.json](../../datasets/manga-collection/issue-34-obata-drawing-20261021/proposed-records.json)：既存schemaの完全な1 Claim・1 Source・1 Citation。新規Entityなし、未受入。
- [approval-record.json](../../datasets/manga-collection/issue-34-obata-drawing-20261021/approval-record.json)：既存承認コメントの本文・URL・本文hash。新たな人間判断や判断日時を作らない。
- [authorization-binding.json](../../datasets/manga-collection/issue-34-obata-drawing-20261021/authorization-binding.json)：上記レコードの全hash、意味、既存Entity依存hash、ad79a57のレビューJSON hash、原文hash／locatorを束縛。**executableなWorker request／Task1判断ファイルではない**。
- [preflight.json](../../datasets/manga-collection/issue-34-obata-drawing-20261021/preflight.json)／[verification.json](../../datasets/manga-collection/issue-34-obata-drawing-20261021/verification.json)：停止理由、公開／ローカルの区別、receipt照合、schema・改変拒否の結果。

元HTMLはGit外保管先で1,487 byte／SHA-256 `86cfb31314e9e3fe2bf26e04425580c2dc3d5660cbd3b522e32e8be1d533af1b`と再照合した。原語「作画の小畑健氏」、元HTML25行、byte [1024,1074) の作品名・担当者の文脈が一致する。ad79a57の[レビューJSON](../../datasets/connectivity/issue-34-obata-evidence/review.json)はGit blobとbyte一致。新しい資料取得は0回。

Sourceは承認済み日本棋院URL1件だけ。Citationはsupport／`roleEvidence.originalText="作画の小畑健氏"`／jaとし、特定ISBN・全巻／全版・制作期間へ拡張しない。ページ表示日を`publishedAt`や関与期間へ補完せず、SourceのpublishedAtはnull。既存のほったゆみのORIGINAL_STORY、小畑のバクマン。AUTHORSHIPと、そのSource・Citationを変更しない。

## 本番基準と重複検査

| 比較対象 | 確認結果 |
| --- | --- |
| 正式な本番基準 | release `manga-issue-25-utc-recovery-08-normal`／revision `88437056-b74f-42ab-88c0-33ed435bdccc`。承認コメント・封印公開資材・保存公開台帳・固定fixtureを照合 |
| 本番API | `https://plunode.net/api/dataset`、HTTP 200、UTC `2026-10-20T15:07:06.026482+00:00`、上記revision一致。全件backupの取得ではない |
| ローカル3200 API | HTTP 200、UTC `2026-10-20T15:07:06.029043+00:00`、旧revision `82b01515-594c-48ca-b4b6-515eefac83ca`。旧base `20261014-credits-001`として区別 |
| 既存正式receipt | 稼働runtimeの**9件**を既存Inventoryで全参照hash・元レコード・scope・不変manifestまで検証。不整合0 |
| 既受入集合 | 66 Entity／50 Claim／43 Source／51 Citation。全件が本番基準fixtureと型・UUID・全field一致。公開済み50 Claimを未公開へ数え直さない |
| 今回の重複 | 本番・既受入集合とも小畑→ヒカルのClaim 0、同じSource URL 0、新UUID衝突0 |

確認した`backups/`には公開後の本番release／revisionに対応する完全なVPS backupがない。以前の`phase-c-vps-baseline-20261020.json`も公開前baseである。APIのrevision確認や追加後fixtureから、receipt・identity・撤回履歴込みのbackupを合成していない。

## 実受入を停止した理由

1. **入力形式が未対応。** 既存`collection-acceptance.py bundle()`はTask1の`review-manifest.json`、`verify_job()`はcandidate-readyのmanga-discovery-v2 work-order／収集承認を必須にする。今回の単回GETレビューを渡した読み取り検査はmanifestなしで拒否された。日本棋院GETを架空のmanga-discovery-v2収集ジョブにしたり、過去の収集承認へ付け替えたりしない。
2. **固定コードの更新レビューが必要。** 設置Workerは`973c7b0c599f79905a029b28b524f4924e169376`。稼働catalog-healthも`Installed code differs from source commit; reviewed worker upgrade required`と報告している。固定runtimeの受入関連コードが設置commitと一致することを確認した。mainの追加機能が自動的に稼働Workerへ入ったとは扱わない。
3. **実受入の観測先が旧base。** 既存accept-releaseは既定ローカルDBのfresh read-only backupを要求し、`same_public()`で承認base／revisionとの一致を要求する。現ローカルrevisionは本番と異なり、供給したoffline backupもlive観測へ昇格できない。旧baseで実行した結果を本番基準の成功へ読み替えない。

accept-release本体やWorker依頼は実行・投入していない。受入rootに手書きreceiptを作る、検査を差し替える、公開snapshotの観測ラベルを偽る、別の受入rootで既存receiptを隠す、といった回避はしていない。既存ロック・時間帯・10分休憩・state・実行コード・設定は保持した。

## 検証できた範囲と未実施

既存`validateFixture`で、本番基準fixture＋未受入1/1/1の閉じた依存をv4 schema検証した。2175 Entity／1895 Claim／1795 Source／1932 Citationの**schema検証用**fixtureであり、公開releaseではない。既存レコード全field不変、既存Entity依存hash一致、承認命題と新レコードの一致を確認。端点・Role・刊行物scope・期間・roleEvidence・UUID・原HTML byteの改変7例を拒否した。

**正式acceptance／receipt：未実施（0件）。次回release候補とそのpublic:validate：未実施。現在本番backupに対するoffline plan：未実施。本番VPSの最新実無書込plan：未実施。** schema検証をrelease validateや実planと表示しない。受入完了後にreleaseを準備するという今回の順序を維持した。

再開には、承認済み単回HTMLの1命題を偽の収集jobなしで取り込む受入契約と、公開済み50 Claim・全9 receiptを維持した現行本番baseへの比較経路の整備・検証が必要。稼働Workerへ反映する場合は固定コードのレビューと正常な移行を別作業で行う。今回の意味承認と凍結UUID／hashはそのまま再利用する。受入の実行経路が整うまでは新しい実行依頼を投入しない。

最初のhold取得時は共通ロックが使用中だったため変更せず、空きを再確認後にholdを取得した。独立worktreeで候補を保存し、main統合も同じhold内で実施。文書・未受入候補だけなので3200／beta／VPSの再build・再配置は不要。VPS・会員DB・検索UI・公開KG・旧成果は変更していない。
