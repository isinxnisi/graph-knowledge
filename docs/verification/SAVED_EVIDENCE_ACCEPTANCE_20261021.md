# 保存原文からの正式受入：1 Claim受入完了

2026-10-21、Issue #34。**小畑健→漫画『ヒカルの碁』の承認済み1 Claimを既存acceptance coreで実受入し、次回releaseのvalidateと実本番backupに対するoffline planまで成功した。公開apply／restoreは未実施。** [仕様](../design/SAVED_EVIDENCE_ACCEPTANCE.md)、[検証JSON](../../datasets/manga-collection/evidence-acceptance-validation-20261021/verification.json)、[実行検証JSON](../../datasets/manga-collection/evidence-acceptance-validation-20261021/actual-execution.json)。[e64a2deの停止記録](OBATA_HIKARU_ACCEPTANCE_PREFLIGHT_20261021.md)の未実施状態を今回更新した。

## 実受入とreceipt

追加は0 Entity／1 Claim／1 Source／1 Citation。既存runtimeの正式receiptは9→10件。保存日時は2026-10-21 02:52:45 JST（原記録`2026-10-20T17:52:45.754800+00:00`）。

- 正式保存先：`/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime/datasets/manga-collection/accepted-issue-34-obata-drawing-20261021/acceptance.json`。
- receipt SHA-256：`7f62ec0f27d4fedfbb09066893d4ac94d88eaf016c2fff3959a001ea9f228efe`。
- [receiptの同一byte監査コピー](../../datasets/manga-collection/evidence-acceptance-validation-20261021/execution/receipt/acceptance.json)。
- 全10 receipt集合SHA-256：`8a55413ee9fedf32fd64ce6fddebd28d1d636ff7de0fcc1fd063a5b15524d56d`。
- [今回の固定decision](../../datasets/manga-collection/evidence-acceptance-validation-20261021/execution/decision.json) SHA-256：`72fd7dc968cdc2bd2f265382e270cb300f6188c51d180f5c6c3daaae5775b99d`。

