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
- 専用branchにActions workflowがあれば自動更新を拒否し、間接的なAI実行を防ぐ。

## 隔離・手動検証

12テスト成功：無変更・時刻だけの変化・日次観測、手動の名前／予定と追加fileの保存、実Gitでの並行編集とnon-fast-forward拒否／次回復旧、共有ロック競合、HTTP相当／Git失敗で前情報保全、取得失敗の明示、私有パス拒否、poll揺れの無視、Windows観測の鮮度、ネットワーク前のロック解放、Actions workflowの拒否。PowerShell AST構文検査成功。

実環境プレビューで、正式receipt fingerprintは既存照合summaryと一致し、VPS API revision `b74a4b00-9454-412f-af5d-1317713a543c` を確認。既存停止container／待受なしportを停止状態のまま記録した。旧停止10依頼と通常待機1依頼を混同しない。旧保存保留は現在残件数の断定に使わない。

Windows taskの導入と実起動結果、既存task定義の不変確認は以下へ追記する。画面・API・DB実装を変えていないため3200／betaの再build・VPS配置はしない。
