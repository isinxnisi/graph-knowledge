# 共有したCapsuleの版について会話する

2026-10-10採用。ローカルの2 User検証を対象にする。実provider、外部公開、通報・運営対応の完成を意味しない。[コミュニティの初回設計](COMMUNITY_VERTICAL_SLICES.md)、[限定リンク](CAPSULE_LINK_SHARING.md)を具体化する。

## 選択と操作経路

共有初回は受入済み。共有旧版の本人再閲覧、新参照追加と比較し、他人と根拠を確認しながら話す新しい体験を優先した。

本人が会員Capsuleの版を共有 →「この版のコメントを見る」→ 明示して「投稿を受け付ける」→ 同じリンクを持つ別Userがログインして投稿 → 作成者が回答 → 両者が同じ画面の独立Claim／Source・Explorerへ戻る。匿名は読取だけ、ログインは既存 `/member` を別タブで開く。tokenをログインcallbackへ渡さない。

- スレッドはCapsule UUIDに一つ。投稿は短いplain text、表示名、日時、投稿時の内容revision。返信階層、編集、通知、リアクションは含めない。
- 受付は既定で停止。既存リンクに書込権限を黙って追加せず、所有者が明示して開始／停止する。受付状態はCapsule全体で共通し、版更新・再発行では変更しない。
- 初回画面は**閲覧中の一版だけ**を表示する。別版の投稿を新しい内容への意見として見せず、別版の一覧・件数を応答に含めない。常に「他の版の投稿はここには表示しない」と説明する。
- 本人の会員画面でも共有snapshotが存在する版だけ対象。共有したことのないprivate版ではコメントを取得できない。共有済み旧版は会員画面の「共有した版を選ぶ」から本文と一緒に再閲覧できる（下記）。APIは本人の明示revision指定による過去共有版の読取に対応する。
- 投稿やCapsuleの説明は意見・文脈であり、KG Claim／Citation／Source、肯否、Global受入を生成・変更しない。

## 保存・追加migration

`003-capsule-discussion.sql` だけを追加する。既存migration／KG／凍結datasetを変更しない。

`member_capsule_thread(capsule_id, closed)` と `member_capsule_post` をPostgreSQLへ置く。postはserver UUID、Capsule＋revision外部キー、author User、request UUID、内容hash、本文、作成日時、撤回日時を持つ。名前は現在のUser profileから解決し、メール・認証identity・他者のUser UUIDを公開しない。KG PersonとUserは別。

投稿時の版はimmutableな `member_capsule_revision` に限定。全private編集を履歴化しない。Capsule削除ではthread/postもcascade削除。投稿者Userの物理削除は外部キーで拒否する。退会・匿名化・保持の方針と実装は公開前に別途定め、意図せず会話全体を消すcascadeにはしない。

撤回は本文をNULLにし、撤回時刻を保持する。読取では表示名も伏せる。停止Userの投稿も本文と名前を返さず、一般的な非表示表示にする。内部のauthorと再送用hashは残すため、これを個人情報削除要求の完了とは扱わない。

戻す場合は新UI／APIを停止して追加tableを保持できる。破壊的な自動rollbackは行わない。

## 認可・API

`/api/capsules/:id/discussion`。すべてno-store／noindex／no-referrer、VaryはCookie・token・期待User。

| 操作 | 契約 |
| --- | --- |
| GET `?revision=N` | 有効なowner session、またはそのCapsule＋版に一致する有効token。匿名可。停止owner・別dataset・失効token・非共有版は404。ownerは自分の過去共有snapshotを指定可 |
| POST | 有効session＋上記読取認可＋受付中。`requestId, revision, body` だけを受理。authorをclientから受け付けない |
| PATCH | owner sessionのみ。`closed, expectedClosed` を照合し、古い状態は409。tokenだけでは不可 |
| DELETE | 有効sessionの投稿者のみ。`postId` で自分の本文を撤回。ownerにも他人の撤回権限を与えない |

変更には一致Originが必須。画面は期待User headerを送り、別人へsessionが変わった投稿を401にする。GETで期待Userを指定した401は匿名へfallbackしない。匿名で開く場合だけsessionなしを許し、DB障害は503のままにする。

すべての投稿・停止・撤回はCapsule行lockで共有発行／失効・private更新・削除と直列化する。読取も同じ行の共有lock内で認可と版別抽出を行う。投稿者のUser行lockでactiveと全Capsuleにまたがる頻度を確認する。

