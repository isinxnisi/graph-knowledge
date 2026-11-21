# テーマ自動制作のAPI・検証・移行

現行の制作00分、独立見直し30分、資料収集20分を使う。追加の内部受付は画像生成と画面採取を扱う。案件の所有、実行権、状態版、作業版、公開承認は既存の規則に従う。

## 運営API

1. 制作で実行権を取得し、`generate_theme_image` に素材指示と日英alt、安定したrequestIdを渡す。受付後は `read_theme_automation` で状態を読む。画像の準備を待つ間は既存の方法で進捗保存・実行権解放ができる。次回は同じ受付を読む。
2. `ready` なら既存prepareに `generatedImage: {automationId, locales}` と、指定言語の `presentation` を含む通常の作成・更新コマンドを渡す。保存済みのワイヤーに不変のimageIdが入る。既存dispatch、登録結果確認、handoffへ進む。素材を替える場合は現行作業版を読み直す。
3. 独立見直しは現在の `evaluationTarget.digest` で `capture_theme_review_preview` を依頼する。状態応答に採取結果と画面名を返す。各画面を `read_theme_review_evidence` で取得し、実際のPNGを確認してから全体評価する。承認時は `assessment.reviewEvidenceId` を添え、従来の `complete` と正規URL確認を行う。表示できない場合は阻害を記録し、公開承認を進めない。採取を使った案件では、現行の版・ガイド・Web buildに一致し、同じ独立見直し実行で画面を読み取ったことをサーバーで確認する。
4. 既存の通常Chat、旧案件のprepare・dispatch、収集経路には従来の契約を適用する。

## 配置と復旧

- 会員DBで `scripts/member-migrate.ts --theme-automation --confirm-origin <canonical-origin>` を実行する。追加migrationは047。Webと内部Workerは `THEME_AUTOMATION_ENABLED=1` で有効化する。Playwright Chromium、共有ライブラリ、Webへ到達できる管理下のホストを用意し、同じ会員DBの構成・同じ運営者の許可設定で `node --import tsx scripts/theme-automation-worker.ts` を監視下で起動する。βに限り `THEME_AUTOMATION_PREVIEW_ORIGIN=http://127.0.0.1:3200` を利用できる。
- 固定画像を使うβ検証ではβWorkerだけに `THEME_IMAGE_PROVIDER=fixture` と固定画像を指す `THEME_IMAGE_FIXTURE_PATH` を設定する。正式には設定できない。OpenAIの利用は別途承認し、専用キー、`THEME_IMAGE_PROVIDER=openai`、`THEME_IMAGE_PAID_ENABLED=1`、承認済みの `THEME_IMAGE_DAILY_LIMIT` をWorkerの秘密設定で導入する。WebやMCPの入力にはキーを渡さない。リクエストは中間品質・一枚。日次枠は送信前の上限で、実際の費用はプロバイダー側でも監視する。
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
- βで画面採取Workerを更新・再起動し、前回の固定画像検証案件で、画像登録と作業版への関連付け1件、採取とPNG8枚のハッシュ、同じ8枚の取得、送信段階から取得までの診断が一致することを照合した。β Web buildは `f7eM29UJ1wCbvjJ33WwC1`。実生成の診断はOpenAI画像生成APIの接続後に同じ手順で確認する。
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

### 2026-11-21 ChatGPT Webの通常チャットで接続・PNG視認・全体評価を確認

