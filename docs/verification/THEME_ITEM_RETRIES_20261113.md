# 運営テーマ再試行制御・β検証 2026-11-13

## 実装と隔離検証

- ①設計・②実装と回帰確認完了。③ローカル3200／HTTPS β反映・既存App更新・実ChatGPT照会を続ける。
- 明示043は既存スケジュールを変更しない。変更前の同受付を保全snapshotとして `.local/theme-retries-20261113/before.json` に保存（Git対象外）。現在9項目公開済み、G07は入力版2・queued・次回2026-11-13 17:00 JST・AI送信0。旧誤接続時の他5項目の各1送信は履歴として保持する。
- 今回の隔離統合8件とMCP／権限23件成功。新URLの即時予約、元URL／追跡パラメータの8回上限、停止中の修正と明示再開、旧Worker結果のfence、同時Worker／同一操作ID、他owner／失効／版違い／公開済み／取消済み、host Retry-After、全体rate、ACK消失を確認。待機中は準備回数を増やさない。
- 既存項目修正19件、一般取込39件、テーマ登録30件成功。運営登録のAI dispatchは呼ばれず、一般投稿の既存AI審査と利用上限は維持。
- 型検査・変更範囲lint・型検査込みpublic build成功。build `RmH5tLbGPlQPxu82h7rS4`。既存のTurbopackの動的path tracing警告は残る。今回UIは変更しない。

## 本番と実G07

本番／正式App／共有Kev／定期実行設定は変更しない。実G07への再試行・停止・再開はこの開発では行わない。機能反映後に運営者がChatGPTで明示操作する。ChatGPTでの接続試験は新しいread-only状態APIに限定する。
