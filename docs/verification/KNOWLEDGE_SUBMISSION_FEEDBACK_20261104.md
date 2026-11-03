# 知識投稿の結果・未読通知と送信先同意（2026-11-04）

今回の申請修正のうち、通知・状態・同意の確認記録。βへの配置・実Google操作の結果は統合側の記録へ追記する。この記録だけでは配置完了を意味しない。

## 契約

- 「受付済み」は公開結果ではない。確認待ち、確認中、補足が必要、処理再開待ち、公開結果を区別する。確認結果は編集フォーム上の独立カードで読み、詳細は折りたたむ。
- 結果は受付時の固定版に属する。新草稿の保存・取消後も元の受付版を選んで読める。現在の入力へ旧結果を付け替えない。
- サイト内未読は投稿単位の件数。補足要求・不受理・運営側での処理確認待ち・公開結果が対象。通常の待機・再試行や単なるGETは未読を消費しない。
- `GET /api/member/knowledge-submissions/feedback` は本文を含まない未読summary、`?submissionId=&revision=` は本人の固定受付版と結果。GETで既読化しない。
- `POST {action:"acknowledge",submissionId,revision,throughEventId}` が、画面で読んだ結果のcursorだけを既読にする。古いcursorの再送で既読が逆行せず、後から到着した結果を消さない。同じ投稿のevent ID割当をtransaction内で直列化し、未commitの小IDが後の既読cursorへ巻き込まれるのを防ぐ。
- 同意目的文からプロバイダ名を分離しても、実送信先とデータ扱いは隠さない。現行Gemini無料APIの既存同意版は変更せず、受付authorization/jobへ提供元profile IDを固定する。送信前のclaim/canSendと応答finishも固定値を照合し、別プロバイダへ既存同意を流用しない。プロバイダ追加・課金・実AI送信は行っていない。
- 通知summaryは本人・認証世代ごとに共有し60秒以内は再利用する。認証profileの5分cacheを変更しない。通信失敗では取得済み表示と入力を保持し、別本人・ログアウト前の遅い応答は捨てる。

## DB

追加member migrationは024。適用済み020〜022は変更しない。`review_authorizations/review_jobs.consent_profile_id`、重複を抑止する`feedback_events`、受付版ごとの`feedback_seen`を追加。退会・投稿削除は既存FKから連鎖し、本文の別コピーを通知表に残さない。

## 確認

- ドメイン・共有通知store・結果カードのunit：19件。状態集計、公開と確認のみの区別、提供元同意、1 flight、通信失敗時保持、認証世代、表示cursorに限定した既読化、同一保存版の受付後更新、固定受付版URLと本人用リンク、遅い通信での結果取得の一本化、常時見える公開先リンクを対象。公開した内容版を表示し、リンクが読むのは現在の公開Recordと明記する。
- 既存共有認証storeのunit：11件を同時実行し通過。認証の5分cacheと入力を消さない境界を維持。
- `scripts/test-member.ts --submissions --feedback`：専用一時PostgreSQLと署名付きOIDC fixtureで通知6件・旧受付送信前検査1件、公開投稿者・貢献履歴8件の計15件通過。実Googleの確認ではない。000〜025を通常migration関数で二度適用し、ledgerのchecksum不変も確認。
- 実PGではowner/Origin/expected-user、GETの無副作用、結果重複抑止、既読の冪等・逆行防止、新結果の未読保持、新草稿・取消後の旧受付、並行jobのcommit順、cascadeと他owner分離を確認。
- 公開投稿者・貢献履歴の会員DBは実PG、KGの公開資格はfixture。非公開Record/Entity/Theme、テーマ指定版より新しいRecordの除外、匿名の人物・private ID非投影、timeline_public=false、照合中のアカウント無効化、私有投稿削除・退会後の公開イベント保持を確認。KG自体の公開ゲート実装は既存の別検証対象で、このテストで実KG接続したとは扱わない。
- 貢献履歴UIのunit3件。handleごとのcursor分離、非公開化を追加読込で受けた際の既存表示消去、旧handleの遅い応答破棄を確認。
- 所有ファイルのESLint通過。全体の型・build・実ブラウザおよび配置は統合作業で確認する。

## 旧受付と送信前の再検証

旧v1の未処理jobを、新しい申請対象の契約を満たさないままAIへ送らない。worker claimで共通の申請条件を検査し、投稿先・操作が不足する場合はquotaや送信attemptを作る前に`needs-changes`へ戻す。受付の本文・raw入力・digest・同意を裏で書き換えず、新草稿で選び直す案内を残す。独立PGでは旧v1の2jobが未送信・課金予約0のまま補足待ちとなり、元の受付が不変であることを確認した。
