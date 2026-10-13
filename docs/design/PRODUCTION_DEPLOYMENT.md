# 単一Webと共通KGの本番配置

2026-10-12更新。公開β計画step7は認証付きHTTPSの実起動確認まで完了。[進捗](../PUBLIC_BETA_PROGRESS.md)と[共通KGの適用・復旧契約](PUBLIC_KG_RELEASES.md)を併読する。構成の準備とVPSでの実起動は区別する。閲覧認証を外すβ公開はstep22。

## 確認環境の更新契約

2026-10-12、ユーザー指定により日常確認とVPSの確認を分ける。Cloudflare Tunnelはユーザーが接続済み。

| 確認先 | 接続先・更新のタイミング |
| --- | --- |
| `https://graph-beta.isinxnisi.com/` | 開発PCの `127.0.0.1:3200`。画面・機能の手動作業／自動開発の受け入れを完了するたびに、検証済みmainの変更を反映する |
| `https://graph.isinxnisi.net` | VPS上の独立したWeb／DB。まとまった工程の区切りで反映する。必須更新の節目は工程12・16・19・22。工程13の実認証接続などVPS配置が必要な検証や、稼働版の不具合修正はその時点で更新する |

- 更新は担当Codexの完了作業に含め、追加の更新指示を待たない。各工程の検証は維持し、配置だけを上記の頻度で行う。24工程の分母は増やさない。
- 3200は `npm run public:build` → `NEO4J_READ_TIMEOUT_MS=10000 npm run public:start` で更新する。占有プロセスがこのrepoの3200であることを確認して停止・build・再起動し、起動セッションを保持する。既存の凍結版serverやCloudflareの設定は変更しない。文書だけの変更で実行物に影響がなければ再buildは不要。
- 反映後は `/api/dataset` と変更に対応する代表経路を実際の確認URLから確認する。ローカルだけの成功をTunnel経由の成功として報告しない。完了報告には日常確認URLと反映したコードのcommit、VPSを更新したか／どこまで反映済みかを短く示す。
- VPSでは検証済みimageを配置し、HTTPS・readiness・代表経路と既存サービスの継続を確認する。通常のWeb更新でKGの再seed、volume削除、preview認証解除は行わない。初回配置scriptの再実行にはKG applyも含まれるため、Web更新だけの手順と混同しない。
- 配置・起動・外部接続が失敗した場合は、実装完了と確認環境への反映完了を分け、未反映内容・原因・次の対応を残す。権限等で管理者操作が必要なら、具体的な配置物・実行手順を準備して報告する。失敗を黙って飛ばさず、該当する配置の完了扱いにしない。
- 自動開発の未受入worktreeは隔離検証までとし、受入時にmain側が3200へ反映する。無人実行からmain／3200／VPSを上書きしない。

Tunnelはローカル3200の現在の画面を転送する。PC・Web server・Tunnelの停止中は利用できず、VPSの常時稼働とは別。同じ `public-kg` でもローカルとVPSは別DBで、自動同期はしない。ブラウザ内保存もoriginごとであり、localhost／beta／VPS間で自動移行しない。

## 構成と境界

```text
https://graph.isinxnisi.net
  → 既存Caddy（試験中はpreview認証）
  → 127.0.0.1:3200 → Web container:3000
                          → graph-neo4j:7687
operator CLI container ────┘
```

