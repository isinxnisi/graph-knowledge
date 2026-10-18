# Windows CollectionWorkerの非表示起動確認（2026-10-18）

対象は設置済み `\Plunode-CollectionWorker` とWindowsの起動入口だけ。直接PowerShellを起動していたActionをGUI版 `wscript.exe //B //NoLogo` に変更し、`worker.wsf` がPowerShellを生成時から非表示で起動する。ランチャーは子の完了まで待ち、実際の終了コードを返す。WSLの収集Worker・承認契約・公開準備処理は変更していない。

## 実際の定期起動

時刻はJST。手動のStart-ScheduledTaskによる代用ではなく、既存の毎分triggerから起動した実プロセスを観測した。

| 起動 | 完了を観測 | 終了コード | health | ログ更新 |
| --- | --- | --- | --- | --- |
| 22:41:31 | 22:42:17 | 0 | online・更新あり | あり |
| 22:42:31 | 22:42:56 | 0 | online・更新あり | あり |
| 22:43:31 | 22:43:57 | 0 | online・更新あり | あり |

22:40:30〜22:43:58の観測全体で、対象となるコンソール／Windows Terminal等の表示イベント・新しい可視ウィンドウは**0件**。WinEvent `EVENT_OBJECT_SHOW` と20ms間隔の可視ウィンドウ観測を併用した。既に表示中のウィンドウは初期観測から除外し、ウィンドウのタイトルは記録していない。人間が画面を見て確認したという記録ではなく、実デスクトップの表示状態を測定した結果である。

変更前の22:30:33〜22:32:10にはPowerShellのPseudoConsoleWindowとWindows Terminalの表示を検出した（重複観測を含む6レコード）。正常終了していても表示が出る問題を再現できた。

変更直後の初回観測は合格として採用していない。Windows Terminalの表示2イベントを検出し、またIgnoreNewで起動が見送られた時刻もLastRunTimeに反映されるため、ログ時刻と起動の対応を誤っていた。表示2イベントの発生元をWorkerと断定していない。確認用コードを実wscriptプロセスの開始・終了・終了コードに基づく方式へ修正し、上記3回を再観測した。初回の不合格記録もJSONに保持している。

## 保全と試験

- 元のTriggers／Settings／Principals／RegistrationInfoはXMLで一致。毎分の起動時刻、ログオン起動、IgnoreNew、実行ユーザー、有効状態、1時間制限を保持。既存タスクのInstallはActionだけを更新し、その場で追加起動しない。
- 設置済み `worker.ps1`／`worker.wsf` はリポジトリのソースとSHA-256一致。システム全体のExecutionPolicyは変更していない。
- 隔離した子の完了待ち、終了37の伝播、空白を含むパス・引数の受け渡し、引数不足の終了2を確認。実収集・実受入は行っていない。
- Worker既存単体テスト14件成功。承認なしの拒否・取消・通信失敗後の再開・重複防止・結果送信再開・共通ロックの回帰を確認。PowerShell構文・WSF XML・差分の空白検査も成功。
- private runtimeのconfig、Workerコード、漫画収集の凍結成果物など149ファイルは比較前後でhash不変。実依頼・操作はともに0件。既存の承認・受入・releaseを保持し、公開KGへのapplyやDB変更は行っていない。
- 他タスク230件は変更直後の照合ですべて一致。最終照合ではWindows標準の `\Microsoft\Windows\Flighting\OneSettings\RefreshCache` だけに外部更新を検出（StartBoundaryが22:44:22、LocalSystemのタスク）。本作業から他タスクへの書込みは行わず、この外部更新も戻していない。
- 共通ロック保持中の観測であり、catalogの新main取込みは従来のロック待ちとなる。onlineは既存依頼の確認が正常であることを表し、新コードの承認・新規収集・公開適用の成功を意味しない。WSL側の固定コード更新は今回の対象外。

詳細な時刻、プロセスID、hash、初回観測と再観測は[機械可読な記録](COLLECTION_WORKER_HIDDEN_20261018.json)。再確認には `tests/check_collection_worker_task.ps1` を使用する。画面／Webの変更はなく、3200・beta・VPSの再build／配置は行っていない。
