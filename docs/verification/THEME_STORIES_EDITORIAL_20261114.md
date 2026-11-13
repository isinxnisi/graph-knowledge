# テーマの読み物編集・β App接続（2026-11-14）

## 結果

設計確認→実装→隔離試験→3200／HTTPS β反映→既存ChatGPT App実呼出しを完了。実装commit `fe5d9486`、稼働build `8Tu7cZwjELp3xVV8kD1PZ`。本番未変更。実PLUTO（版9、19 Record）・黒澤（版10、20 Record）は読取のみで、作業前後のTheme全体とsnapshotが一致した。

## 採用した契約

[設計](../design/THEME_STORIES_EDITORIAL_20261114.md)の `Theme.content.stories` を使用。version 1とordered items（key、exact Record pins、任意のja/en見出し）。明示選択ではkindを問わず候補とする。単独・複数Recordのグループに対応。本文と根拠は共通Recordの固定版を参照し、presentation.records／chapterQuestion／explanationsは既存の役割のまま残す。

未設定は従来互換、items:[]は明示0件、省略更新は保持。古いテーマを一律更新しない。古い版、年表、Graph、Capsuleの固定断面を変更しない。正確な参照版の検証は知識transaction内で行い、外したいRecordを共通知識から削除しない。新規登録のitem:KEYは同じ受付の採用版へ解決する。

`read_theme.storyEditing`：mode／selection／effectiveItems／全候補のtarget・kind・assertion・言語別shortTitle／chapterQuestion／explanations・evidence。固定出典URLは同じsnapshot.sources。`update_theme.changes.stories`：掲載構成の全体置換。通常のrequestId・観測したtarget.revision・reason・運営認可・冪等性・競合・履歴を利用。`get_theme_registration`：受付結果と新テーマ版、`read_theme`で再読込。新しいtoolやscope、管理画面、AI選別は追加していない。

## 隔離試験

- unit／UI／MCP schema／Capsule回帰：57件成功。掲載順、relationの掲載、見出し継承、ja/en見出し、複数本文と各根拠リンク、開閉、明示0件、旧互換、重複key／参照拒否、未取得／旧版のグループ抑止、既存App update toolへの転送を確認。
- 独立PostgreSQLコンテナによる運営登録統合：33件成功（うち今回の合成1件＋PLUTO／黒澤の公開読取コピー各1件）。実βの読取exportは `.local/theme-stories-20261114/*-before.json`、`THEME_STORIES_FIXTURE_DIR`を設定し既存 `scripts/test-member.ts --theme-registration` で実施。終了時にこの試験用コンテナだけを削除。βのDBは試験fixtureの接続先として使っていない。
- コピーから公開日等を読み物選択から外しても元snapshot／年表を保持。指定順・グループ・明示0件、旧版、exact evidence、同じrequestの再送・所有者分離、既存の競合／権限取消／回復を確認。review_attemptsとreview_jobsの増加0。既存一般投稿の審査実装は変更なし。
- 変更対象lint成功、型検査込み公開build成功。全体型検査で既存商品テストfixtureのauthor／edition不足を検出したため、テストデータに空値を補完。商品機能は変更していない。

## 配置

mainを先にcommitし、既存の隔離build stagingからlocal3200へ配置。Webと、テーマ受付を回復するβのreview Workerだけを正常停止・再起動。他のWorkerは不変。DB migration・秘密設定・外部登録・権限・本番の変更なし。localhost3200と `https://graph-beta.isinxnisi.com/` の同じ固定版をブラウザで確認した。

## 実ChatGPTでの確認

既存App `Plunode資料収集 API（β）`（`asdk_app_6aef2b97439081919c3828f9080c4c6f`）と既存会話「Plunode資料収集」で実施。

1. get_theme_authoring_guide／read_theme／search_themesを実呼出し。黒澤版10のlegacy・候補20・現表示13件と新契約を確認。
2. 最初はAppのキャッシュされたupdate_theme定義にstoriesがなく、実ChatGPTは送信せず停止した。既存App管理の「ツールを更新」を実行し、同じ会話を再読込。App再作成・権限追加・OAuth再同意は不要だった。
3. 実PLUTO／黒澤ではなく、既存の確認専用テーマ `theme:9de8183d5957121be1b1e9d39a3b047aa7a596a6411c9718`（【表示確認】商品画像の差し替え・固定版）だけで、実ChatGPTのupdate_themeを実行。新しいテーマは作成していない。
4. 受付 `3ab58d7d-2374-4ccf-91e8-9d82a850a5b8` は get_theme_registrationでpublished、テーマ版3→4。read_themeでmode explicit／掲載2項目（Record3件）と順序・見出し・固定版を読み戻した。
5. 構成は `webb-ariane5-launch-relation`（relation1件）、`webb-space-deployment-preparation`（note2件、見出し「宇宙で望遠鏡をひらく準備」）。既存の参照版1と2を保持。
6. サーバー応答も独立に確認。確認専用テーマの変更はstoriesだけ、snapshot全文一致。タイトル・説明・全Record／年表・画像・商品参照を保持。実PLUTO版9／黒澤版10はThemeとsnapshot全体が変更前と一致。

これはサーバー単体／Codexからの直接呼出しだけでなく、実ChatGPTのApp呼出し・実保存・結果読取まで確認したもの。日常編集は同じread→update→status→readで行える。ChatGPT側で追加確認を要する機能残件はない。実テーマの読み物編集はこの開発では実施していない。

## 画面

1920px／375pxで、確認専用テーマ旧版3の従来一覧、新版4の指定順・relation単独・noteグループ・全文・小さい各Recordへの出典リンク・一覧への復帰・開閉を確認。年表8件を維持。375px時は横溢れなし、部分スクロールを新設していない。iPhone実機は未確認。

画像は `C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/theme-stories-editorial-20261114/`：
- legacy-pc.png：旧版互換
- edited-pc.png：明示編集版
- edited-mobile.png：375pxのグループ本文
- chatgpt-confirmation.png：実App更新・受付・読戻しの結果

表示された試験商品・画像は既存の確認テーマのもので、今回の商品登録・実商品公開ではない。今回の確認用2項目を実テーマの文章品質の完成例とは扱わない。実テーマは共通品質ガイドを読むChatGPT編集者が別途編集する。
