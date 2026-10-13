# アカウント・所有者・会員保存の初回設計

2026-10-09採用。認証・PostgreSQL・会員Capsuleの所有者APIと保存／再閲覧／既存構成編集まで実装。現行の実装契約は[会員Capsule](MEMBER_CAPSULES.md)、共有は[限定リンク](CAPSULE_LINK_SHARING.md)を参照する。本人表示名変更は公開β step12で追加。退会・利用停止等は[公開β step14の採用契約](ACCOUNT_LIFECYCLE_OPERATIONS.md)で実装。実Google接続・locale変更は未実装。本書の未実装項目は先回り設計であり、実装済み範囲を上書きしない。

構想の正本は[Capsule・User Contribution](CAPSULE_AND_USER_CONTRIBUTION_VISION.md)、DB境界は[ARCHITECTURE](../ARCHITECTURE.md)。共有・議論の初回経路は[コミュニティ設計](COMMUNITY_VERTICAL_SLICES.md)。本書はすべての将来機能の完成をログイン実装の前提にしない。

## 最初に触れる経路

探索は未ログインでも使える。その上で「自分の内容を別ブラウザでも読み返す」を最初の会員体験とする。

1. 探索中に会員保存を選び、登録／ログインへ進む。
2. ログイン後、自分のprivateな内容をサーバーへ明示保存する。
3. reload・別ブラウザで本人の一覧と内容を読む。
4. 保存した参照から現在のKG・Claim・Sourceへ戻る。
5. ログアウト後、本人専用内容にはアクセスできない。公開KGの探索は続けられる。

最初の保存対象は、着手時に完成している最小Capsuleがあればその内容、なければ既存保存ビューの起点・確定条件から一種類を選ぶ。認証だけの空画面で終えず、同じ引き継ぎに所有者付き保存まで載せる。保存ビュー／探索途中保存／Capsuleを同じ意味のデータへ変換しない。Capsuleと並行してaccountを設計でき、Capsule完全版を待つ必要もない。

## 認証の初期技術案

**Next.jsのサーバー内でBetter Auth、PostgreSQLのsession、最初はGoogleログイン一種類**を推奨する。自前のパスワード・再設定・確認メール基盤を最初から作らず、低価格VPS上の現在のWebと同居できる案とする。これはGoogle Cloudの実アプリ作成、credential設定、料金・公開運用の承認ではない。