本文はtrim後1〜2,000 UTF-16文字以内。1人につき1分5投稿、Capsule全体200投稿まで（過去版・撤回も数える）。上限は新規投稿だけに作用し、閲覧・撤回は可能。再送はauthor＋request UUIDで同一対象／版／本文なら既存post IDを返し、異内容は409。受付停止後でも受理済み同一投稿の結果確認はできる。撤回済み本文を再送で復活させない。

撤回はリンク失効／受付停止／owner停止後も作者から可能。既知post IDへの撤回APIは内容の読取を許可しない。失効リンクからはページ自体を閉じる。本人は会員画面の投稿一覧から自分の本文を確認・撤回できる（末尾の採用契約）。存在しない／他者postは同じ404。

## 画面の寿命と失敗

コメントは明示して開き、初期閲覧では追加通信しない。表示中30秒ごと、明示再確認、タブ復帰、会員変更通知で認可を取り直す。親の共有Readerも従来どおりtokenを再確認する。非表示・認可失敗で本文を閉じ、取消後の応答を描画しない。会員画面ではコメントの401も親へ通知し、同じ画面のprivate閲覧を閉じる。各要求15秒上限。

未送信入力と結果不明の投稿キーは、タブ内メモリにCapsule＋revision＋Userで拘束して保持する。非表示・401・別Userには入力を見せず、同じ本人の再確認後に戻す。永続storageには保存しない。reloadで消えることを表示し、表示中の入力があれば離脱確認を付ける。

POSTの結果不明では本文を編集不可にし、明示した同一内容・同一キーの再送だけを提供する。自動再送はしない。初回の確定拒否では入力を維持して修正可。結果不明後の再送が401／404等で拒否されても、先の受理を否定できないため元のキーと本文を維持する。受付状態の更新や撤回が不明なら再確認する。既取得の画面・コピーは回収できない。

## 検証と次の段階

実OIDC／一時PGで2 User、匿名、Origin、期待User、非共有版、版更新／token失効、作者のみ撤回、所有者のみ受付制御、再送、同時上限、停止User、別dataset、削除cascade、migration再適用を確認する。UIでは実ログインから会話・根拠・探索・撤回・停止までを390／1440pxで確認する。

公開前の通報・運営非表示／監査、アクセス自体の頻度制御、保持・退会は残る。実Google・実KGとの組合せ、人間受入、外部公開はこのローカル検証では完了しない。

### 実施結果

- `npm test -- --maxWorkers=2`：473件成功。その後、会員失効を親へ通知する1件を追加し、最終の会話・共有・会員UI16件が成功した。結果不明後の401でも同一キーを保持し、別Userへの草稿漏れを防ぐ。
- 最終 `npm run test:member`：実OIDC・一時PostgreSQL22件成功。既定停止、2 User、Origin・期待User、private／別版／別dataset、停止User、再送・同時上限、撤回・削除cascade、migration再適用を含む。
- `npm run test:member:e2e -- --grep 共有版のコメント`：390／1440pxの2件成功。匿名→別タブの実ログイン→本人と別Userの会話→独立Claim／Source→本人撤回→所有者停止を確認。両幅を目視し、横溢れ・page errorなし。KG応答はfixtureで、実Google／実KGの受入ではない。
- 初回の全並列単体は既存8件が時間切れ、並列数2で解消した。ブラウザ初回は既存の検証用共有ライブラリ指定で起動できた。次の試行では2人目のログイン復帰と120秒の予算で失敗し、popupの前面復帰、不要なreloadを明示再確認へ置換、route preflightと新規経路だけ240秒の上限に整理して成功した。runner・全体の時間上限・cleanupは変更しない。
- 型検査の最初の障害は既存の壊れた未追跡生成validatorだったため、それだけを除去して再生成した。実装テストのheader型も修正し、`tsc --noEmit --incremental false` は成功した。全体lintと最終変更箇所のlint、型検査込みbuild・差分検査も成功。本番smokeでExplorer／member／sharedの200、無設定コメントAPIの503、共有・コメントのno-store／noindex／no-referrerを確認した。検証用PG・OIDC・Next dev・本番smokeサーバーは終了。

## 所有者が共有済みの版へ戻る（2026-10-10追加）

新参照追加、失効後の本人投稿管理と比較し、内容更新後に以前の説明と会話へ戻れない具体的な障害を優先した。保存済み共有snapshotを使い、DB・KG・共有tokenの認可を変更しない。