- `compose.production.yaml`を単一構成とする。Neo4jにhost portは付けない。Webもloopbackだけにbindする。既存Caddy／別サービスは維持する。
- 本番は`GRAPH_DEPLOYMENT=production`＋`GRAPH_DATASET=public-kg`＋厳密な`bolt://graph-neo4j:7687`だけを受理する。凍結版の接続guardやローカルpublicの7694/7695は維持する。
- Node 24.21.0、Next 16.3.8、Neo4j 5.26.31-community。Nextのstandalone imageと、tsx／受入資料を持つoperator imageを分ける。VPSでbuildせず開発PCでbuild・検証したimageを転送する。
- `.dockerignore`はallowlist。`.env*`、memo、Git履歴、backupは送らない。資料台帳のうち現行生成検証に必要なファイルだけを含める。Webにcredentialを焼き込まない。
- 管理用imageには、既存の生成validatorがID衝突等を照合する`fixtures/demo.json`も含める。投入は受入済みpublic releaseだけを読む専用CLIに限定し、demoを本番seedしない。Webにはこの照合fixtureをコピーしない。
- 本番envは`/opt/graph-knowledge/app.env`（root、0600）。Composeでruntimeへ注入する。本番CLI／DBは開発用env fileを読み込まない。
- 現時点では`MEMBER_STORAGE_ENABLED=0`。実Google／会員の接続は別工程。会員有効化時にPGとその独立backupを追加する。KGのbackupで会員を巻き戻さない原則は維持する。
- Neo4jのheap最大512MiB／pagecache256MiB、container上限1536MiB、Web上限768MiB。約4GiBのVPSで既存サービスの余地を残す初期値。性能・実測による調整はstep18/19。
- `restart: unless-stopped`、log rotationを設定。Webのreadinessは`GET /api/dataset`でpublic-kgのrevisionが読めることを要求し、空DB／DB障害を成功扱いにしない。Dockerはunhealthyだけでは自動再起動しないため、監視・障害復旧運用はstep19で確認する。
- 接続・接続取得の制限は既存の5秒。読み取りtransactionだけ`NEO4J_READ_TIMEOUT_MS`（整数5000〜15000ms、既定5000）で設定でき、本番Composeは10000msとする。初回試験ではDB再起動直後の近傍取得が約6秒で503になり、通常のreadiness成功だけでは初回Graph取得の余裕が足りなかった。無制限retryや先行warmupで隠さず、cold状態から実ブラウザで再検証する。性能目標・高次数Entityの実測はstep18。

## buildと隔離検証

repo rootで、検証したcodeに対応するtagを付ける。

```bash
docker build --target web -t graph-knowledge-web:TAG .
docker build --target ops -t graph-knowledge-ops:TAG .
npx tsx scripts/test-production.ts TAG
```

検証scriptは3201番の専用projectを作り、空DB・投入・冪等性・backup・再起動・本番imageを使うpublic Playwright（現在6件）・DB停止と復旧を確認して、自分で作ったcontainer／volumeだけを削除する。実行中の3200／凍結版には触れない。

本番構成のローカル試験には、専用Compose project名とprivate envを使う。`GRAPH_WEB_PORT=3201`を指定し、既存3200／凍結版を停止・上書きしない。envには`NEO4J_PASSWORD`、`GRAPH_IMAGE_TAG`、`GRAPH_BACKUP_DIRECTORY`を記載する。`docker compose config`をそのまま表示するとpasswordを展開するため`config --quiet`を使う。

```bash
docker compose -p graph-production-trial --env-file PRIVATE_ENV -f compose.production.yaml up -d --wait graph-neo4j
docker compose -p graph-production-trial --env-file PRIVATE_ENV -f compose.production.yaml run --rm ops validate
docker compose -p graph-production-trial --env-file PRIVATE_ENV -f compose.production.yaml run --rm ops plan
docker compose -p graph-production-trial --env-file PRIVATE_ENV -f compose.production.yaml run --rm ops apply
docker compose -p graph-production-trial --env-file PRIVATE_ENV -f compose.production.yaml run --rm ops apply
docker compose -p graph-production-trial --env-file PRIVATE_ENV -f compose.production.yaml up -d --wait web
GRAPH_TEST_BASE_URL=http://127.0.0.1:3201 npm run public:e2e
```

最初のplanに書込みがないこと、apply2回目がunchanged、backupが0600で生成されること、restartでrevisionが変わらないこと、DB停止で503／再起動で復旧することも確認する。テスト終了時は**テスト用projectだけ**を`down -v`する。本番や既存検証projectへ`-v`を付けない。

## VPSへの初回配置

`scripts/deploy-production.sh`はUbuntu24.04／既存Caddy／developユーザー向けの**管理者実行**手順。Dockerの権限を一般ユーザーへ恒久付与する仕組みやpasswordless sudoは追加しない。

1. ローカルで検証済みの二つのimageを`docker save … | gzip`でarchiveにする。
2. archiveのSHA-256を`archive名.sha256`へ記録し、VPSのdevelopホーム内へ両方と`compose.production.yaml`、`scripts/deploy-production.sh`を同じ構成で転送する。checksumにはarchiveのbasenameを記載する。scriptは転送後に検証する。署名や受入判断の代替ではない。SSH接続先・鍵はprivateな既存設定を利用し、gitへ記録しない。
3. 管理者が以下を実行する。初回のみUbuntu公式packageの`docker.io`／`docker-compose-v2`を導入する。設定・passwordを再生成せず再実行可能。