Next.js用の接続とPostgreSQL adapterは公式に提供されている。[Next.js接続](https://better-auth.com/docs/integrations/next)、[PostgreSQL](https://better-auth.com/docs/adapters/postgresql)。2026-10-09に確認。導入時にNext/React/Nodeの現行版との互換性、ライブラリの固定版・migration・既存sessionへの影響を確認する。新しいORMは必須にせず、最初の保存一種類に必要な範囲で決める。

認証用Route Handlerとサーバー側session確認を置く。画面の非表示やProxyだけを認可にしない。データに近い場所で毎回権限を検証する方針は[Next.js認証ガイド](https://nextjs.org/docs/app/guides/authentication)にも合う。実装前にはインストール済みNextの同ガイドを読む。

Google client ID/secretとredirect URIは実際のprovider接続時に必要になる。[公式設定](https://better-auth.com/docs/authentication/google)。未設定なら本物のログインが使えるようには表示しない。実credential待ちでも、独立した開発・テスト環境のOIDC fixtureと実ライブラリ・実PostgreSQLを使って、登録→session→保存→他人の拒否まで検証できる。fixtureを本番で有効にできない設定検証を設け、任意userIdでログインする本番用抜け道は作らない。Google接続未検証という残りを明記する。

別provider、メール／パスワード、passkeyは必要時に追加する。初回は暗黙のメール一致によるaccount linkingを無効にし、一つの外部identityを一つの内部Userへ対応させる。認証に不要なGoogle API権限を要求せず、Drive同期や既存プロジェクトのcredentialを流用しない。provider tokenの保存を最小化し、ライブラリ都合で保持するsecret／tokenはサーバー側で保護する。暗号化・鍵の所在とログへの非出力は導入版の設定で確認する。

## identityと所有者

| 概念 | 初回契約 |
| --- | --- |
| User | アプリ内部の安定UUID。認証ライブラリのUser IDもUUIDに設定し、別の二重User正本を作らない |
| 外部identity | 検証済みprovider設定／issuerとsubjectの組。ライブラリのproviderId/accountIdとの対応・一意制約を確認する |
| KG Person | 知識上の人物。Userとは別。名前・メール・QIDで自動結合しない |
| 表示名・locale | Userの変更可能な設定。所有者IDや認可キーにしない。メール・外部subjectは公開プロフィールへ出さない |
| ownerUserId | サーバーがsessionから付与。フォーム・JSON・URLの所有者指定を信用しない |
| actorUserId | 保存／投稿／moderation操作を行ったUser。Claim.subjectやSource支持とは別 |

ライブラリの認証テーブルはその正式schemaに従う。製品設定は追加fieldまたはUser IDを外部キーにする小さいprofileへ置き、role/status等は一般profile更新から変更できないようにする。[account identityとlinking](https://better-auth.com/docs/concepts/users-accounts)を導入時にも確認する。

内部UUIDが同じなら表示名変更後も同じ所有者。メールが同じというだけで既存Userへ寄せない。外部accountの追加・変更は、将来本人確認付きの明示操作で扱う。

## sessionとサーバー認可

初回はDBで失効できるcookie sessionを使う。HttpOnly、公開環境のSecure、適切なSameSite、trusted origin、認証ライブラリのOAuth保護を設定し、変更系操作のCSRF／Origin検証を行う。任意callback URLや外部redirectをそのまま受け入れない。

すべてのprivate読取／変更でsessionの有効性、Userの利用状態、対象の所有者／公開範囲、操作権限をサーバーで確認する。初回は匿名／本人／他人の認証済みUserを扱い、moderator/admin権限は必要な操作ができた時にサーバー管理で追加する。料金プランと運営権限を一つのroleへまとめず、汎用RBACエンジンは作らない。

sessionのcookie cacheが有効だと失効の反映が遅れる場合があるため、初回はprivate操作でDBの現在状態を確認する。session寿命・更新間隔は導入版の既定を確認して明記し、全session失効がいつ反映されるかをテストする。[session管理](https://better-auth.com/docs/concepts/session-management)。

private応答を共有cacheへ載せず、Userを越えてDTOが再利用されないようにする。UIの「ログイン済み」表示よりサーバー判定を正本とし、途中で失効した時は内容を失わず再ログインを案内する。

localhostのcookieはportだけでは分離できない。既存の複数dataset画面とテストを併用する場合、環境ごとのcookie prefix・origin・session secret・PostgreSQL接続先を分ける。検証環境の分離を、製品の分野ごとに別Userを作る設計へ転用しない。

## PostgreSQLとNeo4j

| 保存先 | この経路での責務 |
| --- | --- |
| PostgreSQL | 認証用User/account/session、必要なUser設定、所有者付き保存物、更新版・時刻。共有／議論を導入した時にその運営・コンテンツ記録を追加 |
| Neo4j | Entity／Claim／Citation／Sourceの知識正本。現行の読み取りAPIと意味契約を維持 |
| ブラウザ | 未ログインの既存保存、会員保存のdraft。認証正本や他人の認可判定は置かない |

サーバー保存は参照・条件・利用者の説明を保持し、KG本文を第二の知識正本としてコピーしない。表示用Relation ID、旧cursor、通信状態を永続参照にしない。Capsule-local Entity/assertionの正式保存方式は、この初回参照中心Capsuleの設計から決定したことにしない。

保存物のID、owner、schemaVersion、更新revisionは条件や説明本文と分ける。編集は期待revisionを確認し、競合を409で示して他端末の内容を黙って上書きしない。一種類の保存でサーバー認可を成立させてから、次の種類へ広げる。

## ブラウザ保存と会員保存の関係

ログインだけでは既存ローカルデータをアップロードしない。本人が「この内容をアカウントへ保存」を選ぶ。形式・dataset・参照・上限を検証し、serverで新IDとownerを付ける。ファイルのownerやreview済み等の属性を受け入れない。

初回は自動同期・双方向merge・ログアウト時のローカル削除を行わない。ブラウザ保存と会員保存の所在を表示し、取り込み元は成功後も残す。明示取り込みの再送は同一Userのrequest ID等で二重作成を防ぎ、他Userの保存へ重複解決しない。別datasetのファイルを現在環境へ誤投入しない既存契約を維持する。

## アカウント画面と状態

初回UIは登録／ログイン共通入口、現在のUserと表示名・locale、自分の保存一覧、ログアウトを対象にする。全端末ログアウトも実装単位に含める。翻訳は安定キーとlocaleで解決し、locale変更で探索条件や所有者を変えない。

運営停止はsession失効と書込禁止を伴う利用状態として扱い、KGの肯否や投稿の真偽判定へ変換しない。退会はsession無効化、private内容・共有リンク・投稿・監査の扱いを含む独立操作である。単に利用停止にしただけなら「アカウント削除完了」と表示しない。初回ローカル検証で退会全体を必須にせず、一般公開前には削除・匿名化・保持対象を決める。

会員資格失効と所有内容の自動削除を結び付けない。料金・保存数のプラン差・有料機能は後の製品判断とし、初回は明示した小さい上限だけを設定する。

## 最小のAPI境界

route名の最終形は実装時に既存構成へ合わせる。初回に必要なのは認証ライブラリの経路、本人profile取得／更新、一種類の保存物の一覧／作成／読取／更新／削除。現在のKG読取APIの成功型を認証専用へ作り替えない。

- 未認証・session失効は401。private内容の非所有者と不存在は同じ404で内容・存在を漏らさない。
- 閲覧可能だが操作権限がない場合は403。入力不正400、更新競合409、明示上限／頻度超過は契約を分けて扱う。
- 運営DB停止は会員機能の503として扱う。Neo4jの公開読み取りまで一律停止させない。
- serverが許すfieldだけを更新し、owner、運営role、公開受入状態の自己付与を拒否する。

## 段階・検証・人間に残る判断

1. 現行Capsule／保存対象を一種類選ぶ。初回UI・保存schema・認可・migrationと導入版を短く確定する。
2. 専用PostgreSQL、実認証ライブラリ、開発用OIDC fixtureで2 Userの登録・session・保存を成立させる。
3. UIと実DB統合を接続し、reload・本人一覧・他人の拒否・競合・ログアウト／失効をブラウザで確認する。
4. 実Google接続に必要なcredential・redirect設定を相談し、接続後の検証を別の未完了条件として閉じる。

各回はこの一件の引き継ぎを続け、DB構築だけ／登録画面だけで製品体験が完成したことにしない。owner偽装、他Userの読取・更新・削除、session偽造・失効、CSRF、環境間cookie混入、PG停止、local保存不変、Graphへの復帰を必要なunit／実DB／Playwrightで確認する。

**先に進められる**：private保存、session認可、設定UI、テスト、ローカルの共有／議論prototype。**実設定時に相談する**：外部providerの実credential・公開domain・外部公開。**一般公開前に決める**：利用規約／privacy／退会と保持、公開投稿の運用。後者の未決を理由にprivateな縦経路まで着手不能にしない。

## 公開β step12の本人設定

2026-10-12、[最小設定の採用契約](PRODUCT_UI_FOUNDATIONS.md#アカウントメニューと最小設定公開β-step12)を追加。本人profileのGETに加え、表示名だけのPUTとUIを実装した。認証ID・権限・localeをこの入力から変更しない。名前変更はUser UUIDを維持し、既存のコメント表示名も次回読取から更新する。テーマは匿名でも使うブラウザ設定として分離する。実Googleの接続・公開会員環境の有効化は工程13へ残す。
