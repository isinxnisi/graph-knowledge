# 公開・受入の協調導入と運営者手順

Issue #33。**本番導入前の候補**。以下は運営者の別承認後に行う操作であり、今回実行していない。`deploymentEnabled:false`を維持。[方式・障害表](../design/PUBLICATION_COORDINATION.md)、[既存root/SSH/鍵/image導入手順](PUBLICATION_GATE_INSTALLATION.md)と併読する。既存Workerへの停止・切替・設定変更は不要。

## 運営者が先に確定する権限

- VPSのroot bundleにexecutor/policy/cycle/verify-publicationと新しいpublication-exclusion.py/publication-sign.pyを同じ検証済みcommitで配置。wrapperはこれらのroot所有・非group-write・非symlinkを検査する。root entryの許可は `arm/preflight/execute/status/notify/close/cancel/finish UUID` だけ。
- 既存手順の専用実行主体・forced-command・root-owned authorized_keys・NOSETENV限定sudo・upload別経路・host-key pinを準備。Docker group、一般shell、任意image/引数/資格情報を許可しない。`visudo -cf`、`sshd -t`、`sudo -l -U plunode-publish`を運営者が確認し、別接続を確保して実sshdの拒否試験を行う。sshd反映やsudo実行は今回対象外。
- VPSに**閉鎖証明専用Ed25519鍵**を追加。`trusted/exclusion-private.pem` root:root 0600、`trusted/exclusion.pem` root:root 0644、親0700。公開鍵SHA256を別経路でWSLにpin。approver/attester/SSH/audit鍵と共用しない。鍵はGit/Issue/upload/ログに置かない。
- root configに `freezePolicy:"durable-pause-new-v1"`、固定 `workerId`、レビュー済み40桁 `workerCodeCommit`、`exclusionKeySha256` を設定。既存approver/attester pin、image ID、公開KG専用資格情報、専用network、loopback APIも確認。現image候補は前段の `sha256:af1216c98ef75ad0fdba1424d854fc26802af066f684c77af79f9bf6f6cf880f`。今回再build/配布していない。
- WSL側はpublication-attest/coordinationと既存Worker/parser/workflow/inventory/acceptance等の依存Pythonを含む**元repo layout全体**を検証済み固定版・root所有・書換不可で配置。稼働runtimeのコードを実行/importしない。専用主体が既存worker.lock/common lockとreceiptを読める権限を設計し、広域root/sudoや会員DB資格情報を渡さない。現Workerのlock所有UIDと整合する必要があり、別UIDへ安易に移さない。
- coordinator専用directoryは同主体所有0700、config0600。Workerのcontrol.git/state.jsonを書く権限をcoordinatorへ増やさず、独立cacheを使う。attester秘密鍵は0600で専用主体だけが読める。暗号化保管/rotationは別審査。approver秘密鍵を常設自動主体へ置かない。
- GitHubの制御branchは履歴書換/削除を禁止し、operational control投稿権限を限定する。公開中の手動resume・別home Worker・受入CLI直実行は禁止という運用権限契約を確認。既存の自動収集承認と公開承認を混ぜない。
- `exclusion.json`/reservations/jobs/frozenとWSL coordinator journalを永続ディスクへ保存。OS crashでvolatile cacheへ戻らないこと、fsyncとバックアップ・世代巻戻し防止を運営者が確認。これらを削除して再試行しない。

WSL configの配置候補（placeholderは実機のread-only確認から確定する。これはlive設定ではない）：

```json
{
  "workerHome": "/home/WORKER/.local/share/FIXED_EXISTING_WORKER",
  "journalDir": "/home/WORKER/.local/share/plunode-publication-coordination",
  "commonLock": "/home/WORKER/.local/share/graph-autopilot/autopilot.lock",
  "remote": "https://github.com/isinxnisi/graph-knowledge.git",
  "branch": "FIXED_EXISTING_CONTROL_BRANCH",
  "workerId": "FIXED_EXISTING_WORKER_ID",
  "codeCommit": "FIXED_REVIEWED_40_HEX_WORKER_SHA",
  "serverKey": "/etc/plunode-publication/exclusion.pem",
  "serverKeySha256": "PINNED_64_HEX_PUBLIC_KEY_SHA256"
}
```

