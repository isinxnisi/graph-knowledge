# 運営テーマ再試行制御・β検証 2026-11-13

## 実装と隔離検証

- ①設計・②実装／回帰・③ローカル3200／HTTPS β反映・既存App更新・実ChatGPT照会まで完了。
- 明示043は既存スケジュールを変更しない。変更前の同受付を保全snapshotとして `.local/theme-retries-20261113/before.json` に保存（Git対象外）。現在9項目公開済み、G07は入力版2・queued・次回2026-11-13 17:00 JST・AI送信0。旧誤接続時の他5項目の各1送信は履歴として保持する。
- 今回の隔離統合10件とMCP／権限25件成功。新URLの即時予約、元URL／追跡パラメータの8回上限、停止中の修正と明示再開、旧Worker結果のfence、同時Worker／同一操作ID、他owner／失効／版違い／公開済み／取消済み、host Retry-After、全体rate、ACK消失を確認。待機中は準備回数を増やさない。最大20根拠の通常入力も成功するよう、URL別8回は失敗・結果不明を数え、成功した引用照合は失敗枠へ含めない。成功分も取得履歴・サービス／host枠では数える。
- 既存項目修正19件、一般取込39件、テーマ登録30件成功。運営登録のAI dispatchは呼ばれず、一般投稿の既存AI審査と利用上限は維持。
- 型検査・変更範囲lint・型検査込みpublic build成功。build `oFPYWrNF4WmNDkZNEq_CX`。既存のTurbopackの動的path tracing警告は残る。今回UIは変更しない。

## 本番と実G07

本番／正式App／共有Kev／定期実行設定は変更しない。実G07への再試行・停止・再開はこの開発では行わない。機能反映後に運営者がChatGPTで明示操作する。ChatGPTでの接続試験は新しいread-only状態APIに限定する。

## β反映・既存App・実会話の確認結果

- main実装 `0e155358`、複数引用の補修 `f01faa81` を通常push。最終runtime build `oFPYWrNF4WmNDkZNEq_CX` を3200／HTTPS βへ配置し200応答。既存β確認Workerのみを同じ設定で通常再起動し、生存を確認。共有Kev・他Worker・正式VPSは変更していない。
- 明示043をβ会員DBだけへ適用、ledger43→44。再実行で変化なし、旧000〜042のchecksum不変。直前のprivate custom dumpは22,087,481 bytes、SHA256 `a877d049c1c73076911a46c0b8a6bbb3c59dbae567166e8dfc81e5ef83f03fd2`。画像・商品・入力・公開9項目・各回数・G07の17時予定の保全snapshotは反映後も一致。
- 既存App `asdk_app_6aef2b97439081919c3828f9080c4c6f` の「ツールを更新」を使用。再作成・権限拡大なし、Write15→16／Read11→12。`control_theme_registration_retry` と `get_theme_registration_retry_status` が操作一覧に表示された。
- 既存ChatGPT会話「Plunode資料収集」で、2026-11-13 11:47 JSTに新read-only APIを実呼び出し。対象G07／入力版2／NEA URL `https://www.arts.gov/honors/medals/george-lucas`／queued／canRetryNow true／paused false／次回17:00 JST／旧準備8回を取得した。新取得履歴・制御操作履歴は0件。この0件は導入後の新しい履歴であり、旧8回を消した意味ではない。
- 最終補修後も接続済みβ MCPの `get_theme_registration` から `retryControl` を再取得し、同じ入力・状態・履歴0件、G07のAI利用0、他9項目のpublishedを確認。Appからの書込み操作は実G07では試さず、隔離DBで検証した。
- 043適用済み隔離DBでも、通常のWeb投稿は既存AI dispatchへ1回進み、運営専用の取得履歴へ入らないことを追加確認。運営Themeのdispatchは0回のまま。
- 画面画像の保存はCDP captureのタイムアウトで未取得。操作一覧と実ChatGPTの結果本文はブラウザDOMで確認した。UI変更やiPhone実機確認の作業とは区別する。

残件は、運営者がChatGPTでG07の再試行を明示指示した後の、NEA原資料照合と同受付のTheme完成。本開発中はretry／pause／resumeを実G07へ送信していない。機能実装・β反映・App接続の残件はない。本番は未変更。
