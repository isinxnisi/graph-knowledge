# 会員Capsule保存：初回の縦経路

2026-10-09採用、**継続中：認証・所有者付き保存APIのチェックポイント**。ログイン画面・Explorerからの明示保存・会員一覧／再閲覧は次の実装単位。会員体験の完成・Google実接続・人間受入ではない。

## 選択と操作経路

Capsule編集の初回は完了している。編集の細部、直接閲覧の拡張、会員保存を比較し、別ブラウザから本人の説明付き関係図へ戻る体験を優先する。共有／議論より先に、所有者とサーバーでの失効・更新競合を成立させる。

完成させる経路は、ExplorerのCapsule閲覧→会員保存入口→ログイン→選んだ内容だけをアカウントへ保存→別ブラウザ／reload→本人の一覧・内容→現在のClaim／Source→Explorer。ログインだけでブラウザ保存を送信しない。元の保存を残し、所在を表示する。ブラウザの保存ビュー・探索途中保存は今回の対象外。

初回の基準はmain側のアカウント・所有者設計（`/home/isinxnisi/1.projects/7.graph-knowledge/docs/design/ACCOUNT_AND_OWNERSHIP_DESIGN.md`）を読み取り専用で参照したもの（worktreeには未反映）。本書が今回の狭い採用契約。[Capsule構想](CAPSULE_AND_USER_CONTRIBUTION_VISION.md)と[ブラウザ内Capsule](LOCAL_CAPSULES.md)の意味境界を維持する。

## 今回の実装と未実装

- Better Auth 1.7.7＋pg 8.23.1＋専用PostgreSQL。一般のKG探索・Neo4j・既存ブラウザ保存は不変。
- 実Google設定がない通常起動では会員機能は無効、会員APIは503。本物に見せかけたログイン画面は置かない。UIはまだない。
- 認証開始→OIDC callback→DB session→本人の作成／一覧／読取／更新／削除をRoute Handlerで実装した。現在のUserの限定DTO取得、ログアウト、全session失効も提供する。
- 開発・テスト限定の署名付きOIDC issuerを使い、ライブラリ自身のnonce・issuer・PKCE・state・cookieと実DBを通す。User IDを直接渡すログインAPIは作らない。
- 次は上記操作経路のUI接続・現在KGの再解決・390/1440pxと二つのブラウザのE2E。設定UI（表示名／locale）、実Google、公開・共有・議論・退会は未実装。

## identity・session・認可

UserはUUID、KG Personとは別。provider設定名と外部subjectの組をDB一意制約にし、メール一致によるaccount linkingを無効化する。同メールで別subjectのログインは拒否する。User.active／localeは認証入力から更新不可。private操作のたびにDB sessionと現在のactiveを確認し、所有者で全問い合わせを制約する。URL・JSONからownerを受け取らない。運営停止APIはまだなく、active=falseは既存sessionによるprivate操作と新session生成を拒否する。運営停止を正式提供する時には全session削除も一つの操作へ含める。

sessionは7日、更新間隔1日。cookie cacheなし、HttpOnly／SameSite=Lax、HTTPS時Secure、明示cookie prefix。OAuth stateはDB、state cookie検査とCSRF／Origin検査はテスト時も有効。provider tokenは本人確認後にDB hookで破棄し、account cookieを作らない。暗号化設定も有効にするが、初回にprovider API用tokenを保持する必要はない。認証ログへpayloadや接続情報を出さない。

認証routeはGETのget-session／callback／error、POSTのsign-in/social／sign-out／revoke-sessionsだけを許す。開始入力はprovider・callbackURL・任意disableRedirectに限定し、追加scope・直接token・任意providerパラメータを拒否する。callbackURLはライブラリで同originまたは相対pathへ検証。private変更APIは完全一致Originを必須にする。レスポンスはprivate, no-store／Vary: Cookie。非所有者と不存在は同じ404、未認証・停止・失効は401。DB不通は503で、認証失敗と混同しない。初回のschema確認失敗も503にし、失敗した認証instance／poolを破棄して復旧後に再初期化する。

## 保存形式とAPI

`/api/member/profile` GETはid/name/localeのみ。`/api/member/capsules` GET/POST、`/api/member/capsules/:id` GET/PUT/DELETE。すべて実行環境のdatasetに限定する。

