# Capsule編集・共有・コミュニティ掲載の更新手順

2026-10-30 / Issue #63 / `capsule-contribution-001 / r03`。
[実装契約](../design/CAPSULE_EDITOR.md)、[確認環境の更新契約](../design/PRODUCTION_DEPLOYMENT.md#確認環境の更新契約)、[自動開発との協調](../AUTOPILOT_COLLABORATION.md)に従う。公開の承認と、対象環境への接続・実行・検証の成立は別々に記録する。

## 現在の状態と公開対象

**最新配置（2026-10-31）**: `d1330ea8d5917f8c31d239fe7058c2380c554a2d` を正式サイトへ配置済み。build `1gqqeqXTNSzWUrDAFyWUn`、000〜019／20件。3200／HTTPS βも同じソース（build `5O8HMYFaPiKps5cRvuky_`）。[公開後の実操作・backup検証](../verification/CAPSULE_READING_REFINEMENT_20261030.md#2026-10-31-本番反映完了)を現在の記録とする。以下の011〜015公開時点と各追加工程の記述は履歴であり、現在の適用番号を決め打ちしない。今回の一回用runnerは再実行せず、次回は実環境と新しい固定資材を改めて照合する。

2026-10-30の最新ユーザー指示により、βで確認済みのCapsuleを正式サイト `https://plunode.net` へ公開する。以前の「βまで」「本番VPSは更新しない」は過去の実装作業の区切りであり、この公開作業の制限ではない。

公開対象はβの実行記録から固定した `20e5c84a99dd1e1bfa8fb69779729e68a914bb14`。共有URL更新・OGP・関係先絞り込み・スマホ修正を含む。後続の `28fe3aed`／`b26022e9` はテストと記録であり、アプリ実装に差分はない。古いSHAへ戻さず、無関係な自動開発候補も混ぜない。

[本番公開の実施記録](../verification/CAPSULE_PRODUCTION_20261030.md)で、資材の準備・隔離検証・本番反映・正式URLでの確認を分ける。2026-10-30のr2切替は成功し、正式URLで実Googleログイン・保存・同URL共有更新・コメント・共有停止・固定コミュニティ掲載・OGPを確認済み。今後この一回用launcherをそのまま再実行しない。

接続情報・秘密鍵・sudoパスワードをGitやチャットへ載せない。SSHホスト鍵検証やsudo設定を変更せず、既存のdevelop SSHと管理者sudoを使う。管理者操作が不足するときは、固定資材と具体的な実行手順を準備したうえで必要な操作を示す。

## 更新するものと保持するもの

変更対象はWeb、会員operator、会員DBの追加migration **011／012／013／014／015**（適用済みはchecksum確認のみ）。本線KGへのapply・再seed、公開pipelineの署名・Worker更新、Kev、AI教育／日次予定、管理Connector、OAuth／Caddy／Tunnelの設定変更は含まない。本番のKG用ops imageと独立DB containerも保持する。

ユーザーは旧Capsuleを削除してよいと承認済みである。旧Capsule全件の移行を公開条件にしない。ただし、**旧Capsule削除、全データ消去、会員DB resetを更新の必須処理にしない。** 整理が必要ならCapsuleを特定し、既存の所有者用削除経路を使う。会員・認証・プロフィール・コミュニティ・独立会話・通報・監査・KGの削除へ承認を広げない。

## 固定と隔離検証

1. mainへ受け入れるSHAを固定し、Node 24.21.0で変更範囲の単体／UI、型検査、lint、buildを確認する。実行したSHAとbuild IDを保存する。
2. Docker利用環境では、既存の隔離会員runnerで追加migrationと実PGの認可・競合を確認する。runnerは専用container／tmpfs／55432を使う。既に55432が使われている場合は他のcontainerを止めず、専用のnetwork非公開containerと、そのnetwork namespaceを共有するテストprocessで代替する。既存betaの55433をfixtureへ転用しない。

   ```sh
   npm run test:member -- --capsules
   npm run test:member -- --capsules --e2e
   npm run test:member
   npm run test:member -- --community
   npm run test:member -- --community --safety
   npm run test:member -- --operations
   npm run test:member -- --accounts
   ```

   `--capsules`は`tests/capsule-document.integration.test.ts`を選ぶ。013の既定値・未作成thread・明示OFF保持は`tests/member.integration.test.ts`と後述の復元検証で別途確認する。会員ブラウザfixtureは013／014を明示選択し、`--capsules --e2e`は011／012／013／014を適用したfixture環境で`tests/e2e/capsule-member.spec.ts`を選び、実OIDC・会員保存・指定版共有をブラウザで確認する。匿名編集・通常Graphの実ブラウザ確認は検証記録の対象Web・設定・テストを使う。fixtureと実Googleを区別する。
3. 既存Dockerfileの`web`／`ops` targetを使用する。`ops` targetには`member-migrate.ts`と会員migrationが同梱され、Composeの`member-ops`として使える。

   ```sh
   set -euo pipefail
   # CAPSULE_TAGとCAPSULE_SOURCE_SHAは検証済み固定値へ設定する。
   docker build --platform linux/amd64 --target web --label "org.opencontainers.image.revision=$CAPSULE_SOURCE_SHA" -t "graph-knowledge-web:$CAPSULE_TAG" .
   docker build --platform linux/amd64 --target ops --label "org.opencontainers.image.revision=$CAPSULE_SOURCE_SHA" -t "graph-knowledge-ops:$CAPSULE_TAG" .
   docker save "graph-knowledge-web:$CAPSULE_TAG" "graph-knowledge-ops:$CAPSULE_TAG" | gzip > capsule-images.tar.gz
   sha256sum capsule-images.tar.gz > capsule-images.tar.gz.sha256
   ```

   tagだけを証拠にせず、source SHA、build ID、image ID／OCI manifest、platform、archive SHA256、011／012／013／014／015を含む全migrationのchecksumを固定記録へ保存する。WebのAIラボartifactは配置先の既存状態を保持し、betaの実験artifactを本番へ混入させない。
4. 配置するソース／imageと同じmigration処理を使い、対象DBのbackupを別DBへ復元して追加migration・再実行・代表APIを検証する。対象DBの実ledgerと適用済みchecksumを照合してから未適用の011〜015を追加し、ledger16件と既存行の保持を確認する。初期環境から適用する場合も全系列を選ぶ。移行済みchecksumを書き換えて通さない。
5. build・テスト・Dockerの資材は対象を明示し、private backupを検索対象へ混ぜない。実環境の負荷がある場合はVitestを`--maxWorkers=1 --no-file-parallelism`で実行し、`--exclude 'backups/**'`としてglobをshellで展開させずに渡す。

## 011／012／013／014／015の明示適用契約

実装は[scripts/member-migrate.ts](../../scripts/member-migrate.ts)と[追加migration処理](../../lib/server/member/migrate.ts)。通常Webの起動・APIアクセスから自動適用しない。

| 引数 | 対象・依存 |
| --- | --- |
| `--capsule-documents` | 011。文書外枠schemaVersion 2、内容版の共有停止、更新receiptを準備 |
| `--community-capsules` | 012。固定版掲載・cohort・Capsule通報の固定参照。CLIは011も選ぶが、community系列の選択も必要 |
| `--capsule-comments` | 013。`member_capsule_thread.closed`のDB既定値をfalseへ変更。既存の受付停止・会話行を更新せず、投稿認可を広げない |
| `--capsule-share-recovery` | 014。限定リンクの派生方式列を追加。既存行はnullのまま保持し、新規リンクだけ所有者再取得に対応。認証secret・旧token hash・固定版は変更しない |
| `--capsule-publications` | 015。014を前提に、URL維持の共有反映・公開履歴を準備 |
| `--communities` | 005〜007を検査・選択。012の基礎となるcommunity schemaが必要 |
| `--site-operations` | 008とcommunity系列を検査・選択 |
| `--public-profiles` | 009／010とcommunity・運営系列を検査・選択 |
| `--confirm-origin ORIGIN` | 上記追加系列の選択時に必須。読み込んだ`MEMBER_ORIGIN`と完全一致しなければ適用前に停止 |

既存betaの公開プロフィール・運営を保持する全適用は、次の引数を使う。適用済みのchecksumは再検査し、未適用のmigrationだけを同じtransactionで追加する。000〜014が一致する環境では015のみ追加し、全系列のledgerは**16件**になる。適用前の実ledgerが想定と異なる場合は先に調べる。旧000〜010の環境でもこの全選択で011〜015を準備できる。

```sh
node --import tsx scripts/member-migrate.ts \
  --communities --site-operations --public-profiles \
  --capsule-documents --community-capsules --capsule-comments --capsule-share-recovery \
  --capsule-publications \
  --confirm-origin "$CAPSULE_TARGET_ORIGIN"
```

このコマンドは、**その環境の既存private会員設定を読み込んだoperator**で実行する。betaと本番のDB URL・secret・originを混ぜない。011だけを検証する場合は`--community-capsules`・`--capsule-comments`・`--capsule-share-recovery`・`--capsule-publications`を外す。012を適用する場合はcommunity系列と011を併せて選ぶ。013／014／015は通常Webの起動や既存フラグだけでは適用されない。

migrationは単一transactionと既存advisory lockで行い、失敗時はDDL／ledgerともrollbackする。checksum不一致を上書きしたり、ledger行を削除して再実行しない。結果不明なら現在のledger／schemaを読んでから判断する。

## backup・別DB復元・移行再実行

同じ時点のDBを比較する。稼働中のbetaから採取する場合はread-onlyなrepeatable-read transactionで`pg_export_snapshot()`を取得し、その接続を保ったまま`pg_dump --format=custom --snapshot=SNAPSHOT`を実行する。比較用のtable列・全行fingerprint・migration ledgerもそのsnapshotから採取する。別時点の件数差を移行での消失と誤判定しない。書込を止めてbackupする運用なら、既存beta Webだけを停止し、他serviceを巻き込まない。

1. freshなprivateディレクトリとdump名を使い、既存backupを上書きしない。ディレクトリは0700、dump・private設定・比較結果は0600とし、row本文や認証値をログへ出さない。dump SHA256を記録する。
2. 新しい専用PostgreSQL container／別名DBへrestoreし、sourceの全tableの列・全行fingerprint・ledgerと一致することを確認する。対象の識別情報を記録し、既存beta DBや他のcontainerへrestoreしない。
3. 復元DBの実ledgerから適用済みmigrationのchecksumを照合し、対象originと一致するprivate設定を用いて未適用の011〜015を明示適用する。ledger以外の既存列・既存行が変わらず、`closed`の既定値がfalse、既存OFFはOFF、旧linkの派生方式列はnullのままであることを確認する。
4. 同じコマンドを再実行し、ledger16件・全行fingerprintが変わらないことを確認する。認可・新規共有ON・未作成thread・固定版共有・所有者の同一URL再取得・旧リンク・secret変更時の挙動を実PostgreSQLのテストでも検証する。
5. 検証用containerだけを後片付けし、dumpと照合結果をprivateに保管する。復元・テストの成功はlive betaへのmigration適用を意味しない。適用済みかどうかは対象DBのledgerで別に記録する。

## 開発PCの3200とHTTPS beta

1. 実際の開発PCで`make autopilot-review`、必要なら`make autopilot-status`を確認し、共通holdを保持する。tokenで再確認し、固定SHA・dirty・並行作業を確認する。別クラウドの空ロックを開発PCの排他と扱わない。
2. 既存3200のPID・cwd・build ID、beta会員PG、`MEMBER_ORIGIN`、Google provider、community／運営／profile／広告／AIラボ設定、KG revisionを秘密を除いた記録へ保存する。既存`beta-confirmation.json`による7697接続など、採用済みのKG接続を保持する。runtime採取はprefixの取りこぼしを検査し、特に`SITE_OPERATIONS_ENABLED`・`SITE_OPERATOR_USER_IDS`を落とさない。稼働process、private runtime、`.env.public`の有効値を非公開で照合し、値そのものを出力せず保持結果を記録する。
3. 前節の同一snapshotで既存beta会員DBのprivate custom dumpを作り、別DBへ復元・旧table／ledgerを比較する。live DBの変更前にfresh backupを確保する。停止が必要な場合も既存beta Webだけを対象にし、元DBへのrestoreや会員DB resetを行わない。
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

2026-10-30の本番公開指示に基づき実行する。対象環境の実際のledgerを読み、固定sourceのchecksumと照合して必要な追加migrationを確定する。今回の更新前の実物確認では000〜010が適用済みで、011〜015を追加した。更新後のledgerは000〜015の16件。

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
     --capsule-documents --community-capsules --capsule-comments --capsule-share-recovery \
     --capsule-publications \
     --confirm-origin https://plunode.net
   ```

6. 全checksum・ledger16件・旧データ保全を確認し、同じコマンドの再実行が無変更で終わることを確認する。検証済みcandidateを既存`compose.yaml`へ反映する。旧Compose／設定をprivate backupへ残し、権限を維持する。
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

今回の固定実行資材は `scripts/release-capsule-production.py`。実物確認結果・manifest・archive・復旧公開鍵をroot専用stagingへ複写し、固定checksumの照合後に使う。次回の更新へそのまま再実行する汎用deployではない。既存composeとenvのhash、稼働container、旧ledgerが確認時点と違えば停止する。別DBで011〜015を適用・再実行して旧列全行を照合した後、本番へ明示適用する。変更するCompose値はweb/member-opsのimageだけ。

## Capabilityと代表操作の受入

新Webで本人ログイン後、同originの`GET /api/member/capsule-capabilities`を確認する。011／012適用後は`{"documents":true,"community":true}`、011だけなら`community:false`。匿名は401、会員DB障害は503となる。旧Webの404をmigration未適用の証拠としない。schemaの存在だけを示すAPIなので、bool成功と保存・認可成功も区別する。013／014用のcapabilityフラグは追加していない。コメント既定値は013とDB default、再取得は014の列・新規共有後の所有者GETで確認する。014前のWeb／operatorを混在させず、014適用後に新Webへ切り替える。

| 経路 | 確認する結果 |
| --- | --- |
| Graph→Capsule作成 | 作成時に見えていた対象・個別Claim・配置・視点を共通の広い作業面へ引き継ぐ。タイトル直接入力、右クリック、独自対象・関係・根拠・分類チップ・折り返しと書式を持つテキストを編集する。本線KGは変わらない |
| 再編集・Undo・破棄 | My Capsules／会員一覧から同じ作業面を開く。閲覧中に変えた配置・中心・倍率から編集し、複数選択の一回の移動をUndo／Redoする。破棄確認のフォーカスと取消・復帰、IME変換中のEnter・Esc、狭幅を確認する |
| 明示保存→再訪 | 匿名IndexedDB／本人PGを区別し、保存後reloadで内容・テキスト書式・配置・中心・倍率を読む。表示領域の寸法が変わっても勝手なfitや画面外への移動を起こさない。会員一覧summaryから開く際はdocumentを含む詳細を取得する |
| 定期本人再確認 | 30秒の再確認とタブ復帰を挟み、入力・ドラッグ・選択・メニュー・フォーカスが中断しない。通信失敗でログアウトとせず、実ログアウト／本人変更／失効と遅延応答は分離する |
| 競合・通信結果不明 | 成功表示せず入力を保持。同じrequest IDによる照会／再送で二重版を作らない。別Userへ入力を出さない |
| 限定リンク | 保存済みの指定版を別contextで読む。編集草稿・後のprivate更新を混ぜず、所有者の共有画面を閉じて再訪しても同じURLをコピーできる。再取得は版・コメントを変更せず、停止・再発行・所有者停止で旧アクセスが失効する |
| 共有とコメント | 新規共有の受付switchはONで、会話が自動表示される。投稿資格、未ログイン、OFF、空、読込・投稿・失敗を確認する。所有者の会話はprivate最新版ではなく実際の共有版に紐付き、明示OFFを再発行だけで変えない |
| Community掲載 | 自分の完全な内容と版・閲覧範囲を確認して掲載。読取・関連会話・一覧・Graphへ戻る。新版保存だけで掲載を更新せず、明示更新でだけ変わる |
| 限定範囲の負例 | 非参加者、後参加、退出後再参加、公開→限定→再公開、撤去後、Capsule削除後で権限が復活しない。許可のない題名・本文・件数を一覧へ出さない |
| 通報・運営 | Capsule版を通報し、許可された運営者だけが対象確認・版公開停止を行う。更新後の別版を誤停止せず、停止版の全掲載／限定リンクは読めない。独立会話は存続する |
| 既存機能 | Google再ログイン、プロフィール、コミュニティ会話、通常Graphの検索／条件／出典／復帰、AIラボ往復、日英・PC／狭幅で既存状態を保つ |

実Googleの本人確認・他人との権限試験・スマホ実機・Chromiumエミュレーションを実施範囲ごとに区別する。実運営の停止確認には確認用Capsule・確認用版を使い、既存の会員や投稿を停止して検証しない。AIラボへの往復は閲覧の回帰確認であり、追加推論・教育Worker実行・予定変更をしない。

## 失敗時の戻し方

- **migration前の失敗**：Web／設定を保存した検証済み状態へ戻す。DBは未変更のためrestoreしない。archive・preflight結果・原因を残す。
- **migration失敗・結果不明**：現在のledger／schemaを確認する。単一transactionがrollbackしたことを確認できる場合は原因を修正して同じ固定operatorを使う。checksumを改変しない。
- **migration成功後の不具合**：011／012／013／014／015とデータを保持し、schemaVersion 2を読める修正版へのroll-forwardを優先する。新しい文書・snapshotのあるDBへ、schemaVersion 1しか読めない旧Webを戻さない。外枠schemaVersion 2への対応だけで互換と判定せず、今回追加した`layout.center`／`viewport`・text書式・`node.shape`を含む実文書を読めるbuildか確認する。shapeを保存した後の文書は、未知キーを拒否する旧readerでは読めない。形を失わせるために保存文書を加工せず、shape対応readerを維持して修正する。
- Capsule専用の`disable` flagは今回追加していない。capabilityを偽ってfalseにしたり、tableを落として機能停止を装わない。公開継続できない障害では既存の管理者手順でWebを停止し、互換性を確認したbuildへ切り替える。community全体の既存flagを下げる場合は、個人Capsuleだけの停止にはならないことを明示する。
- DB自体の復旧が必要なら、まず別DBへbackupをrestoreして確認する。backup後の退会・停止・共有失効・通報・書込差分を保全し再適用する。古いdumpで正式DBを自動上書きしない。
- betaだけの問題なら保存した旧build／private設定へ戻せるか、新documentとの互換性を確認する。KGや他の会員・communityデータを巻き戻さない。

完了報告には確認URLと短い操作手順、固定SHA・build ID、使用したimageがあれば識別情報、ソース／隔離検証結果、3200／HTTPS betaの反映状態、migration／capability／代表操作、実画面・操作記録、未確認事項を記載する。ユーザーによる体験評価とAIの実操作評価は区別し、本番VPSについても、実際に更新できたかと正式URLで確認した範囲を明記する。接続または管理者実行が残る場合は、必要な実行箇所と固定資材だけを引き継ぎ、公開済みとしない。

014以降の再取得は、既存MEMBER_AUTH_SECRETとlink ID等から用途を分けたHMACを生成し、DBのhashと一致した場合にのみ所有者へ返す。秘密値そのものは変更・出力しない。secret更新時は旧リンクのhash閲覧を保持するが、元のURLを再生成できなくなるため必要に応じて所有者が作り直す。014は既存リンクを一括再発行しない。


## 2026-10-30: 同一URLへの共有反映とOGP（015）

共有機能の実装時点では既存3200／HTTPS βまでを対象とした。最新の本番公開指示で正式環境も対象に更新した。015は適用済み000〜014を書き換えず追加する。`--capsule-publications`を既存の全明示オプションに加え、対象private runtimeと一致する`--confirm-origin`（betaは`https://graph-beta.isinxnisi.com`、正式環境は`https://plunode.net`）で適用する。015は014を前提とする。

実施前にAutopilot holdと固定SHAを確認し、既存private設定・起動PID・build・Docker・KG・AI artifactを記録する。実DBのread-only exported snapshotによるbackupを別DBへ復元し、全旧列・行のfingerprintと000〜014 checksumを照合する。復元先へ015を適用・再適用して16件のledgerと旧値の保存を検証する。切替時も既存Webを正常終了し、fresh backup・別DB復元後に015を明示適用・再実行する。会員DB全体のresetやliveへのrestoreはしない。

015は共有linkの`token_revision`・更新日時と公開履歴tableを追加し、現に有効なリンクだけをbackfillする。停止済み／コミュニティ限定のsnapshotを公開履歴へ含めない。Webのロールバック時もDBを巻き戻さない。ただし旧Webでは新形式URL・共有更新を扱えず、更新済みリンクの再取得も旧token算出になるため、互換旧Webへの長時間rollbackを通常運用にしない。停止したURLは新HTML・画像・JSON・履歴で読めないことを確認する。

反映後は同じURLへの明示更新、旧版を見たままのコメント、履歴の範囲、共有停止、固定コミュニティ掲載、HTML metadataとPNGを確認する。SNS側のキャッシュ更新はoriginの反映と分けて記録する。旧fragmentリンクの閲覧は残るが、OGP付きで渡すには共有画面で新形式URLをコピーする。


## 閲覧・ごみ箱・掲載導線の更新（018、2026-10-30追記）

Googleプロフィール反映済みの実環境は000〜017／18件であり、冒頭の011〜015公開時点の番号を現在の配置に決め打ちしない。[仕上げ記録](../verification/CAPSULE_READING_REFINEMENT_20261030.md)の固定SHAと直前実環境を照合する。今回の追加は018-capsule-trash.sqlのみ。旧migrationのchecksumを変更しない。

`--capsule-trash --confirm-origin ORIGIN` を既存の全系列オプション（Google画像・公式プロフィールを含む）と併せて実行する。000〜017のchecksum一致を確認し、対象環境のprivate runtimeとoriginを使う。018はnullable列とactive-owner索引を追加するだけで、既存のCapsule・共有・コミュニティ・会員を削除しない。実際のごみ箱移動は所有者がUIで指示した対象だけ。

backupを別DBへ復元し、既存全tableの列・行を比較する。018後も旧列の全行が一致し、trashed_atが全件NULL、ledger19件となること、再実行で変化しないことを確認する。ごみ箱内の内容を旧Webが表示しない保証がないため、018の利用開始後に旧Webへ機械的に戻さない。データを保持したまま互換性のある修正版で復旧する。


### 018反映の資材作成上の注意（2026-10-31）

private stagingでも、trackedソースのディレクトリは0755、通常ファイルは0644、実行ファイルは0755を保つ。秘密設定は0600。member-opsは非rootで実行されるため、別DBへの実migrationでimage内の読み取り権限まで検証する。

開発PCの既存launcherへ移設するβbuildはwebpackを使う。symlink node_modulesを持つstagingからTurbopack buildを移動した際にpgのhash別名解決が失敗した実例がある。build成功とトップページ200だけで完了せず、会員session/APIも確認する。

当初の本番候補は018だけを追加するものだった。現在の `scripts/release-capsule-reading-production.py` は下記019を含む最終候補へ更新済みで、固定SHA・直前Google公式対応buildを照合する。元のGoogle公式指定を再実行しない。2026-10-31に本番実行・公開後確認を完了した。次回は検証記録と稼働構成を確認し、新しい固定資材を準備する。

## コメント通報の追加（019、2026-10-31）

表示修正は `0914b06a` を先に3200／βへ配置済み。続く通報対応では019を追加し、適用済み000〜018を編集しない。`scripts/member-migrate.ts --capsule-post-reports --confirm-origin ORIGIN` は既存系列もchecksum確認したうえで019まで明示適用する。既存本番が017までなら追加は018／019、既存βが018までなら019のみ。実ledgerで確定する。

019は共有IDに拘束したCapsuleコメント通報を共通受信箱に追加する。新しい通報を受け付けた後に旧Webを機械的に再配置しない。旧バージョンは対象種別や確認範囲を扱えないため、データを保持して対応版へroll-forwardする。旧dumpを本番へ上書きしない。

切替前のbackup、別DB復元、旧列全行の一致、旧checksumの保存、019後のledger20件、二回目無変更を確認する。beta実機では既存の共有・コメントを誤って通報／非表示にせず、明示した検証用コメントだけを使う。新しい通報から運営受信箱、監査付き確認、非表示／解除、対応終了、共有停止後の確認拒否まで確認する。Google実セッションと隔離fixtureの検証範囲は分けて記録する。

`release-capsule-reading-production.py` の現行固定ソースは `d1330ea8d5917f8c31d239fe7058c2380c554a2d`、新しいprivate stagingは `capsule-comments-final-20261031`。当初の018専用候補や旧stagingは使わない。切替時にroot権限のread-only auditで稼働build・container・設定・ledgerを取得し、先行Google公式対応と照合する。追加018／019を別DBで適用・再実行した後、本番へ明示適用する。

開発PCの `backups/capsule-comments-final-20261031/run-release.py` は実行時に既存Autopilot guardを取得し、そのtokenでreview/assert後、固定checksumのroot専用資材だけを実行する。終了時にguardを解放する。Codex側のholdを保持したままこのrunnerを重ねて起動しない。VPSのsudoパスワードは本人がterminalへ入力し、チャットへ送らない。権限入力待ちの間は公開未完了として扱う。


## Xカード巡回の修正（2026-10-31）

正式共有ページの巡回禁止がX公式Validatorで確認されたため、`/shared`のrobots Disallowだけを外すWeb更新を準備した。固定ソース`3a533256`、正式build `gICsYdcWaoj_SCu-Pm6jh`、3200／β build `BnsDx3WQt5OBxWKBlbZJg`。[原因・検証・反映状況](../verification/CAPSULE_X_OGP_20261031.md)。新しい一回用`release-capsule-x-ogp-production.py`は直前build・設定・ledgerを照合してWebだけを切り替える。migration／DB restore／member-ops更新は不要。2026-10-31 11:17 JSTにsudo実行・正式反映を完了し、originのrobots・共有meta・PNG・新buildを確認した。X公式Validatorは反映後も旧拒否を返し、投稿前カードも未表示のため、X側での表示成功は未確認。詳細は上記検証記録へ残す。使用済みの一回用runnerを再実行しない。
