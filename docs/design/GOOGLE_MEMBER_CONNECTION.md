# Plunodeの本番Google接続と完了条件

2026-10-14更新。公開βの工程13。既存の[会員Capsule](MEMBER_CAPSULES.md)の認証・所有者契約を維持し、専用PostgreSQLと本番設定の接続を準備する。**正式hostのHTTPS・VPS専用PG／Google認証開始の実接続は確認済み。本人Googleログイン・表示名は確認済み。MTU永続適用も確認済み。本人のアカウント保存・logout→login後の再閲覧も確認済み。編集／限定共有・停止／実機等は未確認で、工程13はまだ完了ではない。** 公開KG、会員保存、限定共有の意味を変更しない。

## 接続先

| 項目 | 採用値・境界 |
| --- | --- |
| 会員のcanonical origin | `https://plunode.net` |
| Google authorized redirect URI | `https://plunode.net/api/auth/callback/google` |
| Provider | Google一種類。認証開始で要求するscopeは `openid email profile` のみ |
| DB | Compose内部の `graph-member-postgres:5432/graph_member`。host portは公開しない |
| Web / migrationのDB User | `gk_member`。superuser・CREATEDB・CREATEROLE権限を持たない |
| PostgreSQL管理者 | PG containerだけが別の管理者passwordを持つ。Webへ渡さない |
| 保存 | `member_data` volume。Neo4jの `knowledge` volumeと独立 |
| cookie | `gk-member-production` prefix。Secure・HttpOnly・SameSite=Lax |

本番guardは上記origin・内部DB・User・prefix・Googleを照合する。無効設定のままなら公開KGは動き、会員APIは503。設定不良や会員PG停止でもKG全体の起動を妨げない。readinessは引き続き公開KG用であり、会員正常性の代用にしない。

日常確認先 `graph-beta.isinxnisi.com` の会員機能は無効のまま。VPSとは別origin・別DBであり、Google cookieやsessionを共有する設定を足さない。preview認証の解除は工程22、本人削除等の運営操作は工程14に残す。

## Google側で必要な操作

Google Cloudで、このサービス専用のOAuth clientを**ウェブアプリケーション**として用意する。上記redirect URIを完全一致で登録する。consent画面がテスト状態なら、今回ログインする本人をtest userへ追加する。Drive等の追加API権限や他プロジェクトのcredentialは使わない。

設定後のWeb client JSONをGit外へ保存する。例は `~/.config/graph-knowledge/google-web.json`。WSL側で親directoryを0700、fileを0600にし、チャットには保存先だけを伝える。Client SecretやJSON本文を貼らない。この操作はユーザー側のGoogleアカウント設定であり、Codexの隔離OIDC試験で代替しない。

