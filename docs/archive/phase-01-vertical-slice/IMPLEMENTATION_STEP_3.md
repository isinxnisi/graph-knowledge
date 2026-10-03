# 実装順序3: 読み取りAPIの実施記録

> 完了フェーズの履歴です。記載の仕様・件数は実施時点のものです。現行仕様は [ARCHITECTURE.md](../../ARCHITECTURE.md)、文書一覧は [docs/README.md](../../README.md) を参照してください。
日付: 2026-10-03（Asia/Tokyo）

## 完了範囲

ARCHITECTURE.mdの契約に従い4経路の読み取りAPIを実装した。Cytoscape.js、ページ、検索・グラフ画面、認証、投稿、Wikidata取り込みは追加していない。APIはNode runtimeでNeo4jへ接続し、ブラウザにDB接続設定を渡さない。

## 作成・変更ファイル

| 区分 | ファイル |
| --- | --- |
| Route Handlers（新規） | app/api/entities/route.ts、app/api/entities/[id]/route.ts、app/api/entities/[id]/neighbors/route.ts、app/api/claims/[id]/route.ts |
| domain（新規） | lib/domain/api.ts、lib/domain/search.ts |
| サーバー（新規） | lib/server/read-db.ts、lib/server/queries.ts、lib/server/graph.ts、lib/server/mappers.ts、lib/server/http.ts |
| 検証（新規） | tests/http.test.ts、tests/api.integration.test.ts |
| 既存コード更新 | lib/server/seed.ts（名称正規化関数の共通化のみ） |
| 依存関係・コマンド | package.json、package-lock.json（server-only 0.0.1、テストコマンド） |
| 文書更新 | README.md、docs/PROJECT_CONTEXT.md、docs/ARCHITECTURE.md |
| 記録・応答例（新規） | docs/IMPLEMENTATION_STEP_3.md、docs/API_RESPONSE_EXAMPLES.json |

fixture・制約・データモデルは変更していない。Next.jsによるtsconfig.jsonの一時的な書き換えは元の設定に戻した。

## API一覧と返却型

| GET | 入力 | 200の本文 |
| --- | --- | --- |
| /api/entities | q必須、limit既定10・最大20 | items: EntitySummary[]、hasMore |
| /api/entities/{id} | UUID v4 | entity: EntitySummary + aliases |
| /api/entities/{id}/neighbors | UUID v4、limit既定20・最大50、after任意 | centerId、nodes、claims、page: { nextCursor, hasMore } |
| /api/claims/{id} | UUID v4 | claim（period・polarity・Citation・Sourceを含む）、relatedClaimIds |

EntitySummary、ClaimSummary等はlib/domain/api.tsで既存のdomain定義から導出する。DB保存用の部分日付をvalue/precisionへ戻し、未登録の任意値はnull、配列は[]にする。sourceCountは異なるSourceの数でありCitation件数ではない。

全応答はCache-Control: no-store。入力不正400、存在しない対象・非公開Claim404、未対応メソッド405、予期しない失敗・保存内容の不整合500、DB接続不能・タイムアウト503。生のDBエラーは応答に出さない。入力検証の失敗だけを400にし、保存データのZod検証失敗は500にする。

## 使用した主要Cypher

実装の正本は[queries.ts](../../../lib/server/queries.ts)。q、ID、cursor、limit+1はすべてパラメータで渡す。Neo4jのLIMITにはdriverのIntegerを用いる。

### SEARCH_ENTITIES

```cypher
MATCH (e:Entity)
WHERE e.kind = 'person' AND any(name IN e.searchNames WHERE name CONTAINS $q)
WITH e, CASE WHEN $q IN e.searchNames THEN 0 ELSE 1 END AS rank
RETURN properties(e) AS entity
ORDER BY rank, e.name, e.id LIMIT $take
```

### ENTITY_DETAIL

```cypher
MATCH (e:Entity {id: $id}) RETURN properties(e) AS entity
```

### NEIGHBORS

```cypher
MATCH (:Entity {id: $id})<-[:SUBJECT|OBJECT]-(c:Claim)
WHERE c.visibility = 'published' AND ($after IS NULL OR c.id > $after)
WITH DISTINCT c ORDER BY c.id LIMIT $take
MATCH (c)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(source:Source)
RETURN properties(c) AS claim, properties(subject) AS subject,
       properties(object) AS object, count(DISTINCT source) AS sourceCount
ORDER BY claim.id
```

### CLAIM_DETAIL

```cypher
MATCH (c:Claim {id: $id})-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
WHERE c.visibility = 'published'
OPTIONAL MATCH (c)-[:HAS_CITATION]->(citation:Citation)-[:CITES]->(source:Source)
WITH c, subject, object, citation, source ORDER BY citation.id
RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object,
       count(DISTINCT source) AS sourceCount,
       collect(CASE WHEN citation IS NULL THEN null
                    ELSE {citation: properties(citation), source: properties(source)} END) AS citations
```

### RELATED_CLAIMS

```cypher
MATCH (related:Claim)-[:SUBJECT]->(:Entity {id: $subjectId}),
      (related)-[:OBJECT]->(:Entity {id: $objectId})
WHERE related.visibility = 'published' AND related.predicate = $predicate AND related.id <> $id
RETURN DISTINCT related.id AS id ORDER BY id
```

neighborsは中心Entityの存在確認と近傍取得を同じREADトランザクションで行う。中心を先頭に、返却ページの全端点をIDで重複排除する。ページ境界はClaim IDで、limit+1件の有無からhasMoreを算出する。関連Claim取得も選択中のClaim詳細と同じREADトランザクションで行う。

## テスト結果

