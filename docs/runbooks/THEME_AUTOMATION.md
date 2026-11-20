# テーマ自動制作のAPI・検証・移行

現行の制作00分、独立見直し30分、資料収集20分を使う。追加の内部受付は画像生成と画面採取を扱う。案件の所有、実行権、状態版、作業版、公開承認は既存の規則に従う。

## 運営API

1. 制作で実行権を取得し、`generate_theme_image` に素材指示と日英alt、安定したrequestIdを渡す。受付後は `read_theme_automation` で状態を読む。画像の準備を待つ間は既存の方法で進捗保存・実行権解放ができる。次回は同じ受付を読む。
2. `ready` なら既存prepareに `generatedImage: {automationId, locales}` と、指定言語の `presentation` を含む通常の作成・更新コマンドを渡す。保存済みのワイヤーに不変のimageIdが入る。既存dispatch、登録結果確認、handoffへ進む。素材を替える場合は現行作業版を読み直す。
3. 独立見直しは現在の `evaluationTarget.digest` で `capture_theme_review_preview` を依頼する。状態応答に採取結果と画面名を返す。各画面を `read_theme_review_evidence` で取得し、実際のPNGを確認してから全体評価する。承認時は `assessment.reviewEvidenceId` を添え、従来の `complete` と正規URL確認を行う。表示できない場合は阻害を記録し、公開承認を進めない。採取を使った案件では、現行の版・ガイド・Web buildに一致し、同じ独立見直し実行で画面を読み取ったことをサーバーで確認する。
4. 既存の通常Chat、旧案件のprepare・dispatch、収集経路には従来の契約を適用する。

## 配置と復旧

- 会員DBで `scripts/member-migrate.ts --theme-automation --confirm-origin <canonical-origin>` を実行する。追加migrationは047。Webと内部Workerは `THEME_AUTOMATION_ENABLED=1` で有効化する。Playwright Chromium、共有ライブラリ、Webへ到達できる管理下のホストを用意し、同じ会員DBの構成・同じ運営者の許可設定で `node --import tsx scripts/theme-automation-worker.ts` を監視下で起動する。βに限り `THEME_AUTOMATION_PREVIEW_ORIGIN=http://127.0.0.1:3200` を利用できる。
- 無課金検証ではβWorkerだけに `THEME_IMAGE_PROVIDER=fixture` と固定画像を指す `THEME_IMAGE_FIXTURE_PATH` を設定する。正式には設定できない。OpenAIの利用は別途承認し、専用キー、`THEME_IMAGE_PROVIDER=openai`、`THEME_IMAGE_PAID_ENABLED=1`、承認済みの `THEME_IMAGE_DAILY_LIMIT` をWorkerの秘密設定で導入する。WebやMCPの入力にはキーを渡さない。リクエストは中間品質・一枚。日次枠は送信前の上限で、実際の費用はプロバイダー側でも監視する。
- `IMAGE_GENERATION_UNKNOWN` では新規依頼を繰り返さず、試行IDと利用記録を照合する。保存済み元画像の再処理は同じ受付を使う。画面関連の失敗は対象・Web build・Chromiumの稼働を確認し、解消後に新しい受付で再採取する。期限切れ資格、別案件・版の閲覧、匿名は拒否される。
- 入口・認証後・ツール結果、生成試行、資材保存、採取、画像の提供を会員DBのイベントに保存する。相関には入口ID、案件ID、操作requestId、実行ID、試行IDを利用する。30日で診断イベントと画面バイトを整理し、受付と証拠目録は残す。本文・Cookie・署名URL・file ID・画像・キーは診断イベントに記録しない。アプリ到達前の事象は観測なしまたは `report_theme_external_blocker` の外部報告として扱う。正式切替でCaddyの非到達／HTTP状態も比較する場合は、限定パス・クエリや認証ヘッダーを除く永続ログを正式監査対象にする。

## ChatGPT Webへの引継ぎ

| 対象 | 変更要件と確認 |
| --- | --- |
| 00分・テーマ制作 | 生成素材が必要なら既存claim後に生成APIを使い、受付を再開できるよう保存。ready後だけ既存prepare・dispatchで関連付ける。応答不明の再生成を禁止し、同じケースを継続する。別テーマを含む対象回で生成から非公開handoffまでを確認。 |
| 30分・独立見直し | 最新digestで採取し、PCとスマートフォンの各証拠を画面として読み、現行の根拠・全体評価・承認を続ける。PNG表示不能、古い版、未読証拠で公開を進めない。現行の公開競合時の再評価を維持する。 |
| 20分・資料収集 | 現行のclaim_collection → deliver_collectionを継続する。知識更新・公開版の進展が制作原稿を壊さないことを対象回で確認。 |

正式の固定候補を承認して互換APIとガイドを先に配置する。必要なWeb側の更新・読み戻しはユーザーとChatGPTが行う。旧経路は対象回の確認まで利用可能にする。課金実測、Webの実予定でのPNG視認、各予定の結果照合を運用切替の完了条件とする。
