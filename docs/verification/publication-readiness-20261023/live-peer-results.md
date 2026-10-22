# 固定peer実往復の完了と監査停止（2026-10-23）

最終目標は運営者の固定公開承認後、Codex/VPSの手動操作なしで転送から結果記録まで完結すること。#33は未完了、本番有効化は未承認・未実行。

## 実機で完了した経路

運営者のroot更新成功を受領し、専用SFTPで更新receiptを独立受信。source0732af9、peer9b59669、新manifest68881f…、image367e9c…、本番false、既存frozen/jobs/config/予約不変が一致した。root保全先は `/root/plunode-publication-channel-update.giu2wg07`。

同じnonce `82da68d6-c3a1-4ff7-85d3-24ab2df1b16d` を保持し、root所有の固定WSL peerと実SSH・署名challengeを使い、最新10 receiptの照合→VPS image/validate/observe/実無書込planが成功した。live requestのplan SHAは **9985a539b6281f99a2f7c7d422b2aac214d143d5fc56411fbdfd51605697a392**。草稿のoffline hashで置き換えない。

候補は `manga-issue-34-obata-drawing-20261023`、artifact d83660…、追加1 Claim/1 Source/1 Citation、Entity0、既存更新0。base revision88437056…、10 receipt集合8a5541…は不変。公開署名は作成していない。

取消し→rootの署名付き閉鎖証明→shadow controlの条件付きresume→固定peer finishまで成功し、ticketはfinished。実Workerと同じ973c7b0のparser/tickを独立shadowで実行し、control revision2/pauseMode=nullを確認した。live Workerにpause/control/config/state/cache/schedulerの変更はない。公開APIもrevision88437056…を再確認した。

## 監査通知で停止した境界

rootは固定の `read-only-readiness-verified` outboxを保存した。しかし `readiness-audit` は `read-only-readiness-stopped` で停止。**監査専用PATの送信認証と重複抑制は未確認**。bootstrapのGET成功をPOST成功とみなさない。

DB公開処理の再実行・別nonce・試験DB再作成は行わない。固定script/hashを照合し、専用監査UIDでhome/credential availability、gh list/sendのexitとHTTP statusだけを出す診断入口をVPSへ転送した。PAT/環境値/レスポンス本文/stderrは出力しない。固定の「公開applyなし」監査通知だけは既承認範囲で送信し、成功時は2回目の重複抑制まで確認する。sudo認証は運営者に依頼済み。

一時readiness sudoは監査経路の診断のため残存。全ticketはfinishedで、本番configはfalse。通知成功後、既存cleanup入口で一時sudoだけを撤去し、outbox/journal/frozenは保全する。

## 承認後の接続コード（未配置）

`scripts/publication-delivery.py` は既存fixed client/attest/coordinatorを呼ぶ単発の接続入口。**既に署名された、root実planの固定requestだけ**を処理し、署名鍵・意味判断・有効化・cancel/restore・nonce再生成を持たない。status→署名approval転送→同nonce execute/verify-only→completed確認→close→自分のcontrolだけresume→finish→notifyを接続する。ローカル記録よりroot状態を優先し、操作前のdurable journalと専用lockで再開する。転送/通知/再試行待ちにWorker/common lockを保持しない。

実署名・実Git/CAS・既存gateとファイルによる仮想KGを使った7試験が成功：一巡、完了後再起動、apply応答喪失、commit後失敗のverify-only、close/finish応答喪失、通知のみ失敗、署名/request改変拒否、別運用control保全。Docker・実DB・本番鍵は使わず、完了済み専用DB試験は繰り返していない。

**この接続入口はまだVPS/WSLへ固定配置しておらず、運営者の承認入力からの自動起動・再起動後の再開起動設定も未導入**。この7試験を最終目標達成と報告しない。

## 次に必要なこと

1. 監査診断結果に基づく最小修正と実通知/重複抑制、一時sudo撤去。
2. 暗号化backup2 fileのPC/VPS外保管・phrase別保管の運営者確認（同PC cache受領済みだけでは未達）。
3. 既存署名CLIから接続入口を自動起動する固定手順と、停止後の同nonce再開起動を確定し、必要な固定WSL配置を一括反映・実連携確認する。approver秘密鍵を常時自動主体へ渡さない。
4. 全境界の結果と復旧手順をまとめ、本番有効化だけの個別承認を得る。その後も正式未公開1 Claimの実公開は別の固定release承認が必要。既公開50 Claimは再公開しない。

共有mainは別コミュニティ作業を終えたHEADc1e0a46、未追跡memo.txtのみになったが、そのfileを整理/削除しない。本記録・接続コードは独立worktreeで検証し通常pushする。今回の更新は画面・サービス配置ではなく、3200/beta/Webの再buildは行わない。
