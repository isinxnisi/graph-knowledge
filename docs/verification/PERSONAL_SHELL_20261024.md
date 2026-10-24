# 共通ヘッダー・本人ナビ・見出しの検証（2026-10-24）

基準 main `0ed5caf`。[採用した共通規則](../design/PERSONAL_SHELL.md)。PC本文・会話・一覧は維持し、共通枠を変更した。API・認可・schema変更なし。

## 変更と確認

- ブランド／サイト移動／本人名／表示設定を固定した並びにする。探索復帰はサイトメニューの先頭。保存されたGraphのない直接訪問では「探索を始める」と表示する。
- 本人入口は頭文字＋省略名、開くと全文。招待件数の意味と共有ストアは維持。スマホのカテゴリ選択＋横スクロールを撤去し、PCと同じ定義の本人メニューから目的地へ直接移動する。
- 個別コミュニティのタブは対象内の操作として残し、狭幅では折り返してラベルを途中で切らない。
- `PLUNODE / COMMUNITY・ACCOUNT・ACTIVITY` を共通部品化。場所と会話の主タイトルの役割は維持。
- 更新は「最新の状態に更新」。更新アイコン・余白のある控えめなボタンに統一し、入力を捨てない実処理は維持。
- PC側ナビはsticky。高さ500pxでも内部スクロールで最後の項目へ到達。本文末尾では親領域内に収まる。
- メニュー開き始めのフェードで本文が透ける問題を視覚確認し、ヘッダーのメニューだけは最初から不透明な面とした。

## 画像

隔離DB・検証ユーザーのみ。実betaの本人名・会話をリポジトリへ保存しない。

|同条件|前|後|
|---|---|---|
|320 JA ライト・コミュニティ|[前](assets/community-shell-20261024/before/320-ja-light-community.png)|[後](assets/community-shell-20261024/after/320-ja-light-community.png)|
|390 JA ライト・設定|[前](assets/community-shell-20261024/before/390-ja-light-account.png)|[後](assets/community-shell-20261024/after/390-ja-light-account.png)|
|430 EN ダーク・設定|[前](assets/community-shell-20261024/before/430-en-dark-brown-account.png)|[後](assets/community-shell-20261024/after/430-en-dark-brown-account.png)|

before/afterは320・375・390・430px、日英、ライト／ダークブラウン。長い本人名・メニュー・PC追随はshellフォルダ、会話・招待・管理・作成はjourneysフォルダ。

## 検証記録

- 単体5ファイル33件成功：会員入力保全、別User／失効／遅着応答、共有版、認証ストア、コミュニティ再認可、通報、公開サービス。
- 認証遅延3条件、確認失敗、招待更新、hash除去2条件、スマホ16組の操作確認に成功。
- 新しい共通枠4条件：長い名前・省略・メニュー全文・Escapeフォーカス復帰・パネル境界・操作位置の安定・PC追随。初回のPC試験は本文末尾の親境界を無視した期待値を修正し、スクロール途中と末尾項目への到達を分けて確認。
- 古い名前込みaria-labelへのテスト依存を、安定したアカウントメニュー名＋本人名の内容確認へ修正。入力保持や失効の期待値は変更していない。
- 追加E2E 10件成功：共通枠4条件、会話・作成・投稿地点往復3条件、入力保持・通報3条件。型検査・変更箇所ESLint・public-kg本番形式build成功。

## 境界と残件

iPhone実機およびWindows OS操作によるキャプチャは未実施。画像と狭幅操作は隔離ブラウザ試験。実betaでは既存内容の読取りと遷移だけを確認する。本番・公開KG・収集・Kev・会員データの更新、招待送信は行わない。公開判断は利用者のbeta評価後。

## beta反映

- build: `4W6LbudnEndXyodmHzyJc`。ローカル3200と外部HTTPS `/communities` は200。外部HTML内のbuild識別子も一致。
- ログイン済み実betaで、初回確認中→本人表示、設定→招待、サイトメニュー→元のPLUTO Graph（4 Entity／6 Claim・倍率91%）、Graph→コミュニティ一覧→個別→会話→Back→一覧を読取り操作で確認。hashを除いた一覧復帰も停止しない。
- betaのcommunity・membership・thread・post・member_capsuleについて反映前後の件数と全行ハッシュが一致。本人の投稿・設定・招待は更新していない。
- 復旧用旧build `cqrHmhxZop6_6hxyC4-Oh` は `backups/community-shell-prebuild-20261024/.next-public` に保持。必要時はbetaの実行PIDを確認して停止し、このbuildを `.next-public` に戻して既存起動スクリプトで起動する。DBの復旧操作は不要。
- 所要時間：約30分（変更・共通化／資料と画像比較、隔離試験と再試験、build・反映・実beta確認を含む）。全件試験・本番反映は実施しない。