POST入力は`{requestId, content}`。contentはdataset/title/note/language/entityIds/claimIdsだけ。ローカル形式を丸ごと受け入れず、owner・ID・版・時刻・受入属性を拒否する。サーバーはUUID、schemaVersion=1、revision=1、作成／更新日時を付与する。languageは既存初回と同じja。題名80文字、説明4000文字、30対象／60主張、datasetごと10件。本文はstreamで32,000 bytesまで。UUIDを小文字へ正規化し重複を拒否する。

明示構成だけをJSONBへ保存し、KG本文・出典全文・表示束ID・cursor・Graph通信状態を複製しない。説明をKG Claimへ変換せず、対象の共存から関係を生成しない。構文として正しい参照は現在KGが取得不能でも保持できる。今回のAPIは参照の実在・端点を保証しない。次の閲覧UIが既存Capsuleの再解決で失効・取得失敗・端点不一致を示す。内容版はKG履歴の固定ではない。

PUTは`{expectedRevision, content}`、DELETEは`{expectedRevision}`。所有者・dataset・期待版をSQLの条件へ含め、競合は409。更新成功時のみ版を一つ進める。過去版保存は未実装。POSTはUser行lock下で件数・request IDを検証し、複数processでの同時作成も上限を越えない。同じUserの同じrequest ID・同内容の再送は200で現在の同Capsuleを返し、新規は201。別内容は409。他Userのrequest IDと重複解決しない。削除後もIDとdigestだけのreceiptを残し、古い再送を409として復活させない。receiptの期限・頻度制限は公開前に別途設計する。

## 設定・migration・戻し方

通常は`MEMBER_STORAGE_ENABLED`を指定しない。Googleを実接続する段階でMEMBER_ORIGIN（HTTPSのorigin）、MEMBER_DATABASE_URL（専用運営DB）、MEMBER_AUTH_SECRET（32文字以上の生成値）、MEMBER_COOKIE_PREFIX（gk-から始まる環境固有値）、MEMBER_AUTH_PROVIDER=google、MEMBER_GOOGLE_CLIENT_ID／SECRETを設定する。実credential・外部公開は今回実施していない。同じhostnameの別portでもcookieは分離されないので、環境ごとにprefix／secret／DBを分ける。

fixtureはNODE_ENVがproduction以外、MEMBER_FIXTURE_ENABLED=1、固定loopback origin 3221／issuer 3222、DB 55432/graph_member_test、専用cookie prefixのすべてを要求する。productionでは拒否する。fixture issuerはtests/supportにあり製品routeに含まれない。

`db/member/000-auth.sql`は固定版Better Authの正式schemaから生成、`001-capsules.sql`は内容・receipt・identity一意制約の追加。`npm run member:migrate`を設定済み専用DBへ明示実行する。起動時のmigrationはない。transaction＋advisory lock、適用済みSQLのchecksum照合、再実行無変更。既存KGやローカル形式を移行しない。戻す時は機能を無効化して追加tableを保持する。自動DROP・重要データの破壊・元treeへのDB操作はしない。ライブラリ更新時はschema差分をレビューして新migrationを足す。

## 検証と根拠

`npm run test:member`は専用の名前を持つPostgreSQL 17 containerを一時起動し、180秒上限のVitest後にそのcontainerだけを破棄する。PGのデータはtmpfs、fixture credentialは実行時生成、hostの既存DBを使わない。fixture issuerもテスト後に閉じる。通常の`npm test`にはDBなしの入力・無効設定・本番fixture拒否を含める。

正式schemaとの整合・migration再実行、2 Userの登録と再ログイン、所有者偽装、他User拒否、nonce／issuer／state不一致、同メールの別identity、cookie偽造／環境混入、Origin／callback、同時再送／更新／上限、削除後再送、停止状態、ログアウト／全session失効、DB停止・回復・停止中の初回起動を実DBで確認した（17件）。ブラウザUI・実KG参照・実Google接続・人間受入はこのチェックポイントの検証範囲外。

導入時の確認元：[Better Auth Next.js接続](https://better-auth.com/docs/integrations/next)、[PostgreSQL](https://better-auth.com/docs/adapters/postgresql)、[OIDC](https://better-auth.com/docs/plugins/generic-oauth)、[account linking](https://better-auth.com/docs/concepts/users-accounts)、[session](https://better-auth.com/docs/concepts/session-management)。導入版の型・実装とインストール済みNext.jsのauthentication／Route Handlersガイドも照合した。
