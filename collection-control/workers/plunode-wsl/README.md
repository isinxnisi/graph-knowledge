# CollectionWorkerの実行制御

確認: 2026-10-19 02:03:39 JST。

反映済みcontrolRevision: 0／最後の操作: なし。

**outside-window**／停止モード: なし

日本時間: 03:00〜07:00、09:00〜12:00、15:00〜18:00。ジョブ間10分休憩。

次の開始候補: 2026-10-19 03:00:00 JST

ChatGPTは[未承認の操作雛形](control-template.json)を読み、運営者が明示した操作だけを controls/plunode-wsl/ID.json に新規登録する。

pause-new: 新規開始だけ停止。pause-running: 実行中もチェックポイントから再開できる形で中断。resume: 停止解除。set-windows: windowsを指定して毎日の時間枠を変更。

操作はworker-execution-control-only。収集・知識受入・公開applyの承認ではない。GitHub権限を信頼し、名前だけを本人認証とは扱わない。Issuesは計画台帳であり実行キューではない。

個別処理・根拠・代表Graph経路は[結果一覧](../../results/)を参照。収集候補／正式受入済み未公開／公開済みを混同しない。
