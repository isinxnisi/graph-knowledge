# 運営者の翻訳受付上限の是正（2026-11-15）

## 原因・経路・導入経緯

`submit_theme_translation` → `dispatchThemeRegistration`（既存接続・運営認可）→ `createThemeTranslationAuthoring` → `createKnowledgeSubmissionService(memberStore:true, trustedOrigin:operator-api)` の取得保存・submit受付に進む。

共通受付の`knowledge-submissions.ts`は、owner単位の`submission_receipts.submitted_at > now - 1 hour`を数え、20件あればsubmitを429／RATE_LIMITED／「受付上限です。時間をおいて再試行してください」で拒否していた。fieldや言語単位ではなく、新規受付（訂正も1受付）ごとの件数。同一requestId・同一内容の再送は既存応答を再利用する。失敗したsubmit直前までの取得保存が残る場合がある。

- `9f361560`（2026-11-03）：一般会員投稿の本人受付に20件／時を導入。
- `9cb0ac1e`（2026-11-09）：運営テーマへ訳文登録を追加し、共通のmemberStore受付を利用。
- `a9f2deaa`（2026-11-09）：システム投入と個人投稿の帰属を分離する際、20件の計数もsource_capsule.kindで運営／一般を別枠化したが、運営にも20件／時を残した。

したがって、現在は一般投稿の消費と合算ではないものの、一般投稿用の固定件数制限を運営にも適用している。API guideの`submissionsPerMemberHour:20`と実装は一致していたが、運営テーマ制作に必要な制限ではない。実装・文書に残っていた値を、利用者からの指定の証拠とは扱わない。AIの費用・利用量制御は原因ではない。本番／βの既存Appから変更前guideの20を実読取して確認した。

## 最小修正

- 20件／時の条件を、サーバー内部の`trustedOrigin:operator-api`では適用しない。現在このtrusted経路を生成する呼出元は運営訳文のauthoringだけ。
- アカウントが運営者という理由では免除しない。一般フォーム経由は運営者本人でも従来の20件／時を維持。入力本文からtrustedOriginを指定することはできない。
- 120新規受付操作／10分（取得保存・submit等を各1として数える）の短時間保護、128KB入力・項目ごとの文字数・未処理容量・取消・認証／運営権限／原文・文脈・版・公開可否・冪等性を保持。
- API guideは既存`submissionsPerMemberHour`をnull（運営訳文の時間あたり件数上限なし）とし、短時間保護とAI自動翻訳との違いを説明。新しい設定・運用・migrationを追加しない。
- 既存の受付・計数履歴・訳文・テーマ・Capsuleは更新・削除しない。同じrequestIdと内容で未完了受付の再送が可能になる。成功扱いへの書換えやAI審査の追加は行わない。

## 隔離検証

既存`test-member.ts --theme-translations`が作る専用tmpfs PostgreSQLの会員DB／知識DBで30件成功。既存環境DBへ接続せず、試験コンテナだけを終了・削除。

- 運営訳文を20件登録後、旧上限時と同じ保存済み受付状態から、同じrequestIdで21件目を再開・公開。22件目も公開。
- 同じownerの一般経路で20件まで受付、21件目は従来の429／受付上限。一般枠消費後にも運営経路は登録できる。
- 120操作／10分では運営にも従来の429／「少し待ってから操作してください」を返す。既に公開した同一requestIdの再送は新規受付を作らない。
- 非運営者、無関係なtarget、異なる固定内容版、運営権限喪失後の公開を拒否。MCP引数にtrustedOriginを混入してもdispatchされない。
- 運営のreview_jobs／review_attemptsは0。一般会員の従来の審査、原文・文脈・版チェックと旧受付の回復・取消を既存回帰で確認。
- 共通知識の原文・Theme版・固定snapshot・保存Capsuleと初期の訳文版が保持されることを確認。

変更箇所ESLint成功。ビルド／β反映／本番反映は後続の結果を追記する。既存の本番翻訳に試験登録は行わない。