公式資料：[Better AuthのGoogle設定](https://better-auth.com/docs/authentication/google)、[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)。導入済みBetter AuthのGoogle providerでもdefault scopeとcallbackの組立を照合した。

## 候補envの生成

`scripts/prepare-production-member.py BASE_ENV GOOGLE_WEB_JSON OUTPUT_ENV IMAGE_TAG` を、既存envを読める担当者が実行する。VPSの既存設定は `/opt/graph-knowledge/app.env`。出力は既存fileと異なる未作成のprivate fileにする。

```bash
sudo python3 prepare-production-member.py \
  /opt/graph-knowledge/app.env \
  /home/develop/graph-production-member/google-web.json \
  /opt/graph-knowledge/member-candidate.env \
  beta-step13-20261013
```

これは**候補の作成だけ**で、稼働設定・container・DBは変えない。実credentialが届く前には実行しない。次を機械的に検証する。

- 入力fileが所有者以外から読めないこと、Web client JSONの形式、指定redirect登録。
- 既存Neo4j等の設定を保持し、生成secretは64桁hex、管理者用とWeb用は別値。
- 既存の会員secretを維持し、Google credential・DB・originを黙って差し替えない。
- 出力は0600、既存fileへの上書きは禁止。secretはstdoutへ出さない。

既存PG volumeのpasswordをenv生成で変更することはできない。既に会員PGがある場合、初回volumeと見なさず、DB内の設定との一致を確認する。credential変更・鍵rotationはこの初回手順に含めない。

## 実際の有効化時の順序

実Google設定が届いてから、担当Codexが検証済みimage・Compose・init SQL・候補envを揃え、管理者が適用できる配置物を準備する。**現時点ではVPSへ会員構成を配置・有効化していない。** 既存のWeb更新scriptだけではComposeとinit SQLを配置しないため、工程12のコマンドだけで会員が有効になるとは扱わない。

1. 現行env／Composeをprivateに控え、既存operatorでKG backup。既存Caddy・preview認証・KG revisionを維持する。
2. `compose.production.yaml` を本番の `compose.yaml`、`db/member/production-init.sql` を同directory配下の同相対pathへ配置する。テスト済みWeb／ops imageを検証してloadする。
3. 候補envを指定して `--profile member up -d --wait graph-member-postgres`。init SQLは空volumeの初回だけ実行される。既存volumeを削除・再初期化しない。
4. 会員PGをprivateなcustom-format `pg_dump` へ控え、候補envで `run --rm --no-deps member-ops`。既存5 migration（000〜004）をtransaction・advisory lock・checksumで適用する。二回目は無変更。
5. 候補envを稼働envへ明示適用し、`up -d --no-deps --pull never --wait web`。KG再seed・Neo4j再起動はしない。
6. 外部HTTPSから認証開始・本人Googleログイン・保存・再訪を確認する。会員PG停止試験は隔離環境で行い、稼働VPSのDBを試験目的で停止しない。

実行には `docker compose --env-file ... -f /opt/graph-knowledge/compose.yaml` を使い、設定内容を展開表示する `config` ではなく `config --quiet` で確認する。backupは0600・Git外。会員backupはKGのJSON backupとは別で、KG復元で会員を巻き戻さない。定期退避・restore運用の仕上げは工程19。

失敗時は以前のenv／Compose／Web imageへ戻し、会員機能を無効化できる。新PG volume・適用済みmigrationは保持する。down -v、tableのDROP、古いDBへの自動巻戻しを復旧手段にしない。旧Webの復旧、KG revision、既存serviceの継続も確認する。

## 外部設定なしで確認する範囲

```bash
python3 -m unittest discover -s tests -p test_production_member.py -v
npx tsx scripts/test-production-member.ts beta-step13-20261013
```

後者は一時Compose project・3202・専用PG volumeだけを使う。本番imageに架空のGoogle設定を渡して、非superuser・migration再実行・認証開始URL・最小scope・state cookie・Origin／追加scope／外部redirect拒否・PG停止503とWeb再起動なしの復旧を検証する。Googleへ認証リクエストを送らず、Userは0件のまま。終了時に**この試験projectだけ**をvolumeごと削除する。

`scripts/test-production.ts` は別の一時環境3201で、会員無設定の従来のKG投入・冪等性・停止復旧・本番ブラウザ経路を検証する。`npm run test:member` の実PG＋検証OIDCでは保存と所有者認可も確認する。これらの成功を実Google callback成功として報告しない。

## 工程13の完了条件

- 実Google clientと完全一致のredirect、実VPSの専用PG・migrationを確認する。
- HTTPSのGoogle本人認証から `/member` へ戻り、profileが本人を示す。認証token／メールは公開画面へ出さない。
- private Capsuleを明示保存し、reload・logout／login・別ブラウザで同じ所有者として再訪できる。名前変更で所有者が変わらない。
- 保存内容から現在のKG／Claim／Sourceへ戻れ、元の探索が維持される。
- 匿名や別Userへprivate内容が見えず、一般公開・共有有効化を勝手に広げない。

Google本人認証を含む確認が終わるまで、[進捗](../PUBLIC_BETA_PROGRESS.md)では工程13を未完了のままとする。全体の要求充足と過去の完了数は要求監査を踏まえて別に扱い、準備だけで増やさない。


工程14で退会・停止・共有停止・投稿非表示の追加migration004と運営CLIを加えた。これから本番会員を有効化する場合は最新operator imageで000〜004の5件を明示適用する。既存の000〜003の内容は変えていない。[削除範囲・運営手順](ACCOUNT_LIFECYCLE_OPERATIONS.md)を併読する。過去の工程13検証記録の4件は当時の結果である。

## 2026-10-14：実接続再開の作業境界

会員実接続を最優先とする。最新mainの機能を使い、認証・保存・共有UIを再実装しない。工程17以降への復帰は、工程13の本人ログイン・保存／再訪と実利用の確認を終えた後に判断する。デザイン刷新・スマホの詳細配置・Graphの残課題は引き続き未解決だが、実認証接続の不要な前提にしない。

| 区分 | 現在の状態 |
| --- | --- |
| 実装済み | Google provider、DB session、本人設定、Capsuleの明示保存／読取／編集、限定共有／停止、所有者認可 |
| 隔離環境で確認 | 実PG＋検証OIDCの2 User認可・保存・再訪。実Googleとは別 |
| 実接続済み | 正式HTTPS・KG・専用PG・本人Googleログイン・表示名を確認済み |
| 受領・確認済み | 正式callbackを含むGoogle Web client JSON。2026-10-14にprivate配置・VPS有効化済み |
| 人間操作待ち | 編集・限定共有／停止・実機等の残る本人確認 |
| 適用済み | 専用PG・5 migration・本番Web。ユーザーが管理者scriptを実行 |
| 未確認 | 実sessionでの編集・限定共有／停止、実機スマホ、第二の実Google Userによる隔離。これらを隔離試験で代用しない |

### Google Cloudの操作

1. [Google Auth Platform](https://console.cloud.google.com/auth/overview)で、このサービス専用のprojectを作成／選択する。
2. Brandingでアプリ名・サポートメール・連絡先を設定。今回は初回接続試験で、公開審査を開始する指示ではない。
3. AudienceはExternal／Testing。今回使用する本人アカウントをtest userへ追加する。Testingをアクセス制御の代わりにせず、サービスのpreview認証は維持する。
4. Clientsで「ウェブアプリケーション」を作成し、redirectを完全一致で登録する。`https://plunode.net/api/auth/callback/google`。旧previewのcallbackは今回の認証先にせず、今回 `.com` やlocalhostのcallbackを追加しない。
5. client作成時にWeb JSONをダウンロードする。要求scopeはコードが指定するopenid／email／profileだけ。Drive等を追加しない。
6. Git外の `~/.config/graph-knowledge/google-web.json` へ0600で保存する。directoryは0700で準備済み。チャットへは保存先だけを伝え、JSON／Secret本文は貼らない。WindowsのDownloadsにある場合もWSL側のこの保存先へコピーしてから使う。

[Google公式のWeb client作成・秘密情報管理](https://developers.google.com/identity/protocols/oauth2/web-server)、[OpenID Connect設定](https://developers.google.com/identity/openid-connect/openid-connect)、[Better Authのcallback仕様](https://better-auth.com/docs/authentication/google)を照合。画面の名称差があれば目的・callbackを基準に案内し直す。

### 一回の管理者適用

`scripts/activate-production-member.sh TAG ARCHIVE GOOGLE_JSON`を追加。**実credentialの有効化は管理者の明示操作時だけ**行う。通常のWeb更新scriptではなく、初回PG構成の追加を含む専用手順である。

- 配置bundleのSHA256SUMSとimage archive checksumを検査する。
- 候補envを初回だけ生成。再試行は同じ候補を `prepare-production-member.py --check` で既存env・Google JSON・tagと照合し、秘密値を生成し直さない。
- 候補envがなく既存member volumeがある場合は、初回とみなさず停止する。生成済みvolumeを削除して通さない。
- 旧operatorでKGをbackupし、env／Compose／既存initをprivateに退避。PG起動後はcustom-format dumpを0600で保存する。
- 非superuserを確認し、実Web用の接続情報でmigrationを二回実行、5件とchecksumの維持を確認する。
- 成功後だけ稼働envを切替え、Webだけ更新する。KGの再seed・Neo4j再起動・Caddy／preview認証変更は行わない。
- WebのKG readiness・member status・匿名profile拒否に加え、実Webから認証開始URLを作成してPG接続／state保存・callback／最小scopeを確認する。Googleへブラウザを送る処理や、本人sessionの作成を代行しない。URL・state・cookie・credentialはログへ出さない。
- 途中失敗は旧env／Composeへ戻し、Webを切替えた後なら旧Webも復旧する。会員volume・candidate・privateな退避は保持し、再試行時に再利用する。DBをrollback／DROPして古い状態へ戻さない。

配置物の実パス・検証結果は下の実施記録へ追記する。Google JSONが届くまでは稼働構成を変更しない。sudoパスワードはチャットへ要求しない。管理者コマンドは配置物の検証を終えてから提示する。

### 本人が確認する利用経路

会員の確認は **https://plunode.net/** で行う。`.com`の日常画面は匿名探索の検証を継続し、会員無効のまま。originごとのブラウザ保存・cookie／sessionを共有しない。今回の保存試験はVPS画面で探索から始める。

1. preview認証→`/member`→Google登録／ログイン。本人の表示名を確認し、設定変更→再読込→logout／login後にも維持されるか確認する。
2. 同じVPS画面のGraphでPLUTO等を探索し、選んだ対象／主張からCapsuleを作る。「この内容をアカウントへ保存」で本人と内容を確認して明示保存する。ログインだけでlocal内容を送信しない。
3. 保存したCapsuleを再閲覧・編集し、別ブラウザ／再ログインでも同じ所有者の一覧へ戻れるか確認する。参照のClaim／SourceとGraphへ往復する。
4. 限定共有を発行し、別ブラウザで明示した版だけを確認する。受け手も現在はpreview認証が必要。会員のprivate URLは共有URLではない。共有停止後は旧リンクが失効することを確認する。
5. 匿名private要求の拒否を実VPSで確認。別Userの404・所有者偽装拒否は隔離2 User試験の結果と区別し、第二の実Googleアカウントでの確認をしていなければ未確認と記録する。
6. 実機スマホで登録／再訪と保存・根拠往復の代表操作を確認する。390pxブラウザ検証だけを実機Safari等の確認として報告しない。

評価は目的・実際の対応・判断理由・未解決事項で記録する。Capsuleは説明と明示参照の保存であり、URL Graphの枝／座標保存とは別。今回この意味や保存形式を変えない。

### 接続準備の実施記録（2026-10-14）

- application sourceはmain `61bb9f1`。Web／opsをNode24.21.0でbuildし、tag `beta-member-20261014` を作成。秘密情報を含めない専用bundleを `/home/develop/graph-production-member-20261014` へ転送し、全配置fileとimage archiveのchecksum・shell構文をVPS上で確認した。まだ稼働構成へ適用していない。
- archive SHA256は `4c6d1bdd722ccb19295dd074c0e6812e4b46f616ed6179e6807a59436b5dd33c`。Web image IDは `sha256:c39562dae161ff3df75de92b004a3faa8e8349f00c4369ea4ec0b04e37f90661`、opsは `sha256:ac5a40eeaed12b6f3d1d1848ce46d8f65be4537a7a06a3d9adb738ec7de5c8a6`。bundleのmanifestにも記録した。
- 候補envのPythonテスト8/8。root適用scriptの制御フロー試験は1 test内4 scenario（正常／再実行、migration失敗→再試行、Web失敗→旧Web復旧、不明な既存volumeの拒否）が成功。これはnetworkなし・Docker socketなしのコンテナ内stub試験で、本番適用の実施を意味しない。
- `npm run test:member` は専用PG＋検証OIDCで33/33成功。`test-production-member.ts beta-member-20261014` は実image・実PGで非superuser、5 migrationの二回適用、Google認証開始、最小scope／state cookie、Origin等の拒否、PG停止503→Web再起動なしの回復を確認。Google本人認証は行っていない。
- 会員Playwrightは共有・停止、Graphから保存／再訪／非所有者拒否、編集、本人設定を390／1440px（設定は320／1440px）で確認。初回8件中7件成功、PCの保存テスト1件は古い中央ペインの非表示ボタン指定で失敗したため、現在の正規導線である左ペインへ修正。再実行1/1成功後、runnerの終了後cleanupも整え、最終再実行1/1・command exit 0を確認した。
- スマホ幅の設定・共有先の実画像で、設定保存、説明→Graph→参照／根拠→コメントの順と横はみ出しがないことを確認。共有閲覧は縦に長く、実機での読みやすさは本人確認へ残す。実Googleの登録・再ログイン・第二アカウント保護をこの結果で代替しない。
- `npm run typecheck`／`npm run lint`成功。既存のpredicate比較warning1件のみ。公開imageの初回回帰は28/29成功、リロード後にGraphが復元される新契約に対して検索パネルを開かず入力する旧テストが1件失敗した。復元完了を確認して検索パネルへ切り替える操作へ更新し、対象ケースの単独再実行1/1成功。認証や探索の実装を変更してテストを通したものではない。
- 修正後の `test-production.ts beta-member-20261014` は公開Playwright29/29成功（9.5分）。隔離KGの無書込plan、105知識Node／128 Relationship、再適用unchanged、backup0600、再起動保持、DB停止503→Web再起動なしの復旧を含め正常終了した。既存3200と3210〜3215のdataset API、TunnelのHTMLも200を確認。稼働VPS・凍結datasetへのseed／DB変更は行っていない。

以下は正式origin決定前の配置記録。**旧bundleはsuperseded。以下の旧コマンドは実行しない。** 現行手順は末尾のPlunode切替を参照。

```bash
sudo bash /home/develop/graph-production-member-20261014/scripts/activate-production-member.sh \
  beta-member-20261014 \
  /home/develop/graph-production-member-20261014/images.tar.gz \
  /home/develop/graph-production-member-20261014/google-web.json
```

適用後のHTTPS確認、本人のGoogleログイン、保存／再訪・共有停止の結果を追記するまでは工程13未完了。本人操作とsudoが必要な境界であり、配置準備の成功を実接続へ読み替えない。

## 正式名Plunode・正式originへの切替（2026-10-14）

ユーザー指定により正式名を **Plunode**、正式originを **https://plunode.net** にする。Google本人認証をまだ有効化していないため、既存アカウント移行ではなく初回接続先の変更とする。上の旧bundle／旧管理者コマンドは履歴であり、実行しない。

| 対象 | 採用する扱い |
| --- | --- |
| 正式origin／redirect | `https://plunode.net`／`https://plunode.net/api/auth/callback/google`。production guard・Compose・候補env・認証開始検証を変更 |
| Better Auth | appNameはPlunode、baseURL／trustedOriginsは正式originのみ。旧originをtrustedへ足さない |
| Cookie | `gk-member-production`を維持。Secure／HttpOnly／SameSite=Lax／host-only。親domain指定や他originとのsession共有はしない |
| Caddy／preview | 既存graph siteと既存のBasic認証hashを維持し、同じ保護を持つplunode siteを追加。Caddyfileの他siteは不変。HTTP→HTTPSはCaddy、証明書は既存と同じLet's Encrypt |
| 旧 `/member`・`/shared` | GET／HEADは正式originの同path／queryへ302。旧auth／member APIは409として拒否。OAuth codeを旧callbackから新callbackへ転送しない |
| 旧Graph／閲覧URL | 旧previewで引き続き読む。Graph・Claim・Source ID／KG revisionは不変。自動的に全URLを新originへ転送してブラウザ保存を見失わせない |
| 共有URL | 現在は実会員／実共有未接続。新規発行は正式origin上で `${location.origin}/shared#TOKEN` を使う既存処理。tokenと版はPG側でdomainを持たず、DB変更不要 |
| fragment | サーバーは共有tokenやGraph fragmentを読まない。旧sharedへの302にfragmentを指定せずブラウザの継承を使う。実HTTPSで確認するまでは既存共有リンクの移行を検証済みにしない |
| 同一originの参照入力 | 新originの会員画面に旧hostの閲覧URLを貼る操作は既存のsame-origin検証で拒否する。旧URLを新hostへ替えて同じ参照を開き直す。クロスorigin認可は足さない |
| ブラウザ内保存 | localStorage／sessionStorage・未送信草稿・外観設定は自動移行しない。旧previewで必要な保存ビュー／途中保存／CapsuleのJSONを書き出し、新originで明示読込。`/member?import=...` のIDだけでは別originのlocal内容を取得できない |
| DB／データ | Neo4j／専用PG／volume／User ID／Capsule／共有token／秘密値はそのまま。新DBや再seedは不要 |
| ブランド | 今回は認証appName・運用文書だけ。npm名／Docker名／内部prefixや画面全体の刷新は行わない |

正式hostはapexの `plunode.net` だけ。`www`や別subdomainを今回自動追加しない。現在のOG metadataは起点のtitle／descriptionで、旧hostを焼き込んだGraph画像／canonical URLはない。Graphの可逆URL、閲覧URL、共有URLは表示中originか相対pathを使用するため、URLの状態形式やデータは変更しない。

### 外部操作と適用順

1. お名前.comのルート（ホスト名空欄／@）Aを **153.115.17.82** にする。競合するA／CNAMEや別接続先のAAAAを残さない。DNS providerを自動変更しない。2026-10-14の調査ではローカル・VPS・1.1.1.1・8.8.8.8・dns1/dns2.onamae.comが **150.95.255.38** を返した（TTL300）、AAAAは空。設定画面と権威DNSへの反映をユーザーに確認中。
2. Google Auth PlatformのBranding名をPlunodeにし、Web clientのauthorized redirectへ上記完全一致のURIを設定。JavaScript origin欄を使う場合は `https://plunode.net`（pathなし）。サーバーのGoogleログインにGoogle JS SDKは追加しない。旧graphのredirectは今回不要。External／Testingと本人test user、scopeはopenid／email／profileを維持。Googleから要求された所有権確認は本人側で実施する。
3. JSONをGit外へ0600で保存し、保存先だけ伝える。既存clientのredirectだけ変更した場合、client secretを不要に作り直さない。手元JSONのredirect metadataが古い場合は、Console上の登録確認とJSONの非秘密metadata更新を区別して扱う。
4. 検証済みbundleを使い、管理者が `activate-plunode-origin.sh` を実行。これはDNS確認・既存生成形式との照合・Caddy全体validate・private backup・reloadだけ。失敗時は旧siteへ戻す。会員PGやWeb image、preview認証、KGは変更しない。独自編集があれば推測で上書きせず停止する。
5. 正式hostの証明書・未認証401／noindex・previewログイン後KG、旧preview、既存通知サービスを実確認する。DNS／HTTPSの準備だけで会員接続済みにしない。
6. 正式origin対応の新image／Composeを使って `activate-production-member.sh` を管理者適用。scriptはsecret生成前にDNS一致と正式hostの検証済みHTTPS・未認証401／noindexを確認し、未開通／preview保護なしなら停止する。旧bundleを再利用しない。Google JSON・候補env・DB secretはGit外。旧originの候補envが既にある場合は自動書換えず停止して確認する。
7. 正式hostでGoogle本人ログイン・保存・再訪・共有停止・別User保護・実機を確認。旧previewからの会員導線、共有fragmentとqueryの継承もここで検証する。工程13の完了はここまで必要。

DNS／Caddy／実Googleの未適用・未確認は進捗へ残し、一般公開は引き続き別工程22。HTTP/HTTPSへのアクセス確認と認証有効化を混同しない。

### Plunode対応の準備・検証結果

- 候補env9/9、member unit9/9、実PG＋検証OIDC33/33成功。Caddy候補2/2、会員適用のstub制御フロー1 test内5 scenario（正常／再実行、migration失敗、Web失敗、不明volume、正式host事前確認失敗）成功。stub成功は実HTTPS適用を意味しない。
- Caddy候補をVPSの2.6.2で `validate` し成功。人工のBasic認証hashを使った独立fixtureであり、稼働Caddyfileを変更／reloadしたものではない。
- `beta-plunode-20261014` のWeb／opsをbuild、typecheck／lint成功（既存warning1件）。専用実PG＋本番imageで5 migrationの二回適用、正式Google redirect、最小scope、host-only Secure Cookie、旧originからの開始／旧originへのcallback拒否、PG停止503→Web再起動なしの復旧を確認した。実Googleへの通信・本人session作成はしていない。
- ローカル3200をbuild `Eb71auKshJDbMcLNBe2g8` へ更新。ローカル／TunnelのHTMLとdataset API200を確認し、Tunnel経由の漫画／科学／Event・条件・根拠・概要・起点復帰の代表Playwright1/1成功。会員はローカル503で意図した無効状態。Tunnelの会員status直接probeは403で理由未特定であり、同hostで会員接続を確認したとはしない。
- 新bundleは `/home/develop/graph-production-plunode-20261014` へ転送・全checksum／構文確認済み。Google credentialは含めず、まだ管理者適用していない。旧 `/home/develop/graph-production-member-20261014` は履歴として保持するが、実行しない。
- image archive SHA256は `c240b38eaa44bca55a449ca2b7e7cf8538638829bcd293a0c3ad5496f8b34a8a`。Web ID `sha256:7feea8cf0d94443842f9294b1e96b5c2595b873534518edb1ed2fd931ae183ec`、ops ID `sha256:03c25817f73a968163d81a16c7d3d969c0321cff60756d1387fcc42db8fa3671`。manifestにはsource base commit `8a405ac` とアプリ変更差分SHA256を記録し、旧imageとの混同を避ける。

DNSがVPSへ一致してから、VPS端末でCaddyだけを追加する。

```bash
sudo bash /home/develop/graph-production-plunode-20261014/scripts/activate-plunode-origin.sh
```

正式hostのHTTPS／preview確認後、Google JSONをprivate転送・確認してから次を案内する。JSON未配置の現在は実行しない。

```bash
sudo bash /home/develop/graph-production-plunode-20261014/scripts/activate-production-member.sh \
  beta-plunode-20261014 \
  /home/develop/graph-production-plunode-20261014/images.tar.gz \
  /home/develop/graph-production-plunode-20261014/google-web.json
```

外部待ち：ルートAのVPS一致。管理者待ち：Caddy追加と会員有効化。設定待ち：Google JSON。未確認：新hostの証明書／実Google／本人保存・再訪／実共有fragment移行・実機。今回の準備を工程13完了や一般公開として数えない。

### Caddy適用後・Google JSON受領の確認（2026-10-14）

直前の待ち状態は準備時点の記録。ユーザーがDNS確定・Caddy追加を実施した後、以下を確認した。

- `plunode.net` は **153.115.17.82** に解決。証明書検証付きHTTPSで未認証のdataset API401、Basic認証・noindexを維持。VPS上から会員有効化scriptの実際のDNS／HTTPS／preview事前確認も正常終了した。
- preview認証後、正式host／旧graphともdataset API200・revision `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`。正式hostのmember statusは503で、まだ会員を有効化していない。旧memberは同query付きで正式hostへ302、旧OAuth callbackは409を確認した。
- 正式hostの実Playwright代表経路1/1成功（11.1秒）。漫画／科学／Event、条件、概要、起点切替／直前復帰、Claim／Sourceを確認。別の390pxブラウザでもPLUTOのEntity4／Claim5を確認した。
- ブラウザで旧 `/shared?check=1#fragment-check` が正式hostの同query／fragmentへ移ること、旧memberのquery転送を確認。これは人工fragmentの転送確認で、実共有データの受入確認ではない。
- Caddy／Docker／既存通知serviceは全てactive。最初のローカルPython HTTPS probeは接続timeoutになったが、証明書検証付きcurl・VPS上の事前確認・実ブラウザ・Playwright requestでは上記成功を確認。単発失敗を常時疎通の保証へ読み替えない。
- ユーザー指定のWindows JSONを内容を表示せず検証し、Web client形式・正式callbackを確認。Git外 `~/.config/graph-knowledge/google-web.json` とVPSの `/home/develop/graph-production-plunode-20261014/google-web.json` に0600で配置した。元fileは変更せず、Git／image／manifest／ログにSecretを含めない。JSON受領は実Google認証成功とは別。

**残りは管理者による上記 `activate-production-member.sh` の実行、その後のHTTPS状態確認と本人Googleログイン・保存／再訪・共有停止・実機確認。** Caddy追加を再実行する必要はない。本人sessionをCodexが代行作成せず、preview認証・既存KGを維持する。会員適用前にPG／DBや稼働envを変更していない。

### 会員有効化後の実HTTPS確認（2026-10-14）

ユーザーが `activate-production-member.sh` を実行。提出ログではKG backup成功、専用PG作成・healthy、migration二回成功、`beta-plunode-20261014` のWeb更新・healthy、会員status200／匿名profile401／Google認証開始を確認した。script内の5 migration・非superuser検査も通過している。private退避は `/opt/graph-knowledge/member-rollbacks/activation-jDfirZp3`。これはユーザー実行ログに基づく確認で、Codexが本番Docker／PGへ管理者接続したものではない。

適用後に実HTTPSを別途確認した。

- 未preview認証は401・noindexを維持。preview認証後のKG200・revision `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c` を維持。
- member status200／Google。会員未ログインのprofile・Capsule一覧・本人投稿APIはJSONの401で、preview認証だけではprivateデータを読めない。
- 実clientの認証開始200。client IDは受領JSONと一致し、redirectは正式callback、scopeはopenid／email／profileだけ。state CookieはSecure／HttpOnly／SameSite=Lax、Domainなし。旧graph Originからの認証開始は403。
- HTTPSのbuild `pmbu-6SRzMtrUalkhnuSw` は検証済みimageと一致。Caddy／Docker／既存通知serviceは全てactive。
- 1440／390pxの実ブラウザでGoogle登録・ログインボタンが有効、横はみ出しなし。390pxの実画像でログイン案内・ブラウザ内保存との区別を確認。両幅でPLUTO探索がEntity4／Claim5になることも確認した。

認証開始検証はPGへ一時OAuth stateを作るが、Googleへブラウザを送ったり、本人session・Capsule保存を作ったりはしていない。残りは **本人のGoogle callback→表示名確認、ログアウト／再ログイン、本人保存・再閲覧／編集、限定共有・停止、別User保護、実機操作**。会員有効化の管理者コマンドをもう一度実行する必要はない。これらの実利用確認まで工程13未完了。

### 本人callbackのinvalid_code調査（2026-10-14）

ユーザーはGoogle認証画面を通過したが、正式hostの `/member?error=invalid_code` へ戻った。本人ログイン成功とは扱わず、工程13を障害調査中とする。

導入済みBetter Auth1.7.7のcallback実装では、`validateAuthorizationCode` の例外／tokenなしをinvalid_codeへまとめる。Google providerは `https://oauth2.googleapis.com/token` へコード交換する。画面のerrorだけではコード失効／PKCE／client設定／コンテナのDNS・通信・TLSを区別できない。生のBetter Auth loggerを有効化してcode・token・Secretをログへ出す対応は取らない。

VPS本体のPythonから、受領JSONと人工の無効codeでtoken endpointへprobeしHTTP400／invalid_grantを確認した。これはhostの疎通確認であり、実codeの失敗原因やWebコンテナの通信成功、client secretの実認証成功を保証しない。

`scripts/diagnose-production-google.sh` と `scripts/diagnose-google-token.mjs` を追加し、VPSの `/home/develop/graph-google-diagnostic-20261014` へ転送・hash／構文確認した。管理者が次を実行する。

```bash
sudo bash /home/develop/graph-google-diagnostic-20261014/diagnose-production-google.sh
```

- 受領JSONと稼働Webのclient ID／Secretはprivate pipeでdigestだけを照合し、出力は一致booleanのみ。origin一致も確認する。
- WebコンテナからGoogleのJWKSとtoken endpointを各15秒で確認。redirectは追わず、人工codeだけを使用。invalid_grantはこのprobeの想定結果で、本人callbackの原因確定ではない。
- 出力はHTTP statusと許可したOAuth error名／transport error codeのみ。生の例外、error_description、レスポンス本文、token、code、state、個人情報を出さない。
- DB／env／会員データを変更せず、WebやDBを再起動しない。Google本人認証やcallbackの再送は代行しない。

秘匿性と判定のPython／Nodeテスト1件（invalid_grant、invalid_client、不明errorの秘匿、transport code、Secret不一致）成功。eslint／shell構文・差分check成功。これは診断処理の検証で、本人ログインの修正完了ではない。コンテナ操作は既存のsudo運用に従い、結果を待って原因を絞る。Google credentialや認証モデルを推測で変更しない。

### コンテナ通信timeoutとMTUの切分け（2026-10-14）

ユーザーの診断結果はorigin／client ID／Secretすべて一致、JWKS／tokenとも `UND_ERR_CONNECT_TIMEOUT`。設定不一致より前に、稼働WebからGoogleへの接続失敗が確認された。VPS本体はIPv4 forwarding=1、GoogleのA／AAAAを解決し、Docker daemonの独自設定fileなし。hostの外向き `enp3s0` のMTUは **1442**、docker0／プロジェクトbridgeは **1500**。MTU不一致によるTLS通信の停滞を有力候補とするが、変更前後の実疎通で確認するまで原因確定とはしない。

`scripts/repair-google-egress-mtu.sh` を既存診断directoryへ転送・hash／構文確認した。管理者操作は次の一つ。

```bash
sudo bash /home/develop/graph-google-diagnostic-20261014/repair-google-egress-mtu.sh
```

- 実host default routeと現在のWeb namespaceのdefault route・interface・MTUを読む。1280〜1500のhost MTUよりWeb側が大きい場合だけ対象とし、コンテナPIDも前後照合する。
- **現在のWeb interfaceだけ**をhost MTUへ合わせ、既存の秘匿診断を再実行する。JWKS200／人工codeのtoken400・invalid_grant／credential一致とKG readinessが全部成功した時だけ変更を維持する。
- 失敗時は同じWebの旧MTUへ戻す。DB／host interface／iptables／Docker daemon／Caddy／envを変更せず、container・DBを再起動しない。Webが入れ替わっていれば古いnamespaceへ書かない。
- 一時変更であり、Web再作成後の永続化は未実装。成功後は[Docker bridgeのMTU option](https://docs.docker.com/engine/network/drivers/bridge/)を使うプロジェクト限定の永続化を、必要な停止範囲・volume維持・復旧と合わせて別途準備する。host全体のdaemon／firewall設定を推測で変えない。

隔離コンテナ・stubによる1 test内4 scenario（成功、Google失敗の復元、readiness失敗の復元、不一致なしの無変更）成功。shell構文／差分check成功。これは手順の制御フロー検証で、本番のMTU変更・通信回復・本人ログインはまだ未確認。ユーザーの実行結果を待つ。


### 一時修正の成功と永続化の準備（2026-10-14続報）

ユーザーの実行結果でWeb MTU1500→1442、JWKS200／人工codeのtoken400・invalid_grant／KG readiness成功を確認した。続けて本人が実Googleログイン・表示名表示の成功を申告した。MTU変更前後で回復したことを確認し、credential再生成は行っていない。一時修正はWeb再作成で失われる。

永続設定は`compose.production.yaml`のWebに専用`web-egress` bridge（`GRAPH_EGRESS_MTU`既定1442）を接続し、`gw_priority: 1`で外向き経路にする。既存default networkはDB接続用に維持する。ホスト全体のDocker設定は変更しない。[Composeのgateway priority](https://docs.docker.com/reference/compose-file/services/#gw_priority)を使い、Docker API1.48以上が必要。実VPSのDocker29.1.3／Compose2.40.3を確認済み。異なる回線では既定値を無条件に使わずhost MTUを確認する。

`scripts/persist-google-egress.sh`を専用bundleから管理者実行する。稼働Composeの独自差分、host MTU不一致、既存egress networkの異なるMTUを拒否。KG backupとprivate PG dumpを取得し、Webだけを再作成する。Neo4j／PGのcontainer ID・起動時刻、KG revisionの不変、Web default-route MTU、Google疎通を確認する。失敗時は旧ComposeでWebを再作成し、従前の一時MTUへ戻す。DB／volume／secret／Caddyは変更せず、進行中HTTPだけ短時間中断し得る。

隔離実Composeで二回のWeb新規実行後のMTU1442、専用networkのdriver optionを確認。本番imageの実PG試験でも5 migration二回・非superuser・認証開始・Origin検証・PG停止503と復旧が成功。これらは実VPSでの永続適用とは区別する。

本人保存確認の案内で段階が抜けていた。現行UIは「Capsuleを作る・読む」→「表示中のGraphから作る」→「Capsuleを保存」（ブラウザ内）→「読む」→「この内容をアカウントへ保存（別タブ）」→会員画面の「この内容をアカウントへ保存」。会員画面の「ブラウザ内から選んで保存」でも選択できる。ブラウザ内保存はorigin単位で、別domainから自動移行しない。二段階の発見性を改善課題とし、保存再訪・logout後再login・編集・共有停止・実機スマホは未確認のまま残す。

永続化bundleは `/home/develop/graph-google-egress-20261014` へ転送し、全6 fileのSHA256とshell構文を照合済み。管理者実行は `sudo bash /home/develop/graph-google-egress-20261014/scripts/persist-google-egress.sh`。転送・検証は適用ではなく、本人の保存確認後に実行結果を確認する。恒久適用scriptの隔離stubは成功・Google失敗復旧・readiness失敗復旧・独自Compose拒否・host MTU不一致拒否の5 scenarioが成功した。


### VPSでの恒久適用結果（2026-10-14）

ユーザーが上記scriptを実行し成功。KG backup・private PG dump後に専用egress networkを作成しWebだけ再作成、Healthyまで5.8秒。default-route MTU1442、JWKS200／人工codeのtoken400・invalid_grant、設定一致を確認。scriptのDB container ID・起動時刻不変、KG revision不変の検査も通過した。private控えは `/opt/graph-knowledge/member-rollbacks/egress-1bTaSt7H`。恒久設定は適用済みで、次はWeb再作成後の本人session継続・Capsule保存／再訪を確認する。本人保存の確認を適用成功から推測しない。

診断・一時修正・恒久適用のPython testは各1（うち一時4／恒久5 scenario）が成功。まとめ実行の診断1件は既定Node12で失敗したため、プロジェクトのNode24へPATHを合わせて再実行し成功。アプリコードは変更しておらず、既存本番imageでの会員接続integrationを実施した。UI build／全Graph E2Eの再実行は今回のCompose・運用script変更の検証には含めない。

適用後の別途HTTPS確認：正式トップ200・dataset200（revision `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`）・会員status200。preview認証のみで会員sessionを持たないprofile／capsulesは401。Caddy／Dockerはactive。ユーザー本人のsessionやprivate Capsuleの内容は取得していない。


### 本人の実アカウント保存・再ログイン後再訪（2026-10-14）

ユーザーが「ログアウト→ログインで保存したCapsuleは表示できている」と確認。本人の実Google sessionでのアカウント保存と再ログイン後再訪は確認済みへ更新する。恒久適用後の対話で得た本人確認であり、Codexが本人のprivate内容を閲覧した結果ではない。編集・共有発行／停止・実機スマホ・第二の実Google Userは未確認のまま。

リンク／ボタンの役割、レイアウト、発見性、操作の予測しづらさが実利用上の問題として指摘された。保存できることと、自然に保存へ進めることを別に評価する。次の会員導線改善は[現行デザイン方針](EDITORIAL_EXPLORER_DESIGN.md#会員capsule導線の次の改善単位2026-10-14)に記録し、機能実接続の成功でデザインを完了扱いにしない。
