# 通常Chatで公開資料画像を年表に入れる

出典ページと実画像のURLを分けて扱う。出典と利用条件を読み、編集上の効果、許諾範囲、必要なクレジットを確認する。採用の判断は制作・独立見直しがその会話内で行う。

1. `preview_theme_source_image({imageUrl})` で画像のPNGと `sha256` を受け取る。画像そのものを見て題材と照合する。表示されない場合は、その応答を採用判断に使わない。
2. `import-theme-source-image` に `imageUrl`、`expectedSha256`、新しい `requestId`、`provenance:{id,kind:"licensed",sourceUrl,terms,credit,creditDisplay}`、`alt:{ja,en}` を渡す。案件のある制作・見直しでは `prepare_theme_production_submission` → `dispatch_theme_production_submission`。案件外の素材登録は `import_theme_source_image`。必須のクレジットは `creditDisplay:"public"` とする。公開媒体、加工・縮小の可否、利用条件ページのURLは terms に記す。
3. 受付を読み、返った `imageId` を別のテーマ登録・更新で日英それぞれの `presentation[].records[].imageId` に配置する。現在のテーマ版、対象項目の `{id,revision}` と既存 presentation を `read_theme` で確認して保存する。画像に合わせて既存の年表項目や文章を削らない。
4. 保存後の版を再読し、日英の対象項目で同じ `imageId`、各言語のalt、出典とクレジットを確認する。独立見直しでは認証済みプレビューの年表と詳細を開き、実際に画像が表示されることを確かめる。

完全一致の再送は同じ受付・保存済み送信を使う。URL先の画像が視認時から変わった場合は `SOURCE_IMAGE_CHANGED`。最新画像を視認し、採用する場合は新しい受付IDを使う。認証・署名が必要なURL、商品画像ホスト、静止画を返さないページはこの経路の対象外。取得が失敗した場合や掲載条件が成立しない場合は、既存の後日対応手順に沿って扱う。枚数の目標は設けない。

## βで通常Chatから1回だけ確かめる指示文

[ChatGPTのβアプリ設定](https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6aef2b97439081919c3828f9080c4c6f)で「ツールを更新」を実行する。βアプリの詳細で `preview_theme_source_image` と `import_theme_source_image` の両方を確認する。通常Chatでβアプリを指定し、次を一度送る。

```text
Plunodeの公開資料画像取り込みを、この通常Chatだけでβ通し確認してください。βアプリだけを使います。最初に接続確認案件 380ed892-aae1-4daa-abc4-83cd64822cc1 を読み、ID・environment:beta・origin:https://graph-beta.isinxnisi.com がすべて一致した実体を使ってください。βを特定できなければ書き込まず、結果を返してください。正式・既存の公開テーマ・定期案件・品質ガイドには書き込まないでください。

候補はDARTが衝突直前に撮影したディモルフォスの観測画像です。
出典 https://science.nasa.gov/asset/hubble/surface-image-of-dimorphos/
利用条件 https://www.nasa.gov/nasa-brand-center/images-and-media/
取得対象 https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2023/07/STScI-01H5Q6WNZ8GPX2B6JMHX4G3RMT.tif/jcr:content/renditions/985x985.png
出典と利用条件を読み、公開クレジット NASA, APL を保持してください。preview_theme_source_image を呼び、ツールが返したPNGを実際に視認して、出典の表題・説明に書かれていない画面内の特徴を一つ説明してください。PNGを視認できなければ取り込み前に止め、見えた応答の種類を報告してください。

DARTの既存テーマを読む場合は参照に限り、衝突に関する実在する公開記録を正確な版で選びます。再利用できる記録がなければ、実資料で根拠を確認して検証用の項目を用意してください。画像の配置先は非公開の独立したβ確認用テーマ「DART資料画像 β確認」とします。manual 案件を使い、その caseId と現在の lease/version で prepare → dispatch します。先に取得失敗の例として出典のHTMLページを imageUrl にした登録を別受付で試し、成功した imageId がないことを確認してください。
実画像のプレビューSHA-256、出典ページ、利用条件、公開クレジット、日英altで正しい画像を登録します。適用済みの同じ保存済み送信を再照会・再送し、同じ imageId を確認してください。その imageId を選んだ同じ記録の ja と en の年表項目に配置し、テーマの保存版を読み戻します。必要な日英表示用本文・訳を登録し、認証付き確認画面か既存の独立見直しプレビューで、日英の年表と項目詳細の双方の画像を確認してください。公開はせず、案件は保存して実行権を解放します。
最後にケースID・テーマ版・imageId・プレビューリンク、視認した特徴、再送・失敗・日英表示の実測結果を返してください。未確認の工程は個別に明示してください。
```