会員Capsule →「共有した版を選ぶ」→ 共有済みの版の一覧 → 一版の説明・Graph・コメント → 個別Claim／Source・探索、または「現在の保存内容へ戻る」。共有停止後も所有者は読み返せる。未共有のprivate過去版を履歴化・復元する機能ではない。

- 所有者専用 `GET /api/member/capsules/:id/revisions` は共有snapshotだけを新しい版順で返す。最大50版、各要素はrevision・当時の題名・内容更新日時のみ。日時を共有発行日時と呼ばない。
- 同routeの `?revision=N` はその共有snapshot一件だけを返す。現在版APIと分け、未共有版／不存在／非所有者／別datasetは404、sessionなし／停止User／期待User不一致は401。不正な版値・重複queryは400。tokenでこのAPIの権限を増やさない。
- 所有者・dataset・activeを同一SQLのsnapshot取得条件へ含める。共有失効は本人の履歴閲覧権を取り消さず、Capsule削除は従来どおりsnapshot／投稿も削除する。新migrationは不要。
- 会員URLの `capsule=UUID&revision=N` は所有者の再閲覧位置だけを指定する。reload・タブ復帰もその一版を再認可する。URL自体は共有権限を持たず、限定リンクの代わりにしない。
- 旧版の表示を明記し、編集・削除・共有発行は現在版へ戻ってから行う。現在版に戻る際も最新の保存を取得する。取得失敗を現在版への黙ったfallbackにせず、一覧と再確認を提供する。
- 参照先KGは現在データを読む。KG本文の歴史固定・過去版の複製／復元・旧版リンクの再発行は行わない。共有snapshotの閲覧だけで失効リンクを再開しない。
- 版の一覧は明示して取得する。本文・一覧は会員Readerと同じ寿命で非表示・アカウント通知時に消し、遅い応答を捨てる。永続browser storageへ保存しない。コメントは従来の表示中30秒ごとの再認可も維持する。
- 版の切替で入力を失わないよう、コメント草稿・結果不明キーは本人＋Capsule＋版別のタブ内メモリに保持する。一版の送信成功は他版の草稿を消さない。画面外に草稿が残る時もreload／離脱警告を維持する。版を戻して本人を確認後に入力を表示する。

初回では版差分・コメント数・最新コメント順・通知を追加しない。所有者以外の投稿者による失効後の投稿管理は、末尾の別経路で扱う。公開運営・実接続・実データの人間受入はこの変更に含めない。

### 旧版再閲覧の検証結果

- 通常単体480件成功（`npm test -- --maxWorkers=2`）。旧版URL・reload・現在版復帰、失敗時の非描画、別User／非表示時の隔離、遅い一覧応答の排除、版別の結果不明キー保持を含む。
- 実OIDC／一時PostgreSQL23件成功（`npm run test:member`）。共有した1・3版だけの一覧、未共有2・4版の拒否、本人以外／tokenだけ／期待User不一致／停止User／別datasetの拒否、リンク失効後の本人読取と削除後404を追加した。
- 新規E2E `npm run test:member:e2e -- --grep 共有済み旧版` は390／1440pxの2件成功。実認証→共有済み版選択→説明・版別コメント→版を跨ぐ草稿復帰→共有停止→同じ旧版のreload→独立Claim／Source→現在版へ復帰を確認した。両幅のスクリーンショットを目視し、横溢れ・page errorなし。KG応答はfixtureであり、実Google／実KG・人間受入の代用ではない。
- 初回E2Eは復元した本文を持つtextareaの `getByLabel(..., exact: true)` が要素を見つけられず、2件とも待機失敗した。独立した実ブラウザの最小HTMLでlabel検索0件・textboxのrole/name検索1件を確認し、検証をrole/nameへ修正した。待機時間や製品側の認可・入力保持は緩めていない。
- 最終の会員・共有・コメントUI22件、型検査、全体lint＋変更箇所lint、型検査込みbuild・差分検査も成功。本番smokeでExplorer／member／sharedの200、無設定の版一覧・版本文APIの503とno-storeを確認した。一時PG・OIDC・Next dev・本番smokeを終了し、検証portの解放を確認した。


## 失効後も自分の投稿を確認・撤回する（2026-10-10追加）

旧版再閲覧の初回は完了している。会員Capsuleへの新参照追加・版差分と比較し、リンク失効で自分の投稿を発見できず、既存の作者撤回APIに辿れない障害を優先した。

