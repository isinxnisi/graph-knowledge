# 保存原文・人間判断・固定レコードからの正式受入

2026-10-21、Issue #34。取得済みの原文証跡と明示的な意味承認から作成した固定レコードを、既存`collection-acceptance.py`へ接続する。manga-discovery-v2のjob・work-order・収集承認を作らず、`saved-evidence-v1`という別のreview種別を使用する。初版は新規Entityを含まない1 Claim・1 Source・1 Citationに限定する。公開apply／restore・収集・Workerの固定コード更新は含まない。

## 既存処理との接続

`evidence-review`は固定binding・承認本文・proposed records・既存Entity依存・保存原文のhashと引用byte／行を照合し、pending-human-review-onlyのreview bundleと未承認decisionを作る。原文取得時のレビューJSONもhashで固定し、Source URL／HTTP status／取得時刻、人物・作品・Predicate・Role・scope・period、引用原語をレコードと比較する。HTMLは実行しない。元のUUID・日時・注記を再生成しない。

`accept-evidence`は人間が明示承認したdecisionの全UUID／recordSha256／scope／全参照hashを既存coreで検証し、selection・merge・重複／閉じた依存・事前validate・不変receipt／manifest・release作成・validate・planを再利用する。別receiptに所有されたUUID、比較後に増えたreceipt、未承認・保留・改変は拒否する。receiptのsourceJobIdはnull、sourceReviewKindはsaved-evidence-v1。架空の収集履歴を作らない。

原HTMLはGit外に保持する。review bundleにrawの相対path・SHA-256を固定し、受入直前の再照合にも使用する。receiptの参照にはreview JSON・固定レコード・原語とbody hashを残し、HTML全文をGitへ追加しない。

既存`accept-release`のTask1形式・live DB観測／plan要件は維持する。新しいbackupモードを指定できるのは`accept-evidence`だけ。

## プログラムとデータroot

実行コードとNode validatorは、検証・commitしたcheckoutから読み込む。`--data-root`は既存Worker runtimeのデータ／receipt保存先にだけ適用する。data-root内のPython／TypeScriptは実行・importしない。使用した主要program／schemaのhashをreviewとreceiptへ固定する。

稼働Workerのstate・config・固定コード・時間帯・休憩・既存receiptを移行しない。手動の`accept-evidence`は、同じruntimeのworker.lock・受入rootの既存lockを取得し、既存の手動共通hold token、Worker identity、pause／activeAttempt／control errorを検査する。競合時は強制解除せず停止する。公開区間のpauseを解除して実行してはいけない。#33の公開操作が進行中／結果不明なら、その協調手順で閉鎖が確認できるまで受入しない。

これは運営者が明示実行する手動CLIであり、Workerの定期キュー・schedule・stateは書き換えない。新しいWorker requestや常駐serviceを追加しない。将来Workerへ同じ入口を組み込む場合は、固定コード更新を別にレビューする。

## 本番backupモード

`--production-backup`は実際に本番から取得・安全に受領した完全backup、`--backup-sha`はその固定byte hash。既存validatePublicBackupでchecksum・schema・graphDigest・receipt／identity／withdrawal履歴を検証し、既存data-rootの対応release artifactとも一致させる。fixtureやAPI表示からbackupを合成しない。

HTTPSの本番`/api/dataset`を読み取り、backupのrevisionと一致することを受入前・保存直前・plan前後で確認する。redirectは追わない。backupの全byte hash、release／revision、元データ／参照集合の変化も停止条件とする。

観測ラベルは**supplied-backup-not-a-live-check**のまま保持する。比較は既存publication-backup-plan.tsで、検証済みbackupに対するoffline planとして実行する。最新VPS実DB planを実行したとは表示しない。公開直前には、#33の手順で最新の実preflightと別の公開承認が必要。

## 操作

共通holdを保持し、Node24と依存を使えるWSLで実行する。mainの凍結JSONとGit外原文は、同じ相対path・同一byteで既存runtimeへ配置する。既存pathに異なる内容があれば上書きせず停止する。新しいprivate原文directoryは0700／files0600にする。

```bash
python3 scripts/collection-workflow.py evidence-review \
  --data-root /home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime \
  --production-backup /安全に受領した本番backup.json --backup-sha 固定SHA256 \
  --public-origin https://plunode.net \
  --binding datasets/manga-collection/issue-34-obata-drawing-20261021/authorization-binding.json \
  --binding-sha 9e4e9cd91059d81060e75658c33f576befe416ffdc8eca09839bc4c605c2159f \
  --raw-evidence .local/collection-trials/issue-34-nihonkiin-pc-20261020/response.html \
  --output /同じruntime内の新規review-directory \
  --decision-output /同じruntime内の新規decision.json \
  --decision-id issue-34-obata-drawing-20261021 --release manga-issue-34-obata-drawing-001
```

生成decisionはdraftで、生成だけでは受入を許可しない。既存の人間指示が許可したUUID・全内容hash・意味・根拠と一致することを確認し、その実際の指示をhumanDecisionへ記録したapprovedファイルを固定する。過去承認の本文・時刻は書き換えない。

```bash
python3 scripts/collection-workflow.py accept-evidence \
  --data-root /home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime \
  --production-backup /安全に受領した本番backup.json --backup-sha 固定SHA256 \
  --public-origin https://plunode.net \
  --decision /上で固定したdecision.json --decision-sha 完全なdecisionのSHA256 \
  --worker-home /home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020 \
  --manual-lock-token 現在保持中のTOKEN
```

同じdecisionとhashで再開する。receipt保存後にplanや通信が失敗しても受入を巻き戻さない。元receipt／recordedAt／選択本文／releaseを保持して準備だけ再開する。offline planも成功済み結果を再利用せず毎回実行する。全正式receiptと旧成果を省略した別rootで実行しない。
