# Capsule文書・コミュニティ掲載の更新手順

2026-10-29 / Issue #63 / `capsule-contribution-001 / r02`。
[実装契約](../design/CAPSULE_EDITOR.md)、[確認環境の更新契約](../design/PRODUCTION_DEPLOYMENT.md#確認環境の更新契約)、[自動開発との協調](../AUTOPILOT_COLLABORATION.md)に従う。公開の承認と、対象環境への接続・実行・検証の成立は別々に記録する。

## 現在の状態と残る接続

**本書の作成時点で、この変更は既存3200／HTTPS beta／本番VPSへ未反映。** クラウドでのソース・隔離PG・一時Webの検証を、既存環境の更新済みとは数えない。このクラウドには既存開発PCのrepo／runtime／共通Autopilotロック、対象VPSのSSH設定・鍵・sudo接続が提供されていない。Dockerを使う本番image／Compose検証も、このクラウドの標準コマンド環境からは未接続である。個々の実検証結果は公開時の検証記録へ追記する。

| 残る実行箇所 | 必要な接続と行うこと |
| --- | --- |
| 既存開発PC | 既存repo・共通Autopilot hold・beta専用会員PG・private runtime設定。受入済み固定SHAをbuildし、011／012を明示適用して既存3200を更新する |
| image検証環境 | Dockerと既存のbuild手順。固定SHAからlinux/amd64 Web／member-ops imageを作り、隔離PGで移行と復旧を検証する |
| 既存VPS | 通常のdevelop SSHと管理者sudo。固定資材を転送・照合し、既存ComposeのWeb／member-opsだけを切り替える |

接続情報・秘密鍵・sudoパスワードをGitやチャットへ載せない。SSHホスト鍵検証やsudo設定を変更せず、利用可能な既存管理端末から実行する。接続できない段階では、固定資材と本書を引き継いで未反映を明記する。

## 更新するものと保持するもの

変更対象はWeb、会員operator、会員DBの追加migration **011／012**。本線KGへのapply・再seed、公開pipelineの署名・Worker更新、Kev、AI教育／日次予定、管理Connector、OAuth／Caddy／Tunnelの設定変更は含まない。本番のKG用ops imageと独立DB containerも保持する。

ユーザーは旧Capsuleを削除してよいと承認済みである。旧Capsule全件の移行を公開条件にしない。ただし、**旧Capsule削除、全データ消去、会員DB resetを更新の必須処理にしない。** 整理が必要ならCapsuleを特定し、既存の所有者用削除経路を使う。会員・認証・プロフィール・コミュニティ・独立会話・通報・監査・KGの削除へ承認を広げない。

## 固定と隔離検証

1. mainへ受け入れるSHAを固定し、Node 24.21.0で変更範囲の単体／UI、型検査、lint、buildを確認する。実行したSHAとbuild IDを保存する。
2. Docker利用環境では、既存の隔離会員runnerで追加migrationと実PGの認可・競合を確認する。runnerは専用container／tmpfs／55432だけを使う。

   ```sh
   npm run test:member -- --capsules
   npm run test:member -- --capsules --e2e
   npm run test:member
   npm run test:member -- --community
   npm run test:member -- --community --safety
   npm run test:member -- --operations
   npm run test:member -- --accounts
   ```

   `--capsules`は`tests/capsule-document.integration.test.ts`を選ぶ。`--capsules --e2e`は011／012を明示適用したfixture環境で`tests/e2e/capsule-member.spec.ts`を選び、実OIDC・会員保存・指定版共有をブラウザで確認する。匿名編集・通常Graphの実ブラウザ確認は検証記録の対象Web・設定・テストを使う。fixtureと実Googleを区別する。
3. 既存Dockerfileの`web`／`ops` targetを使用する。`ops` targetには`member-migrate.ts`と会員migrationが同梱され、Composeの`member-ops`として使える。

   ```sh
   set -euo pipefail
   # CAPSULE_TAGとCAPSULE_SOURCE_SHAは検証済み固定値へ設定する。
   docker build --platform linux/amd64 --target web --label "org.opencontainers.image.revision=$CAPSULE_SOURCE_SHA" -t "graph-knowledge-web:$CAPSULE_TAG" .
   docker build --platform linux/amd64 --target ops --label "org.opencontainers.image.revision=$CAPSULE_SOURCE_SHA" -t "graph-knowledge-ops:$CAPSULE_TAG" .
   docker save "graph-knowledge-web:$CAPSULE_TAG" "graph-knowledge-ops:$CAPSULE_TAG" | gzip > capsule-images.tar.gz
   sha256sum capsule-images.tar.gz > capsule-images.tar.gz.sha256
   ```

   tagだけを証拠にせず、source SHA、build ID、image ID／OCI manifest、platform、archive SHA256、011／012を含む全migrationのchecksumを固定記録へ保存する。WebのAIラボartifactは配置先の既存状態を保持し、betaの実験artifactを本番へ混入させない。
4. imageと同じoperatorで、000〜010のある隔離DBから011／012への移行、同じコマンドの再実行、別DBへのbackup復元、代表APIを検証する。移行済みchecksumを書き換えて通さない。

## 011／012の明示適用契約

実装は[scripts/member-migrate.ts](../../scripts/member-migrate.ts)と[追加migration処理](../../lib/server/member/migrate.ts)。通常Webの起動・APIアクセスから自動適用しない。

| 引数 | 対象・依存 |
| --- | --- |
| `--capsule-documents` | 011。文書外枠schemaVersion 2、内容版の共有停止、更新receiptを準備 |
| `--community-capsules` | 012。固定版掲載・cohort・Capsule通報の固定参照。CLIは011も選ぶが、community系列の選択も必要 |
| `--communities` | 005〜007を検査・選択。012の基礎となるcommunity schemaが必要 |
| `--site-operations` | 008とcommunity系列を検査・選択 |
| `--public-profiles` | 009／010とcommunity・運営系列を検査・選択 |
| `--confirm-origin ORIGIN` | 上記追加系列の選択時に必須。読み込んだ`MEMBER_ORIGIN`と完全一致しなければ適用前に停止 |

既存beta／本番の公開プロフィール・運営を保持する今回の全適用は、次の引数を使う。000〜010が一致すれば再適用せず検査し、未適用011／012だけを同じtransactionで追加する。既存11件に追加する環境ではledgerは**13件**になる。適用前の実ledgerが想定と異なる場合は先に調べる。

```sh
node --import tsx scripts/member-migrate.ts \
  --communities --site-operations --public-profiles \
  --capsule-documents --community-capsules \
  --confirm-origin "$CAPSULE_TARGET_ORIGIN"
```

このコマンドは、**その環境の既存private会員設定を読み込んだoperator**で実行する。betaと本番のDB URL・secret・originを混ぜない。011だけを検証する場合は`--community-capsules`を外す。012を適用する場合はcommunity系列と011を併せて選ぶ。

migrationは単一transactionと既存advisory lockで行い、失敗時はDDL／ledgerともrollbackする。checksum不一致を上書きしたり、ledger行を削除して再実行しない。結果不明なら現在のledger／schemaを読んでから判断する。

## 開発PCの3200とHTTPS beta

1. 実際の開発PCで`make autopilot-review`、必要なら`make autopilot-status`を確認し、共通holdを保持する。tokenで再確認し、固定SHA・dirty・並行作業を確認する。別クラウドの空ロックを開発PCの排他と扱わない。
2. 既存3200のPID・cwd・build ID、beta会員PG、`MEMBER_ORIGIN`、Google provider、community／運営／profile／広告／AIラボ設定、KG revisionを秘密を除いた記録へ保存する。既存`beta-confirmation.json`による7697接続など、採用済みのKG接続を保持する。
3. beta Webだけを止め、既存beta会員DBのprivate custom dumpを作る。復元先を別名のprivate DBとして復元・旧table／ledgerを比較する。元DBへのrestoreや会員DB resetを行わない。
4. betaの既存private設定をoperatorへ読み込み、上記全適用コマンドを実行する。originは既存設定と照合した`CAPSULE_TARGET_ORIGIN`を使う。Google設定をfixtureへ置換しない。
5. 受入済みSHAの検証済みbuildへ切り替える。基本のbuild／start契約は次のとおりだが、既存launcherが設定と確認KGを引き継ぐ場合はその経路を維持する。

   ```sh
   npm run public:build
   NEO4J_READ_TIMEOUT_MS=10000 npm run public:start
   ```

   既存の常駐launcherを使う場合の引数は次のとおり。3200を自動停止するscriptではないため、占有processの所有を確認してから既存betaだけを停止する。`all`を使って別のcommunity試作を巻き込まない。

   ```sh
   python3 scripts/start-local-previews.py beta --node /absolute/path/to/verified/node
   ```

6. `http://127.0.0.1:3200/api/dataset`と**`https://graph-beta.isinxnisi.com/`の両方**からbuild・代表操作を確認する。Tunnelの設定や新しい公開先を作らない。クラウドの一時3200はこの確認の代わりにならない。

## 既存VPSへの反映

既存の正式originは`https://plunode.net`。`/opt/graph-knowledge/app.env`と`/opt/graph-knowledge/compose.yaml`、既存develop SSH＋管理者sudoを使う。[直近の会員公開手順](PUBLIC_ACCOUNTS_RELEASE.md)の固定資材・private backup・別DB復元・Webだけの切替という順序へ接続する。

**過去の固定公開scriptを今回のtagで再実行しない。** `release-public-accounts-production.py`は旧build／009・010等を固定した一回用である。`deploy-production.sh`は初回KG applyを含むため今回には使わない。`update-production-web.sh IMAGE_TAG ARCHIVE`は`GRAPH_IMAGE_TAG`更新とKG用opsによるbackupを行う旧手順で、設置済みComposeがliteral imageで固定されている場合は新Web／member-opsへ切り替わらない。今回の更新へ無条件に流用しない。

1. 検証済みimage archive、checksum、固定manifestを既存developのstagingへ転送し、転送後にもSHA256を照合する。VPS上でsource buildしない。
2. 既存会員反映の排他`/opt/graph-knowledge/.member-activation.lock`を管理者手順で保持し、他の更新と競合させない。ロックファイルを削除しない。管理者権限で現Web／member-ops／KG opsのimage pin、build、全migration checksum、PG／Neo4jのcontainerとStartedAt、Google／Cookie／各既存flag、KG revision、AIラボartifactを確認する。現在の値を古い公開記録から決め打ちしない。設定内容そのものを公開ログへ出さない。
3. 稼働Composeをprivateな`compose.capsule-candidate.yaml`へ複写し、**`web`と`member-ops`のimageだけ**を今回の固定imageへ変更する。KG用`ops`やDB、volume、network、環境変数、他serviceは保持する。`config --quiet`と非公開の意味比較で、この2箇所以外に差がないことを確かめる。新しいCompose構成やhostingを作らない。
4. 現Webだけを停止する。private dumpと設定backupを取り、同じPG内の別名DBまたは既存のprivate復元環境へ実restoreする。既存tableの列・全行hash／ledgerを照合し、復元先だけを撤去する。会員・community・監査を保持し、意図した対象Capsule整理がある場合だけ別記する。復旧用exportは既存の暗号化保管経路を使う。
5. 固定archiveをloadし、candidateのmember-opsで以下を実行する。Composeの通常entrypointに依存せず、既存ops imageのNode／tsxから正しい会員CLIを明示する。

   ```sh
   sudo docker compose \
     --env-file /opt/graph-knowledge/app.env \
     -f /opt/graph-knowledge/compose.capsule-candidate.yaml \
     --profile ops run --rm --no-deps --entrypoint node member-ops \
     --import tsx scripts/member-migrate.ts \
     --communities --site-operations --public-profiles \
     --capsule-documents --community-capsules \
     --confirm-origin https://plunode.net
   ```

6. 全checksum・ledger13件・旧データ保全を確認し、同じコマンドの再実行が無変更で終わることを確認する。検証済みcandidateを既存`compose.yaml`へ反映する。旧Compose／設定をprivate backupへ残し、権限を維持する。
7. 既存service名`web`だけを切り替える。PG／Neo4j・KG opsを再作成せず、既存runtime設定を使う。

   ```sh
   sudo docker compose --env-file /opt/graph-knowledge/app.env \
     -f /opt/graph-knowledge/compose.yaml \
     up -d --no-deps --pull never --wait --wait-timeout 180 web
   sudo docker compose --env-file /opt/graph-knowledge/app.env \
     -f /opt/graph-knowledge/compose.yaml \
     exec -T web node scripts/production-readiness.mjs
   ```

8. 新build／固定image、readiness、正式HTTPS、次節の代表操作、他service継続、DB非再起動、KG revisionと既存AI artifactの保持を記録する。Web更新に本線KGの新release・署名・applyは必要ない。

この節は既存管理経路で行う一回の更新手順であり、自動反映の仕組みを追加したものではない。現在のクラウドから実行済みという意味ではない。

## Capabilityと代表操作の受入

新Webで本人ログイン後、同originの`GET /api/member/capsule-capabilities`を確認する。011／012適用後は`{"documents":true,"community":true}`、011だけなら`community:false`。匿名は401、会員DB障害は503となる。旧Webの404をmigration未適用の証拠としない。schemaの存在だけを示すAPIなので、bool成功と保存・認可成功も区別する。

| 経路 | 確認する結果 |
| --- | --- |
| Graph→Capsule作成 | 作成時に見えていた対象・個別Claim・配置を取り込む。独自対象・関係・根拠・自由テキストを編集し、Undo／Redo・破棄が機能する。本線KGは変わらない |
| 明示保存→再訪 | 匿名IndexedDB／本人PGを区別し、保存後reloadで内容と配置を読む。会員一覧summaryから開く際はdocumentを含む詳細を取得する |
| 競合・通信結果不明 | 成功表示せず入力を保持。同じrequest IDによる照会／再送で二重版を作らない。別Userへ入力を出さない |
| 限定リンク | 保存済みの指定版を別contextで読む。編集草稿・後のprivate更新を混ぜず、停止・再発行・所有者停止で旧アクセスが失効する |
| Community掲載 | 自分の完全な内容と版・閲覧範囲を確認して掲載。読取・関連会話・一覧・Graphへ戻る。新版保存だけで掲載を更新せず、明示更新でだけ変わる |
| 限定範囲の負例 | 非参加者、後参加、退出後再参加、公開→限定→再公開、撤去後、Capsule削除後で権限が復活しない。許可のない題名・本文・件数を一覧へ出さない |
| 通報・運営 | Capsule版を通報し、許可された運営者だけが対象確認・版公開停止を行う。更新後の別版を誤停止せず、停止版の全掲載／限定リンクは読めない。独立会話は存続する |
| 既存機能 | Google再ログイン、プロフィール、コミュニティ会話、通常Graphの検索／条件／出典／復帰、AIラボ往復、日英・PC／狭幅で既存状態を保つ |

実Googleの本人確認・他人との権限試験・スマホ実機・Chromiumエミュレーションを実施範囲ごとに区別する。実運営の停止確認には確認用Capsule・確認用版を使い、既存の会員や投稿を停止して検証しない。AIラボへの往復は閲覧の回帰確認であり、追加推論・教育Worker実行・予定変更をしない。

## 失敗時の戻し方

- **migration前の失敗**：Web／設定を保存した検証済み状態へ戻す。DBは未変更のためrestoreしない。archive・preflight結果・原因を残す。
- **migration失敗・結果不明**：現在のledger／schemaを確認する。単一transactionがrollbackしたことを確認できる場合は原因を修正して同じ固定operatorを使う。checksumを改変しない。
- **migration成功後の不具合**：011／012とデータを保持し、schemaVersion 2を読める修正版へのroll-forwardを優先する。新しい文書・snapshotのあるDBへ、schemaVersion 1しか読めない旧Webを戻さない。
- Capsule専用の`disable` flagは今回追加していない。capabilityを偽ってfalseにしたり、tableを落として機能停止を装わない。公開継続できない障害では既存の管理者手順でWebを停止し、互換性を確認したbuildへ切り替える。community全体の既存flagを下げる場合は、個人Capsuleだけの停止にはならないことを明示する。
- DB自体の復旧が必要なら、まず別DBへbackupをrestoreして確認する。backup後の退会・停止・共有失効・通報・書込差分を保全し再適用する。古いdumpで正式DBを自動上書きしない。
- betaだけの問題なら保存した旧build／private設定へ戻せるか、新documentとの互換性を確認する。KGや他の会員・communityデータを巻き戻さない。

完了報告には固定SHA・build ID、ソース／隔離検証結果、3200／HTTPS beta／VPSそれぞれの反映状態、migration／capability／代表操作、未確認事項を記載する。接続または管理者実行が残る場合は、必要な実行箇所と固定資材だけを引き継ぎ、公開済みとしない。
