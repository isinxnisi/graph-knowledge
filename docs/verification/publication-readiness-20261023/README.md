# Issue #33 承認済み導入の再開（2026-10-23）

最終目標は、人が固定releaseの公開を承認した後、CodexやVPSでの手動公開操作なしで、転送・最新照合・単回apply・公開後検証・結果記録まで完結すること。固定版の導入成功だけでIssueを完了しない。

今回のチャットの「既定範囲の権限変更は運営者承認済み」と、Issueコメント6344746868の追認を受け、P33-READY-20261022の承認済み範囲を進めた。以前の曖昧な承認解釈を訂正したコメント6344637834は履歴として維持し、過去に遡って承認成立へ変更しない。本番有効化と実データapplyは、実施内容・影響を提示してそれぞれ個別承認を得る。

## 現在の工程と実測

- VPS/WSLの固定bundleとbootstrapの全SHAを再照合し一致。VPSのreadiness directoryとWSLの新固定snapshot/clientは未配置。VPSのsudo -nはパスワード要求で停止し、sudoを迂回しない。
- control branchは直前のprotection404とeffective rules空を再確認したうえで、承認済みの最小protectionを実設定した。enforce_admins/required_linear_history=true、allow_force_pushes/allow_deletions=false。required_status_checks/reviews/restrictionsはnull。APIで再読取し一致。通常WorkerのFF pushを制限する要件は追加していない。既存第三者ルール・main branchを変更していない。
- 復旧用の元応答・要求・作成後応答をローカルへ保全。必要な場合だけ、自分が作成した同一設定であることを確認して戻す。他者ルールを無条件削除しない。protection変更でcontrol branchのtree/historyを書き換えていない。
- live Worker config SHA d3411e24…、receipt10件/集合8a55413e…、control revision2/pauseMode=nullを維持。公開APIは200/revision88437056…のまま。正式未公開1 Claimと既公開50 Claimを保持し、本番apply0。
- shared mainは別のコミュニティ作業でdirty/共通lock保持中。触らず独立worktreeを使用し、hold取得・強制解除・停止はしていない。

## 運営者の一括作業

既定の権限設定を再承認してもらう段階ではない。VPS端末のsudo/PAT/暗号化phrase入力と、WSL端末のsudo/暗号化phrase入力を一括依頼した。固定bootstrapはP33-READY-20261022のものを変更していない。秘密値をchatへ要求せず、最後のJSONとroot-private保全先だけを受領する。

監査PATは選択repoのIssues読書き・期限付き。暗号化backupは復号一致後にもPC/VPS外保管が必要で、同一PC内のコピーだけでは達成としない。復号phraseは暗号化fileと別管理。sudo認証や秘密値をCodexへ渡すことは不要。

## 次の工程と完成条件

固定版導入結果を確認後、fresh backup→最新receiptと1 Claim差分→固定WSL peer/実SSH→read-only plan→閉鎖/条件付きshadow再開→監査認証/重複抑制→一時sudo撤去を進める。完了済みの専用DB apply/復旧試験は繰り返さない。

既存runbookはCLIを段階ごとに操作する手順であり、現在のsourceには、それだけで「承認後に転送から記録まで自動完結」を実証した一連の呼出し入口はない。固定版連携の成功後に、この必須の連結を既存CLIで確認し、手動転送・execute・close/resume/finish・通知が残るなら最小限で接続する。新しい意味判断・検索機能・有料AI・常駐serviceを追加することを目的にしない。現時点で#33完成とは扱わない。

停止理由は、必須の運営者端末入力結果が未受領であること。本番有効化・実データapplyは未承認かつ未実行で、入力待ちをその承認へ読み替えない。