```bash
sudo bash /home/develop/graph-production-bootstrap/scripts/deploy-production.sh TAG /home/develop/graph-production-images.tar.gz
```

scriptは専用volume／envを用意し、image読込→DB起動→validate→plan→既存KGならbackup→apply2回→Web readiness→backupを実施する。対象releaseはimage内の受入済み初回`20261011-001`。後続releaseの適用時は新しいartifactとbaseReleaseを別途planで確認する。

Caddyは`/etc/caddy/graph-knowledge.caddy`を追加し、元のCaddyfileをbackup後にimport一行を追加する。候補をvalidateしてから置換し、reload失敗時は元へ戻す。既存site blockは書き換えない。既にgraphの別設定がある場合は自動上書きしない。対象VPSのCaddy2.6.2で受理される`basicauth`構文を使用する。

previewのランダムpasswordは`/home/develop/graph-preview-login.txt`（develop、0600）に保存し、ログ／Git／チャットへ出力しない。Caddyにbcrypt hashを置く。認証なしの一般公開へ切り替える操作はscriptへ含めない。

配置後、DNS／証明書・HTTPS・未認証401・認証後の検索→探索→Source・既存通知サービスの継続稼働を実際に確認してstep7を完了とする。認証中は検索engineへ掲載しない。

## 手動運用の最小コマンド

VPSでは、管理者が`docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml …`を使う。

- 状態：`ps`、`logs --tail 100 web`。secret入りenvや`config`全体をログに残さない。
- KG控え：`run --rm ops backup /backups/UNIQUE_NAME.json`。既存fileは上書きしない。
- 復元計画：`run --rm -e PUBLIC_RESTORE_EXPECTED_REVISION=CURRENT_REVISION ops restore-plan /backups/NAME.json`。
- 復元：現在KGを先にbackupし、同じ期待revisionで`restore`。旧版からでも復旧後は新revisionになる。
- DB volume削除は禁止。imageだけ戻してもKGは戻らない。data更新／復元は共通KGの専用経路を使う。

定期backup・VPS外退避・保持期間・disk監視・image更新失敗の運用はstep19の残作業。初回backupだけで災害復旧が完成したとは扱わない。

## 検証記録

2026-10-11。本番imageのNode24.21.0、Neo4j5.26.31、Composeで検証。

- 既存3200／6凍結版と異なる専用project・3201で検証。空DBは503・unready、plan無書込み、105知識Node／128Relationship投入、2回目unchanged。releaseは`20261011-001`、実在Claimは27のまま。
- backupが0600で生成され、DB再起動後もrevisionを保持。DB停止でAPI503／unready、再起動で200／同revisionへ復旧。試験用container／volumeだけを削除した。
- 本番image上の既存Playwright4件が成功（48.2秒）。漫画・科学・Event、三限定、Source、概要、起点切替／復帰、更新失効、旧Claimリンクを確認。スクリーンショットも確認し、CSS／Graph表示を保持した。
- 初回・再試験ではcold近傍取得が約6秒で503となった。読み取りだけ10000msの有限設定にし、先行warmupなしで再起動後の全4件と停止／復旧を通した。接続・接続取得の5秒、API返却契約、データは維持。高次数・本番VPSの応答性能は別工程。
- Web／operatorはuid1000。operatorにもmemo／`.env*`／Git／backup／テスト用server／prompt文書が入らないことを実imageで確認した。
- 2026-10-11時点では、VPSの既存Caddy2.6.2で追加site候補のvalidateとDNS Aを確認し、配置artifactを転送するところまで。管理者配置とHTTPSの確認は翌日の記録を参照。

今回の配置候補tagは`beta-step7-20261011`。Web image `7c1c1f399014`、operator image `977c223500e5`。転送用archiveは896,415,973 bytes、SHA-256は`769094dc9af90371d726690dce9a164894f86f7b93c26a54d20bb33c86559dec`。VPSでは以下の一回で初期配置する。secretは実行時に生成され、Gitや転送imageには入っていない。

```bash
sudo bash /home/develop/graph-production-bootstrap/scripts/deploy-production.sh beta-step7-20261011 /home/develop/graph-production-images.tar.gz
```

