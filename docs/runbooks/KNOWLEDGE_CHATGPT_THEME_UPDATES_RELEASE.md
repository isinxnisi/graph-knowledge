# ChatGPTテーマ直接更新の追加公開

既存の正式構成・Google認証・接続App・scope・会員／Capsule／テーマ／KG／AI artifactを保持して追加する。収集計画を利用者が新設することは直接更新の手順にしない。

1. 検証済み固定SHAでβ／正式用資材をbuildし、source label・build ID・image identityを記録する。βは既存runtimeを引き継ぎ3200とHTTPS βへ配置する。
2. 会員038だけを追加する。000〜037のchecksumは保全し、最新backup・分離復元・migration再実行・旧行／所有者の保全を確認する。既存036を編集しない。新しい知識migrationはない。
3. 正式の実構成を再照合して、Web／同じops imageの3 Workerを切替する。稼働後のmember ledgerは39、knowledge ledgerは9。OS・Caddy・旧KG・既存AI artifactは変更対象ではない。
4. 現行正式App `Plunodeテーマ・資料 API（本番）` の `themes:compose` を保持してツール更新を確認する。別Appの作成やcollection-only許可の無断拡張は行わない。
5. Chatからテーマ検索／取得→同じテーマの更新受付→通常処理→同じIDの新しい版→資料URLと年表／関係図を確認する。元の版・既存Capsule断面を維持し、受付と公開を区別する。必要な本人sudo／OAuth操作は具体的な資材を用意して最後に依頼する。

本番の `sudo -n` は不可。既存の端末入出力を継承するSSH helperを用い、パスワードをチャットや設定へ保存しない。以前の一回用release runnerをそのまま再実行せず、新しい前提・資材・追加migrationへ固定する。

## 2026-11-08の配置結果と利用開始

app a2712fc6／正式build jGYRGPYTKRpa4o6BWC8crを配置し、会員038・39件、知識9件を確認。正式backupの別DB復元／再実行・PCでの復号照合と、既存App・同じChatでの3→4→5更新／復元を完了。[詳細](../verification/KNOWLEDGE_CHATGPT_THEME_UPDATES_20261108.md)。この一回用stageを次回deployへ再利用しない。

利用時は既存の本番Appを有効にしたChatで、テーマURLと「説明をこう変えて」「この資料URLの出来事を加えて」のように変更を伝える。Chatはguide→テーマ取得→固定版へのupdate→受付状態／公開URLの確認を行う。新しい知識は通常確認を通り、構成編集だけなら追加のAI確認を行わない。収集計画の作成・運営画面操作は不要。古いツール一覧のままなら既存App管理の「ツールを更新」を行う。同じApp・既存scopeを維持し、別App新設を標準にしない。