## 2026年11月28日のβ確認

- Web `81e028b2`、build `e3oCxkwPl690faJmAgffQ`。3200とHTTPS βの状態API、既存Google運営者の画面、ChatGPTのβアプリ更新後の公開画像2ツールとprepare定義を確認した。
- [通常Chatの実行記録](https://chatgpt.com/c/6b0aa8bd-24ec-83e8-a93e-2847c9e155b1)では、DARTの観測PNGを視認し、画面中央左の平たい岩とその下の影を識別した。再利用できるβの記録がなかったため、NASAの資料を照合した衝突記録1件で非公開のmanual確認用テーマを作成した。
- 案件 `e9003097-7d9c-4502-8873-8cd59d81d122`。登録済み画像 `e38ad884e3c5bda402919efcbaf3854ebf556171b382b20035cc12d532b3377d`。同じ保存済み送信を2回dispatchし、同じimageIdと `replayed:true` を確認した。HTMLを指定した別受付は `SOURCE_IMAGE_UNAVAILABLE` で、画像の登録結果がないことを確認した。
- [日本語の第2版](https://graph-beta.isinxnisi.com/operations/themes/theme%3Acd4567d85ea7f6dffe02ae30cf8bd6442604b5f205ee5731?revision=2&locale=ja)・[英語の第2版](https://graph-beta.isinxnisi.com/operations/themes/theme%3Acd4567d85ea7f6dffe02ae30cf8bd6442604b5f205ee5731?revision=2&locale=en)で、同じ年表項目の画像ID、各言語alt、出典を読み戻した。通常Chat内のブラウザはβサイトの運営者セッションを持たず、βアプリには画面採取ツールが出ていなかった。この画面照合は認証済みChromeで実施した。両言語の年表サムネイル640×640、詳細985×985、拡大画像と NASA, APL の表示を確認。匿名での運営プレビュー・公開テーマURL・画像URLはすべて404だった。
- 隔離試験は関連単体59件、運営登録17件、制作53件を確認。制作の既存公開版を検証する1件は、ビルドと並行した試験で時間切れになり、同じ隔離構成での単独再試験で通過した。対象lintと型検査込みのWebビルドも成功。
- β再開時にWindows実行ファイルへのWSLの連携が利用できなかったため、β固有のWindows HTTPS代替設定を退避し、既存の標準TLS経路へ戻した。NASA画像の取得、ChatGPTのOAuth更新、Googleログインが通った。停止していたβの公開投影・審査Workerは既存のβ設定で再開した。公開資料の画像処理はWebが担当する。

## 正式へ進める順序

1. βの通常Chatで実画像の応答・掲載までを確認し、固定SHAで[共通本番公開手順](PRODUCTION_RELEASE.md)の正式差分を作る。今回の画像登録は既存画像・来歴・受付テーブルを使うため、画像取り込みに伴うDB migrationはない。正式／βの配備台帳で別の未反映変更を確認する。
2. 正式Webの切替後、既存の認証でMCPの2ツール、prepareの `import-theme-source-image`、技術ガイドの `sourceImages` を読み戻す。新機能はWebのMCPで取得・登録し、画像生成・プレビューWorkerに新規処理は追加しない。正式差分にWorkerの変更が含まれる場合は共通手順に沿って扱う。
3. 正式の品質ガイドで画像節と技術経路の表を現行版から更新し、制作・見直しの両phaseで読み戻す。正式ChatGPTアプリの「ツールを更新」で2ツールを読み戻す。既存の [制作](theme-production-continuity/production.md)・[独立見直し](theme-production-continuity/independent-review.md) の保存済みプロンプトに、同じ実資料画像手順を適用する。次回起動時は本番の接続確認と現行ガイドの読み直しから始め、最初に採用できた画像について実際の配置を確認する。
4. `licensed-archival-image-chat-intake` は通常Chatから採用できた実績を確認してから進展を記録する。紐付く画像候補ごとの選定・権利確認と公開版の変更は各案件の制作・見直しに任せる。

### 正式の品質ガイドに適用する画像手順

本番反映では第27版から第28版へ更新した。次回変更時も現行版を先に読む。契約2は `read_theme_work_guide({phase:"production",management:true})` でキーを取得し、本文は同じrevisionの `managementBody` を末尾まで読む。`images` の既存の添付・生成の指示に次の段落を入れて経路を明確にする。契約1の技術経路の表でも、テーマ画像行に同じ公開画像の手順を含める。添付契約と既存の生成素材の手順はそれぞれ対象に応じて記載する。

> 公開資料の実画像を使うときは、出典ページと利用条件を確認し、公開画像URLを `preview_theme_source_image` に渡して実画像を視認する。採用時は、視認結果のSHA-256・出典・利用条件・必要なクレジット・日英altを添えた `import-theme-source-image` を案件の prepare → dispatch で実行し、返った `imageId` を別のテーマ更新で日英の年表項目に配置する。見直しでは、既存の認証済み画面採取で実際の表示とクレジットを確かめる。画像を取得・視認できない場合は、掲載しない理由を記録し、現行の制作継続基準を適用する。

更新は読み取った現行版を `expectedRevision` に指定し、変更後の全体を現行契約で保存する。画像の確認・再開条件と、採取証拠・完了に関わる基準の変更履歴を照合する。公開画像の受付が使えることを正式で確認してから、既存定期プロンプトの書き換えを適用する。

## 2026年11月28日の正式配備

正式稼働版 `a9b8a84c`／build `YbHfEJTnvcfoN6kZHAVxx` を基準に、公開資料画像の差分を固定した。配備元は `25e437f453ae1caaaf3f9e23d4469d7d3177d28c`（`codex/theme-source-image-production`）。隔離環境でWebと専用プレビューWorkerのbuild一致、HTTPのbuild読戻し、ChromiumのPNG採取、関連59件と配備計画6件を確認した。配備資材の封印は `84d8bf70e6ec70f6ec82d76fd8b52454db980e9f2c0105aa6738c6369e02465c`。

初回の切替は、有効な独立見直しleaseがあり事前確認で停止した。再実行では既存の照会で案件と画像・プレビュー処理が落ち着くのを待機し、独立見直しが公開第12版を確定してleaseを返した後、同じ封印済み資材と公開手順の事前確認で切り替えた。

- 正式稼働buildは `lXyj2xEDxQLznY8NE1xOO`。Web、`knowledge-publisher`、`knowledge-review`、`knowledge-patrol`、`theme-automation` を読戻した。適用SQLは0件で、台帳は会員51件・知識13件。切替時の世代は `k75-63e39a2009cc5bd60b03db1173d022ee`、復旧用バックアップは `/opt/graph-knowledge/backups/release-25e437f453ae-84d8bf70e6ec70f6`。
- 正式HTTPSの状態・公開互換性APIを `production_release.py verify-https` で確認した。認証済みMCPは正式案件の環境・originと、技術ガイドの `sourceImages` を返した。品質ガイドは画像節と登録経路表を第28版へ更新し、制作・独立見直しで読戻した。評価基準第27版・画面要件第15版の内容を維持した。
- 運営者による正式アプリのツール更新後、アプリ詳細で `preview_theme_source_image`、`import_theme_source_image`、案件経由のprepare、既存の認証付き画面採取を確認した。[正式アプリの定義](https://chatgpt.com/plugins/plugin_asdk_app_6aeffba90628819181cfb1d6eb54a8d0)
- 正式アプリ指定の通常ChatでNASAのDART観測PNGを取得・視認した。985×985 px、SHA-256は `81e28b59570bc6ea70b382e6cff3ad9159dff8fcda12f9237fe02201c843f7d5`。角張った岩の密集と中央付近の岩の影を識別した。無指定の案件取得は定期対象が空で環境フィールドを返さなかったため、正式アプリの接続先と認証済みの指定案件読戻しで環境を照合した。[正式の通常Chat実行記録](https://chatgpt.com/c/6b0adc70-7a1c-83e8-a04b-27b62eec2a6b)
- 保存済みの定期指示は、独立見直し、制作の順に各一段落を追加した。再度編集画面を開いて、両方の全文と稼働状態（制作は毎時00分・独立見直しは毎時30分）を照合した。[定期タスク](https://chatgpt.com/scheduled)

正式の接続確認は画像プレビューまで。登録・再送・取得失敗・日英配置と詳細表示はβで確認済み。正式では定期制作・独立見直しで有益な素材が見つかった案件から採用し、その画像の配置と表示を確認して共有後日対応に進展を記録する。