通常テスト545/545（26 file）、実DB統合11/11、typecheck、lint、両imageの本番build、Bash構文検証が成功。通常テストは`npm test -- --no-file-parallelism --testTimeout=15000`を使用。初回の既定5秒では既存Capsule UI一件が時間切れになり、重い処理を分けて上記条件で全件を再確認した。語彙checkの既存warning一件は増えていない。ホストの検証Nodeは24.15.0、imageのbuild／実行はrepo指定の24.21.0。

typecheck初回は既存ignoredのEvent dev生成型2 fileが破損していたため、その生成物を除去して再確認した。sourceは変更せず、その後のtypecheckは成功。既存Web3200／3210〜3215は全てAPI200、凍結fixture／dataset／資料台帳／schema／UI sourceの差分はない。

## VPS実起動後の確認

2026-10-12（JST）、ユーザーが上記管理者コマンドを実行し、previewへの接続を確認。その後、実VPSへ以下の読み取り検証を実施し、step7を完了とした。

- `https://graph.isinxnisi.net` の証明書検証が成功。未認証の `/` と `/api/dataset` は401、`X-Robots-Tag: noindex, nofollow, noarchive`。認証後のdatasetとPLUTO検索は200。
- 既存 `tests/e2e/public.spec.ts` をHTTPSへ接続し4/4成功（19.0秒）。検索・開始例、漫画／科学／Event、三限定、関係概要、起点切替／直前復帰、Claim／仏語原表記／Sourceを確認。更新失効と旧撤回参照の表示はテスト内の応答差替えであり、本番KGへ撤回や更新を実行していない。
- PLUTO起点の実スクリーンショットでGraph・文字・3ペインを確認。認証は一時0600 credential fileからブラウザへ渡し、traceは無効化。credentialをGit・画面・コマンド引数・報告へ残さず、検証後に一時fileを削除した。
- 初回backup `ready-20261011T155518Z.json` はdevelop所有・0600。18 Entity / 27 Claim / 15 Source / 29 Citation / 16 ExternalIdentifier（知識Node105）、release `20261011-001`、receipt1、撤回0。backup内revisionと実APIのrevisionが一致した。冪等再投入・DB停止復旧は前述の隔離試験で確認済みで、今回稼働中のVPSでは繰り返していない。
- `systemctl is-active docker caddy resale-ebay-notifications` は全てactive。Webはloopback 3200だけ、Neo4jのhost公開portなし。既存通知siteのHTTPS rootは従来どおり404（rootには経路がない）で、通知serviceも継続稼働。

現在は認証付き試験環境であり、一般β公開・実Google会員接続・運用復旧全体の完了ではない。試験起動確認時は7/24（約29%）。以後の完了数は[進捗](../PUBLIC_BETA_PROGRESS.md)を正本とする。定期backup／外部退避等はstep19、認証を外す判断はstep22に残す。今回の追確認は文書更新だけで、DB・API・UI・本番設定を変更していない。

## 日常確認入口の接続確認

2026-10-12、工程10までのコード `8c0364f` のローカル本番buildをTunnel経由でも確認した。HTTPSの `/`・`/api/dataset` は200、datasetは `public-kg`、revisionは `legacy:20261011-001`。既存Playwrightの320pxタッチ探索／一覧・出典往復と、漫画・科学・Event／限定・概要・起点切替・復帰の2ケースが成功（18.8秒）。実データの書込みはない。

今回は更新契約と文書だけを変更し、既に最新の3200は再buildしていない。VPSはユーザーの更新頻度の変更に従い、工程7の `beta-step7-20261011` のまま。工程8〜10は日常確認先で確認でき、次の定期VPS反映は工程12とする。

2026-10-12、工程11の閲覧／Capsule／会員・共有のスマホ調整後、3200を再build・再起動した。最終build IDは `dZ0DHR4oT4Znt2oBzHsiC`。Tunnel側も同じbuildと `public-kg`／revision `legacy:20261011-001` を返す。最終buildでローカルの閲覧3経路、Tunnelの320px閲覧／制作Role Capsule／漫画・科学・Event探索3経路が成功。会員の実PG検証は隔離環境で行い、Tunnel／VPSへ検証用認証を公開していない。VPSは工程7のまま、次の必須更新は工程12。[進捗末尾の工程11検証結果](../PUBLIC_BETA_PROGRESS.md)を参照。