`workerHome/runtime`とpeerの`--runtime`は同一でなければ拒否する。serverKeyはroot-owned非書換で別経路pin、configのremote/branch/ID/codeCommitは実Worker configとの一致を検証する。設定変更・別UID・複数Workerを導入する場合はこの単一Writer前提を再審査する。

## 一回の公開（導入承認後だけ）

以下の `fixed-client` はhost/key/known_hostsが固定された既存設計のSSH client候補。`SCRIPTS`/`CONFIG`/`RUNTIME`/`CANDIDATE`/`ATTESTER_KEY`は運営者が検証した固定パスとする。コマンドを手動実行する前に差分と状態を確認する。現行50 Claim/未公開0件を再公開しない。

1. 正式receiptと現行VPS backup/revisionから既存CLIで候補作成・検証。UUID nonceでcandidateをuploadし、`fixed-client arm UUID` のresult objectを `ticket.json` に保存する（外側result envelopeを除く）。
2. 人間の運用判断を `human-decision.json` に記録する。既存形式actorType/reviewer/decidedAt/statementで、対象nonceのpause-newと**閉鎖証明後だけのresume**を認めるもの。公開承認の代用ではない。AIが人間の署名や判断を生成しない。
3. `python3 "$SCRIPTS/publication-coordination.py" --config "$CONFIG" --document ticket.json --human-decision human-decision.json pause`。通常Worker tickが反映するまで待つ。ロック使用中/ACK未反映なら後で同操作を再試行し、Worker設定・タスク・stateを変更しない。
4. `python3 "$SCRIPTS/publication-attest.py" --coordination-config "$CONFIG" --runtime "$RUNTIME" --candidate "$CANDIDATE" --key "$ATTESTER_KEY" --client "$FIXED_CLIENT" preflight UUID`。実ACK・両lock・全receiptを証明できなければ停止。成功後、statusからlive requestを取得する。
5. 従来どおり運営者が固定requestをレビューし、別approver鍵でpublication-sign.pyを明示実行してapproval.jsonだけuploadする。人間の承認待ち中はlockを保持しない。pauseは残す。
6. 同じpeer引数で `execute UUID`。公開承認・最新receipt・VPS base/revision/planを再検証する。応答不明ならstatusと同nonce executeによる**verify-only復旧**。別nonce/再apply/自動restoreを行わない。
7. completed確認後 `fixed-client close UUID` のresultを `closure.json` に保存。PC不在でもcloseは可能だが、resumeはPC復旧後。未予約で取り消す場合は同peer引数の `cancel UUID` を使う。予約済み/結果不明の場合はcancel不可、pauseを維持して人間へ戻す。
8. `python3 "$SCRIPTS/publication-coordination.py" --config "$CONFIG" --document closure.json --human-decision human-decision.json resume`。署名・自分のpause・次revisionのCASが一致する場合だけ投稿する。
9. 同peer引数で `finish UUID`。Gitへ保存済みの正しいresumeを署名証明し、VPSのactive枠を解放する。Workerの通常tickと時間帯/休憩に従って再開する。finish前のPC断は同じresume→finishを再試行する。notify失敗だけなら `fixed-client notify UUID`。

## 本番有効化の残ゲート

今回実装したのは隔離環境の論理プロトコルとCLIである。実VPS/Windows/WSLをまたぐ権限設定・秘密鍵保管・host identity・永続ディスク/実再起動・通信遮断・Docker残存処理の確認、root bundle全体の独立security review、運営者による公開判断が残る。`deploymentEnabled:true`への変更はその後の別承認とする。

実環境試験では、未公開データを混ぜない専用隔離先でPC/WSL再起動と通信断を再現し、再起動後のWorkerがGit同期失敗時/paused時に受入を開始しないこと、旧VPS process再開をclose/cancelが拒否すること、closure→resume→finishの回復、root以外からjournalを書換えられないことを確認する。本番公開や既存Workerへの故障注入で代用しない。
