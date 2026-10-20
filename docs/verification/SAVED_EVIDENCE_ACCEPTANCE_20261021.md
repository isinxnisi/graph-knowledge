# 保存原文からの受入経路：実装・実行記録

2026-10-21、Issue #34。[e64a2deの停止記録](OBATA_HIKARU_ACCEPTANCE_PREFLIGHT_20261021.md)に対する、受入経路の修正と実行準備。[仕様と操作](../design/SAVED_EVIDENCE_ACCEPTANCE.md)、[検証JSON](../../datasets/manga-collection/evidence-acceptance-validation-20261021/verification.json)。

## 解消した不整合

`evidence-review`／`accept-evidence`を追加し、保存原文と人間が承認した固定レコードを既存acceptance coreへ接続した。manga-discovery-v2のjobやwork-orderを作らず、saved-evidence-v1として原文／引用・意味・UUID・本文hashを検証する。既存のselection・merge・重複・事前validate・不変receipt／release・失敗再開を再利用し、従来accept-releaseのlive DB検査は維持する。

本番backupモードは既存validatePublicBackupと対応release artifactで完全backupを検証し、HTTPSの現行revisionを保存前とplan前後で照合する。backupの観測ラベルをliveへ変更しない。planは既存publication-backup-plan.tsによるoffline比較で、最新VPS実planとは区別する。

実行プログラム／validatorとデータrootを分離し、検証済みcheckoutのコードで既存Worker runtimeの同じreceipt保存先を使用する。worker.lock・受入root lock・手動共通hold・pause／activeAttemptを確認する。稼働Workerの固定コード973c7b0、config・state・schedule・既存receiptの移行は不要で、今回は変更していない。

## 固定入力の再照合

実際のe64a2de候補・ad79a57レビュー・Git外原HTMLを新入口の原文検証関数へ渡し、全field・hash・引用位置・既存Entity依存が一致した。これは入力照合であり、供給fixtureを本番backupへ偽装した実受入ではない。

| 種類 | 維持するUUID | 維持するrecordSha256 |
| --- | --- | --- |
| Claim | `7ae1c51b-9ba0-46fb-a070-41ac310e8c94` | `56bfc8a80c5c5feb22568d6699b327f4e0a9589430bfb067a914fedb56a9f6a5` |
| Source | `932fb74b-9292-4fb9-9f8a-29ce35d83823` | `0c118862f33fb5c754cc26597aa3afed6ee29ea6bfbddd2afa6da78d194a1018` |
| Citation | `995e3891-aa9c-4af6-a2ba-3114dfb61fec` | `172212acdde04d1a5691873f02f6e497124337de4e119a1a36b667a686061ebe` |

bindingのbyte hashは`9e4e9cd91059d81060e75658c33f576befe416ffdc8eca09839bc4c605c2159f`、元HTMLは`86cfb31314e9e3fe2bf26e04425580c2dc3d5660cbd3b522e32e8be1d533af1b`。DRAWING／scope=null／期間不明を保持する。原語は「作画の小畑健氏」／ja、25行・byte[1024,1074)。Source／Citationを含む凍結JSONは変更していない。稼働runtimeの元9 receiptも全hash一致を再確認した。

## 隔離検証

合計**61テスト成功**：新入口10、既存acceptance16、既存workflow16、既存sequence19。新入口はprivateなdata-rootを使用し、TypeScriptの実validator・backup validator・offline plan・既存receipt保存を実行した。live metadataと共通hold tokenの検査だけを隔離試験用に置換し、実DB・本番KGへは書いていない。

- 人間判断のないdraft、原文・UUID・Role・scope・period・原語の改変、再hashした別Source／刊行物scope、review後のプログラム変更を拒否。
- 本番revision変更、改変backup、Worker pause、実flock競合、別receiptのUUID所有、比較外の追加receiptを拒否。
- 既存coreで1 Claim／1 Source／1 Citationを隔離受入し、validate・既存更新0のoffline plan、既存Inventory互換の元レコード検証を確認。
- receipt保存後のrevision変化では受入を保持し、同一decisionで元receipt／recordedAt／releaseを変えず再開。正常再実行でもplanを新しく実行。

Windows checkoutのCRLFで凍結入力hashが変わる問題を、Gitの元LF byteを持つWSLローカルの検証コピーで回避した。hashの期待値やvalidatorは緩和していない。実装・試験4ファイルのbyte一致を検証JSONへ記録した。

## main統合とruntime準備

独立worktreeの固定実装`cc591c41632b290d3e69b9ed5e53dd129e0650d3`を、#33の更新を含むmain `02b79bb1d7262ae42a9bc2fb111cd10898cd9034`へ直列統合し、通常pushした。統合後の実装・試験byte hashは検証コピーと一致し、e64a2deの固定JSON 5ファイルも全byte一致。ユーザーの既存memo.txtは保持した。

共通holdとworker.lockの下で、既存runtimeへ固定JSON 5ファイル・ad79a57レビューJSON・Git外HTMLの計7ファイルを同じ相対path／同一byteで配置した。異なる既存ファイルがある場合は上書きしない手順で、全件新規配置だった。新規filesは0600、原文directoryは0700。配置前後でconfig・state・元9 receiptはhash一致、正式受入は増えていない。

## 実受入の状態と不足する操作

現時点では**正式受入0件、receipt未作成、次回release未作成、最新VPS実plan未実施**。現行本番release `manga-issue-25-utc-recovery-08-normal`／revision `88437056-b74f-42ab-88c0-33ed435bdccc`の検証済み完全backupが未受領のため、accept-evidenceはまだ実行していない。

既存SSHユーザーdevelopにはDocker操作権限がなく、sudoには運営者の端末での認証が必要。#33と連携し、導入全体とは切り離した[既存opsによるbackup単体の手順](https://github.com/isinxnisi/graph-knowledge/issues/33#issuecomment-6294978106)を用意した。新ユーザー・鍵・sudoers・image導入は不要で、公開KGのread-only backupと0600の受領用コピーだけを生成する。表示されたpath／SHA-256を使い、WSLへ受領・検証してから本件の固定decisionと既存受入処理を実行する。

本番backupが整うまで、旧ローカルDB、API表示、追加後fixtureからの合成backupで代用しない。受領後は同じ固定レコードからreceipt→次回release→validate→offline planへ進み、#33へreceipt集合と未公開1件の状態を共有する。最新VPS実planと公開applyは別工程で、今回はapply／restoreを行わない。

Python CLIだけの変更で、Web／検索UI・会員DB・公開KG・稼働Worker設定は不変。3200／beta／VPSのWeb再build・再配置は不要。