## 既存Webだけの節目更新（step12以後）

`scripts/update-production-web.sh TAG ARCHIVE.tar.gz` をVPSの管理者がsudoで実行する。検証済みWeb／operator imageのarchiveとbasenameを記載したSHA-256 fileを事前転送する。既存の `/opt/graph-knowledge/compose.yaml`／private env／Caddy／preview認証を維持し、image tagだけ更新する。

既存operatorでKGをbackupしてから、`up --no-deps --pull never --wait web` とreadinessで更新する。KGのapply／再seed、DBの再起動、volume削除、会員有効化は含まない。Web更新が失敗した場合は以前のprivate envを戻し旧imageでの起動を試み、失敗ならその旨を報告する。汎用運用復旧の完成とはせず、外部HTTPS・代表経路と既存サービスの確認までを担当作業に含める。

2026-10-12、step12着手時のSSHユーザーでは `sudo -n` がpassword必須、Docker socketもpermission deniedだった。root SSHも許可されていない。権限設定の恒久変更や初回scriptの再実行で回避せず、具体的な配置物を準備して管理者操作を依頼する。ユーザーの実行後に担当CodexがHTTPS・実ブラウザを確認するまで、VPSへの反映は完了に数えない。

## 工程12の配置物と反映状態

2026-10-13（JST）。設定メニュー・本人表示名・外観保存のWeb更新を準備した。日常確認先は工程12の本番build ID `DgGcElZlO4DGW2isuF962` を返し、dataset／revisionはローカルと同じ `public-kg`／`legacy:20261011-001`。会員設定の実保存は隔離PG＋OIDCで検証し、この入口の会員未設定状態は維持する。

VPS用のtagは `beta-step12-20261012`。Web imageは `sha256:c1eabfbf84d16aa5ea899fd4decd280305cb0bf6f59998117715ebc553cdaf7d`、operatorは `sha256:da4acebbe53d8e591c514bdae722e46b5f14f62e6dcc779b165a02b4b8d27caa`。imageのNodeは24.21.0、Web build IDは `GJuUVUK2vkXbILCQsR2ET`。archiveはVPSの `/home/develop/graph-production-step12/images.tar.gz` へ転送済みで、現地SHA-256検証・script構文検証は成功した。checksumは `4fbf35f080581e0466cbcf0b826e704049c10eaa18254d57e05b5870a8571bff`。

現在のSSHユーザーはDocker socketを操作できず、`sudo -n` も管理者パスワードを要求する。権限変更・迂回は行わず、管理者による次の一回の操作を残している。

```bash
sudo bash /home/develop/graph-production-step12/update-production-web.sh beta-step12-20261012 /home/develop/graph-production-step12/images.tar.gz
```

更新前のVPS dataset revisionは `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`。ローカルのlegacy revisionと一致させるための再投入は行わない。更新後、同じrevisionの維持・HTTPS・imageのbuild ID・代表的な設定／探索操作・既存サービス継続を確認して工程12を完了にする。現時点でVPSは工程7のまま。preview認証・会員無効化も維持する。


工程12のimageは、隔離した本番Composeで空DB503・無書込plan・105知識Node／128 Relationship・二回目unchanged・backup0600・DB再起動保持・ブラウザ14/14（2.1分）・DB停止503・Web再起動なしの復旧を確認済み。停止／再開後は新規HTTP接続と90秒以内のHTTP／Docker health回復を待ち、古いunhealthy判定だけで打ち切らない。試験環境は終了時に専用volumeごと破棄した。VPSの稼働DBへ同じ停止試験を行った意味ではない。

