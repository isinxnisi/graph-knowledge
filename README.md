# Graph Knowledge

出典付きの関係性を蓄積・探索するサービスの初期基盤です。作業前に[PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md)と[ARCHITECTURE](docs/ARCHITECTURE.md)を参照してください。文書の状態とフェーズ別履歴は[docsの入口](docs/README.md)にまとめています。

初期Vertical Slice（ローカルの読み取り専用デモ）は、実装順序5のUI・テーマ調整まで完了しています。ルートに検索・Cytoscape.jsのGraph・詳細を一画面で表示します。既定環境は架空のデモデータです。別環境の少数実データパイロットは末尾を参照してください。会員Capsuleの認証・保存は任意設定のprototypeです。投稿・Wikidataの大量取り込みや自動同期は未実装です。Graphの可読性・同名表示・選択とスクロールの操作を調整しています。

## 共通KG・公開準備の画面

受入済みの漫画・科学・Eventを一つの検索入口から辿れる `public-kg` を追加しました。公開βへの進捗は[全24ステップ](docs/PUBLIC_BETA_PROGRESS.md)、投入の契約と制限は[共通KGのrelease適用](docs/design/PUBLIC_KG_RELEASES.md)を参照してください。旧検証画面は変更しません。

```bash
cp .env.public.example .env.public
# .env.publicのNEO4J_PASSWORDをローカル用の値へ変更
docker compose --env-file .env.public -f compose.public.yaml up -d --wait
npm run public:validate
npm run public:plan
npm run public:apply
npm run public:dev
```

画面は http://127.0.0.1:3200 。初回は18 Entity・27 Claimで、個々のSource/Citation/限定を保持します。後続releaseは `npm run public:plan -- <directory>` / `npm run public:apply -- <directory>` 。公開KGは明示撤回・差替えとrevision付きcursorに対応します。更新を検知した画面は同じ起点/条件から明示的に読み直します。初回生成物の再作成は `public:prepare`、一時DBの更新試験は `public:integration`、画面試験は `public:e2e` です。

日常のPC／スマホ確認は https://graph-beta.isinxnisi.com/ （Cloudflare経由でこのPCの3200へ接続）。画面・機能の作業／受け入れ完了時に3200を更新します。VPSの https://graph.isinxnisi.net は工程の区切りで更新するため、反映版が異なる場合があります。[更新のタイミングと確認手順](docs/design/PRODUCTION_DEPLOYMENT.md#確認環境の更新契約)を参照してください。PC・Web・Tunnelの停止中は日常確認先も利用できません。

ローカルで本番buildの画面を確認する場合は、3200の開発serverを終了してから次で起動します。read timeoutはVPSと同じ10秒（許容範囲5〜15秒）です。ブラウザを更新して最新buildを確認してください。VPSへ自動配置するコマンドではありません。

```bash
npm run public:build
NEO4J_READ_TIMEOUT_MS=10000 npm run public:start
```

800px以下では「検索／Graph／選択の詳細」で切り替えます。Graph内の「隣接一覧へ」、一覧の「Graphへ戻る」で中央を移動でき、保存入口は検索領域にあります。タップ・ピンチ、既存の表示倍率ボタンとテキスト一覧で探索できます。

KGのbackup/復元（会員PGは対象外）:

```bash
mkdir -p backups
npm run public:backup -- backups/public-kg-before-update.json
curl http://127.0.0.1:3200/api/dataset
PUBLIC_RESTORE_EXPECTED_REVISION='<対象DBの現在revision>' npm run public:restore:plan -- backups/public-kg-before-update.json
PUBLIC_RESTORE_EXPECTED_REVISION='<plan時と同じrevision>' npm run public:restore -- backups/public-kg-before-update.json
```

空の専用DBへ復元する場合だけ期待revisionを `empty` にします。backup自体にある過去revisionと、復元先DBの現在revisionは異なり得ます。更新作業を止め、現在KGもbackupしてからplanを確認してください。復元後は新revisionになり旧cursorは失効します。既知schemaの論理backupの範囲と撤回manifestは[適用・復旧契約](docs/design/PUBLIC_KG_RELEASES.md)を参照してください。


## 起点と条件を保存して再訪する

検索欄またはGraph起点欄の「保存・再訪」から、現在の起点と適用中の条件を名前付きで保存できます。同じブラウザで再読込した後も一覧から開けます。保存はdatasetごと20件までで、ブラウザのデータ削除で失われます。

開くと現在のデータを取得します。展開した枝・配置は保存しません。開く前の探索には「直前の探索へ戻る」で戻れます。会員同期・共有は未実装です。[詳しい保存範囲](docs/design/LOCAL_SAVED_VIEWS.md)。

