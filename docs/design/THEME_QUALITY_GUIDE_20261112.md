# 会話から改訂する共通のテーマ品質ガイド

今回の範囲はローカル3200・HTTPS β。技術schemaと編集品質の本文を分離する。

- 稼働正本は既存会員PostgreSQLのsite_editorial_guide_version、ID theme-authoring-quality。Markdown一本文を追記型の版として保存し、Gitへ本文を二重管理しない。添付v1.1を初版投入する。既存本文があれば読んでから差分を調整する。
- get_theme_authoring_guideは固定の技術契約にqualityGuide（ID・版・日時・全文）と読書き入口を添える。read_theme_quality_guideは現在／指定版と20件ずつの履歴を返す。呼出しごとにDBを読み、会話やbuild内のコピーを正本にしない。
- update_theme_quality_guideはrequestId・expectedRevision・reasonと、Markdown全文かrestoreRevisionの一方を受ける。競合はGUIDE_CHANGED。既存site_operation_requestで同一内容再送を再利用し、異なる内容の同じIDを拒否する。復元は過去本文を新しい版へ保存し、旧版を保持する。別の承認・AI審査は加えない。
- 既存の認証済み運営者・active判定・missions:collect＋themes:composeを維持する。一般利用者／収集専用tokenを昇格しない。編集本文は参照コンテンツであり、認証・schema・公開先・処理上限の変更や未実装機能の実現には使わない。
- 初回だけ明示migration041とWeb配置・既存β Appの操作定義更新が必要。以後の本文更新にCodex、Git、build、再起動、配置、App更新は不要。本番・テーマ／商品／画像・定期実行は変更しない。

通常操作は、現行版を読む→ユーザーが求めた箇所だけ改訂→期待版を指定して保存→再取得。未決案を確定規則へ変えない。実ChatGPTと内部試験は分けて記録する。
