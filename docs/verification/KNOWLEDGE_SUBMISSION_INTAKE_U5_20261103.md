# U5途中：本人の投稿受付・Capsule選択・会員ライフサイクル

2026-11-03。[現行契約](../design/KNOWLEDGE_SUBMISSIONS_U5.md)。本人の草稿保存・版固定受付・編集・取消、保存済みCapsuleの項目選択取込を接続した。AIの永続job・原資料との照合・通常自動受理・公開・本人結果通知は次工程。受付をU5全体の完了と扱わない。

## 確認先と今回の範囲

日常確認先は `https://graph-beta.isinxnisi.com/member/submissions`。本記録の配置欄が完了するまで、当該URLの反映は未確認。

1. ログインして「知識を書く」。説明・出来事・具体的な関係、範囲・肯否・時期・根拠を入力し、草稿保存する。
2. 再訪して「この版を受付」、または未保存の変更から「保存して受付」。今回は「AI処理の接続待ち」と表示する。
3. 編集して保存すると新しい草稿になり、旧受付をその内容へ付け替えない。取消は確認後に行う。
4. 「Capsuleから」で本人の保存文書を選び、項目を最大20件選択して取り込む。本人のCapsule下部「知識を投稿」からも別タブで入れる。元の文書・共有範囲を変えない。

一般投稿から公開正本へ書く経路はまだ無い。今回、実投稿をGemini／Kevへ送信しない。0.8B任意助言、Gemini通常自動受理という採用済み方針は維持し、全件人手承認へ変更しない。

## 主な設計・認可

- 非公開投稿は会員DBの `member_knowledge` へ移す。共通知識DBとは分離し、認証したownerの現在user行を同じtransactionでlock・再確認する。
- 追加migration `db/member/020-knowledge-submissions.sql`。既存000〜019、知識001／002／先行試験003は書き換えない。003は先行の隔離検証の再現用で、βへ適用しない。
- `submissions`、不変`submission_revisions`、版固定`submission_receipts`、ownerごとの冪等`submission_requests`。HTTP要求の元文字列を保持し、正規化後の内容と分ける。
- Origin・session・active user・X-Member-User・本文stream上限を確認。owner／状態／collection権限を自己付与できない。他人と存在しないIDは同じ404、private no-store。
- CapsuleはID・保存版・選択keyからサーバーが本人の保存内容を捕捉する。古い版は409、同じ操作の再送は元の取得結果。未選択の自由メモ・関係・私有説明は含めない。
- 原記録／対象／資料の版、肯否・範囲・時期・具体語を保持。元記録は訂正候補として区別。作者noteやKG citationの解説を原資料の引用へ読み替えず、抜粋が無ければ空として補足可能にする。
- 停止はDB triggerで受付・草稿を取消。再開しても旧受付を復活しない。退会はuser FKで本文・捕捉断面・再送応答・receiptをcascade削除する。別DBへの消去の取りこぼしを作らない。
- 保存数・版数・容量・短時間の操作数／受付数を有界化し、操作制限中も取消できる。通信結果不明では入力を保ち同じ操作IDで再試行する。読取だけで日時・順序を変更しない。

## 検証

- 使い捨てPostgreSQL＋実テストOIDCで9試験成功。本人分離、別session／Origin、自己権限付与拒否、元文字列、同時再送／同時編集、受付後の再編集、Capsuleの版・選択捕捉、元Capsule不変、制限中取消、停止との競合、退会消去を確認。
- 同じ使い捨てDBをdumpし、別DBへ復元して38テーブルの行fingerprint一致、020を含む再適用で不変を確認。これはβの実会員DBでの退会操作ではない。
- 新UI5試験で一操作での保存＋受付、曖昧な失敗の同一操作再試行、未完成の資料を外して草稿保存、取消確認、アカウント変更時のprivate DOM排除を確認。
- 選択捕捉3試験で取得版・肯否・範囲・時期・具体語、noteと引用の区別、不正・重複keyの拒否を確認。
- 既存Studioの回帰では矢印反転の1件が5秒timeoutになった。方向編集の実装は変更しておらず、対象を絞った再実行では3.424秒で成功した。他51件の成功と合わせて機能回帰を確認し、timeoutを成功扱いにはしていない。TypeScriptと変更TSのESLintも成功。先行prototype repositoryは11試験と12表の別DB復元・再適用で回帰確認した。βの実操作は下記へ追記する。

再検証は `.local/issue75/node node_modules/tsx/dist/cli.mjs scripts/test-member.ts --submissions`（PATHに同nodeのdirectoryを含める）。専用の一時PG containerだけを作り、終了時にそのcontainerだけを削除する。dumpは作業worktreeの `.local/u5-member/` に残す。実GoogleやiPhoneでの確認とfixtureを区別する。

## 配置・保全・残件

開始時main `c49a7f25`、作業branch `codex/issue75-theme-foundation` の `d799f785`。mainの未追跡memo.txtと並行作業を保持。無関係な自動開発候補を取り込まない。共通hold・token review／assertで変更・検証を保護する。

現在は配置準備中。βの既存会員DBをfresh backup・別DB復元し、元の行・000〜019 checksumを保ったうえで追加020を適用する。Google認証・Cookie・会員・Capsule・コミュニティ・通常KG・知識DB・AI artifactは引き継ぐ。本番VPSはU8であり更新しない。

U5の残りは基本あと2回程度の推定。永続job・利用量・0.8B任意助言・Gemini・原資料照合・自動受理transaction・公開／通知と、実会員の総合確認を接続する。今回の「受付済み」はAI審査通過や公開の意味ではない。
