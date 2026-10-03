# Graph Knowledge

出典付きの関係性を蓄積・探索するサービスの初期基盤です。作業前に[PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md)と[ARCHITECTURE](docs/ARCHITECTURE.md)を参照してください。文書の状態とフェーズ別履歴は[docsの入口](docs/README.md)にまとめています。

初期Vertical Slice（ローカルの読み取り専用デモ）は、実装順序5のUI・テーマ調整まで完了しています。ルートに検索・Cytoscape.jsのGraph・詳細を一画面で表示します。すべて架空のデモデータです。認証・投稿・Wikidata取り込みは未実装です。Graphの可読性・同名表示・選択とスクロールの操作を調整しています。

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
| /api/entities?q=... | personの名称・別名の部分一致検索 | limit 10 / 20 |
| /api/entities/{id} | Entity詳細・別名 | UUID v4 |
| /api/entities/{id}/neighbors | 公開Claimの両方向1段階探索 | limit 20 / 50、afterは前のnextCursor |
| /api/claims/{id} | 主張・Citation・Source・他の同一関係のClaim ID | UUID v4 |

すべてJSON、Cache-Control: no-storeです。DBはサーバーだけから接続します。検索結果には同名人物を区別するdescriptionを含みます。入力不正400、存在しない対象・非公開Claim404、GET以外405、内部エラー500、DB接続不能・タイムアウト503です。非GETにはAllow: GETを返し、HEADにはHTTP仕様どおり本文がありません。

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

Graphの線は同じ主体・関係タイプ・対象のClaimをまとめた表示用Relationです。肯定・否定の混在は「異説あり」と点線で示し、クリックすると独立した各Claimの期間・出典を比較できます。初期Graphは7 Claim / 5 Relation、全展開は15 Claim / 13 Relationです。未取得ページがある場合、Graph表示は取得済みの主張に基づきます。

Graphの配置・曲率の最新調整と確認画像は [IMPLEMENTATION_GRAPH_BALANCE.md](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_GRAPH_BALANCE.md) を参照してください。

テーマ色は `app/theme.css` に集約しています。画面とGraphで共有しています。右上でライト/ダークを切り替え、ダーク時はブラウン/ブルーを選べます。配色切り替えにGraphも追従します。CSS定義を編集した後は画面を再読み込みしてください。配色・検証・完了範囲は [IMPLEMENTATION_THEME.md](docs/archive/phase-01-vertical-slice/IMPLEMENTATION_THEME.md) を参照してください。

## 展開を閉じる・再開する

青葉ハル→星の航路→白石ミオと展開した後、星の航路の詳細または一覧の「展開を閉じる」を押すと、その展開で支えられていた枝を閉じます。別経路が支えるEntity・Claimは残ります。起点も閉じられますが、起点Nodeは残ります。

未選択Nodeのクリックは即時に選択・必要な展開を行い、選択中Nodeの再クリックは300msの判定後に開閉します。300ms以内のダブルクリックは開閉を抑止します（別動作は未割当）。閉じたNodeのクリックか「展開を再開」で受理済みの枝を戻します。祖先の閉鎖で休止した子孫も戻り、明示的に閉じた子孫は戻りません。復元だけでは通信せず、追加ページは従来の「続きを表示」です。二重枠は現在開いている受理済み展開を示します。

残存Nodeの位置とpan/zoomを維持します。復元Nodeは以前の座標を優先し、衝突時だけ追加配置します。上限で復元できない場合は他の枝を閉じて再試行してください。探索キャッシュは有限で、破棄された枝は再取得になります。ページ再読込・中心変更で探索状態はリセットします。

[開閉フェーズ実施記録](docs/archive/phase-02-exploration-close/IMPLEMENTATION_EXPLORATION_CLOSE.md)を参照してください。API・DB・fixtureは変更せず、条件付き探索・複数起点・時系列はまだ追加していません。

Nodeクリックと今後の設定の責務は [GRAPH_INTERACTION_AND_SETTINGS.md](docs/design/GRAPH_INTERACTION_AND_SETTINGS.md) に記録しています。設定モーダル・永続化はまだ追加していません。
