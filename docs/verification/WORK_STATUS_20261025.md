# 統合管理一覧 初版（2026-10-25）

## 範囲

通常Pythonによるread-only取得・小集計と、専用Git branchのMarkdown反映のみ。新Web／DB／常駐service／AI／通知／Worker制御は追加しない。公開repoであることをGitHub metadataで確認した。公開一覧から私有絶対パス、認証値、鍵、内部IP、プロセス引数、Docker環境変数を除外する。

既存セッションの初期調査ではCodex／ChatGPTのタイトル・直近記録と現行docsを参照した。これは今回だけの初期登録で、定期スクリプトが会話やAIへアクセスするものではない。コミュニティ第1弾公開済み、ルーム構想、AI育成ラボ、検索・Graph、データ収集・受入、公開配送、統合一覧の7単位を登録する。運用中の既存処理と人間が編集するセッション状態は別に表示する。

## 設計と取得元

- 正本：`codex/work-status/WORK_SESSIONS.json`（人間の予定・名前・環境設定・固定業務）。自動生成は同branchの `WORK_STATUS.md` だけ。mainの同名fileは入口・固定手順。
- 既存CollectionWorker homeのstate／health／catalog-source、正式receipt10件、stateが参照する既存reviewの小さな結果を読み取る。collector・inventory・validate・plan・accept・applyを実行しない。
- 既存公開照合summaryとreceipt fingerprint、現在の公開API revisionを再利用。集合かrevisionが異なれば正式未公開件数は未確認へ戻す。初回は51 Claim公開済み・正式未公開0、全KG1895 Claimとは別の集計。
- 実ss・プロセスcwd、Docker ps、Git worktree metadata、Windows Task Scheduler／cloudflared数。VPSは公開APIだけで内部Docker／port／serviceは未確認。beta APIは認証なし観測で取得失敗のため未確認。
- ローカルのGit bare cacheと3つの最新観測fileのみ。無変更ではcommitせず、日付が変わった初回だけ観測を更新。通常pollの時刻／Running・Readyの揺れは意味差分に含めない。
- 共通flockは小さな読取中だけ。通信・外部コマンド待機時に保持しない。競合なら次回。GitHubは通常push、遠隔編集に勝たせる。手動JSON・追加fileを保持し、次回fresh fetchから再試行する。
- 専用branchにActions workflowがあれば自動更新を拒否し、間接的なAI実行を防ぐ。専用Git操作のhooksもコマンド単位で無効にし、既存環境の設定は変えない。

## 隔離・手動検証

15テスト成功：無変更・時刻だけの変化・日次観測、手動の名前／予定と追加fileの保存、実Gitでの並行編集とnon-fast-forward拒否／次回復旧、共有ロック競合、HTTP相当／Git失敗で前情報保全、取得失敗の明示、私有パス拒否、poll揺れの無視、Windows観測の鮮度、ネットワーク前のロック解放、Actions workflowの拒否、実Git pre-push hookが呼ばれないこと。PowerShell AST構文検査成功。

実環境プレビューで、正式receipt fingerprintは既存照合summaryと一致し、VPS API revision `b74a4b00-9454-412f-af5d-1317713a543c` を確認。既存停止container／待受なしportを停止状態のまま記録した。旧停止10依頼と通常待機1依頼を混同しない。旧保存保留は現在残件数の断定に使わない。

Windows taskの導入と実起動結果、既存task定義の不変確認は以下へ追記する。画面・API・DB実装を変えていないため3200／betaの再build・VPS配置はしない。


## 実導入・定期実行の結果

