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

## 正式へ進める順序

1. βの通常Chatで実画像の応答・掲載までを確認し、固定SHAで[共通本番公開手順](PRODUCTION_RELEASE.md)の正式差分を作る。今回の画像登録は既存画像・来歴・受付テーブルを使うため、画像取り込みに伴うDB migrationはない。正式／βの配備台帳で別の未反映変更を確認する。
2. 正式Webの切替後、既存の認証でMCPの2ツール、prepareの `import-theme-source-image`、技術ガイドの `sourceImages` を読み戻す。新機能はWebのMCPで取得・登録し、画像生成・プレビューWorkerに新規処理は追加しない。正式差分にWorkerの変更が含まれる場合は共通手順に沿って扱う。
3. 正式ChatGPTアプリの「ツールを更新」で2ツールを読み戻す。既存の [制作](theme-production-continuity/production.md)・[独立見直し](theme-production-continuity/independent-review.md) の保存済みプロンプトに、同じ実資料画像手順を適用する。次回起動時は本番の接続確認と現行ガイドの読み直しから始め、最初に採用できた画像について実際の配置を確認する。
4. `licensed-archival-image-chat-intake` は通常Chatから採用できた実績を確認してから進展を記録する。紐付く画像候補ごとの選定・権利確認と公開版の変更は各案件の制作・見直しに任せる。
