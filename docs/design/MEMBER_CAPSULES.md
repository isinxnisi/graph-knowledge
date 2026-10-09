# 会員Capsule保存：初回の縦経路

2026-10-09採用、**継続中：会員保存・再閲覧UIを接続**。実OIDC／専用PostgreSQLで、Explorer→明示保存→別ブラウザ再訪→現在の根拠を試せる段階。会員Capsuleの編集画面・プロフィール設定、Google実接続・人間受入は未了。

## 選択と操作経路

Capsule編集の初回は完了している。編集の細部、直接閲覧の拡張、会員保存を比較し、別ブラウザから本人の説明付き関係図へ戻る体験を優先する。共有／議論より先に、所有者とサーバーでの失効・更新競合を成立させる。

完成させる経路は、ExplorerのCapsule閲覧→会員保存入口→ログイン→選んだ内容だけをアカウントへ保存→別ブラウザ／reload→本人の一覧・内容→現在のClaim／Source→Explorer。ログインだけでブラウザ保存を送信しない。元の保存を残し、所在を表示する。ブラウザの保存ビュー・探索途中保存は今回の対象外。

初回の基準はmain側のアカウント・所有者設計（`/home/isinxnisi/1.projects/7.graph-knowledge/docs/design/ACCOUNT_AND_OWNERSHIP_DESIGN.md`）を読み取り専用で参照したもの（worktreeには未反映）。本書が今回の狭い採用契約。[Capsule構想](CAPSULE_AND_USER_CONTRIBUTION_VISION.md)と[ブラウザ内Capsule](LOCAL_CAPSULES.md)の意味境界を維持する。

## 今回の実装と未実装

- Better Auth 1.7.7＋pg 8.23.1＋専用PostgreSQL。一般のKG探索・Neo4j・既存ブラウザ保存は不変。
- 実Google設定がない通常起動では会員機能は無効、会員APIは503。UIは利用不可と表示し、ログインボタンを出さない。公開capability `/api/member/status` は設定済みprovider種別だけを返し、credentialやsessionを含めない。
- 認証開始→OIDC callback→DB session→本人の作成／一覧／読取／更新／削除をRoute Handlerで実装した。現在のUserの限定DTO取得、ログアウト、全session失効も提供する。
- 開発・テスト限定の署名付きOIDC issuerを使い、ライブラリ自身のnonce・issuer・PKCE・state・cookieと実DBを通す。User IDを直接渡すログインAPIは作らない。
- `/member` で登録／ログイン、現在の表示名・locale、明示保存、本人一覧・読取・確認削除、ログアウト・確認付き全端末ログアウトを接続。現在KGの再解決は既存Capsule Readerを使う。
- 会員Capsuleの編集UI、設定UI（表示名／locale）、実Google、公開・共有・議論・退会は未実装。サーバー更新APIは前回から維持する。

## identity・session・認可

UserはUUID、KG Personとは別。provider設定名と外部subjectの組をDB一意制約にし、メール一致によるaccount linkingを無効化する。同メールで別subjectのログインは拒否する。User.active／localeは認証入力から更新不可。private操作のたびにDB sessionと現在のactiveを確認し、所有者で全問い合わせを制約する。URL・JSONからownerを受け取らない。運営停止APIはまだなく、active=falseは既存sessionによるprivate操作と新session生成を拒否する。運営停止を正式提供する時には全session削除も一つの操作へ含める。

sessionは7日、更新間隔1日。cookie cacheなし、HttpOnly／SameSite=Lax、HTTPS時Secure、明示cookie prefix。OAuth stateはDB、state cookie検査とCSRF／Origin検査はテスト時も有効。provider tokenは本人確認後にDB hookで破棄し、account cookieを作らない。暗号化設定も有効にするが、初回にprovider API用tokenを保持する必要はない。認証ログへpayloadや接続情報を出さない。

認証routeはGETのget-session／callback／error、POSTのsign-in/social／sign-out／revoke-sessionsだけを許す。開始入力はprovider・callbackURL・任意disableRedirectに限定し、追加scope・直接token・任意providerパラメータを拒否する。callbackURLはライブラリで同originまたは相対pathへ検証。private変更APIは完全一致Originを必須にする。レスポンスはprivate, no-store／Vary: Cookie。非所有者と不存在は同じ404、未認証・停止・失効は401。DB不通は503で、認証失敗と混同しない。初回のschema確認失敗も503にし、失敗した認証instance／poolを破棄して復旧後に再初期化する。

## 保存形式とAPI

`/api/member/profile` GETはid/name/localeのみ。`/api/member/capsules` GET/POST、`/api/member/capsules/:id` GET/PUT/DELETE。すべて実行環境のdatasetに限定する。

POST入力は`{requestId, content}`。contentはdataset/title/note/language/entityIds/claimIdsだけ。ローカル形式を丸ごと受け入れず、owner・ID・版・時刻・受入属性を拒否する。サーバーはUUID、schemaVersion=1、revision=1、作成／更新日時を付与する。languageは既存初回と同じja。題名80文字、説明4000文字、30対象／60主張、datasetごと10件。本文はstreamで32,000 bytesまで。UUIDを小文字へ正規化し重複を拒否する。