## 説明付きCapsuleを保存する

「Capsuleを作る・読む」で対象と主張を選び、題名と自分の説明をブラウザ内に保存できます。会員保存を設定した環境では、閲覧中の「この内容をアカウントへ保存」から別タブでログインし、選んだ内容だけを非公開で保存できます。`/member` から本人の一覧・現在の根拠を読み、対象から探索へ進めます。元のブラウザ保存は残り、編集は自動同期されません。

会員保存の無設定時は利用不可を表示し、既存の探索は利用できます。[設定・保存境界・未実装範囲](docs/design/MEMBER_CAPSULES.md)を参照してください。外部認証情報なしの検証は `npm run test:member`（実DB・API）、`npm run test:member:e2e`（ブラウザ）で実行できます。専用の一時PostgreSQLと開発OIDCを起動して終了時に破棄します。試験用開発ビルドはWebpackと、通常画面・buildとは別の `.next-member-test` を使います。55432・3221・3222が空いている必要があり、E2EにはPlaywrightのChromiumとそのLinux依存ライブラリも必要です。

## 必要な環境

- Node.js **24.21.0**（.nvmrcに固定）、付属のnpm。
- Docker Engine / Docker DesktopとDocker Compose。
- ローカルの7474、7687ポートが空いていること。

nvmを利用している場合は`nvm install`、`nvm use`でNodeを選択できます。既存Nodeの上書きは不要です。

## セットアップと投入

```bash
cp .env.example .env
npm ci
docker compose up -d --wait
npm run fixture:validate
npm run db:constraints
npm run db:seed
npm run db:seed
```

.envのパスワードはローカル開発用です。Composeとseedは同じ.envを読みます。Neo4j Browserはhttp://127.0.0.1:7474、Boltは127.0.0.1:7687です。接続情報はサーバー用で、NEXT_PUBLIC変数は使いません。既存データボリュームのパスワードは.envの変更だけでは変更されません。

fixtureはすべて架空データです。正常なfixtureはEntity 12、Claim 15、Source 5、Citation 15の計47ノード、SUBJECT/OBJECT/HAS_CITATION/CITESが各15の計60 Relationshipです。ExternalIdentifierとHAS_EXTERNAL_IDは0です。

初回seedの作成件数は47ノード・60 Relationship、2回目は両方0になります。seedのJSON出力で、fixture期待件数・今回の作成件数・DB全体件数を確認できます。DB全体件数は開発専用DBを前提とします。

