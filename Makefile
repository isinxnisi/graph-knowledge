# 自動開発の操作一覧。「make」だけでヘルプを表示します。
# 実行例: make autopilot-status
#
# 期間・時刻を変更する手順:
#   1. make autopilot-config で設定を編集して保存
#   2. make autopilot-apply でWindowsのスケジュールに反映
#   3. make autopilot-status で次回の実行予定を確認
#
# 変更・実行操作ではWindowsの管理者確認（UAC）が出ます。
.DEFAULT_GOAL := autopilot-help
.PHONY: autopilot-help autopilot-status autopilot-review autopilot-hold autopilot-test autopilot-on autopilot-off autopilot-run autopilot-config autopilot-apply autopilot-check autopilot-logs completion-sound

# 手動セッション完了用の通知音を試聴します。Windows側の音量設定を使います。
completion-sound:
	@python3 scripts/notify-complete.py --test

# 操作一覧と使い方を表示します。迷ったらこれを実行してください。
autopilot-help:
	@python3 scripts/autopilot.py help

# 自動実行が有効か、次回はいつか、前回は成功したかを確認します。
autopilot-status:
	@python3 scripts/autopilot.py status

# 未反映commit・固定SHA・開発ログ・dirtyを確認します。取り込みや自動実行はしません。
autopilot-review:
	@python3 scripts/autopilot.py review

# 同じロックで手動作業と自動実行を排他します。別terminalで保持し、完了時Enterで解放。
# 既定60分。時間を変える場合は python3 scripts/autopilot.py hold --minutes 120。
autopilot-hold:
	@python3 scripts/autopilot.py hold

# 一時Gitリポジトリを使い、検知・排他を検証します。実開発や実DBには触れません。
autopilot-test:
	@python3 -m unittest discover -s tests -p 'test_autopilot*.py' -v

# 停止していた定期実行を再開します。今すぐ開発を始める操作ではありません。
autopilot-on:
	@python3 scripts/autopilot.py on

# 次回以降の定期実行を停止します。すでに実行中の開発はそのまま続きます。
autopilot-off:
	@python3 scripts/autopilot.py off

# 予定時刻を待たず、専用worktreeで開発を1回実行します。
# 実際に実装・テスト・commitが行われます。停止中なら先に autopilot-on を実行してください。
autopilot-run:
	@python3 scripts/autopilot.py run

# 設定ファイルをエディターで開きます。
# START_DATE=開始日、END_DATE=終了日、RUN_TIMES=毎日の実行時刻です。
# 保存後は必ず autopilot-apply を実行してください。
autopilot-config:
	@python3 scripts/autopilot.py config

# 編集した設定をWindowsのスケジュールに反映します。
# 停止中なら停止状態を維持します。開発実行中は変更できません。
autopilot-apply:
	@python3 scripts/autopilot.py apply

# 認証・必要コマンド・worktreeなど、起動条件だけ確認します。
# Codexによる実装・テスト・commitは行いません。
autopilot-check:
	@python3 scripts/autopilot.py check

# 最新の実行ログの末尾を表示します。失敗や停止の理由を調べるときに使います。
autopilot-logs:
	@python3 scripts/autopilot.py logs