明示構成だけをJSONBへ保存し、KG本文・出典全文・表示束ID・cursor・Graph通信状態を複製しない。説明をKG Claimへ変換せず、対象の共存から関係を生成しない。構文として正しい参照は現在KGが取得不能でも保持できる。今回のAPIは参照の実在・端点を保証しない。閲覧UIが既存Capsuleの再解決で失効・取得失敗・端点不一致を示す。内容版はKG履歴の固定ではない。

PUTは`{expectedRevision, content}`、DELETEは`{expectedRevision}`。所有者・dataset・期待版をSQLの条件へ含め、競合は409。更新成功時のみ版を一つ進める。過去版保存は未実装。POSTはUser行lock下で件数・request IDを検証し、複数processでの同時作成も上限を越えない。同じUserの同じrequest ID・同内容の再送は200で現在の同Capsuleを返し、新規は201。別内容は409。他Userのrequest IDと重複解決しない。削除後もIDとdigestだけのreceiptを残し、古い再送を409として復活させない。receiptの期限・頻度制限は公開前に別途設計する。

## 設定・migration・戻し方

通常は`MEMBER_STORAGE_ENABLED`を指定しない。Googleを実接続する段階でMEMBER_ORIGIN（HTTPSのorigin）、MEMBER_DATABASE_URL（専用運営DB）、MEMBER_AUTH_SECRET（32文字以上の生成値）、MEMBER_COOKIE_PREFIX（gk-から始まる環境固有値）、MEMBER_AUTH_PROVIDER=google、MEMBER_GOOGLE_CLIENT_ID／SECRETを設定する。実credential・外部公開は今回実施していない。同じhostnameの別portでもcookieは分離されないので、環境ごとにprefix／secret／DBを分ける。

fixtureはNODE_ENVがproduction以外、MEMBER_FIXTURE_ENABLED=1、固定loopback origin 3221／issuer 3222、DB 55432/graph_member_test、専用cookie prefixのすべてを要求する。productionでは拒否する。fixture issuerはtests/supportにあり製品routeに含まれない。

`db/member/000-auth.sql`は固定版Better Authの正式schemaから生成、`001-capsules.sql`は内容・receipt・identity一意制約の追加。`npm run member:migrate`を設定済み専用DBへ明示実行する。起動時のmigrationはない。transaction＋advisory lock、適用済みSQLのchecksum照合、再実行無変更。既存KGやローカル形式を移行しない。戻す時は機能を無効化して追加tableを保持する。自動DROP・重要データの破壊・元treeへのDB操作はしない。ライブラリ更新時はschema差分をレビューして新migrationを足す。

## 検証と根拠

`npm run test:member`は専用の名前を持つPostgreSQL 17 containerを一時起動し、180秒上限のVitest後にそのcontainerだけを破棄する。PGのデータはtmpfs、fixture credentialは実行時生成、hostの既存DBを使わない。fixture issuerもテスト後に閉じる。通常の`npm test`にはDBなしの入力・無効設定・本番fixture拒否を含める。

正式schemaとの整合・migration再実行、2 Userの登録と再ログイン、所有者偽装、他User拒否、nonce／issuer／state不一致、同メールの別identity、cookie偽造／環境混入、Origin／callback、同時再送／更新／上限、削除後再送、停止状態、ログアウト／全session失効、DB停止・回復・停止中の初回起動を実DBで確認した（17件）。このサーバー側チェックポイント時点ではブラウザUI・実KG参照・実Google接続・人間受入は検証範囲外だった。後続UI検証は下記。

