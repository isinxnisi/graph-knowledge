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

## β検証記録

- Web source `9a5d89a3`、build `f7eM29UJ1wCbvjJ33WwC1`。会員DB migration 047を適用。3200とHTTPS βの公開一覧を確認し、匿名プレビューは404。現行のβ Appから新しい技術ガイドを読み戻した。βの常駐Workerは画面採取を処理する構成で起動し、画像生成先は検証時だけ固定画像を使った。
- 非公開の手動検証案件で、固定画像の処理・imageId発行、prepare／dispatchによる関連付けと、別実行へのhandoffを確認。人の会員セッションを使わず、ChromiumでPC 1440px／スマートフォン390pxの日本語プレビューを採取。挿絵・拡大・年表・Story・出典を確認し、PCは並んだ年表を続けて操作でき、スマートフォンは戻るボタンを使えた。画面証拠8枚を見直し用読み出し経路で取得。未承認稿の匿名プレビューと一般公開APIはともに404。
- 初回の実画面でPC・スマートフォンの導線差を確認し、採取コードを修正した。ローカルの障害診断中にPlaywrightが一度だけ検証用の短命資格をエラー出力に含めたため、その資格を失効させた。採取コードは遮断された通信のエラーを整形し、同じ資格を含む生のPlaywrightエラーを出さずに終了する。
- HTTPS βのMCPに匿名で接続した際の401を入口IDで照合し、Web再起動後も入口・HTTP結果と8枚の証拠が残ることを確認。隔離回帰は制作／MCP 47件、画像・プレビュー等の対象26件。MCPの重複6件を含む。
- 未実施は課金を伴う生成実測、ChatGPT Webの実予定でのPNG視認と全体評価、正式環境での切替。ヴァイキングの本番案件と3件のWeb側プロンプトはこの検証で変更していない。

## 2026-11-21 実生成とWeb予定の統合検証

### 実生成を1受付に限定