日常確認先は代表4/4（49.6秒）、ローカル3200と既存3210〜3215のdataset APIは全て200。[実装・検証記録](../PUBLIC_BETA_PROGRESS.md#工程12の実装検証2026-10-1213)を参照。VPSへの適用・適用後確認は上記管理者操作待ちであり、ローカル／imageの成功をVPS更新成功として扱わない。


### 工程12のVPS反映確認（2026-10-13）

管理者による更新後、HTTPS上のbuild ID `GJuUVUK2vkXbILCQsR2ET`・設定メニューと、更新前backup／更新後APIのrevision一致を確認した。backup `before-web-20261012T232138Z.json` は0600、revisionは `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`。既存Playwrightの代表4/4（37.1秒）、Docker／Caddy／通知serviceのactiveを確認。preview credentialは一時fileだけで扱い、traceは無効化した。前節の管理者操作待ちは解消し、工程12を完了とした。次の通常のVPS更新は工程16、工程13の実認証接続は必要な時点で反映する。会員機能はまだ無効。

## 工程13の会員接続準備

2026-10-13。本番Composeへ任意のmember profile・専用PG volumeと非superuser、operator imageへ既存migrationを追加した。既定は会員無効で、KG operatorへ会員credentialを渡さない。実Googleが未設定のVPSにはまだ配置しない。[接続・privateな候補env生成・本人認証の完了条件](GOOGLE_MEMBER_CONNECTION.md)を正本とする。通常Web更新と、初回のCompose／PG構成追加を区別する。

## 工程16の配置物と反映状態

2026-10-13。探索に加え、閲覧・保存・会員・共有・コメントの日英UIを準備した。ローカル3200／Tunnelはbuild `98eAc3Mw3apKr3syvIefS`・revision `legacy:20261011-001`、代表2/2を確認済み。会員未設定を維持する。

VPS用tagは `beta-step16-20261013`。Web imageは `sha256:4f6a10e3295c88579b830c2aeab9169f13e81462dedb77e64e1d144f2f6e570a`、operatorは `sha256:de135d1bebbbbdaea3703a4c00f7fd88bf0536e0a6c632df0f7fc4eaff1db497`。Node24.21.0、Web build ID `2sDd_pNucKRYWsHCCq6AK`。app／components／libのsourceは現在の作業内容とbyte単位で一致する。隔離Composeで本番imageのブラウザ19/19・backup・停止／復旧まで検証した。[検証記録](../PUBLIC_BETA_PROGRESS.md#工程16の実装検証2026-10-13)を参照。

archiveと既存更新scriptはVPSの `/home/develop/graph-production-step16/` に転送済み。SHA-256 `9559a5232827b6b4575566ab72db1eced97bf1057eecf6e99bd17712ffb1ef92` の現地検証とscriptの `bash -n` は成功した。既存SSHユーザーの `sudo -n` はパスワードを要求するため、管理者が次を一回実行する。権限の恒久変更は行わない。

```bash
sudo bash /home/develop/graph-production-step16/update-production-web.sh beta-step16-20261013 /home/develop/graph-production-step16/images.tar.gz
```

適用前のVPS dataset revisionは `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`。既存DB・private env・Compose・Caddy・preview認証を維持するWeb更新であり、会員機能を有効化する操作ではない。適用後に担当CodexがHTTPSのbuild、revision維持、日英の閲覧／保存・既存探索と既存サービス継続を確認する。配置準備時点では管理者操作待ちだったが、次節の反映確認で解消した。

### 工程16のVPS反映確認（2026-10-13）

前節の管理者操作待ちは解消。証明書検証付きHTTPSが工程16 build `2sDd_pNucKRYWsHCCq6AK` を返し、dataset revisionは更新前の `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c` を維持した。実装commit `ebf24b8` のimageに対する代表Playwright4/4（1.3分）が成功。英語の閲覧／ブラウザ保存、三domainの探索・三条件・関係概要・起点切替／復帰、Event期間・仏語根拠を確認した。

未認証APIは401・noindex、会員statusは未設定503を維持。Docker／Caddy／既存通知serviceはactive。credentialはGit外0600 fileから渡し、traceは無効化した。今回の確認ではVPSのDB停止・再投入・設定変更は行っていない。隔離Composeの復旧試験と稼働VPSの読み取り確認を区別する。工程16を完了とし、次の通常更新は工程19。実Google接続の構成追加は別途その接続時に反映する。

## デザイン刷新初回案の日常確認先（2026-10-14）

日常確認先3200／Tunnelはbuild `6EDDklJLu6NG_VR-zrYxt` に更新。最終代表2/2（1.1分）、HTMLのbuild一致、dataset／revision維持を確認した。[実装・実画面評価](EDITORIAL_EXPLORER_DESIGN.md)を参照。VPSは工程16のbuild／KG revisionを読み取り確認し、今回の案は未配置。VPS用imageの再作成も今回は行っていない。通常更新は19の契約を維持し、まずユーザーが日常確認先で今回案を評価する。会員未設定503とpreview認証は維持する。
