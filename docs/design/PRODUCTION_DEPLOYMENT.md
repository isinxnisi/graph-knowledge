# 単一Webと共通KGの本番配置

2026-10-12更新。公開β計画step7は認証付きHTTPSの実起動確認まで完了。[進捗](../PUBLIC_BETA_PROGRESS.md)と[共通KGの適用・復旧契約](PUBLIC_KG_RELEASES.md)を併読する。構成の準備とVPSでの実起動は区別する。閲覧認証を外すβ公開はstep22。

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

検証scriptは3201番の専用projectを作り、空DB・投入・冪等性・backup・再起動・本番imageを使う既存Playwright4経路・DB停止と復旧を確認して、自分で作ったcontainer／volumeだけを削除する。実行中の3200／凍結版には触れない。

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

現在は認証付き試験環境であり、一般β公開・実Google会員接続・運用復旧全体の完了ではない。全体は7/24（約29%）、次は8のUI統一。定期backup／外部退避等はstep19、認証を外す判断はstep22に残す。今回の追確認は文書更新だけで、DB・API・UI・本番設定を変更していない。
