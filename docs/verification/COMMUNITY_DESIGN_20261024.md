# 実コミュニティ UI 改修・検証（2026-10-24）

基準 main: `68e99ff`。実装方針と参考資料は [デザイン体系](../design/COMMUNITY_UI_DESIGN.md)。本番・KG・Worker・Kev・3275 の試作は変更しない。

## 変更範囲

|画面|対応|
|---|---|
|発見・参加／運営一覧|場所の記号、タイトル・説明・訪問操作の共通行|
|スレッド一覧|実投稿数・更新日時、会話タイトルをリンクにし、作成を独立した入力面へ|
|会話・返信|スレッド名を主見出し、投稿者・日時・本文を一組にし、返信面と静かな補助メニュー|
|自分の投稿|認可済みの所属先・会話名・日時・抜粋、ページをまたぐ該当投稿への移動と一覧復帰|
|招待・参加履歴|同じ見出し・場所の記号・状態・操作の配置。対応待ちバッジは維持|
|設定・メンバー・管理履歴|設定値と操作を整理、人物の頭文字、役割と補助操作を対応付け|
|通報・撤回・退出|共通メニューと確認ダイアログ。既存の取消確認・再送・失効処理を維持|
|個人ナビゲーション|既存の共有枠を維持し、記号とスマホ横一列のメニューを適用|

新規 schema、権限拡大はない。投稿位置の読取と認可済み表示情報を追加した。Capsule 掲載は準備中のまま。

## 重点検証

- 隔離 PostgreSQL＋実認証の community integration: 28 件。65 投稿のうち先頭ページ外の投稿を、前後を含むページで取得。他スレッド／存在しない投稿の拒否、退出・再参加後の旧限定会話題名の非開示、本人の撤回権を確認。
- safety integration: 14 件。通報対象認可、非表示・復帰、停止、監査、冪等性を確認。
- 関連 unit: 18 件（session 7、report 3、identity 5、primitives 3）。型チェック・変更ソース lint。
- ブラウザ: 22 種のシナリオを通過（design 3、auth 5、既存 UX 4、safety 4、C1 2、C1b 4）。過去比較用の 1 件は通常試験では skip。
- JA 1440／390、EN 320 の新規試験で、ページ先の投稿→会話→返信→元の cursor の投稿一覧、作成の取消・失敗・再送・成功、補助メニューの画面端・Escape・取消後フォーカスを確認。
- 認証応答遅延、503、対象だけの403、内部移動、Back/Forward、招待の到着・失敗・解決、入力中の別タブ復帰、通報結果不明からの再送は既存の重点試験を再実行した。

途中の試験で、変更中の別ルートへの再認可が旧ルートを参照し本文が操作不能になる競合を検出。最新ルートの取得関数を保持し、ルート変更時の取得を古い pending 状態で抑止しないよう修正した。StrictMode による確認ダイアログのフォーカス帰還先上書きも修正し、再試験した。

## 同じ幅での比較

画像はすべて隔離環境の架空データ。実 beta の非公開投稿・会員情報は記録しない。

|画面・幅|変更前|変更後|
|---|---|---|
|スレッド・390px|[前](assets/community-design-20261024/before/community-design-community-design-ja-390/threads.png)|[後](assets/community-design-20261024/after/community-design-community-design-ja-390/threads.png)|
|会話・1440px|[前](assets/community-design-20261024/before/community-design-community-design-ja-1440/conversation.png)|[後](assets/community-design-20261024/after/community-design-community-design-ja-1440/conversation.png)|
|投稿履歴・390px|[前](assets/community-design-20261024/before/community-design-community-design-ja-390/activity.png)|[後](assets/community-design-20261024/after/community-design-community-design-ja-390/activity.png)|
|一覧・320px EN|[前](assets/community-design-20261024/before/community-design-community-design-en-320/directory.png)|[後](assets/community-design-20261024/after/community-design-community-design-en-320/directory.png)|
|招待・1440px|[前](assets/community-design-20261024/before/community-design-community-design-ja-1440/invitations.png)|[後](assets/community-design-20261024/after/community-design-community-design-ja-1440/invitations.png)|
|管理・320px EN|[前](assets/community-design-20261024/before/community-design-community-design-en-320/management.png)|[後](assets/community-design-20261024/after/community-design-community-design-en-320/management.png)|

[会話の初期表示](assets/community-design-20261024/after/community-design-community-design-ja-1440/conversation-viewport.png)・[作成面](assets/community-design-20261024/after/community-design-community-design-ja-390/composer.png)。小人数・長題名・短長文の混在を使用し、常設作成フォームの排除、読み始める位置、操作の強弱を自己レビューした。

## 反映と残件

反映済み build: `YRaA0GOCLG13vk5z77VgL`。3200 と `https://graph-beta.isinxnisi.com/communities` は HTTP 200、双方の HTML に同じ build と chunk を確認。ログイン済み実 beta で参加一覧→話題一覧→作成面→取消→既存会話、投稿メニューと Escape、個人 Capsule へ移動→ブラウザ Back、Home の探索入口を確認。本人の投稿一覧は実 beta では空であり、該当投稿移動は隔離データで検証した。会員・Capsule・コミュニティ・スレッド・投稿の件数と内容 fingerprint は反映前後で一致した。

Web のみを 3200／実 beta へ反映する。反映前 build `ay5gQ39fSwm8ihSoG6M0f` を `backups/community-design-prebuild-20261024/.next-public` に退避。切り戻しは対象 beta プロセスを確認して停止し、この build を `.next-public` に戻して既存の `scripts/start-local-previews.py beta` で起動する。DB migration はない。

iPhone 実機・Windows OS キャプチャ操作は未実施。狭幅 Chromium の操作試験と区別する。実 beta の書込み・招待送信・撤回は行わず、書込みと失効競合は隔離環境で検証した。C2、AI、本番公開は後続の判断とする。
