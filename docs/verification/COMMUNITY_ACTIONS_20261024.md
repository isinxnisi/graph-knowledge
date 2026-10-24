# コミュニティの階層導線・補助操作・通報配置（2026-10-24）

基準main `ff71b9e`。利用者の添付は現状画面として扱う。API・認可・schema・Graph保存形式は変更しない。

## 原因と変更

- 個別画面の「コミュニティ一覧」と属性ラベル、会話の所属先と「スレッド一覧」が重複していた。個別画面の `COMMUNITY` を発見画面へのリンクにし、会話のコミュニティ名から場所へ戻る。投稿履歴への文脈付き復帰・元の探索への復帰は残す。
- 3点操作は44pxの操作領域、20pxの図形、通常透明。見出し・投稿者と同じ行に保ち、参加中のラベル付き操作とは区別する。
- 通報項目だけ `.shell .quiet` がメニュー項目のpaddingを上書きし、左端へ寄っていた。共通メニュー内の操作の余白・文字・hoverを揃えた。
- 従来の上下判定は開いた瞬間だけだった。固定配置を可視viewport内に制約し、スクロール・resize・visualViewport変化・内容サイズの変化で再配置する。汎用detailsの高さ／フェードアニメーションから除外し、本文の高さを変えない。
- ダイアログは既存native dialog＋body portalを維持。可視領域に中央配置し、短い表示領域は内部スクロールにする。背景スクロールとスクロールバー幅を保持・復元。16pxの入力文字でiOSの小文字入力フォーカス時の拡大を避ける。既存の入力保持・取消確認・再認可・フォーカス復帰・送信冪等性は維持する。

## 画像比較

隔離DB・検証OIDCユーザーの架空データのみ。実betaの本人情報・投稿は保存しない。比較画像は各幅・言語・テーマを揃えた。

|条件|前|後|
|---|---|---|
|320 JA ライト・会話|[前](assets/community-actions-20261024/before/community-actions-community-action-surfaces-ja-320/conversation.png)|[後](assets/community-actions-20261024/after/community-actions-community-action-surfaces-ja-320/conversation.png)|
|320 JA ライト・投稿メニュー|[前](assets/community-actions-20261024/before/community-actions-community-action-surfaces-ja-320/post-menu.png)|[後](assets/community-actions-20261024/after/community-actions-community-action-surfaces-ja-320/post-menu.png)|
|390 EN ダーク・通報|[前](assets/community-actions-20261024/before/community-actions-community-action-surfaces-en-390/report.png)|[後](assets/community-actions-20261024/after/community-actions-community-action-surfaces-en-390/report.png)|
|430 JA ライト・場所|[前](assets/community-actions-20261024/before/community-actions-community-action-surfaces-ja-430/community.png)|[後](assets/community-actions-20261024/after/community-actions-community-action-surfaces-ja-430/community.png)|
|1440 EN ライト・場所|[前](assets/community-actions-20261024/before/community-actions-community-action-surfaces-en-1440/community.png)|[後](assets/community-actions-20261024/after/community-actions-community-action-surfaces-en-1440/community.png)|

新しい画面では重複した戻り行を除き、会話名と本文を主役にした。メニューを開いた際の投稿高さ変化は4幅すべて0px。短いviewportの画像、長文末尾のメニュー画像もafter配下に保存する。

## 検証の限界

iPhone実機・ソフトウェアキーボード・Windows OSキャプチャは未実施。ブラウザの高さ420px変更とvisualViewport模擬イベントは、実機と同一の検証ではない。添付の通報項目の余白不整合は再現したが、iOS固有のブラウザUI移動を再現したとは扱わない。実betaでは閲覧・入力取消まで、送信・撤回試験は隔離環境のみ。
## 試験

- 変更前の比較取得4条件に成功。
- 関連単体33件成功（認証ストア5・再認可7・通報3・会員入力/共有13・補助操作5）。visualViewportの縮小/移動、入力保持、背景スクロール復元、スクロール時のメニュー再配置を追加。
- E2E10件成功：新規4条件＋会話地点/作成/撤回3条件＋入力保持/通報/再送3条件。320/390/430/1440px、日英、ライト/ダークを代表条件で確認。
- 初回の単体試験ではjsdomにResizeObserverがなく失敗。ブラウザAPIのテスト用stubを追加し、既存の期待値を緩めず再試験した。
- 型検査・変更箇所ESLint成功。- 短いviewportで操作ボタンへの到達を追加確認。スマホ3条件成功、PCはresizeイベントの処理前に座標を読む試験上の競合を、座標条件を待つassertionへ修正して成功。アプリに固定待機は追加していない。
## 反映と実beta

- public-kgの本番形式build成功。build `QNMnJbnTc8UZJnqJgAmV-` を3200へ反映。ローカル／外部HTTPS `/communities` は200、外部HTMLのbuild識別子も一致。
- ログイン済み実betaで個別コミュニティ→会話、場所名→個別、COMMUNITY→発見、Back/Forwardを確認。通報はコミュニティ・投稿で開始と取消、Escapeのフォーカス復帰を確認し、送信していない。
- サイトメニューから保存済みPLUTO Graphへ復帰し、4 Entity・6 Claim・倍率91%を確認。
- betaのcommunity・membership・thread・post・member_capsuleの反映前後の件数／全行ハッシュ一致。API・DB・権限・会員データは変更していない。本番・公開KG・Worker・Kev・3275は未変更。
- 旧build `4W6LbudnEndXyodmHzyJc` を `backups/community-actions-prebuild-20261024/.next-public` に保持。必要時はbeta PID/cwdを確認して停止し、旧buildを戻して既存 `start-local-previews.py beta` で起動する。DB切戻し不要。
- 所要時間は約25分。原因確認・実装と画像比較、隔離試験約8分（初回compileと追加確認を含む）、build/反映/実beta操作約5分。iPhone実機でのブラウザUI・キーボード表示中の再評価は利用者確認として残す。