- 10:17〜10:21 JSTの通常チャットでは、認可コード交換1件とトークン更新22件がすべて200。6件はJWTの有効開始時刻まで待機した。制作ガイドと検証案件の連続読み取りが成功した。β Web buildは `4JpkEG3jRrLNTeHXjsUmD`。 [β接続の修正記録](BETA_TUNNEL.md#2026-11-21-時刻同期後の再発とβの修正)
- 案件 `e61171da-bdec-486c-abd7-9c5ad4532052` の独立見直し実行 `7da79854-4f25-4cee-8f89-3581586e7d39` は、受付 `6130d695-7dca-46a6-b7c0-3dc7ef047a42` のPNG8種類を取得した。サーバーの提供記録は再取得を含む10件。ChatGPTの報告では8枚を実際に視認し、PC／スマートフォンの挿絵、年表の戻り導線、Story、NASAの出典と引用を確認した。
- 10:20:45 JSTに現行digestとガイド第6版の全体評価を `needs-changes` で保存した。Webの読み直し報告とサーバーの保存内容は一致し、案件は見直し工程、実行権は解放済み、公開受付は0件。短い検証用原稿の公開品質は未承認。
- プレビュー右上の「確認失敗」は、採取ブラウザが会員プロフィールAPIを遮断した場合のヘッダー表示。テーマ本文や画像は対象を限定したプレビュー権で取得する。会員セッションを採取Workerへ渡さず、表示はレビュー画面の改善候補として扱う。 [採取時の経路制限](../../scripts/theme-automation-browser.ts)
### 2026-11-21 β単発予定でPNG視認・全体評価を確認

- ユーザー側で作成した10:25 JSTの単発予定は、通常チャットと別の実行 `c628f148-092d-4ce3-856f-95209bc96317` で動作した。10:28:48 JSTの採取受付 `03d3dfb3-0f0b-43cd-a456-0c5ec6df9905` は同じβ buildでPC 1440px・スマートフォン390pxのPNG8枚を生成した。同一実行への8種類の配信、対応する永続診断8件を照合した。
- 10:30:35 JSTにガイド第6版・現行digestに一致する `whole-theme` の `needs-changes` を保存した。保存された予定実行の本文には、8枚それぞれの実視認報告がある。金色の主鏡と銀色の遮熱膜が両幅の拡大表示に収まること、年表とStoryの戻り導線、Ariane 5の打上げ説明とNASAの出典・引用を確認した。原稿の題名・導入・Storyの不足を公開品質の課題に挙げている。Webの予定画面は取得できなかったため、視認所見の照合には同じ実行IDでサーバーに保存された評価本文を使用した。
- トークン更新19件はすべてHTTP 200、うち2件は待機処理を通過。MCP呼び出し19件はすべてHTTP 200で、評価保存後の案件再取得と実行権の解放も確認した。公開受付は0件。正式環境と既存の通常運用3予定に変更なし。正式切替はクレジット引落しの照合、既存OAuthの再利用防止の確認、利用枠・Workerを含む固定候補の承認後。

### 正式切替の段取り

1. 正式監査の稼働ソース、会員・知識DBの台帳と、同じ候補のβ証拠を照合する。今回の追加は会員DBの `047-theme-automation.sql` と `048-mission-oauth-assertion-ids.sql`。048は既存のJWT再利用防止記録を保持し、Better Authが指定する安定した識別子を保存できるようにする。利用者・セッション・トークンのIDと既存の認可を維持する。切替前のJWTについて、新しい再利用防止記録は遡って作成しない。
2. 共通公開手順でWebと既存の知識3 Workerを固定する。新しい自動制作の受付は最初は無効のまま、既存の公開ページ、通常編集、制作・見直し・資料収集の読取とOAuthを確認する。正式DBのバックアップと台帳確認の後に旧サービスを止め、会員047、048を順に適用する。復旧は共通手順の前進復旧を使い、失敗時は状態ファイルを確認して同じsealの資材で再開する。 [共通本番公開手順](PRODUCTION_RELEASE.md)
3. 専用WorkerはDockerfileの `theme-automation-ops` から作り、Webと同じGit SHAと `.next-public/BUILD_ID` を確認する。Chromiumを同梱した非rootのimageと [Composeの設定例](../../ops/theme-automation.production.compose.yaml) を個別に承認対象に含める。設定例を稼働中の正式Composeへ反映する際は、既存サービス・環境・ネットワークとの差分を照合し、将来の共通リリースでもWebの設定が保持されるよう正規Composeへ統合する。専用Workerの環境ファイルは管理者だけが読めるようにし、Webに画像生成キーを配布しない。
4. API有効化と専用Worker起動は切替票に含め、共通公開の確認後に行う。初回はOpenAI画像生成APIへの送信を無効にし、Webと同一のDB・originに接続して認証済みプレビューの代表経路を確認する。専用Workerの停止・再開、設定復旧はこの段階で実測する。共通公開手順が管理する3 Workerに専用Workerは含まれない。以降の会員migrationやWebとの共用変更では、専用Workerの停止・整合したimageへの交換・再開を追加の切替手順に含める。
5. 課金有効化は既存のOpenAIプロジェクト、実費結果と利用枠を確認後に行う。問題時は新規送信を止め、生成済み画像と受付・診断を保持する。既存の00分・20分・30分の予定は共有APIの後方互換性を保ち、Web側の指示変更は必要なときにユーザーとChatGPTが行う。本番で対象案件がある回だけを観測し、PNG視認・承認・公開URL、資料収集の配送と公開反映をそれぞれ照合する。

### 2026-11-21 正式切替候補の準備記録

- 固定ソース `e4946790d5f8e3a9ad2d51cdafb0304c8543fa3b`。正式監査で稼働中のWebと知識3 Workerは `89fb67b026f2d2ff695efaa023b33200d1456ec6`、build `Z_Qv5CFufUf3HwEDuiPdL`、会員046まで・知識013までだった。同じ正式buildをHTTPSからも確認した。監査時点の空き領域51.7 GiB、利用可能メモリ1,631 MiB、NTP同期済み。
- 隔離復元DBで会員048適用前の行と台帳の保持、再適用の冪等性、同じ署名を同時に受けた場合の1件受理と重複拒否、新しい署名のトークン更新、既存の認可コードとセッションを確認した。認証とMCP回帰38件、ESLint・型検査、共通公開の隔離Docker／PostgreSQL試験を含む7件が成功した。
- β build `2bjzTiD-PDfaRmHShLyBH` に会員048を反映。3200とHTTPSで稼働を確認し、既存認証から操作ガイド、検証案件、品質ガイドの3件を連続で取得できた。同じ実画像のPC／スマートフォンのPNG8枚を採取し、匿名のプレビューと公開APIは404。元の単発予定の独立評価は前節に記録済み。
- 正式候補build `8KGRoVvhFNgTYCT3r5L3x`。Web・知識3 Worker・会員047／048が対象で、知識DBの追加移行と公開世代再構築は計画に含まれない。専用WorkerにはWebと同じ正式用データ定義を同梱し、同じbuildを持つ非rootのimageでPNG採取と隔離DBの `--once` 起動を成功させた。実画像の追加送信は0件。
- 本番切替は候補とsealを確認して承認を受けてから行う。既存予定はユーザー側で管理し、旧経路の互換性を維持する。外部課金の有効化は実費・特典クレジット引落しの照合を待つ。
- ローカルの正式資材は `.local/theme-automation-release-20261121/release-e4946790` に固定し、sealは `d1453ed41bfc8b70624fbf8bdb1236fcbbb4d469da452b0df195e2af8cc9018c`。専用Workerと設定例は `.local/theme-automation-release-20261121/worker-release-e4946790` に固定し、sealは `676aa8f31646f7a9766cd5fce28a34d2699dd97bc7738b6fd417d4dbf36e342c`。両資材のハッシュとbuildの一致を照合済み。正式VPSには未転送・未適用。

### 2026-11-21 正式互換性切替の進行と全体の受入

- 承認対象は候補 `e4946790` のOpenAI画像生成APIを無効にした互換性切替。転送用tarのSHA-256 `85d650d012e327ae81e3748c2dac4ca0ad62372d046214d4d5526cd0e7a5f0c5` をVPS側でも照合した。管理者は端末でsudoを行う。切替前に正式Webで新機能が無効であることを確認し、適用後にWebと既存3 Workerのソース、会員・知識台帳、設定ファイルのハッシュを照合する。
- 切替直前の既存Appでは、制作ガイド・現行制作案件・品質ガイドの認証済み読み取りが成功。制作案件は見直し工程で停止中、実行権なし。新機能の受入では、この状態と既存の停止理由を引き継ぐ。
- 11:36 JSTに正式の互換性切替と読み戻しを確認した。Webと知識3 Workerは `e4946790d5f8e3a9ad2d51cdafb0304c8543fa3b`、正式buildは `8KGRoVvhFNgTYCT3r5L3x`。会員047／048のチェックサムは計画と一致し、会員台帳49件、知識台帳13件。環境ファイルのハッシュは監査時の値を保持。復旧記録と会員DBバックアップは `/opt/graph-knowledge/backups/release-e4946790d5f8-d1453ed41bfc8b70`。
- HTTPSでTOP、dataset、公開世代 `k75-5d1288ffc3cff4fd5b64fe2084331665`、公開検索の連続ページを確認した。既存Appのガイド・制作案件・品質ガイド・テーマ検索の連続読み取りも成功し、新しい自動制作ツールは非公開だった。ヴァイキング案件 `4c649f02-a749-4ccd-822b-ddba9757d8fc` は従来と同じ見直し工程・停止状態にある。専用Workerの正式起動、API有効化、課金と既存Web予定の実処理の確認は後続工程。


| 工程 | 完了条件 |
| --- | --- |
| 正式互換性切替 | Webと知識3 Worker、会員047／048、公開HTTPSと既存MCPの読取を照合する。知識DB台帳と公開世代を照合する。 |
| 専用Workerと画面採取 | Webと同じ固定buildのWorkerを配置し、OpenAI画像生成APIへの送信を無効にした状態で、認証済みプレビューと診断の継続を確認する。停止時に受付・画像・ログを保つ。 |
| 画像生成の正式有効化 | βの実費・特典クレジットと本番の利用枠を確認する。専用Workerへ正式用の秘密設定を反映し、受付から作業版への関連付けを追跡する。 |
| ChatGPT Webへの引継ぎと復旧 | ユーザー側で必要なツール設定と指示を読み戻す。既存の00分制作、20分資料収集、30分独立見直しの対象回を観測し、非公開原稿、配送・公開反映、同じ実行でのPNG視認と全体評価、公開結果をそれぞれ照合する。対象のない回は実処理の確認を後続回へ持ち越す。 |

次の正式有効化で追加するのは、seal照合済みの専用Workerと、Webの `THEME_AUTOMATION_ENABLED=1`。会員047／048適用済みの環境で行い、追加のDB移行は予定しない。専用Workerは画像APIキーを含めず、OpenAI画像生成APIへ送信しない設定で起動する。Webのガイド・既存操作と、認証済みプレビュー・証拠取得を順に確認する。復旧時は専用Workerを停止し、Webを有効化前のComposeへ戻して代表経路を再確認する。OpenAI画像生成APIの有効化、Appの新ツール読み戻し、Webの予定指示と実行結果の照合は別途記録する。

### 2026-11-21 正式の画面採取有効化

対象は専用WorkerとWebの画面採取・PNG取得・診断。専用Workerでは `THEME_IMAGE_PROVIDER` を空にし、`THEME_IMAGE_PAID_ENABLED=0` を明示する。OpenAI画像生成キーは設定しない。Webの自動制作ツールには画像生成の受付定義も含まれるため、予定の画像生成経路を切り替えるのはOpenAI画像生成APIを有効化した後とする。

- 同じWeb build・台帳を確認し、既存Composeへの差分をWebの機能フラグと専用Workerに固定する。非rootの採取Workerを起動し、ChromiumでPNGを採取してからWebを再起動する。アプリの環境ファイルと既存3 Workerの設定は既存値を使用する。
- 専用Workerに必要な会員接続設定は稼働中のWebから取り出し、VPSの管理者専用ファイルに保存する。文字列を二重解釈しないComposeのraw形式を使い、値を出力しない。候補の正規Composeが承認済み追加設定と一致することを確かめる。
- 失敗時は専用Workerを停止し、Composeの控えからWebを戻して公開代表経路を再確認する。適用・復旧は同じ資材と共通公開ロックを使う。 [正式の画面採取有効化スクリプト](../../scripts/activate-theme-preview-production.py)
- 本番用資材の転送SHA-256は `4b59879508cdd99165f00f37d0bbe05321bd730e733738ea9a00b74c00aa6d06`、有効化手順を含むsealは `57fce99c63d84192d666e2448fd6562335719daec53a51993c5ad4d90bceffe3`。VPS側で転送を照合後、管理者のsudoで有効化した。
- 正式build `8KGRoVvhFNgTYCT3r5L3x` で `theme-preview-activated` を確認。専用Workerの非root ChromiumでPNG採取が通り、Webの再起動後に既存サービス・環境・台帳を再確認した。OpenAI画像生成APIへ送信しない設定を稼働コンテナで確認した。復旧用Composeは `/opt/graph-knowledge/backups/theme-preview-e4946790d5f8-676aa8f31646f7a9` に保存済み。
- 正式HTTPSの公開世代 `k75-5d1288ffc3cff4fd5b64fe2084331665` と検索を確認した。既存Appの認証済み操作ガイド、ヴァイキング案件、品質ガイド、テーマ検索を連続で取得し、ガイドに `capture_theme_review_preview`、`read_theme_review_evidence`、`read_theme_automation` が載った。対象版のHTMLとプレビューAPIは未認証で404、`private, no-store` と `noindex` だった。
- 正式Appの新ツール読み戻しと、認証済みの案件に対する採取・PNG取得・永続診断は確認待ち。ヴァイキング案件は見直し工程の停止状態で、実行権は空いている。採取した案件では以後の公開承認に画面証拠が必要になるため、検証に使う案件を確認してから採取する。OpenAI画像生成APIの利用額・利用枠の照合と、既存の定期予定3件の対象回確認は後続。

正式の認証済みPNGを確認するには、本番Plunode Appのツールを更新し、対象として確認済みの案件を取得する。見直し実行権が空いていれば、新しい実行IDでreviewをclaimし、最新のdigestで画面採取を1件依頼する。同じ実行で採取得果と全画面名を読み出し、各PNGを取得してPC・スマートフォンの表示と診断を照合する。表示できなかった画面は阻害要因とし、検証記録に残す。この疎通試験では評価保存・公開操作を行わず、実行権を解放する。

### 2026-11-21 正式Workerの運営者認可

- ヴァイキング案件 `4c649f02-a749-4ccd-822b-ddba9757d8fc` の採取受付 `6c6b2ee2-88b6-4a1e-b6bb-364baf7d9a8c` は、正式build `8KGRoVvhFNgTYCT3r5L3x` で `blocked / OPERATOR_REQUIRED`。MCPの受付と診断保存までは通り、見直し実行権は解放済み。
- `authorizeProductOperator()` は `isSiteOperator()` に加え、案件所有者がDBで有効なアカウントであることを要求する。専用Workerの起動手順は、Webが使う `COMMUNITY_ENABLED`、`SITE_OPERATIONS_ENABLED`、`SITE_OPERATOR_USER_IDS` を渡していなかった。修正は既存Webと同じ設定の継承で、認可ロジックとWebの許可リストは既存のものを使う。
- 修正手順は、旧受付・所有者・実行権の取得記録・アカウントの有効状態を実DBで照合し、Workerの実際の `authorizeProductOperator()` で修正前後を確認する。WebとWorkerが同じ会員DBを使用し、修正差分が専用Workerの運営者設定3項目だけであることを確認して、専用Workerを再起動する。手順の転送SHA-256は `928d0adaa5517fb23360be582cf7914a9cd4166c4ce585c8987b8976e75a2e45`、sealは `f541d53ec5f569d139441f991b89cef0416675674dd6d59888301e746097477f`。 [運営者設定の修正手順](../../scripts/repair-theme-preview-operator-production.py)
- 固定WorkerイメージとComposeの隔離検証で、継承した運営者設定と有効アカウントの組み合わせを許可し、設定欠落・無関係な利用者・無効アカウント・無効フラグを拒否した。専用Workerの再起動に失敗する隔離試験で、元の環境ファイルと復旧記録が戻ることも確認した。

- 正式の実査で、案件所有者とclaim記録は一致し、アカウントは有効でWebの許可リストに含まれていた。Webと専用Workerは同じ会員DBを使用していた。Worker側で運営者設定3項目が欠けていたため、既存Webの値をそのまま継承し、専用Workerだけを再起動。稼働Workerで同じ案件所有者の `authorizeProductOperator()` が `OPERATOR_REQUIRED` から `AUTHORIZED` に変わった。
- 本番Appで新しい見直し実行 `7c8f8d03-c7a4-4a22-88e9-e39fd98d2a60` を取得し、同じ現行digest・ガイド第5版で新規受付 `fb9ad4b8-c5ef-4628-9546-b5e9063fe730` を作成。正式build `8KGRoVvhFNgTYCT3r5L3x` で `QUEUED`、`STARTED`、`EVIDENCE_READY` と進んだ。日本語・英語それぞれでPC 1440pxとスマートフォン390pxの概要、年表、StoryのPNG計12枚をMCPから取得し、受付・対象digest・画面名を照合した。`SERVED` 診断も確認した。直近35件の診断表示では、今回の取得に対応する11件が見えた。
- 実行権を解放後、案件を読み直して、見直し工程・停止状態・評価対象digest・既存評価が保持されていることを確認した。今回の疎通試験で全体評価、公開、OpenAI画像生成APIの有効化は行っていない。

### 2026-11-21 OpenAI画像生成APIの正式接続準備

- βの受付 `2c329dce-5f47-49c3-ac64-11dfb95178f7` は、11月21日01:55:38 JST（11月20日16:55:38 UTC）に `gpt-image-2.6-flare` へ1回送信し、画像1枚を登録した。応答の使用量はテキスト入力77、画像出力1,132、合計1,209トークン。公開単価で換算すると0.034345 USD。実際の請求額は対象プロジェクトのSpend、特典クレジットはBillingで照合する。 [モデル単価](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)・[使用量と費用の確認](https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs)
- 正式は同じモデル・1536×1024・medium・1送信につき1枚。承認済みの送信前ガードはUTCの1日につき最大30送信・30枚で、JSTの09:00に日付が切り替わる。30送信に達した受付は次のUTC日まで待機する。利用状況の照合と送信の有効化は後続。切替時に送信待ちの画像受付があれば内容を照合する。
- 日次30送信の正式設定用資材に差し替え、VPSへ転送・照合した。転送SHA-256は `fb0cd5591eaff7554a4ad978abedc65771d4a15284369182e34c82dcb484b0ee`、sealは `188007323911020305b9749794e6f8bddd7681c6910b0ba0307fb714b932c28e`。PowerShellから `wsl.exe -d Ubuntu --cd /home/isinxnisi/1.projects/7.graph-knowledge -- python3 .local/theme-automation-release-20261121/configure-image-api-approved.py enable` を実行し、承認済みプロジェクトのキーをVPS端末で入力する。設定対象は専用Worker。停止時は同じスクリプトの `disable` で処理中の受付の確定を待ち、送信設定とキーを外して画面採取Workerを起動する。 [正式切替スクリプト](../../scripts/configure-theme-image-api-production.py)
- Composeの差分、キーの非表示入力、待機中の受付があれば有効化を止める動作、専用Workerの起動失敗時に元の設定へ戻る動作を隔離検証した。固定Workerイメージの設定読み込みも、ネットワークを切った状態で確認した。日次ガードの資材を固定した段階で、正式WorkerはOpenAI画像生成APIへの送信を無効にした状態。 隔離PostgreSQLで当日の架空履歴29件と前日の1件を用意し、疑似応答で30件目を計上した。31件目は `IMAGE_DAILY_LIMIT` で次のUTC日まで待機した。OpenAIへの実送信は0件。
- ヴァイキング案件の障害修正時に正式の画面採取と診断を確認した。以降の画像生成・画面採取の技術検証は専用の非公開テーマを使う。ヴァイキングの執筆と独立見直しは本番の定期制作で進める。

#### Web定期実行への引継ぎ

| JST | 確認する動作 |
| --- | --- |
| 毎時00分 制作 | 画像が必要な案件でだけ生成を依頼し、readyの受付を既存prepare → dispatchに使う。結果が不明な受付では同じ送信を追跡し、新規受付による再送を保留する。制作済みの原稿は非公開で見直しへ引き継ぐ。 |
| 毎時20分 資料収集 | 既存のclaim → deliverの受付を読み戻し、知識の反映を別途確認する。制作原稿と公開済みの訂正を保持する。 |
| 毎時30分 独立見直し | 現行digestで採取し、同じ実行で各PNGを視認する。評価と公開結果を既存の承認条件で確認し、公開版の競合時は照合・再評価を行う。 |

予定指示の更新が必要になった場合は、ユーザーとChatGPT Webで設定を保存・読み戻す。各工程は対象回の受付、操作の記録、表示または公開結果で確認する。

### 2026-11-21 本番画像生成APIの有効化とWeb単発検証

- ユーザーがVPS端末で本番用キーを入力し、専用Workerの `image-api-enabled` を確認した。モデルは `gpt-image-2.6-flare`、1送信で1枚、UTC日次30送信・30枚が上限。有効化時の送信待ちは0件。HTTPSはbuild `8KGRoVvhFNgTYCT3r5L3x` と公開世代 `k75-5d1288ffc3cff4fd5b64fe2084331665` を読み戻した。
- ヴァイキング案件 `4c649f02-a749-4ccd-822b-ddba9757d8fc` は本番の定期制作対象。案件指定なしで取得した定期制作の現行案件も同じIDだった。作業版14・画像受付0件・実行権解放済みを確認した。
- 単発予定の対象は「【非公開・検証専用】Webbの打上げと遮熱膜」。案件 `e22c8431-3c62-4f4e-8508-6641b51e33b2`、テーマ `theme:b39fcf548af2921f3428daa72624b40126ba4baf0ebbabcb` の作業版1。公開済みの出典付き記録2件を固定参照し、日英の編集表示、年表2件、Story 2件を保存した。 `workflow: manual` の見直し工程に引き渡し、実行権解放済み。公開API・未認証プレビューともHTTP 404。画像受付は0件で、単発予定の作成と実行はChatGPT Web側の作業。

単発予定は既存の毎時00・20・30分から離して設定する。検証専用の案件IDを明示し、`workflow: manual`、見直し工程、非公開、実行権を確認する。画像受付があれば同じ受付を追跡する。受付がない場合だけ新しい実行IDで実行権を取得し、Webbの主鏡と遮熱膜を描く説明用の挿絵1枚を日英の代替テキスト付きで依頼する。生成指示へ未公開原稿や秘密を送らない。結果が不明な受付は再送せず、受付IDと状態を引き継ぐ。

状態がreadyになったら `imageId` を確認する。既存の日英の記述を保持して `prepare → dispatch` の `generatedImage` で私的作業版へ関連付ける。現行digestで採取し、PC・スマートフォンのPNGを視認して実行権を解放する。受付ID、使用量、作業版、採取受付ID、視認枚数、解放結果を記録する。単発の疎通範囲は画像登録と表示確認まで。全体評価・公開・既存3予定の対象回確認は別途、既存の承認条件で進める。

### 2026-11-21 本番Webの単発統合検証

- 14:08～14:11 JSTにChatGPT Web単発予定の実行 `a1d5b21e-94fb-4a75-a94b-d160d5335b4c` が検証専用の非公開テーマで完了した。画像受付 `bbd2578e-41b4-4546-9a56-cd3f0f0e4901` に `SEND_STARTED` 1件と `IMAGE_REGISTERED` を確認した。モデルは `gpt-image-2.6-flare`、画像IDは `80773584a4a31a56a100c8d3eb6210251405d8b596e9e192d1dede150f1dd4bf`。使用量は入力97、出力1,132、合計1,229トークン。実際のクレジット引落額は未照合。
- `prepare → dispatch` 後の作業版2で日英両方に同じ画像IDが付いている。公開状態はprivate、登録待ち0件、評価記録なし、実行権なし。画面採取受付 `9ec45147-2122-4bd9-aad6-704fd49a8c06` で、現行buildのPC 1440px・スマートフォン390pxに各4枚を保存した。診断では同じ実行IDの採取完了とPNG配信記録を確認した。
- Webの実行報告でPNG8枚の実視認を確認した。画像全体、年表、Story、出典と引用、戻る導線を確認済み。ヘッダーの「確認失敗」表示は残っている。Worker再起動をまたいだ診断の読み戻しはβで確認済み。
- 本番の定期制作・資料収集・独立見直しの受入は、各予定の対象回の結果で確認する。ヴァイキングは定期制作の本番案件として扱う。11月21日14:14 JSTの読み戻しで、見直し工程の停止中、私的作業版14、実行権なし。単発の検証専用テーマは非公開のまま保持する。

### 2026-11-21 制作案件の検索と終了

- [Issue #76](https://github.com/isinxnisi/graph-knowledge/issues/76)。運営一覧では公開版と案件の段階を併記する。「公開済み」と「見直し中」の両方に該当するテーマは両方の絞り込みから参照できる。「制作・見直し案件」から案件ID、更新日時、手動／定期、全体評価、残作業・阻害、登録と操作の履歴を確認する。
- Appでは `list_theme_productions` にテーマIDを指定し、次ページには `nextCursor` を渡す。対象の案件IDで `get_theme_production` を呼ぶ。`includeSettledSubmissions: true` で確定済みの登録を含め、`operationCursor: 0` で操作履歴を取得する。案件IDを省略する既存の定期取得は従来どおり。既存の認証主体・origin・環境を使う。
- 案件の終了は運営一覧の案件詳細、または `abandon_theme_production` を使う。案件版と理由を指定し、同じ要求を再送する場合は `requestId` と本文をそろえる。稼働中の実行権、未決の登録、保留中の公開切替、未確定の画像生成や画面採取がある場合は先にそれらを確認する。終了は公開承認を発行せず、公開版・作業版・画像・証拠と操作履歴を保持する。
- βはアプリ `6b0f4e8f`、build `4huMZ2N5g3U3RDx3GPCfG` に会員049を反映。3200とHTTPS βでdataset 200、未認証の案件API 404を確認。既存β Appで新しい技術ガイドを取得し、βのサービスからテーマID→案件ID→履歴を確認した。別のテーマ未紐付けの手動検証案件を公開せず終了し、同じ要求の再送と定期枠保持を確認した。隔離回帰は制作／MCP 52件、別実行のUI・登録19件（MCP 7件は重複）、資料収集11件。資料収集の公開対象テストは旧版にもあった未公開fixtureを修正して再検証した。
- 正式は監査と切替承認後に適用する。共通正式手順で会員049をバックアップして適用し、Web・知識3 Workerの固定版と、Webと同じbuildの画面採取Workerへ切り替える。正式の画像生成用キー・UTC日次30上限・運営者認可を保持する。終了済みデータの書式を旧コードは認識しないため、適用後の障害は新版側で復旧する。
- 正式反映後にAppの新しいツールを更新・読み戻す。通常Webb「Webbが宇宙でひらくまで」のテーマIDから関連案件を照会し、案件ID・状態・最終更新・進捗・未確定受付と公開版の関係を記録する。終了の判断は実態の読み取り後に行う。非公開の検証専用Webbは別テーマに留める。毎時00・20・30分の既存Web予定は従来の操作契約で、対象回の実行結果を照合する。

#### #76 正式切替候補と復旧

- 監査時の正式Web・知識3 Workerは `e4946790`、正式build `8KGRoVvhFNgTYCT3r5L3x`、会員台帳49、知識台帳13。βで検証したソース `6b0f4e8faa23f4e22deceb2eaf26691705f472be` と照合し、変更はWeb・知識3 Worker・画面採取Workerと会員049に固定した。049のSHA-256は `b0c8e30fb656e198ddbaa702be7666fb5d1647a48af9dd1798fb05d704a29daa`。公開投影の再構築は行わない。
- 正式候補のWebと専用Workerはbuild `E-2KKBgQfOIONbdAWUXdZ`。共通sealは `93e8083f63f892564da26556a65ac0e756456a43c559922ebf89d918b8676efb`、専用Workerを含む全体sealは `21e92c0b8d8945edc0884ed77ccc52c8408bf614d28980a5816040c33d783607`。VPS転送SHA-256 `4a50e4ab956c3e2d301d5dc359df8032b81bebcff2819158e6944ebd00da187e` をVPSで再照合した。初回資材は展開時の権限で非rootのWorkerがpackage.jsonを読めなかった。展開時の設定を是正して再ビルドし、非rootのWeb／知識Workerの読取と、専用Workerのネットワークを切ったChromiumによるPNG採取を確認した。
- 承認後に共通公開ロック内で監査を再照合し、会員DBバックアップを確認する。画面採取Workerが処理中の受付を確定できる時間を取って停止し、知識3 WorkerとWebを停止して049を適用する。Webの公開読取を確認してからWorkerを起動する。Composeは各image参照だけを差し替え、既存Workerのキーと設定のハッシュ、Webと同じ運営者認可、日次30送信・30枚を読み戻す。
- 049の確定前に切替が失敗した場合は、旧Compose・旧イメージを用いてWeb・4 Workerを再起動する。049の確定後はバックアップと移行台帳を確認し、同じ固定資材で未完了の切替を再開する。旧DBへの自動巻き戻しは行わない。端末へ `case-management-readback` が出たら、正式HTTPSと既存APIを確認し、通常Webbの案件を読み取る。