人間判断は、[既存意味承認](https://github.com/isinxnisi/graph-knowledge/issues/34#issuecomment-6292911753)と、本タスクの直接指示（turn `01a159e6-415b-7883-a57a-e8e8ff43e5b7`、2026-10-20T15:20:24Z受信）に基づく。[元指示の記録](../../datasets/manga-collection/evidence-acceptance-validation-20261021/execution-authorization.json)に本文・hash・受信時刻を残した。AIが新たな意味判断を追加したものではない。Python 3.10で解釈できる同一瞬間の`+00:00`表記をdecisionに使用し、元の承認本文／時刻は変更していない。

## 固定UUID・意味・根拠

既存小畑健`d5e39491-5a5f-423c-9222-2eb3c18db9a8`→既存漫画ヒカルの碁`0c29d0e2-685f-4c56-9805-6bf1baf40e7c`。CONTRIBUTED_TO／affirmed／DRAWING／scope=null／期間from,to=nullを保持した。

| 種類 | 維持したUUID | 維持したrecordSha256 |
| --- | --- | --- |
| Claim | `7ae1c51b-9ba0-46fb-a070-41ac310e8c94` | `56bfc8a80c5c5feb22568d6699b327f4e0a9589430bfb067a914fedb56a9f6a5` |
| Source | `932fb74b-9292-4fb9-9f8a-29ce35d83823` | `0c118862f33fb5c754cc26597aa3afed6ee29ea6bfbddd2afa6da78d194a1018` |
| Citation | `995e3891-aa9c-4af6-a2ba-3114dfb61fec` | `172212acdde04d1a5691873f02f6e497124337de4e119a1a36b667a686061ebe` |

受入本文`accepted-records.json`はe64a2deの固定レコードと全field一致し、上記canonical hashを保持する。元候補のhiddenは受入本文で保持し、release候補内だけ既存workflowの規約に従ってpublishedとして準備する。本番DBには適用していない。既存Entity・Claim・Source・Citationの全fieldは不変。

bindingのbyte hashは`9e4e9cd91059d81060e75658c33f576befe416ffdc8eca09839bc4c605c2159f`。保存HTMLは1,487 byte、SHA-256 `86cfb31314e9e3fe2bf26e04425580c2dc3d5660cbd3b522e32e8be1d533af1b`。「作画の小畑健氏」／ja、原HTML25行・byte[1024,1074)とad79a57レビューを新入口で照合。新しい外部資料取得は0回。原HTMLはGit外の0600領域、原文directoryは0700に保全する。

## 現行本番との比較とrelease

#33が実VPSから取得した完全backupを独立コピーしてSHA検証した。保存日時は2026-10-20T17:28:02.379Z、SHA-256 `750850776e2824b7e1eb20a3fc73db56e41dc188f71cfba214290741dd7071ab`。Git外pathは`/home/isinxnisi/1.projects/7.graph-knowledge/backups/issue34-production-20261021/public-backup.json`。既存validatePublicBackupでchecksum・schema・graph・identity／receipt／撤回履歴を検証し、対応する公開release artifactと全レコードが一致した。

本番baseは`manga-issue-25-utc-recovery-08-normal`、revision `88437056-b74f-42ab-88c0-33ed435bdccc`。受入前・保存前・plan前後のHTTPS `/api/dataset`でも同revisionを照合した。旧ローカル3200や公開前backupを本番として使用していない。

| 状態 | Entity | Claim | Source | Citation |
| --- | ---: | ---: | ---: | ---: |
| 現行本番backup | 2175 | 1894 | 1794 | 1931 |
| 既公開の正式受入集合 | 66 | 50 | 43 | 51 |
| 正式受入済み未公開 | 0 | 1 | 1 | 1 |
| 次回release候補 | 2175 | 1895 | 1795 | 1932 |

次回releaseは**`manga-issue-34-obata-drawing-001`**、既存runtimeの`datasets/public-kg/releases/manga-issue-34-obata-drawing-001`に保存した。

- data SHA-256：`bab5fd783adf0cdb622cc6c11441bce35bb7213074d489bc7f3e2989a5ca435b`。
- manifest SHA-256：`cb0df37a0f1c7669c5d21c4c51d65fabbc0c1eb811cf136e98de1f86533cdc60`。
- validate成功。実backupに対するoffline planはClaim／Source／Citationの3 node、関係4件を追加、既存更新0。
- **最新VPS実DBのplanは未実施**。観測ラベルはsupplied-backup-not-a-live-check、planはvalidated-production-backup-offlineのまま区別した。

[release manifest](../../datasets/manga-collection/evidence-acceptance-validation-20261021/execution/release/manifest.json)、[data.jsonの同一byte gzip](../../datasets/manga-collection/evidence-acceptance-validation-20261021/execution/release/data.json.gz)、[全監査コピーとhashのindex](../../datasets/manga-collection/evidence-acceptance-validation-20261021/execution/artifact-index.json)。正本は既存runtimeに保持し、監査コピーでは元path／参照hashを書き換えていない。原HTML・完全backupはGitへ含めない。gzipは展開後の元byte hashも照合した。

## 不整合の解消と検証

保存原文＋人間判断＋固定レコードをsaved-evidence-v1として受け入れる最小入口を追加した。manga-discovery-v2 job／work-orderを偽装せず、既存selection・merge・重複／依存・事前validate・不変receipt／release・失敗再開を再利用する。従来accept-releaseのlive DB要件は維持した。

実本番backupではobject key順がrelease schema順と異なり、初回の事前validateがhash不一致で停止した。この時点でreceiptは未作成。validatorや期待hashは緩和せず、既存fixtureV4Schemaで出力順だけを揃え、再parseした全field／値が元fixtureと一致することを必須にした。修正を`448ad397ed20a9f03c929bd5957569df32ebeed5`へ固定・pushし、新しいr2 review／decisionで再照合して上記実受入を完了した。初回review／decisionもruntimeに保全した。出力先の既存資料との重複、UTC表記、scheduled Workerの一時ロック競合も、受入前に停止・修正／終了待ちしており、ロック削除や強制終了は行っていない。

**関連62テスト成功**：新入口11（修正後に全件再実行）、既存acceptance16（修正後に全件再実行）、既存workflow16・sequence19。draft、原文／UUID／意味／Source／scopeの改変、program drift、revision変更、pause、実flock競合、別receipt所有、比較外receiptを拒否し、receipt保存後の再開でも同じ受入を保持する。隔離試験は実TypeScript validator／offline planを使用し、live metadataと共通hold検査のみを試験用に置換した。実行codeとnative検証コピーの全byte一致も確認した。

実受入後、既存Inventoryの全10 receiptの根拠・hash・不変manifest検証はissues=0。全receiptを使うaccepted_additionsでも、現行本番からの追加が0／1／1／1のみであることを確認。全既存公開レコードの全fieldと元9 receiptのhashが不変だった。#33の固定済み既存棚卸しでも既公開50 Claim・未公開1 Claimを独立確認済み。

## Worker保全と残条件

検証済みmainのcode／validatorと、既存Worker runtimeのデータ／receipt保存先を分離して実行した。共通hold・実worker.lock・受入root lock・pause／activeAttemptを検査した。Worker固定code `973c7b0c599f79905a029b28b524f4924e169376`、config、時間帯、10分休憩、既存requestは変更していない。stateの通常scheduled tickによるreportedAt更新は観測したが、手動CLIからstateは書き込まず、control revision=2・windows・pause・lastAttempt・次回開始値を維持した。

今回の正式受入と次回release準備に残条件はない。公開する場合は、#33側で10 receipt／未公開1 Claimとして最新状態を再同期し、別の公開承認と最新VPS実preflight／planが必要。旧9 receipt／未公開0の観測や過去のplanは再利用しない。公開apply／restore、本番設定・会員DB・検索UIの変更は本件で行っていない。Webの変更はなく、3200／beta／VPSのWeb再build・再配置は行っていない。
