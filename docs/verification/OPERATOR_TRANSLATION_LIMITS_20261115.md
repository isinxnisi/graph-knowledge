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

変更箇所ESLint・`git diff --check`・本番image／βのwebpack build成功。既存の本番翻訳に試験登録は行わない。

## β反映と本番資材

- アプリ固定source `17d1dbb7427771892f657e15d25804b3024cffec`（mainへ通常push済み）。差分の他のcommitは直前の受入済み関連テーマ公開の手順・結果文書のみ。
- ローカル3200／HTTPS β build `GgNdmpefHACEPXTmTyvWv`。public-kg revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` を確認。
- 既存β ChatGPT Appの `get_theme_authoring_guide` を実際に呼び、`translations.limits.submissionsPerMemberHour:null` と120新規操作／10分の説明を読取。App ID・scope・endpoint・操作引数は変更していない。既存の翻訳・テーマへ試験書込みはしていない。
- 本番用build `_m89624VY6pZia_8LYV6p`、Web config ID `sha256:40b2d33ccc73c5ea3a40197cd9da8c9c310a6f1b66becba71421719b669468db`。本番用の空seedを持つDockerfileの同一固定sourceから構築。archiveのconfig・全layerとsource labelを照合し、VPSへ転送したSHA-256照合も成功。
- `scripts/release-operator-translation-limits-production.py` はWebのみ更新。DB移行・データ補修・Worker／OS／設定変更はしない。直前0267d4efのbackup Composeを固定hashで照合し、そのWeb tagだけを置換した内容と現行Compose全文が一致することを要求する。既存env hash・稼働image／build・会員44／知識9 migration checksumを改めて照合。不一致では切替に進まない。
- 設定backup後にWebだけを切替。readiness・他container ID・env・migration・既存訳文版の全保持を照合する。既存訳文のchecksumは非公開のメモリ内で扱い、新版追加は許容するが旧版の改変・欠落は拒否する。隔離PGでこの保持照合SQLを確認。失敗時は互換性のある直前WebとComposeだけを戻し、DB dumpは戻さない。
- 実行用：`backups/operator-translation-limits-20261115/run-release.py`（ignored/private資材）。本番 `sudo -n true` はパスワード要求のため本人が実行し、下記の切替・正式確認まで完了した。

## 本番反映・正式Appの確認完了（2026-11-15）

- 本人sudo実行により、固定source `17d1dbb7427771892f657e15d25804b3024cffec`／build `_m89624VY6pZia_8LYV6p` へWebのみ切替。稼働containerd manifest ID `sha256:f9178ff416a701ee39c93bf41a148a97f07e8a49b1225e450681fd851069d0c9` は、照合済みarchiveとconfig／全layerが一致する。同一imageのconfig IDは上記40b2d33c。
- VPSの正式receiptをSSHで回収・照合。既存訳文62版の全checksum、会員44／知識9のmigration、Worker／PG／KGのcontainer、private設定、AI artifactを保持。DB migration・訳文／テーマの書換え・AI送信・Worker更新なし。
- 正式HTTPS `/api/publication/compatibility` のbuild一致、`/api/dataset` のpublic-kg revision `f5dbf83f-c89e-4e40-95ee-57957016089f` を確認。既存5テーマの固定版とsnapshotを正式Webから読み、直前リリースのhashと全件一致した。
- **既存の本番ChatGPT App**から `get_theme_authoring_guide` を実呼出しし、`translations.limits.submissionsPerMemberHour:null`、120新規受付操作／10分、一般投稿は変更しない旨、運営訳文のAI審査／AI quotaなしの説明を取得。App再作成・再同意・scope変更は不要。
- 本番への21件以上の試験訳文登録は行っていない（22件の公開と上限時の同一requestId再開は隔離DBで検証）。既存テーマ・訳文・Capsuleの内容を変更せず、ChatGPTから通常登録を再開できる。
- backup：`/opt/graph-knowledge/backups/translation-limits-web-20261115T143159Z`。直前Web／Composeによる互換復旧が可能。DB dumpの機械的巻戻しは行わない。
- 修正 `17d1dbb7`、β確認・本番手順 `cf4bc429` をmainへ通常push済み。今回の最終変更はこの完了記録だけで、再buildは不要。β／正式とも同じ修正sourceを配置済み。機能上の残件なし。本番の実翻訳書込みは利用再開時の確認として区別する。
