# Graph Knowledge

出典付きの関係性を蓄積・探索するサービスの初期基盤です。作業前に[PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md)と[ARCHITECTURE](docs/ARCHITECTURE.md)を参照してください。

現在の実装は実装順序1〜2（環境・domain・fixture・制約・seed）までです。API、画面、Cytoscape.js、認証、投稿、Wikidata取り込みは未実装です。app/layout.tsxはフレームワークの構造だけを用意し、ページはありません。ブラウザのルートはNext.js標準の404になります。

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

通常テストはDB不要です。統合テストは起動済みの開発専用Neo4jに対してseedを再実行します。全ノードの属性と接続が再実行前後で等しいこと、期待件数、制約、既存内容が異なる場合のトランザクション全体のロールバックを検証します。テストでDB全体を削除しません。他データがあるDBでは件数の検証が失敗するため、このComposeの専用DBを使ってください。

Next.jsのdev/build/startは環境の動作確認用です。検索・グラフ表示は次の実装段階で追加します。

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
