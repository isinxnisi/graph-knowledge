# 共有したCapsuleの版について会話する

2026-10-10採用。ローカルの2 User検証を対象にする。実provider、外部公開、通報・運営対応の完成を意味しない。[コミュニティの初回設計](COMMUNITY_VERTICAL_SLICES.md)、[限定リンク](CAPSULE_LINK_SHARING.md)を具体化する。

## 選択と操作経路

共有初回は受入済み。共有旧版の本人再閲覧、新参照追加と比較し、他人と根拠を確認しながら話す新しい体験を優先した。

本人が会員Capsuleの版を共有 →「この版のコメントを見る」→ 明示して「投稿を受け付ける」→ 同じリンクを持つ別Userがログインして投稿 → 作成者が回答 → 両者が同じ画面の独立Claim／Source・Explorerへ戻る。匿名は読取だけ、ログインは既存 `/member` を別タブで開く。tokenをログインcallbackへ渡さない。

- スレッドはCapsule UUIDに一つ。投稿は短いplain text、表示名、日時、投稿時の内容revision。返信階層、編集、通知、リアクションは含めない。
- 受付は既定で停止。既存リンクに書込権限を黙って追加せず、所有者が明示して開始／停止する。受付状態はCapsule全体で共通し、版更新・再発行では変更しない。
- 初回画面は**閲覧中の一版だけ**を表示する。別版の投稿を新しい内容への意見として見せず、別版の一覧・件数を応答に含めない。常に「他の版の投稿はここには表示しない」と説明する。
- 本人の会員画面でも共有snapshotが存在する版だけ対象。共有したことのないprivate版ではコメントを取得できない。共有済み旧版を選んで再閲覧するUIは次段階。APIは本人の明示revision指定による過去共有版の読取に対応する。
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

撤回はリンク失効／受付停止／owner停止後も作者から可能。既知post IDへの撤回APIは内容の読取を許可しない。失効リンクからはページ自体を閉じるため、失効後の本人投稿一覧・撤回UIは次段階。存在しない／他者postは同じ404。

## 画面の寿命と失敗

コメントは明示して開き、初期閲覧では追加通信しない。表示中30秒ごと、明示再確認、タブ復帰、会員変更通知で認可を取り直す。親の共有Readerも従来どおりtokenを再確認する。非表示・認可失敗で本文を閉じ、取消後の応答を描画しない。会員画面ではコメントの401も親へ通知し、同じ画面のprivate閲覧を閉じる。各要求15秒上限。

未送信入力と結果不明の投稿キーは、タブ内メモリにCapsule＋revision＋Userで拘束して保持する。非表示・401・別Userには入力を見せず、同じ本人の再確認後に戻す。永続storageには保存しない。reloadで消えることを表示し、表示中の入力があれば離脱確認を付ける。

POSTの結果不明では本文を編集不可にし、明示した同一内容・同一キーの再送だけを提供する。自動再送はしない。初回の確定拒否では入力を維持して修正可。結果不明後の再送が401／404等で拒否されても、先の受理を否定できないため元のキーと本文を維持する。受付状態の更新や撤回が不明なら再確認する。既取得の画面・コピーは回収できない。

## 検証と次の段階

実OIDC／一時PGで2 User、匿名、Origin、期待User、非共有版、版更新／token失効、作者のみ撤回、所有者のみ受付制御、再送、同時上限、停止User、別dataset、削除cascade、migration再適用を確認する。UIでは実ログインから会話・根拠・探索・撤回・停止までを390／1440pxで確認する。

共有旧版の本文を本人が再閲覧する入口、失効後の自分の投稿管理、公開前の通報・運営非表示／監査、アクセス自体の頻度制御、保持・退会は残る。実Google・実KGとの組合せ、人間受入、外部公開はこのローカル検証では完了しない。

### 実施結果

- `npm test -- --maxWorkers=2`：473件成功。その後、会員失効を親へ通知する1件を追加し、最終の会話・共有・会員UI16件が成功した。結果不明後の401でも同一キーを保持し、別Userへの草稿漏れを防ぐ。
- 最終 `npm run test:member`：実OIDC・一時PostgreSQL22件成功。既定停止、2 User、Origin・期待User、private／別版／別dataset、停止User、再送・同時上限、撤回・削除cascade、migration再適用を含む。
- `npm run test:member:e2e -- --grep 共有版のコメント`：390／1440pxの2件成功。匿名→別タブの実ログイン→本人と別Userの会話→独立Claim／Source→本人撤回→所有者停止を確認。両幅を目視し、横溢れ・page errorなし。KG応答はfixtureで、実Google／実KGの受入ではない。
- 初回の全並列単体は既存8件が時間切れ、並列数2で解消した。ブラウザ初回は既存の検証用共有ライブラリ指定で起動できた。次の試行では2人目のログイン復帰と120秒の予算で失敗し、popupの前面復帰、不要なreloadを明示再確認へ置換、route preflightと新規経路だけ240秒の上限に整理して成功した。runner・全体の時間上限・cleanupは変更しない。
- 型検査の最初の障害は既存の壊れた未追跡生成validatorだったため、それだけを除去して再生成した。実装テストのheader型も修正し、`tsc --noEmit --incremental false` は成功した。全体lintと最終変更箇所のlint、型検査込みbuild・差分検査も成功。本番smokeでExplorer／member／sharedの200、無設定コメントAPIの503、共有・コメントのno-store／noindex／no-referrerを確認した。検証用PG・OIDC・Next dev・本番smokeサーバーは終了。
