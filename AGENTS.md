# Project instructions

Read docs/PROJECT_CONTEXT.md and docs/ARCHITECTURE.md before changing this project. Use docs/README.md to locate active designs and completed phase archives; archived records are historical, not the current specification. Follow the current requested implementation scope; future API/UI plans are not authorization to implement them.

公開実行版（Web／publication operator／gate／delivery）・固定CollectionWorker・Windows Taskを更新する作業では、変更前に [公開実行版更新の短い入口](docs/runbooks/PUBLICATION_RUNTIME_UPDATE.md) を読む。設置版の正本・producer・既存検証と引渡し／再開の判断を辿り、完了済みの固定更新コマンドを再実行しない。通常のデータ追加や無関係な作業で、この更新ガイドの通読は不要。

作業完了時は必要な検証を行い、今回の作業に関する変更を日本語のコミットメッセージでコミットする。ユーザーから別の指示がある場合はその指示を優先する。

AI関連の設計・作業前に [共通Kevの接続・責務と検証方針](docs/design/AI_PROCESSING_DIRECTION.md) を読む。Kevは他プロジェクトも使う独立サービスであり、利用は公開APIを原則とする。Kev本体の変更が必要なら目的・他利用者への影響・代替案を整理し、実施前にユーザーへ相談する。

## 自動開発との協調（手動セッション）

手動セッションの通常の完了手順は、必要な検証→日本語メッセージでコミット→設定済みupstreamへの通常pushまでとする。pushの結果も完了報告に含める。

画面・機能を変更した手動作業と自動開発の受け入れでは、完了報告までに検証済みmainの変更をローカル3200へ反映し、日常確認先 `https://graph-beta.isinxnisi.com/` でも代表経路を確認する。ユーザーから更新を指示されるのを待たない。VPSの正式originは `https://plunode.net`（旧 `https://graph.isinxnisi.net` はpreview維持）。VPSは[確認環境の更新契約](docs/design/PRODUCTION_DEPLOYMENT.md#確認環境の更新契約)の区切りで必ず更新する。文書だけの変更は不要な再buildをせず、両環境の反映状態と未反映・失敗があれば報告する。自動worktreeの未受入変更を3200やVPSへ直接配置しない。

main側などの手動作業では、最初に `make autopilot-review` と必要に応じて `make autopilot-status` を実行し、未反映commit・開発失敗・dirty・実行中を確認する。詳細は [docs/AUTOPILOT_COLLABORATION.md](docs/AUTOPILOT_COLLABORATION.md)。

- 変更・テスト・DB操作・受け入れ作業の前に、別terminalで `make autopilot-hold` を起動し、そのterminalを作業完了まで保持する。Codexは `exec_command` の `tty: true` でセッションを保持できる。共通ロックが使用中なら変更せず、終了後に再確認する。ロックファイルを削除したり、実行中の自動開発を強制終了しない。
- 取得時のtokenを使い、`python3 scripts/autopilot.py review --token TOKEN` で再確認する。長い作業の区切り・変更／検証／commit前に `python3 scripts/autopilot.py assert-held --token TOKEN` で保持を確認する。期限切れ・セッション終了時は作業を止め、再取得・再確認する。60分が既定、`hold --minutes 120` まで指定可能。
- 終了・中断時は保持terminalへEnterを送り解放する。手動作業中の予定実行はスキップされ、解放後の次回予定から再開する。Windowsの有効／無効設定は変更しない。
- 停止・失敗のログと途中変更を確認したら、確認した実行IDだけを `python3 scripts/autopilot.py reports --acknowledge ID ... --note 確認理由` でDriveのアーカイブへ移す。未確認の失敗・未受入commitを一括で確認済みにしない。原ログと確認履歴はローカルに保持し、失敗の確認だけでは当日休止を解除しない。
- 自動開発の取り込みは、確認した固定SHAを対象にレビュー・検証し、受け入れ指示の範囲内で行う。未反映commitの検知は受け入れ承認ではない。ブランチの最新HEADを無条件にmergeしない。受入commit後、ロック保持中に `python3 scripts/autopilot.py complete-acceptance --token TOKEN --target SHA` で完了する。未反映・dirty・Git操作途中がないことを確認し、利用上限の当日休止を解除して次の予定で再試行できるようにする。元の休止記録はログへ保持し、スマホの受入済み記録も整理する。確認だけの `make autopilot-reports` は休止を解除しない。同期失敗を受入失敗と扱わず、ローカル原記録を残して報告する。
- 単一コマンドだけを保護する場合は `python3 scripts/autopilot.py guard -- COMMAND ...` を利用できる。hold内でguardを重ねない。

設定された自動開発専用branch上でrunnerから動く無人ターンは、runner自身が同じロックを保持しているため再取得しない。自動実行から手動側へmerge／pushせず、runner・設定・ロックを変更しない。設定がない別環境では、その状態を報告し、当該自動実行が存在しないことを確認して通常作業へ進む。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