1. βの会員DBと `workflow: manual` の非公開案件を使う。既存の画像生成用OpenAIプロジェクトで `gpt-image-2.6-flare` の利用許可、残枠と現在の料金を確認する。βの試行に使うキーは `THEME_IMAGE_OPENAI_API_KEY` としてWorkerの既存の秘密設定へ渡す。キーはチャット・コマンド引数・Webには渡さない。
2. 対象プロジェクトの利用枠を確認し、固定サイズ1536×1024・medium・テキスト入力・1枚の当日見積に余裕を取って試験費用が1 USD以内に収まることを確認する。OpenAIの予算アラートだけでは停止せず、強制上限にも反映遅延がある。試行中、同じ試験枠で別の生成を流さず、既に確認した利用枠と以下の1受付制限を併用する。残枠や単価を確認できない状態では送信を保留する。 [OpenAIのプロジェクト設定](https://help.openai.com/en/articles/9186755-managing-your-work-in-platform-with-projects)・[現在の画像単価と計算](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)
3. 既存claim後に `generate_theme_image` を呼び、返った `automationId` を固定する。指示はASCIIの公開題材の短文（10〜512文字）とし、日英altを付ける。βの通常の画面採取Workerでは課金設定を無効にしたまま、秘密設定を読み込んだ一時Workerだけで次を実行する。

   ```bash
   THEME_IMAGE_PROVIDER=openai THEME_IMAGE_PAID_ENABLED=1 THEME_IMAGE_DAILY_LIMIT=1 \
     node --import tsx scripts/theme-automation-worker.ts --beta-image-request "$automation_id"
   ```

   この処理は指定のβ手動案件の画像受付だけを選ぶ。βで当日のOpenAI送信枠を1回に制限し、同じ受付の送信記録を翌日も再利用する。応答不明の場合は新しい受付を作らず、試行IDを使って利用記録と照合する。画像保存の再開は生成送信と別処理。既存の定期案件はこのコマンドの対象外。
4. `read_theme_automation` の `result` にある `providerAttemptId`、`providerRequestId`、`usage`、発行した `imageId` を照合する。使用量欄が取れない場合は不明として扱う。送信前後の既存プロジェクトの Usage Dashboard または分離した既存の費用照会で、画像枚数と実際の課金額を照合する。料金反映待ちは未確認として残す。 [OpenAIの画像API応答](https://developers.openai.com/api/reference/resources/images/methods/generate)・[OpenAI Costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs)
5. 通常のprepareに `generatedImage` を渡し、保存ワイヤーとdispatch後の非公開作業版で同じimageIdを確認してhandoffする。生成・保存と画面採取の各受付が確定した後にβのWorkerを再起動し、生成イベント、登録、採取、同じ証拠の読み出しを案件・受付・試行IDで照合する。

### ChatGPT Webへのβ引継ぎ

β Appだけのツール定義を更新し、`get_theme_authoring_guide` とツール一覧で `capture_theme_review_preview`、`read_theme_automation`、`read_theme_review_evidence`、`update_theme_production` を確認する。ユーザーとChatGPTが既存の00分・30分・20分とは別のテスト用予定を用意する。実生成後に当該手動案件のcaseIdを渡し、次の指示で1回実行する。

> β App（graph-beta.isinxnisi.com）の手動検証案件 `<caseId>` を指定して取得し、review工程を新しいexecutionIdでclaimする。現行ガイドとevaluationTargetを読み、同じdigestで画面採取を依頼する。受付の状態を読み、PC・スマートフォンの全画面名を `read_theme_review_evidence` で1枚ずつ取得する。
>
> 実際に表示されたPNGから、両画面幅の挿絵の見切れや表示位置、年表、Story、出典、戻る導線を各画面に見える具体的な内容とともに報告する。本文・根拠・参照・画像の適切さも現行ガイドに照らして全体評価し、同じ実行で全画面を読めた場合だけ現在のdigestとガイド版で `assessment` を保存する。合格なら `reviewEvidenceId` に採取受付IDを指定する。この検証では `complete` は実行しない。PNGが視認できなければ `EVIDENCE_VIEW_UNAVAILABLE` を記録し、全体評価を保留して実行権を解放する。
>
> 終了時に案件ID、実行ID、画面採取受付ID、画面名、目視所見、全体評価の結果または阻害理由を残す。

経路が成立したと判定するには、テスト予定の実行結果にある視認所見と、サーバーの同じ実行ID・現行digest・ガイド版での証拠取得と評価記録を照合する。APIからPNGを返せたことと、予定実行のAIがそれを視認できたことはそれぞれ確認する。

### 2026-11-21の確認結果

- βのWeb／Workerの実行環境、WSLとWindowsの環境変数、確認できるβ用設定に、既存の課金キーと承認済み利用枠を特定できなかった。有料画像APIへの送信は0件。実画像、トークン使用量、実課金、実生成画像の作業版への関連付けは未確認。
- 隔離の制作／MCP 48件と画像アダプター3件が成功。1受付に限定し、定期案件を選ばないこと、別のWorkerから保存済み受付を読み直せること、応答欠測と0を区別できることを確認した。
- βで画面採取Workerを更新・再起動し、前回の無課金検証案件で、画像登録と作業版への関連付け1件、採取とPNG8枚のハッシュ、同じ8枚の取得、送信段階から取得までの診断が一致することを照合した。β Web buildは `f7eM29UJ1wCbvjJ33WwC1`。実生成の診断は課金接続後に同じ手順で確認する。
- β Appのガイドに新APIが載っていることを読み戻した。今回利用可能なAppツール定義には画面証拠の取得ツールがまだ表示されていない。β Appのツール更新、テスト用予定の作成と実行、実行記録の照合を引き継ぐ。

### 正式導入の判定と復旧

実生成・課金照合とテスト予定の実画面評価が揃ってから候補SHAを固定する。正式監査・β台帳でWeb、会員DBの047、専用Workerの配置とChromium依存物を照合する。共通の公開手順では `--migration member/047-theme-automation.sql` を候補に含める。現行の共通公開資材は専用Workerを同時に起動しないため、監視・停止・復旧を含めたWorkerの配置先と資材は別項目として固定する。正式プロジェクトの鍵・利用枠はWorkerへ限定し、通常公開・資料収集・公開済み完了案件の回帰を確認する。正式の秘密設定を含む切替票、停止順、復旧手順を提示し、承認後に切り替える。

段階的に互換APIを配置してから処理を有効にする。障害時は課金生成の新規送信を止め、受付、既に取得した素材、証拠の状態を保存し続ける。予算超過・結果不明を再生成で解消しない。見直し証拠を読み出せない案件は公開を保留し、復旧後に現行版の証拠から再評価する。既存の定期枠は正式承認後、実予定の結果が揃うまで従来経路を使える状態にする。 [正式公開手順](PRODUCTION_RELEASE.md)

## 2026-11-21 実生成の追加β結果

- 01:55:38 JST（11月20日16:55:38 UTC）に、βの非公開の手動検証案件で `gpt-image-2.6-flare` の中品質を1回送信し、1536×1024のJPEGを1枚取得した。既存の画像検査と保存で不変のimageIdが発行され、作業版1へ関連付けられた。受付は1件で、送信の再試行は0件。
- 画像API応答の使用量はテキスト入力77、画像出力1,132、合計1,209トークン。公開単価での試算は0.034345 USD。API応答の使用量と、OpenAI側の実課金・特典クレジット引落しの確定を区別する。後者はプロジェクトのSpendを読み戻して記録する。 [モデル単価](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)・[API利用量と課金の確認](https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs)
- β build `f7eM29UJ1wCbvjJ33WwC1` の認証済み日本語プレビューでPC 1440px、スマートフォン390pxを確認した。両幅で金色の主鏡と銀色の遮熱板を認識でき、拡大時に画像全体を表示できた。画像、年表、Story、出典、戻る導線を確認し、PNGを8枚取得。生成画像は主題が分かる挿絵で、実機の構造確認は公式資料を使う。非公開稿は匿名プレビューと一般公開APIで404。 [NASAのWebb構造図](https://science.nasa.gov/asset/webb/webb-telescope-spacecraft-diagram/)
- βの画面採取Worker再起動後、同じ受付で外部送信1回、画像登録1件、作業版への関連付け1件、証拠8枚のハッシュと8枚の読み出しを照合した。試行用に貸与したキーは一時実行のWorkerに限り、常駐Workerは引き続き画面採取を担当する。
- ChatGPT Webの別テスト予定は未確認。β Appで `read_theme_review_evidence` を利用可能にし、現行のβ手動案件を新しい実行IDでclaimする。採取済みの同じ証拠を読み、現行digest・ガイド版に一致する全体評価の記録と目視所見を照合する。試験では公開操作を行わない。元の00分・30分・20分の予定には設定変更を行っていない。正式はWeb側の確認とリリース承認後に進める。