## 検証

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run dev
```

通常テストはDB不要です。統合テストはこのComposeの開発専用Neo4jを使い、seedの冪等性とHTTP経由のAPIを直列実行で検証します。APIテストは空きポートでNext.jsを自動起動して終了時に停止します。公開状態・不正データの検証では一部のデータを一時変更し、必ず復元します。503の検証ではNeo4jを一時停止し、finallyで再起動します。他のDB作業と同時に実行しないでください。終了時に全属性・接続が元に戻っていることを確認し、DB全体の削除は行いません。

Next.jsのdev/startでルートの探索画面と以下のAPIを提供します。APIだけを検証する場合は`npm run test:api`を実行します。

## fixtureとseedの扱い

- fixtures/demo.jsonのUUID v4は固定です。毎回生成し直しません。
- Zodで全件の型、ID、参照、関係のkind、日付を検証してから接続します。
- 各ClaimのsubjectId/objectId、CitationのclaimId/sourceIdは一つのIDのみを許可します。
- 制約はneo4j/constraints.cypherで定義し、IF NOT EXISTSで適用します。seedも先に制約を適用します。
- Neo4jのスキーマ操作はデータ操作と別トランザクションです。fixtureのデータ投入は全件を一つのトランザクションで実行します。
- seedはON CREATEでのみ属性を保存し、同じIDの既存属性・接続がfixtureと違う場合は拒否します。差分更新・削除同期は行いません。
- 部分日付は精度を維持したスカラーへ展開します。不明の日付は保存時にpropertyを省略し、読み取り時にnullとして扱います。
- 6つの一意制約は各ノードのid、およびExternalIdentifierのnamespace/valueです。現在のfixtureに外部IDはありません。

fixture内容を変更して初めから投入する場合は、開発専用データを消してよいことを確認したうえで、以下を**明示的に**実行します。通常のseedやテストはこの操作を行いません。

```bash
docker compose down --volumes
docker compose up -d --wait
npm run db:seed
```

停止してデータを保持する場合は`docker compose down`を使います。

## 読み取りAPI

| GET経路 | 内容 | 既定値 / 上限 |
| --- | --- | --- |
| /api/entities?q=...&kind=work | 人物・作品・組織の名称・別名検索（kind省略はすべて） | limit 10 / 20 |
| /api/entities/{id} | Entity詳細・別名 | UUID v4 |
| /api/entities/{id}/overview | 現在datasetの公開Claimを種類・視点・肯否・domain限定別に集計 | UUID v4、探索条件から独立 |
| /api/entities/{id}/neighbors | 公開Claimの両方向1段階探索 | limit 20 / 50、afterは前のnextCursor |
| /api/claims/{id} | 主張・Citation・Source・他の同一関係のClaim ID | UUID v4 |

すべてJSON、Cache-Control: no-storeです。DBはサーバーだけから接続します。検索結果にはkind・description・aliasesを含みます。kindは検索候補だけを絞り、探索の関係・Role条件とは独立です。入力不正400、存在しない対象・非公開Claim404、GET以外405、内部エラー500、DB接続不能・タイムアウト503です。非GETにはAllow: GETを返し、HEADにはHTTP仕様どおり本文がありません。

```bash
npm run dev
```

別のターミナルで、起動ログに表示されたポートに合わせて確認できます。次のIDは固定fixtureの青葉ハルとC01です。

```bash
API_BASE_URL=http://127.0.0.1:3000
curl --get "$API_BASE_URL/api/entities" --data-urlencode 'q=青葉ハル'
curl "$API_BASE_URL/api/entities/c286065c-6e17-47a7-9288-2a1cf6919ce9"
curl "$API_BASE_URL/api/entities/c286065c-6e17-47a7-9288-2a1cf6919ce9/neighbors?limit=2"
curl "$API_BASE_URL/api/claims/580dd445-3287-401d-bcce-43af3caaf509"
```

返却型・主要Cypher・検証記録は[Step 3実施記録](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_STEP_3.md)、取得した応答例は[API_RESPONSE_EXAMPLES.json](docs/API_RESPONSE_EXAMPLES.json)を参照してください。

## 探索UIとブラウザテスト

`npm run dev`で起動し、表示されたURLを開きます。「青葉ハル」を検索して選択し、Graphの作品「星の航路」をクリックして追加展開できます。線から主張・期間・出典・参照箇所を確認できます。Graph下のテキスト一覧でも同じ操作ができます。同名の「佐藤アキ」は説明で判別でき、「森ユウ」は孤立人物です。

Nodeクリックは一段階のみ展開します。追加ページは右の「続きを表示」から取得します。既存位置を保つため、新しいNodeが画面外に配置された場合は「全体を表示」を使用してください。Entity 100 / Claim 200の上限を超えるページは追加せず、他の展開を閉じて再試行できます。別の人物の検索・選択でも探索をリセットできます。

```bash
npx playwright install chromium
# Linuxで必要な共有ライブラリが不足する場合:
# npx playwright install-deps chromium
npm run test:e2e
```

DBをseed済みにして実行してください。ブラウザテストは3210番ポートでNext.jsを自動起動・停止します。DB停止を含むAPI統合テストとは同時に実行しないでください。通常テストは状態管理・主張カードも検証します。E2Eのページングは実APIのlimit=2、上限とHTTPエラーはテスト内の応答制御を使い、fixtureとDBを変更しません。

[Step 4実施記録](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_STEP_4.md)にファイル・状態管理・レイアウト・検証範囲を記録しています。

## 手動の画面確認とテスト用Webの違い

自動開発のcommit・テスト成功と、手動確認用Webの常駐は別です。Playwrightが起動したWebは試験終了時に停止します。DBの起動だけでは探索画面は開きません。以下のコマンドを各terminalで保持すると、同じmainのコードをdataset別に確認できます。起動済みWebでPlaywrightを実行する時は `GRAPH_TEST_REUSE=1` を付け、手動用Webを再利用します。

| データ | URL | Web起動 |
| --- | --- | --- |
| demo | http://127.0.0.1:3210 | `npm run dev -- --port 3210` |
| 漫画v1（広いClaim） | http://127.0.0.1:3211 | `npm run pilot:dev` |
| 漫画v2（制作Role） | http://127.0.0.1:3212 | `npm run pilot:v2:dev` |
| 科学v1（広いClaim） | http://127.0.0.1:3213 | `npm run science:dev` |
| 科学v2（組織立場） | http://127.0.0.1:3214 | `npm run science:v2:dev` |
| Event（特定開催回参加） | http://127.0.0.1:3215 | `npm run event:dev` |

各環境の既存env・専用DBを使います。DBが停止している場合は下記の各dataset節のCompose起動を行い、healthyを待ちます。既存volumeへ画面確認のために再seedする必要はありません。全環境の同時起動・初回コンパイル・試験の並行実行はPC負荷が増えるため、重い検証は順に行います。DBのhealthcheckは認証付きHTTP経由で `RETURN 1` を30秒間隔で実行し、HTTP成功・空のerrors配列を確認します。毎回Javaを起動せず、wgetの5秒timeoutで失敗を戻します。Bolt経由のAPIは別途画面確認で検証します。プロセス終了やPC再起動後の自動復帰は今回追加していません。

## Step 5の画面確認

```bash
npm run dev -- --port 3210
```

[http://localhost:3210](http://localhost:3210)を開きます。青葉ハルから星の航路、橘ソラ、黒川レン、白石ミオ、月の工房、月刊コミック灯などをクリックし、一段階ずつ展開します。11 Entity / 15 Claimまで広げると、佐藤アキの漫画家・編集者をGraph上でも区別できます。淡い外枠が直近に表示されたNode、二重枠が展開済みです。「全体を表示」で表示範囲を手動調整できます。

線を選ぶと主張・期間・Citation/Source・関連主張を確認でき、下の一覧も選択状態を示します。詳細・一覧のスクロールはGraphの表示範囲を動かしません。

開発サーバーが既に3210番で起動している場合、テストは次でそのサーバーを利用できます。既定ではテスト専用サーバーを自動起動します。

```bash
GRAPH_TEST_REUSE=1 npm run test:e2e
# 別のポートを指定する場合:
# GRAPH_TEST_PORT=3211 npm run test:e2e
```

同じディレクトリのNext.js devは同時に複数起動できないため、起動済みの場合はreuseを指定してください。[Step 5実施記録](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_STEP_5.md)に変更内容・ブラウザ検証・スクリーンショットを記録しています。

Graphの線は同じ主体・関係タイプ・対象のClaimをまとめた表示用Relationです。肯定・否定の混在は「肯定・否定あり」と点線で示し、矛盾や真偽を判定しません。クリックすると関係全体の概要から独立した各Claimの限定・期間・出典を確認できます。初期Graphは7 Claim / 5 Relation、全展開は15 Claim / 13 Relationです。未取得ページがある場合、Graph表示は取得済みの主張に基づきます。

Graphの配置・曲率の最新調整と確認画像は [IMPLEMENTATION_GRAPH_BALANCE.md](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_GRAPH_BALANCE.md) を参照してください。

テーマ色は `app/theme.css` に集約しています。画面とGraphで共有しています。右上でライト/ダークを切り替え、ダーク時はブラウン/ブルーを選べます。配色切り替えにGraphも追従します。CSS定義を編集した後は画面を再読み込みしてください。配色・検証・完了範囲は [IMPLEMENTATION_THEME.md](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_THEME.md) を参照してください。

## 展開を閉じる・再開する

青葉ハル→星の航路→白石ミオと展開した後、星の航路の詳細または一覧の「展開を閉じる」を押すと、その展開で支えられていた枝を閉じます。別経路が支えるEntity・Claimは残ります。起点も閉じられますが、起点Nodeは残ります。

未選択Nodeのクリックは即時に選択・必要な展開を行い、選択中Nodeの再クリックは300msの判定後に開閉します。300ms以内のダブルクリックは開閉を抑止します（別動作は未割当）。閉じたNodeのクリックか「展開を再開」で受理済みの枝を戻します。祖先の閉鎖で休止した子孫も戻り、明示的に閉じた子孫は戻りません。復元だけでは通信せず、追加ページは従来の「続きを表示」です。二重枠は現在開いている受理済み展開を示します。

残存Nodeの位置とpan/zoomを維持します。復元Nodeは以前の座標を優先し、衝突時だけ追加配置します。上限で復元できない場合は他の枝を閉じて再試行してください。探索キャッシュは有限で、破棄された枝は再取得になります。ページ再読込・中心変更で探索状態はリセットします。

[開閉フェーズ実施記録](docs/archive/phase-02-exploration-close/IMPLEMENTATION_EXPLORATION_CLOSE.md)を参照してください。API・DB・fixtureは変更せず、条件付き探索・複数起点・時系列はまだ追加していません。

Nodeクリックと今後の設定の責務は [GRAPH_INTERACTION_AND_SETTINGS.md](docs/design/GRAPH_INTERACTION_AND_SETTINGS.md) に記録しています。設定モーダル・永続化はまだ追加していません。

## 辿る関係を選ぶ

検索欄の下で既存4種類の関係を選び「適用」します。全件選択は従来の自由探索、全件解除は関係を表示しない指定です。編集中のチェック変更だけではGraphを変えません。適用すると同じ起点から取得し直し、旧条件の枝・開閉状態・cursorはリセットします。共通Nodeの座標と表示範囲は可能な限り維持します。起点を検索から変更しても適用中の条件は維持します。

条件付きの近傍API例：GET /api/entities/{id}/neighbors?predicates=ASSISTANT_OF,INFLUENCED_BY&limit=2。続きを取得する時は返されたnextCursorをそのままafterへ渡し、同じpredicate集合を指定してください。条件付きcursorは起点と条件に結び付いており、別条件との混用は400です。条件を省略した無条件のUUID cursorは維持しています。条件内の結果なしは、孤立Entityとは分けて表示します。

[条件付き探索の契約](docs/design/CONDITIONAL_EXPLORATION_PHASE.md)を参照してください。起動済みdevをAPI統合テストに使う場合は API_TEST_BASE_URL=http://127.0.0.1:3210 npm run test:integration を使用できます。統合テストはDB停止・再開を含むためPlaywrightと同時実行しないでください。

検証結果と確認画像は [Phase 03実施記録](docs/archive/phase-03-conditional-exploration/IMPLEMENTATION_CONDITIONAL_EXPLORATION.md) を参照してください。

## 少数実データパイロット v1

架空demoを残し、浦沢直樹周辺の確認した資料だけを別環境で探索できます。収録は人物5・漫画作品3・Claim9（制作関与8、人物間の影響1）・Source4・Citation9です。網羅的な経歴データではありません。[収集台帳と版](datasets/pilot-urasawa/v1/README.md)を参照してください。

Node 24.21.0の環境で、プロジェクトルートから実行します。

```bash
cp .env.pilot.example .env.pilot
npm run pilot:validate
docker compose --env-file .env.pilot -f compose.pilot.yaml up -d --wait --wait-timeout 180
npm run pilot:seed
npm run pilot:dev
```

画面は **http://127.0.0.1:3211**。「少数実データパイロット v1」の表示を確認し、「浦沢直樹」を検索してください。PLUTO → 長崎尚志 → MASTERキートン → 勝鹿北星と辿れます。BILLY BATも展開し、線を選んで引用詳細のプロデュース／脚本／ストーリー共同制作と、根拠とする巻・版を確認してください。「影響を受けた」だけを適用すると、本人インタビューを根拠とする手塚治虫への関係を確認できます。

既存の.envは変更しません。パイロットは別compose project・別volume、Neo4j Browserは7475、Boltは7688、Next出力は.next-pilotです。demoは従来の7474 / 7687を維持します。プロセスはデータセットと接続先を検査します。シェルに既にNEO4J_URI等をexportしている場合、その値が.env.pilotより優先されるので、別のシェルで実行するか設定を確認してください。既存ファイルのある場合は.env.pilotを上書きせず内容を確認します。

seedは指定データセット・実行モード・接続先が食い違う場合、またはDB内に対象外のNode/Relationshipがある場合に拒否します。変更済みデータへ上書き更新はしません。demoのseedは`npm run db:seed`、実データは`npm run pilot:seed`を使用し、混在させないでください。環境を切り替える際はサーバーを再起動します。

パイロットの生成／検証はオフラインです。`npm run pilot:prepare`はledgerからdata/manifestを生成します。原資料を再取得して黙って更新する処理はありません。

```bash
npm run pilot:integration
npm run pilot:e2e
```

実データの統合テストは.env.pilotを使用します。ブラウザテストは3211の専用サーバーを使い、既に起動している場合は`GRAPH_TEST_REUSE=1 npm run pilot:e2e`で確認できます。demoの`test:integration`はDB停止・一時書込みを行うので、パイロット設定では実行を拒否します。demoのブラウザ回帰は従来の`test:e2e`で、パイロットのケースは分離しています。同じdemo DBに対する統合テストとブラウザテストは順番に実行してください。

パイロットを停止する場合は専用サーバーをCtrl+Cで終了し、次を実行します。データvolumeは残ります。

```bash
docker compose --env-file .env.pilot -f compose.pilot.yaml stop
```

## 関係語彙の意味契約

Phase 16で[Relation・Claim・Predicate・typed qualificationの基本設計](docs/design/RELATION_MODEL_PRINCIPLES.md)を採用しました。新語彙・限定の追加判断、共通機構とdomain固有意味、比較／表示／根拠の境界をここへまとめています。個別語彙の変更時は各domain契約と併せて参照してください。

既存4 predicateの包含・除外・境界例と変更手順は [Predicate意味契約](docs/design/PREDICATE_CONTRACTS.md) を参照してください。`npm run vocabulary:check`をlint/testでも実行します。追加・変更には全既存語彙との比較と、変更前後hashに一致する承認済み票が必要です。使用済みIDの意味を変えず、基準版を書き換えません。コミット済みの変更を審査する場合は `npm run vocabulary:check -- --base-ref <変更開始前のcommit>` を使います。Phase 05ではRoleを導入していません。現在の限定Roleは下記Phase 06を参照してください。

## 制作Role v2環境

[採用契約](docs/design/CONTRIBUTION_ROLE_CONTRACTS.md)・[実施記録](docs/archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)を参照。実データ候補は人間の受入を経たものだけ生成します。v1は変更しません。

```bash
cp .env.pilot-v2.example .env.pilot-v2
docker compose --env-file .env.pilot-v2 -f compose.pilot-v2.yaml up -d --wait
npm run pilot:v2:prepare
npm run pilot:v2:validate
npm run pilot:v2:seed
npm run pilot:v2:dev
```

http://127.0.0.1:3212 で「長崎尚志」を検索。Role条件はGraph上部の「見る関係を編集」から、刊行物の限定・原表記はEdgeの詳細で確認します。2026-10-04に5候補を受入済み。旧9 Claimと役割付き5 Claimを保持し、Graphでは9 Relationへ集約します。受入範囲は指定刊行物の商品情報のクレジットです。生成データを直接編集せず、今版は凍結し、以後の追加は新dataset版で人間判断と生成・検証を行ってください。

検証：`npm run pilot:v2:integration`、`npm run pilot:v2:e2e`。専用テストの架空Claimはpilotファイルへ保存しません。

## 探索の始め方（Phase 07）

名前・別名を検索し、人物・作品・組織の候補を選ぶと一段階のGraphが表示されます。初めから関係や制作役割を選ぶ必要はありません。Nodeから枝を辿り、線から個々の主張と出典を確認できます。

Graph上部の「適用中」は現在辿っている条件です。「見る関係を編集」で条件を調整し、「適用」した時だけ同じ起点から取得し直します。キャンセル／Escapeでは未適用の変更を捨て、探索を保ちます。制作関与を選んだ編集画面には「制作の役割を調整」があります。「役割で絞らない」は広いClaimも含み、「役割を指定する」は選択Role付きClaimだけを対象にします。全Roleを選んでも役割未指定Claimは含みません。

詳細は「詳細を広く読む」で幅を切り替えられます。Graphの座標・選択・pan/zoomは維持されます。現在はPhase 09の統一入口から人物・作品・組織を検索できます。実Role画面の確認はv2専用環境を起動して http://127.0.0.1:3212 を開き、「長崎尚志」等を検索してください。[Phase 07実施記録](docs/archive/phase-07-exploration-entry/IMPLEMENTATION_EXPLORATION_ENTRY.md)に画像と検証結果をまとめています。


## 関係を俯瞰し、探索の主題を変える（Phase 08）

Entity詳細の「関係概要を見る」で、現在のdatasetに登録された関係の種類・方向を先に確認できます。主張件数とdomain別の限定内訳は折り畳み、制作Role・組織立場・参加立場の記録は短く補助表示します。件数は人数やGraphの線数ではありません。現在の探索条件では絞りません。Nodeのダブルクリックも同じ概要を開きます。初回クリックの選択・展開はそのままです。

「この対象から広く見る」で追加条件を解除して新しい起点へ、「同じ条件でこの対象から見る」で適用条件を保って切り替えます。Entity詳細から直接切り替えることもできます。「直前の探索へ戻る」は一回だけ元の受理済み範囲・開閉・座標・表示範囲へ戻ります。未完了だった取得は再試行してください。再読込や検索候補からの新探索で復帰記録は消えます。

demoは `npm run dev -- --port 3210` で http://127.0.0.1:3210 、実Roleのv2は http://127.0.0.1:3212 （上記の起動コマンドを参照）。「青葉ハル」／「長崎尚志」から概要→別Entity起点→直前復帰を確認できます。[Phase 08実施記録](docs/archive/phase-08-entity-overview/IMPLEMENTATION_ENTITY_OVERVIEW.md)を参照。


## 一般Entity検索（Phase 09）

一つの「対象を探す」フォームから人物・作品・組織を検索できます。既定はすべて。検索対象の選択や検索だけではGraphを変えず、候補を選ぶと適用中の関係／Role条件を保って探索を開始します。デモでは「青葉ハル」「星の航路」「青空出版」、実データv2では「PLUTO」「Master Keaton」から開始できます。Phase 09時点の対象は三種。Phase 15では特定開催回のeventも検索へ公開しています。

起動先はdemo http://127.0.0.1:3210、実データv2 http://127.0.0.1:3212。常時起動を保証する表示ではありません。通常の`npm run dev`では起動ログのURLを使ってください。[実施記録](docs/archive/phase-09-entity-search/IMPLEMENTATION_ENTITY_SEARCH.md)に検証経路を記録しています。

## 科学・研究機関パイロット（Phase 10）

人物5・機関3・広いAFFILIATED_WITH 8 Claimの凍結版です。C09の人物間影響はpendingで投入していません。demo／漫画v1／v2とは別環境です。[台帳・生成物・受入と起動](datasets/pilot-science/v1/README.md)／[画面観察・検証](docs/archive/phase-10-science-pilot/IMPLEMENTATION_SCIENCE_PILOT.md)。

```bash
cp .env.science.example .env.science
npm run science:validate
docker compose --env-file .env.science -f compose.science.yaml up -d --wait --wait-timeout 180
npm run science:seed
npm run science:dev
```

既存.env.scienceは上書きしないでください。Node24.21.0を使用。画面は **http://127.0.0.1:3213**。「ゲッティンゲン大学」→パウリ→ニールス・ボーア研究所→ディラック→ケンブリッジ大学と辿れます。原職位と資料の限定は線の詳細／Citationにあります。現在名で表示し、同時在籍・面識・共同研究を認定するGraphではありません。

生成確認はscience:prepare／science:validate、専用Web起動後にscience:integration、ブラウザはscience:e2e（起動済みサーバーを使うならGRAPH_TEST_REUSE=1）。DBはBolt7690／Browser7477、Next出力は.next-scienceです。停止は `docker compose --env-file .env.science -f compose.science.yaml stop`、volumeは残ります。

### 固定の探索開始例

左ペインの「探索してみる」から、現在のdatasetに存在する人物・作品・組織を文字入力なしで起点にできます。開始例は追加条件なしで新しい探索を開始します。既存の検索とGraph途中での起点切替・直前復帰も維持しています。関係モデルを検証する追加データの構成案は[設計文書](docs/design/RELATION_MODEL_VALIDATION_SAMPLES.md)を参照してください。新規データはまだ投入していません。

## 科学v2：時期別の組織立場

Phase 14の限定検証環境は **http://127.0.0.1:3214**。科学v1の広い8 Claimを残し、Visitor 1924–1925 / Associate professor 1926–1927の2 Claimを追加しています。制作Roleと組織の立場は別の条件です。

```bash
cp .env.science-v2.example .env.science-v2
docker compose --env-file .env.science-v2 -f compose.science-v2.yaml up -d --wait
npm run science:v2:validate
npm run qualification:check
npm run science:v2:seed
npm run science:v2:dev
```

ハイゼンベルクの開始例からNBIの線を選び、広いClaimと2立場/期間の詳細を比較できます。「見る関係を編集」→「組織との関わりの立場を調整」から絞ります。起点切替・直前復帰は従来どおり。[dataset・検証方法](datasets/pilot-science/v2/README.md)／[採用契約](docs/design/TYPED_QUALIFICATION_CONTRACTS.md)。

## 特定Event参加（Phase 15）

[採用契約](docs/design/EVENT_PARTICIPATION_CONTRACTS.md)と[完了記録](docs/archive/phase-15-event-participation/README.md)を参照。PARTICIPATED_INと会議議長限定を追加。開催回の開催期間はEntity側、参加Claimの期間とは別です。既存三種に加え、特定開催回のeventを同じ検索・探索へ公開します。

[実資料dataset](datasets/pilot-event/v1/README.md)は人間受入後に生成・投入・検証済みです。確認画面は **http://127.0.0.1:3215**。初期画面の「第5回ソルヴェイ物理会議（1927）」開始例を押し、Lorentzの線を選ぶと広い参加と会議議長限定のClaimを比較できます。Event詳細に開催期間、Claim詳細に期間不明を表示します。

```bash
cp .env.event.example .env.event # 初回だけ。既存の設定を上書きしない
npm run event:validate
docker compose --env-file .env.event -f compose.event.yaml up -d --wait
npm run event:seed
npm run event:dev
```

「見る関係を編集」→「参加上の立場を調整」→「会議議長」で絞れます。生成を再現する場合は `npm run event:prepare`。このv1は専用DBで凍結し、既存demo・漫画・科学のdatasetへ混在させません。

人工データによる三用途の契約検証は次で再現できます。実在資料の受入・検証結果ではありません。

```bash
docker compose -f compose.event-test.yaml up -d --wait
node --import tsx scripts/event-contract-test.ts seed
node --import tsx scripts/event-contract-test.ts dev
# 別terminalで
npm run event:integration
npx playwright test --config=playwright.event-contract.config.ts
```

人工検証画面は http://127.0.0.1:3216 。「架空会議」「架空参加者A」を検索します。実在資料を表示している画面と混同しないよう、架空デモ表示と人工名称・Sourceを使います。検証DBには名前付きvolumeを設けていません。破棄する場合は専用composeに対して `docker compose -f compose.event-test.yaml down -v` を実行します。

Phase 17の[概要presentation契約](docs/design/ENTITY_OVERVIEW_PRESENTATION.md)と[画面比較・検証記録](docs/archive/phase-17-entity-overview/README.md)を参照してください。概要の「Graphに戻って関係を選ぶ」は閉じるだけで、探索条件や起点を変更しません。


Phase 20では「見る関係を編集」内で、作品制作への関与・人物と組織の関わり・特定開催回への参加を選べる。Visitor・会議議長・制作Roleは別の追加条件。アシスタント・影響を含む任意の組合せは「個別の関係を指定」で編集できる。「すべての関係」は三入口すべてとは異なる。Apply前の編集／CancelはGraphを変更しない。[採用契約](docs/design/RELATION_FACET_CONTRACTS.md)／[検証記録](docs/archive/phase-20-relation-facet/README.md)。

Phase 21では線の構造化済み限定と中立的な肯否を表示し、詳細を「この関係の概要」→「個別の主張と根拠」へ整理した。「主張 Nを読む」「根拠を読む」で移動でき、Graph内・Graph未表示・条件外の主張を分ける。SourceのURL・参照箇所・原表記・確認範囲は先に読み、書誌情報は展開して確認する。浦沢→PLUTOの未構造化Roleを「作画」等へ推定しない。[現行契約](docs/design/RELATION_PRESENTATION_CONTRACTS.md)／[4 datasetの実画面・不足・検証記録](docs/archive/phase-21-relation-presentation/README.md)。


Graphの関係ラベルは、構造化済みの具体語がある場合「制作／プロデュース」「組織／Associate professor・Visitor」「参加／会議議長」のように短い見出しと具体語を先に示す。指定なしやClaim構成は詳細へ残す。具体値がない線は従来表示を維持し、資料から役割を推定しない。[現行契約](docs/design/RELATION_PRESENTATION_CONTRACTS.md)／[Phase 22の実画面・検証](docs/archive/phase-22-semantic-edge-labels/README.md)。

## 自動開発のスケジュール操作（WSL）

このディレクトリで `make` または `make autopilot-help` を実行すると操作一覧を表示します。

手動Codexは作業開始時に未反映変更を確認し、変更・検証中は共通ロックを保持します。手順は[自動開発との協調](docs/AUTOPILOT_COLLABORATION.md)。`make autopilot-review` は確認だけで、受け入れや取り込みはしません。`make autopilot-hold` を別terminalで保持している間、予定実行はスキップされます。完了時Enterで解放すると、次回予定から自動開発が続きます。

| やりたいこと | コマンド |
| --- | --- |
| 状態・次回予定を見る | `make autopilot-status` |
| 未反映commit・固定SHA・開発結果を確認 | `make autopilot-review` |
| 手動作業中の競合を防ぐ（別terminalで保持） | `make autopilot-hold` |
| 検知・排他を隔離環境でテスト | `make autopilot-test` |
| 次回以降を止める（今の作業は続行） | `make autopilot-off` |
| 自動実行を再開する | `make autopilot-on` |
| 今すぐ開発を1回実行する | `make autopilot-run` |
| 最新ログを見る | `make autopilot-logs` |
| 起動条件だけ確認する | `make autopilot-check` |
| 期間・時刻の設定を編集する | `make autopilot-config` |
| 編集した設定をWindowsへ反映する | `make autopilot-apply` |

期間変更は **config → apply → status** の順です。設定画面では `START_DATE`・`END_DATE`・`RUN_TIMES` を編集します。
`apply` は停止中なら停止を維持し、開発実行中は変更を拒否します。実行先は既存の専用worktreeで、このプロジェクト直下で開発を始めるコマンドではありません。
変更・実行時のWindows管理者確認（UAC）は人が許可してください。コントローラーの一時ファイルは処理終了時に削除します。

設定ファイルは `~/.local/share/graph-autopilot/autopilot.env` です。保存するとLinux側の期間ガードは即時反映されますが、Windowsの発火予定は `apply` するまで変わりません。反映に失敗した場合はエラーを解消して再適用するか、設定を元に戻してください。
これはこのPCの既存自動実行を操作する入口です。PC起動・ネット接続が必要で、スリープ解除は行いません。`off` は実行中のCodexを強制終了しません。