導入時の確認元：[Better Auth Next.js接続](https://better-auth.com/docs/integrations/next)、[PostgreSQL](https://better-auth.com/docs/adapters/postgresql)、[OIDC](https://better-auth.com/docs/plugins/generic-oauth)、[account linking](https://better-auth.com/docs/concepts/users-accounts)、[session](https://better-auth.com/docs/concepts/session-management)。導入版の型・実装とインストール済みNext.jsのauthentication／Route Handlersガイドも照合した。

## 会員画面の採用契約（2026-10-09）

今回も編集細部・直接閲覧拡張・共有の新規着手と比較し、進行中の別ブラウザ再訪の縦経路を優先した。専用routeを使い、既存Explorerの探索state・Capsule authoringを会員状態へ従属させない。

- Capsule一覧の会員入口、または閲覧中の「この内容をアカウントへ保存」から `/member` を別タブで開く。元のタブへ戻れば探索Graph・条件・配置が残る。直接開いた利用者には新しい探索を開くリンクを用意する。会員Readerで対象を選び、その対象の閲覧リンクから別タブで関係探索へ進める。画面には現在のdataset（demoなら架空データ）を表示する。
- `?import=<local UUID>` は同origin・同datasetのブラウザ保存を選ぶだけで、送信命令ではない。認証redirect後も指定を保つ。送信前に題名・説明・構成件数と現在の利用者を確認する。localStorageは書き換えず、ログイン・一覧取得だけでは送信しない。
- 認証失敗はサーバーが固定する同origin `/member` へ戻す。有効な取込元／会員Capsule UUIDだけを保ち、生のproviderエラーは表示せず再ログインを案内する。任意の失敗時redirectは入力から受け取らない。
- 会員の内容を読む `?capsule=<server UUID>` は現在版の本人専用参照であり、共有リンクではない。毎回サーバー認可を通し、別利用者・削除済みは404。ID以外の内容はURLへ入れない。環境のdatasetから外れた応答を描画しない。
- 会員DTOは画面メモリだけに置く。タブ非表示時にprivate表示と取得を破棄し、復帰／bfcache復帰時は本人と内容を再取得する。明示ログアウトは他タブへ内容を含まない通知を送り、再確認させる。サーバーでの失効は次のprivate要求／タブ復帰に反映される。
- UI要求の `X-Member-User` は**期待する表示中利用者**でありowner指定ではない。サーバーはDB sessionの利用者を正本とし、不一致なら401。別タブのアカウント変更後に、以前確認した内容を新しい利用者へ誤保存しない。ログアウト／全端末ログアウトも同じ照合を行い、表示中と違う利用者のsessionを解除しない。従来のAPIクライアントはheader省略可で、認可は常にsession・active・ownerで実施する。
- 明示保存の前にsessionStorageへUser／dataset／local ID／内容版別のrequest IDと送信内容を保持する。応答消失・reload・再ログイン後の同じタブでの再送は同じrequest IDを使う。保持失敗・同版の内容不一致は送信しない。serverが再送を検出した場合は新規保存と区別し、処理済み操作の現在内容を表示していると明示する。別タブ・別ブラウザは別の明示コピー操作となり、自動重複排除／同期を約束しない。
- 取得・送信は15秒上限で、世代変更／非表示／unmount時に取消し、遅い応答を表示しない。送信中断はserver取消の保証ではなく、再送キーで結果を確認する。失効や停止でもブラウザ内の元の内容を保持する。
- 初回会員画面は読取と確認削除まで。削除は表示版を条件にし、409では新しい版を自動削除せず再確認を案内する。local編集の自動反映、会員内容のlocal自動コピー、会員編集・過去版復元は提供しない。
- UI文字列はlocale解決境界へ分離。日本語の初回であり、表示名・localeの変更画面は次の単位。`/member` はnoindex／nofollow、private APIはno-store。public KGの描画・dataset・DBに変更はない。

`npm run test:member:e2e` は既存の専用一時PG runnerを使い、明示migration・開発専用OIDCの本人選択画面・3221のNext dev・Playwrightを起動し、終了時に破棄する。全体10分、Playwright8分の上限。実Google・外部認証・本番DBへ接続せず、KG応答だけを既存fixtureで置き換える。実KG内容の受入を代替しない。

### このUI単位の検証

- 通常テスト453件（`npm test -- --maxWorkers=2`）成功。最終の会員client／Capsule関連60件も成功。
- `npm run test:member` 18件成功。期待利用者の不一致による保存・読取・ログアウト／全端末ログアウト拒否、既存のnonce／issuer／Origin／所有者／競合／DB停止と回復を実PGで確認。
- `npm run test:member:e2e` 5件成功。390/1440px、実OIDC・DB session、明示保存・reload・再送・別contextでの本人再訪・他人拒否・Claim／Source・対象から探索・元のGraph維持を確認。失効・応答消失・削除競合・削除後再送・全端末失効・無設定表示・認証失敗からの復帰も含む。
- 既存Capsule作成／編集と直接閲覧のE2E11件を確認（失敗修正後の対象3件再実行を含む）。既存テストはStrictModeで中断された要求を成功件数へ数えていたため、成功応答の回数と未選択Claimへの要求なしを分けた。製品の取得条件は変更していない。
- 初回のChromium起動は共有ライブラリ不足。既存の検証用LD_LIBRARY_PATHで解消し、製品設定へ固定していない。通常テストの全並列では既存UI2件が5秒を超過し、並列数2で全件成功。会員E2EはExplorerのclient初期化完了を待って操作する。
- 実行NodeはPATHの24.15.0（engines指定24.21.0との差は維持）。実Google・実KG接続のブラウザ検証・人間受入は未実施。実認証情報・公開運用の判断を代替しない。

- `npm run lint`、最終変更ESLint、型検査込み最終`npm run build`、最終`npx tsc --noEmit`、`git diff --check`が成功。productionでExplorer／memberが200、会員status／profile／capsulesが503・no-store、390pxの無設定画面にログインなし・横溢れなし・page errorなしを確認。専用PG／OIDC／Next dev／本番smokeサーバーは終了した。