- 初版ソース `06c8855` をmainと専用開発branchへcommit・通常pushした。固定PythonをWSLの専用私有ディレクトリへ配置し、configには取得元と既存の非対話Git認証helperだけを設定した。秘密値の新設・変更はない。
- 一覧branch `codex/work-status` を2 fileのみで新規作成した。初回commit `4b59d5c`、実定期起動による反映 `c4f2006d`。mainへの自動commitは行っていない。
- Windows `Plunode-WorkStatus` を通常ユーザー・Limited／Interactive、30分 (`PT30M`)、IgnoreNew、StartWhenAvailable、制限3分で登録した。wscript GUI入口を使い子起動を非表示にする。認証・sudo操作は不要だった。
- **2026-10-25 19:16:46 JSTの最初の予定起動**が正常終了0。19:17:06に取得・GitHub反映を完了し、次回は19:46:46。これは手動のPython成功だけでなく、実Task Scheduler入口からの確認である。
- 19:18:32の実再実行は `unchanged`、commitなし。毎回のhealth時刻やtaskのRunning／Readyだけで新しいcommitを作らないことを実環境でも確認した。beta API取得失敗は未確認のまま表示し、更新自体は完結する。
- 既存のCollectionWorker、Publication Delivery、GraphKnowledge-Autopilot、Afterglow-LoginRecoveryのExport-ScheduledTask SHAを前後比較し、**4件すべて完全一致**。Worker／サービスの起動・停止・設定変更、データ変更、VPS配置は実行していない。
- GitHub連携の通常contents更新で `WORK_SESSIONS.json` の「統合管理一覧」だけを完了へ変更（commit `9bdbd947`）。予定の「ルーム基盤」、他の名前と内容を維持した。これにより、ChatGPTが特別な管理APIなしに小さな手動fileを変更できる経路も実確認した。自動再生成後も手動JSONのblobがcontents更新結果と完全一致することを確認した（c1d448de）。

公開一覧では時刻の経過だけで動的な警告色を出すWeb機構は作らず、観測時刻と90分の鮮度基準を明示する。Windows taskには独立した取得時刻を表示する。ローカル実行記録は毎回更新され、GitHubに変化がなくても定期実行の継続を確認できる。

残る未確認：VPS内部のservice／Docker／port、認証なしでは取得できないbeta API。既存catalog同期は `blocked-review-required` の記録を表示し、今回修復対象にはしない。物理的PC再起動試験や新しい秘密情報配置はこの一覧の導入に含めない。追加の手動設定は残っていない。


新しい正式receiptが発生した後も、既存公開準備の `up-to-date` health／`awaiting-approval` stateが参照する小さなledgerを優先し、現在の公開済み・公開待ち件数に追従する。準備待ち・一時的なロック待ちでは以前のsummaryを原観測時刻のまま保持し、現在receipt集合／公開revisionが異なれば未確認へ戻す。初回の51／0を固定表示し続ける構成にはしない。新receipt→通常準備summary→承認待ちledgerへの追従と、runtime外candidate pathの拒否を隔離試験へ追加した。管理スクリプト自身は候補やledgerを作成しない。

既存runtimeの成果・receipt・cache等1127 fileを最終hash比較し、変更0を確認した。既存task4件の不変と併せ、状態取得のための既存処理変更がないことを確認した。


## 一覧の読みやすさと固定業務の粒度の修正

利用者の指示に基づき、固定業務を `category=データ収集` の下の「公開承認」「収集・正式受入の判断」へ整理する。サービス状態の確認と予定JSON編集は運用説明に残し、固定業務の一覧から外す。既存のセッション名・手動の順序・内容は変更せず、表示側だけを進行中→予定→保留→完了へ安定ソートする。

環境表は公開・確認先、具体的なサービス・作業環境、ホスト・共通基盤の3表に分け、各4列。port／URL／worktreeを接続・配置の1列にまとめ、セル内改行を使う。入力HTMLはescape後に改行だけをbrへ変換する。データ欄の曖昧な「根拠／次の対応」をなくし、区分と件数・状態の2列へ整理。必要な集計範囲・旧記録・照合時刻は表外の説明とする。

既存15試験成功。保存済み実観測からのプレビューで、表示順・表分割・固定業務2件・元の件数と未確認表示の保持を確認した。取得処理とWindows task、Worker、公開KGは変更しない。