共有Reader（失効表示を含む）→「自分の投稿を確認・撤回」→ 会員ログイン →「自分の投稿を見る」→ 本人の文章・投稿時版・日時を確認 → 確認操作で撤回 → 同じ一覧・reloadで撤回済みを確認する。会員画面から直接開くこともできる。共有tokenを会員URL・callbackへ引き継がない。

- `GET /api/member/posts` はserver sessionの本人・active・実行datasetで絞る。匿名／停止User／期待User不一致は401。tokenだけでは許可しない。返すのはpost ID・Capsule ID・投稿時revision・本人の本文・作成／撤回日時だけ。所有者の題名・説明・KG参照・名前・他人の投稿・件数・リンクは取得しない。
- 共有停止／再発行・受付停止・所有者停止でも、activeな投稿者は自分の文章を管理できる。これはCapsuleや会話を再閲覧する認可ではない。所有者にも他人の投稿一覧を許可しない。別datasetの投稿は空、Capsule削除では既存cascadeにより一覧から消える。
- 新しい順に1ページ20件。`created_at DESC, id DESC` のkeyset cursorで前の投稿へ進み、ページを置き換える。先頭へ戻る操作を用意する。cursorは上限512文字で形式を検査し、不正／重複queryは400。cursorは権限を持たず、別人が使っても本人条件は不変。時刻はDBのmicrosecondを保持して同一millisecond内の投稿を飛ばさない。境界の投稿が削除されても続きの取得を可能にする。
- 撤回は既存 `DELETE /api/capsules/:id/discussion` を再利用し、期待UserとOrigin・作者を検査する。既存の冪等な本文NULL化・Capsule行lock・投稿者active確認は維持する。確認前に送信せず、結果不明では成功と表示／自動再送せず、一覧再確認から状態を判断する。削除済み／他人は同じ404。
- 一覧は明示取得し、永続storageへ保存しない。非表示・アカウント変更通知・bfcache復帰で消して再認可、取消後の遅い応答は捨てる。表示中30秒ごと・明示操作でも同じページを再確認する。401は親の会員画面へ通知し、private内容を閉じる。各要求15秒上限、全応答no-store／noindex／no-referrer、VaryはCookie・期待User。
- 本人の発言に他人の文章が引用されている場合も、その発言全体を本人の投稿として返す。本文撤回後は復元しない。撤回の時刻と内部の作者・hashは従来通り残り、個人情報削除要求・退会処理を完了したとは扱わない。
- 新migrationは不要。既存の作者＋作成時刻indexを使い、DB/schema・KG・凍結dataset・共有権限は不変。戻す場合は新一覧API／UI・入口だけを停止できる。初回では投稿検索、他人の会話へのアクセス復元、編集・通知・運営対応を追加しない。


### 本人投稿管理の検証結果

- 通常単体487件成功（`npm test -- --maxWorkers=2`）。ページ置換／同じcursorの再確認、撤回の確認・結果不明、期待User、非表示・別アカウント通知・取消後の遅い応答を含む。その後、本人一覧の401で処理中の会員保存も取消す回帰を追加し、最終の関連UI・境界23件が成功した。
- 実OIDC／一時PostgreSQL25件成功（`npm run test:member`）。共有失効・owner停止後の本人読取／撤回、匿名・別人・停止User・別dataset・Origin・期待User、削除後の消滅、43投稿の同時刻とmicrosecond境界、cursorの改変・重複・境界投稿の削除を確認した。
- `npm run test:member:e2e -- --grep 共有失効後も` は390／1440pxの2件成功。実2 Userで投稿→共有停止→失効画面の入口→本人の一覧→撤回の取消／確定→reload→所有者側でも本文NULL→ログアウトまで確認。両幅の画面を目視し、横溢れ・page errorなし。KG応答はfixtureで、実Google／実KGの組合せ・人間受入は未検証。
- 初回E2EはChromiumの `libnspr4.so` 不足で2件とも起動前に失敗。worktree内の既存検証用ライブラリを `LD_LIBRARY_PATH` に指定して再実行し成功した。製品設定・検証の時間上限を緩めていない。
- 型検査、全体lint＋最終変更箇所lint、型検査込み本番build、差分検査が成功。本番smokeで既存3ページ200、無設定の本人一覧／コメントAPI503とno-store／noindex／no-referrerを確認した。一時PG・OIDC・Next dev・本番smokeサーバーは終了し、検証portの解放も確認した。