| 検証 | 結果 |
| --- | --- |
| 既存domainテスト | 25件成功 |
| 入力・エラー処理の単体テスト | 13件成功 |
| HTTP + 実Neo4j統合テスト | 17件成功 |
| 既存seed統合テスト | 1件成功 |
| 合計 | 56件成功 |
| 型検査・lint・本番ビルド | 成功、4つのAPIをDynamic routeとして生成 |

HTTPテストはNext.jsを空きポートで自動起動し、以下を確認した。

1. 青葉ハルのname検索と「あおば はる」のalias検索。作品名ではperson検索に出ない。
2. 同名の佐藤アキ2人をID・descriptionで区別し、limit=1ではhasMoreがtrue。
3. 名称・別名の完全一致を部分一致より優先し、名称とIDで安定して並べる。
4. Cypherのような検索語をデータとして扱い、グラフを変更しない。
5. Entity詳細の返却キーが契約どおりで、aliasesが取得できる。
6. 青葉ハルの近傍はSUBJECT/OBJECT両方向で、deniedを含み、二段階先を含まない。
7. 対象側の人物や作品からも同じClaimを発見できる。
8. limit=2のClaimページングに欠落・重複がなく、各ページのnodesが中心とその端点だけになる。
9. hidden Claimは近傍・relatedClaimIdsから除外され、詳細は404。
10. C01の複数Citation/Source、period、polarity、同一関係の別Claim IDを取得できる。
11. 月の精度、終了不明、Source公開日、URLのnullを維持する。
12. C13はsourceCount=0、citations=[]、未知の期間をnullで返す。
13. 孤立Entityは中心だけ、claims=[]、nextCursor=null。
14. 不正UUID/q/limit/cursorで400、存在しないIDで404。
15. 全4経路のPOST/PUT/PATCH/DELETE/OPTIONS/HEADが405。Allow: GET、HEADは本文なし。
16. 保存データのpredicateを一時的に不正にした場合、詳細情報を漏らさず500。
17. 専用Neo4jを実際に停止した状態で全4経路が503、再起動後に同じアプリから検索が復旧する。

一時的なデータ変更はfinallyで復元した。DB停止もfinallyで再起動する。テスト終了時に全ノード属性・接続のsnapshotが開始時と等しいことを確認し、最終状態は47ノード・60 Relationship、Neo4jはhealthy。seedとAPIの実DBテストは直列実行する。

## 実際のAPI応答例

[API_RESPONSE_EXAMPLES.json](../../API_RESPONSE_EXAMPLES.json)にHTTP経由で取得した完全な応答を保存した。search、entity、neighbors、claim、unsourced、internalError（500）、unavailable（503）を収録する。

青葉ハルの検索:

```json
{
  "items": [
    {
      "id": "c286065c-6e17-47a7-9288-2a1cf6919ce9",
      "kind": "person",
      "name": "青葉ハル",
      "description": "漫画家、星の航路の作者"
    }
  ],
  "hasMore": false
}
```

青葉ハルの近傍はEntity 5件・Claim 7件で、肯定・否定の両方を含む。C01詳細はsourceCount=2、Citation 2件、relatedClaimIds 2件。期間は2001年〜2003年で、年精度のまま返す。これらの全フィールドは応答例JSONで確認できる。

## 実行した主要コマンド

今回もNode 24.21.0を/tmp/graph-knowledge-node/binから使用した。

```bash
export PATH=/tmp/graph-knowledge-node/bin:$PATH
npm install --save-exact server-only
npm run typecheck
npm run lint
npm test
API_RESPONSE_EXAMPLES_PATH=/tmp/graph-knowledge-step3-responses.json npm run test:api
API_RESPONSE_EXAMPLES_PATH=/tmp/graph-knowledge-step3-responses.json npm run test:integration
npm run build
docker compose ps
git diff --check
```

APIテスト内でdocker compose stop neo4jとdocker compose up -d --waitを実行した。必要な応答例を残す場合だけAPI_RESPONSE_EXAMPLES_PATHを指定する。通常のテストは文書ファイルへ出力しない。

## 当初設計からの変更・具体化

データモデル、API経路、返却型、上限に大きな変更はない。

- server-onlyを追加してDBアクセス層のクライアントimportを防ぎ、driverを遅延初期化・共有する。
- 名前正規化はseedとAPIで同じ関数を使う。既存fixtureの保存内容は変わらない。
- UUIDは既存型と合わせてv4を受理し、小文字へ正規化。重複した既知queryパラメータは400、未定義queryは無視する。
- 405のcodeは既存の4種類を増やさずINVALID_ARGUMENTとする。Next.jsの自動HEAD/OPTIONSを使わずGET以外を明示的に拒否する。
- 初回検証で近傍集約後のORDER BYの参照に誤りがあり、返却したclaim.idを使うよう修正した。
- Next.jsの初回コンパイルを含むHTTPテストは既定5秒では足りず、テストの待ち時間を30秒にした。APIのDBトランザクション上限5秒は変更していない。DB停止・再起動のテストだけは別の長い待ち時間を持つ。

## UI実装前に残る判断

API契約を変更する必要がある未解決事項はない。Step 4では次の画面上の判断を行う。

- 検索、グラフ、Claim詳細・出典を一画面のどこへ配置するか。
- relatedClaimIdsの詳細を一括取得して並べるか、選択時に個別取得するか。
- 追加展開後の中心・ノード位置、選択状態と再試行の見せ方。
- テキスト一覧による代替操作と、出典未確認・否定・期間不明の表示文言。

一本のClaimを一本の辺にすること、否定の文字と破線、画面上限100 Entity / 200 Claim、受理したページだけcursorを進めること、架空データの常時表示は既に採用済み。これらを未確定として扱い直さない。今回Step 4には進んでいない。
