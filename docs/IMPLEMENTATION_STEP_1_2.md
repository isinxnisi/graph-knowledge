# 実装順序1〜2の実施記録

日付: 2026-10-03（Asia/Tokyo）

## 実装した範囲

Node / Next.js / Neo4jの環境、domain型・predicate辞書・日付検証、架空fixture、Neo4j制約、seedと検証を実装した。API、Cytoscape.js、検索・グラフ画面、PostgreSQL、認証、投稿、Wikidata取り込みは実装していない。

## 作成・変更ファイル

| 区分 | ファイル |
| --- | --- |
| 環境 | package.json、package-lock.json、.nvmrc、.gitignore、.env.example、compose.yaml |
| Next.js / TypeScript / lint | next.config.ts、tsconfig.json、eslint.config.mjs、app/layout.tsx |
| domain型・辞書・検証 | lib/domain/predicates.ts、lib/domain/dates.ts、lib/domain/fixture.ts |
| fixture | fixtures/demo.json |
| 制約・DB・seed | neo4j/constraints.cypher、lib/server/neo4j.ts、lib/server/seed.ts |
| CLI | scripts/constraints.ts、scripts/seed.ts、scripts/validate-fixture.ts |
| 検証 | tests/domain.test.ts、tests/seed.integration.test.ts |
| 手順・継続作業 | README.md、AGENTS.md、CLAUDE.md |
| 更新文書 | docs/PROJECT_CONTEXT.md、docs/ARCHITECTURE.md |
| 今回の記録 | docs/IMPLEMENTATION_STEP_1_2.md |

.envはローカル用に.env.exampleから作成し、Git対象外。next-env.d.tsと.nextはNext.jsの生成物としてGit対象外。AGENTS.md / CLAUDE.mdはNext.jsが生成したもので、AGENTS.mdにはプロジェクト文書を読む指示を追加した。

## 環境と実行したコマンド

Node 24.21.0 / npm 11.19.0、Next.js 16.3.8 / React 19.3.0、Neo4j Community 5.26.31 / neo4j-driver 6.2.0を使用した。バージョンは.nvmrc、package.json、package-lock.json、compose.yamlに固定。

既存の/usr/bin/nodeはv12.22.9で、既存npmはWindows側の参照先不整合により使用できなかった。公式配布のNode 24.21.0 Linux x64アーカイブを/tmp/graph-knowledge-nodeへ展開し、公式SHASUMS256.txtのSHA-256と一致することを確認した。既存Nodeは置き換えていない。今回のnpmコマンドは以下のPATHで実行した。

```bash
export PATH=/tmp/graph-knowledge-node/bin:$PATH
node --version
npm --version
npm install --save-exact next react react-dom neo4j-driver zod
npm install --save-dev --save-exact typescript @types/node @types/react @types/react-dom tsx vitest eslint eslint-config-next
npm install --save-dev --save-exact @types/node@24
npm install --save-dev --save-exact eslint@10
npm install --save-dev --save-exact eslint@9.39.5
npm ci
cp -n .env.example .env
docker compose up -d --wait
docker compose ps
npm run fixture:validate
npm run db:constraints
npm run db:seed
npm run db:seed
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run dev
git diff --check
```

上記は主要なコマンドの一覧。診断時にはdocker compose logs、docker inspect、npm ls、curlによる起動確認も実行した。Next.jsのdevは3000番ポートが既存の別プロセスで使われていたため3001で起動し、http://127.0.0.1:3001の標準404を確認後に停止した。既存の3000番プロセスは操作していない。Neo4jはhealthyの状態でデータを保持している。

## 実DBの件数とseed結果

| ノードlabel | 件数 |
| --- | ---: |
| Entity | 12（person 8 / work 2 / organization 2） |
| Claim | 15 |
| Source | 5 |
| Citation | 15 |
| ExternalIdentifier | 0 |
| 合計 | 47 |

| Relationship type | 件数 |
| --- | ---: |
| SUBJECT | 15 |
| OBJECT | 15 |
| HAS_CITATION | 15 |
| CITES | 15 |
| HAS_EXTERNAL_ID | 0 |
| 合計 | 60 |

| 連続した成功実行 | 作成ノード | 作成Relationship | 実行後の総数 |
| --- | ---: | ---: | --- |
| seed 1回目 | 47 | 60 | 47ノード / 60 Relationship |
| seed 2回目 | 0 | 0 | 47ノード / 60 Relationship |

初回の診断実行では5秒のトランザクション上限に達して失敗した。失敗した投入はロールバックされ、最初の成功実行が47ノード・60 Relationshipを作成した。その後の統合テストでもseedを再実行し、全ノードの属性（日時・部分日付を含む）と接続が変わらないことを比較した。

6制約はentity_id、claim_id、source_id、citation_id、external_identifier_id、external_identifier_key。実DBのSHOW CONSTRAINTSで確認し、Entity ID重複の書き込みが拒否されることも確認した。

## fixture検証とテスト

- fixtures/demo.jsonはschemaVersion=1で全件検証に成功。全IDは固定UUID v4、参照先・predicate/kind・日付の精度と実在性に不整合なし。
- 同名人物2人、孤立人物、C01の複数出典、C03の否定、C13の出典未確認を確認。
- domainテスト25件が成功。閏年、0001〜9999の境界、精度違反、期間の明確な逆転、重複ID、参照先不在、複数主体・所有者、種別違反、未知predicate、不正URL等を検証。
- 実DBの統合テスト1件が成功。再投入時の属性・接続一致、件数、6制約、変更fixture拒否時の全体ロールバックを検証。
- 型検査、lint、Next.jsのビルドとdev起動を確認。ブラウザの探索経路のテストは画面実装後に行う。

## 設計からの変更と理由

大きな構成変更はない。以下を実装に合わせて具体化した。

1. **seed専用タイムアウトを60秒に分離**: 初回一括投入が5秒で失敗したため。データ全件を一つのトランザクションに保ち、対話的な読取は5秒のままとする。
2. **制約作成は別トランザクション**: Neo4jのスキーマ操作をデータ操作と分ける必要があるため。制約はIF NOT EXISTSで残り、データ投入失敗時はデータ全件がロールバックされる。
3. **ON CREATEでのみ属性を保存し、既存内容の違いは拒否**: 初期seedは更新同期を担わないという仕様を明確に実装するため。
4. **Next.js生成ファイルと型検査手順を具体化**: next-env.d.tsをGit対象外とし、next typegen後にtscを実行する。AGENTS.md / CLAUDE.mdは生成されたものを保持する。
5. **ESLint 9.39.5を互換性のため固定**: ESLint 10を試したがNext.js付属のReactルールでエラーになったため9へ戻した。9には非推奨警告が出る。更新時はプラグイン側の対応も確認する。

次の作業は実装順序3の読み取りAPI。今回の完了は環境と投入基盤までであり、API・UIの実装を含まない。
