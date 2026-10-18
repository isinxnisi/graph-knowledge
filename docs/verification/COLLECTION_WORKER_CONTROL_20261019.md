# CollectionWorkerの時間帯・休憩・一時停止（2026-10-19）

公開KGへのapply・restore・VPS配置・会員DB操作を追加せず、既存Workerの重い処理を開始する手前へ実行制御を追加した。通常枠は毎日03:00〜07:00、09:00〜12:00、15:00〜18:00（日本時間）。終盤15分は新規開始を控え、実行中は終了後10分の猶予を持ってチェックポイント再開へ戻す。

## 隔離試験

- Worker既存14件を含む32件の単体／Git transport／子プロセス試験に成功。
- 3枠の開始・終盤・終了・枠外、UTCホスト相当での日本時間判定、日付跨ぎ、休憩が次の枠へ跨がる場合を確認。
- 1回最大1試行、終了後599秒では次を開始せず600秒で開始、再インスタンス化後も休憩を維持することを確認。
- pause-newは開始前なら実行せず、実行中なら完了を優先。pause-runningは再開可能なpausedへ移り、resumeでも休憩・元の承認・受入記録を保持することを確認。
- 12:05の安全な完了、18:10を超える処理の中断と翌枠での再開を確認。PC停止相当でfinallyを通さず再生成した場合は、保存した試行上限＋休憩を保持。
- 時間枠変更・停止状態をプロセス間で保持。適用済み操作の差替え／削除、連続revision・前IDの不一致、AI判断、未知のapply操作を拒否。取消済みの依頼はresumeでも復活しない。
- ローカルbare GitをGitHub相当の通信先として、別connectorの操作2件追記→停止中のPC相当から順次反映→時間外の状態共有→03:00開始→再起動時の重複実行なしを確認。
- 実際の隔離した子プロセスをSIGTERMで停止し、チェックポイント・判断ファイル不変、同じ処理の再開、試行別stdout／stderr各2件を確認。実収集・実受入は行っていない。
- 長い子コマンドを短い試験予算で中断し、Workerの巡回予算を超えて残さないことを確認。55分処理・57分巡回予算の試験は時計と短縮予算によるもので、1時間実待機の試験ではない。
- 凍結r0003の実ワークフロー隔離試験は60.6秒。通信8回目の失敗→72試行／71応答のキャッシュ再開→レビューのGit共有→萩尾望都2 Claimの模擬部分受入→実validator→無書込planの試験置換→plan失敗再開を確認。正式受入の記録日時・releaseは不変。実運営者承認・実DB接続は使っていない。

承認・改変拒否・共通ロック・失敗再開の既存回帰は維持した。隔離試験で使用した時計・模擬判断・provider fixture・plan置換は本番Workerから受け取れない。

## 設置への反映

実装commitは`8dc3f69ceef375d06c8a821eb937e94ae639bdf2`。02:02:39 JSTに既存private lockを取得した状態で更新した。旧home全体を`/home/isinxnisi/.local/share/plunode-collection-worker-before-control-20261019`へ保持し、既存home・workerId・ロックファイルを引き継いだ。現行mainの固定commitへruntimeを更新し、実行コードとconfigのcodeCommitを揃えた。承認対象のadapterコードhashは従来の`80e05b67bc0129b963653b90df4cfbfa5bd6aff190acda99f54c08541e55801e`のまま。

datasetsと既存ジョブ等451ファイルのhashが更新前後・自然な定期実行後ともに一致。実依頼0件・操作0件・正式な制御操作0件のまま。過去の実行承認・受入・未適用releaseは変更せず、模擬承認を実運用へ持ち込んでいない。旧コードを前提にする実依頼があれば別の互換性レビューで停止する更新条件とし、今回キューが空であることをローカル状態とcontrol branchの両方で確認した。

| 自然な定期起動（JST） | 終了 | health／ログ | 表示イベント |
| --- | --- | --- | --- |
| 02:03:31 | 0 | online・更新あり | 0 |
| 02:04:31 | 0 | online・更新あり | 0 |

以前のWindows確認用コードを再利用し、手動起動ではなく既存triggerからの2回を実デスクトップで観測。観測全体でコンソール等の表示イベントは0件。WindowsタスクXMLは反映前後で完全一致し、毎分の時刻、ログオン起動、wscriptによる非表示、IgnoreNew、1時間制限を保持した。他タスクの変更は行っていない。

GitHub連携のfetch_fileで、control branchのREADME.md・status.json・control-template.jsonを実際に読み取った。状態は`controlRevision: 0`、手動停止なし、`outside-window`、次回開始候補は**2026-10-19 03:00 JST**。これは承認済み依頼があれば開始できる時刻であり、収集自体の新しい承認ではない。雛形はdraft-not-approved。時刻判定・制御状態・次回候補はGitHubの[現在の状態](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/workers/plunode-wsl/README.md)で確認できる。

時間外なので、新しいmainのカタログ取込みは次の許可枠へ延期している。新しい収集依頼を出す場合も、最新proposalsのsourceCommit・定義／入力／コードhashを確認し、旧承認を更新コードへ読み替えない。公開KG・VPS・会員DBへの変更は行っていない。

実PCの再起動・1時間の実待機は行わず、再生成したプロセスと保存状態、短縮した予算で隔離検証した。詳細な試験名・通信再開・実タスク・公開された状態・保全hashは[機械可読な検証記録](COLLECTION_WORKER_CONTROL_20261019.json)に保持する。

操作方法・GitHubの登録先・信頼境界は[現行契約](../design/COLLECTION_WORKER.md#実行時間帯休憩一時停止2026-10-19)を参照。計画台帳のIssuesを実行キューへ変換しない。Web機能の変更はなく、3200・beta・VPSの再build／配置は行わない。
