# 初期技術設計

更新日: 2026-10-03 / 状態: 実装順序1〜2を実装。API・画面は未実装。検証記録はIMPLEMENTATION_STEP_1_2.mdを参照。

## 前提と設計の位置づけ

[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)を目的とスコープの基準とする。Neo4jを関係性データの正本、PostgreSQLをサービス運営データの正本とする構成を想定する。初期はClaimノード方式を採用し、fixtureで検証する。今回決めた実装範囲は末尾の「最小Vertical Sliceの初期採用仕様」にまとめる。将来の拡張案と初期仕様を区別する。

## 初期システム構成

```text
ブラウザ: 検索 / グラフ探索 / Claim・出典詳細
    ↓ アプリケーションAPI
サーバー: 入力検証 / グラフ投影 / 展開上限 / 将来の認可
    ├─ Neo4j: Entity / Claim / Source / Citation / 外部ID
    └─ PostgreSQL: 将来のUser / 権限 / Bookmark / 編集・審査等

fixture投入処理 → Neo4j
将来の限定的なWikidata取込処理 → 同じ検証・登録経路 → Neo4j
```

初期は単一のWebアプリとAPI、Neo4jで読み取り体験を成立させる。PostgreSQLの責務は予約するが、利用する機能がないVertical Sliceのためだけに空の運営機能を実装しない。ブラウザからDBへ直接接続しない。

検索用の名称・別名も初期はNeo4jで保持する。初期の検索方式と技術構成は末尾の採用仕様に従う。本番ホスティングは未選定。初期から別の検索基盤やマイクロサービスを設けない。

## Relationship方式とClaimノード方式の比較

| 観点 | Entity間のRelationshipに属性を持たせる | ClaimをNodeとして扱う |
| --- | --- | --- |
| 例 | `(A)-[:ASSISTANT_OF {id, sourceIds, ...}]->(B)` | `(A)<-[:SUBJECT]-(Claim)-[:OBJECT]->(B)` |
| 単純な探索 | 直接の辺を辿れて簡潔 | Claim経由の探索・UIへの変換が必要 |
| 複数出典 | 出典ID配列等を持つか、別途参照モデルが必要 | Citationを介して複数Sourceへ接続できる |
| ページ番号等 | 出典ごとの情報が増えると属性管理が複雑 | Citationごとに保持できる |
| 矛盾する主張 | 並行する辺で表現可能だが識別・集約規約が必要 | 独立したClaimを並存させられる |
| 限定条件・審査・履歴 | 辺の属性・外部ID参照で対応する | Claimを識別可能な対象として拡張できる |
| 負担 | 小規模では簡潔。複雑化すると周辺モデルが必要 | ノード・接続が増え、問い合わせが複雑になる |

**初期採用: Claimノードを正本とする。** 複数出典と矛盾の保存が中核要件であり、最初から主張を独立した対象として扱う利点が大きい。Neo4jのRelationshipから別のノードへ直接Relationshipを張る形は使えないため、Relationship方式でSourceを共有するには追加の参照管理が必要になる。

正本となる`ASSISTANT_OF`などの直接RelationshipをClaimと同時に保存しない。UI用の辺はAPIで導出する。将来必要なら再生成可能な投影を検討するが、第二の正本を作らない。

## Neo4jの論理モデル

### Entity

人物・作品・組織・出来事などの対象。共通の`Entity`ラベル、内部`id`、`kind`、表示名称、別名、登録・更新日時を持つ。初期の`kind`は`person / work / organization / event`を想定する。必要に応じて検索用ラベルを追加するが、人物専用の主キーや漫画専用の基本構造にしない。

多言語名称は将来、言語・表記・別名区分を持つ名称モデルへ拡張する。生年月日などの出典付き事実まで無制限にEntity属性へ詰め込まない。初期はEntity間の関係を扱い、リテラル値や多項関係の正式モデルは別途設計する。

### Claim

「誰が、どの関係で、誰・何と繋がると主張されているか」を表す。

| 項目 | 初期の意味 |
| --- | --- |
| `id` | 永続的な内部ID |
| `predicate` | `ASSISTANT_OF`等の管理された関係タイプ |
| `polarity` | `affirmed / denied`。否定は不明・未掲載と区別 |
| `validFromValue/Precision`, `validToValue/Precision` | 主張される関係の期間。APIではperiodに変換。任意 |
| 日付精度 | 年・月・日、不明など。年だけを架空の月日にしない |
| `visibility` | 閲覧対象を選ぶための状態。真偽の判定ではない |
| `createdAt`, `updatedAt` | システムの記録日時 |
| 取込由来 | 取込元statement識別子、取得日時、元データの版等 |

各Claimは`SUBJECT`と`OBJECT`をそれぞれ一つ持つ。例ではClaimから主体・対象へ接続する。期間不明は「無期限で成立」と解釈しない。初期の日付精度と期間端点の規則は末尾の採用仕様に従う。推定・曖昧な範囲表現は後回しにする。

関係タイプには意味、主体・対象の許容kind、方向、表示名を定義する。`ASSISTANT_OF`はアシスタントから相手への方向とし、`INFLUENCED_BY`や`CONTRIBUTED_TO`等も個別に定義する。アシスタント関係から師弟関係を自動推論しない。逆方向表示は同じClaimの見せ方とし、逆向きのClaimを重複保存しない。

関係タイプ定義は初期はバージョン管理したTypeScriptの定数辞書に置く。ユーザーが任意のpredicateを追加できる機能は後回しにする。

### SourceとCitation

**Sourceは資料自体、CitationはあるClaimがその資料のどの箇所を参照するか**を表す。

- `Source`: `id`, `kind`, タイトル、著者・発行者、URL、ISBN/DOI等、公開日と精度、版・号など。URLのない書籍にも対応する。
- `Citation`: `id`, ページ・章・節・タイムコードなどの参照箇所、必要な注記、アクセス日、`stance`（支持・反証・背景）。初期fixtureは支持を中心に扱う。
- 接続: `(Claim)-[:HAS_CITATION]->(Citation)-[:CITES]->(Source)`。

Claimは0件以上のCitationを持てるが、0件は「出典未確認」と明示する。公開投稿で必須にするかは未確定。Citationは一つのClaim、一つのSourceに属する。Sourceは複数Claimで共有できる。異なる版や号はページ対応が異なるため、安易に同じSourceへ統合しない。

単なるURL文字列の配列にはしない。公開日を関係期間の代わりに使わない。全文や長い引用の保存は初期スコープ外。

### 外部識別子

`(Entity)-[:HAS_EXTERNAL_ID]->(ExternalIdentifier)`を用い、`namespace + value`を一意にする案とする。例は`namespace=wikidata`, `value=Q...`。一つのEntityに複数の外部IDを持たせられる。Sourceの外部識別子も用途を分けて管理する。

### 構造例

```text
(Claim C1 {predicate: ASSISTANT_OF, polarity: affirmed})
    ├─ SUBJECT → (Entity A {kind: person})
    ├─ OBJECT  → (Entity B {kind: person})
    ├─ HAS_CITATION → (Citation R1 {locator: "pp.12–13"}) → CITES → (Source S1)
    └─ HAS_CITATION → (Citation R2 {locator: "インタビュー"}) → CITES → (Source S2)

(Claim C2 {predicate: ASSISTANT_OF, polarity: denied})
    ├─ SUBJECT → (Entity A)
    ├─ OBJECT  → (Entity B)
    └─ HAS_CITATION → (Citation R3) → CITES → (Source S3)
```

同じ内容・条件を支持する資料は同じClaimにCitationを追加できる。期間・条件・肯否が異なるものは別Claimにする。自動的なClaim統合は行わず、同値性の基準は今後決める。異なる期間が示されるだけでは矛盾と断定しない。必要ならClaim間に`DISPUTES`等を設けるが、自動検出は初期範囲外。

内部IDと外部IDの一意性を制約で守り、Claimの接続数、predicateの許容型、Citationの所有関係、期間の妥当性は書き込み経路で検証する。これらがすべてDB制約だけで保証されるとは想定しない。

## PostgreSQLとNeo4jの責務

| データ | 正本 | 備考 |
| --- | --- | --- |
| Entity・名称・外部ID | Neo4j | PostgreSQLへ同じマスタを複製しない |
| Claim・期間・Source・Citation | Neo4j | 知識の内容と参照関係 |
| User・認証情報・権限 | PostgreSQL | 認証サービス利用の有無は未確定 |
| Bookmark | PostgreSQL | 対象の内部IDだけを参照 |
| 編集操作の監査・審査・通報 | PostgreSQL | 誰がどの操作をしたか、承認手続き |
| Notification・配信状態 | PostgreSQL | サービス運営情報 |

監査ログに差分や復元用の過去スナップショットを残すことはあり得るが、現在のグラフを検索・探索する第二の正本にはしない。知識の現行内容はNeo4jから読む。運営上の審査状態はPostgreSQLが正本、Neo4jの`visibility`は公開読取用の反映結果とする将来案。初期fixtureでは静的に設定する。

DB間の外部キーや単一トランザクションは前提にしない。将来の編集時にはPostgreSQLに操作IDと指示を記録し、Neo4jへ冪等に適用後、完了を記録する方式を検討する。再試行・未完了操作の照合が必要。Outbox、可視性反映、権限確認の具体的な手順は投稿機能導入時に決定する。

## ID設計

- Entity、Claim、Source、Citation等はUUID v4を持つ。fixtureはあらかじめ割り当てた固定UUID v4をファイルに保存する。
- Neo4jのDB内部識別子をURLや他DBからの永続参照に使わない。
- QIDは外部IDであり、内部の主キーにしない。Wikidata未登録のEntityを作れる。
- Bookmark・監査ログは対象種別と内部IDを参照する。削除や統合で参照が消えた場合の扱いを設計する。
- fixtureは固定IDで再投入できるようにする。取込も元のstatement ID等を使って再実行時の重複を防ぐ。
- 外部IDの衝突時は自動統合せず、同一性を確認する。将来は統合履歴や旧IDからの転送を検討する。

## Wikidataとの連携方針

初期は人が確認できる少数のfixture。次に対象QIDと利用するpropertyを限定した取り込みを検討する。大規模Dump、全領域の同期、Wikipedia全文のAI解析は行わない。

Wikidataのstatementは値だけでなくqualifierやreferenceを持つため、主張・限定条件・出典を保った形で読む。単純な値だけの抽出で出典や期間を落とさない。[公式データモデル](https://www.wikidata.org/wiki/Wikidata:Data_model)、[データアクセス](https://www.wikidata.org/wiki/Wikidata:Data_access/en)を参照する。

1. QIDを外部IDとして解決し、必要なEntityを用意する。
2. propertyと内部predicateの対応を意味・方向・限定条件まで確認する。
3. statementをClaim、referenceをSource/Citationへ変換する。
4. 元のstatement ID、取得日時、版情報、変換ルールの版を残す。
5. 対応できない限定条件は保持して要確認にする。意味を失ったClaimを確認済みとして公開しない。

外部statementと内部Claimの対応は取込由来情報として保持する。Wikidataのrankを本サービスの真偽や信用点数に変換しない。外部referenceがない場合、Wikidataを経由した取得記録と、主張の根拠となる資料を区別する。WikidataのページURLだけで一次出典が確認できた扱いにはしない。

再取込でユーザーが追加した出典を上書きせず、外部側の変更・削除は差分として確認する。Wikidataの構造化データはCC0とされるが、リンク先の記事・画像・書籍等の利用条件は別に確認する。[公式ライセンス説明](https://www.wikidata.org/wiki/Wikidata:Licensing)を参照する。実際の取込時にアクセス方式と利用条件を再確認する。

## 最小Vertical Slice

### fixtureとAPIの境界

末尾の採用仕様に従い、架空のEntity 12件、Claim 15件、Source 5件、Citation 15件を用意する。fixtures/demo.jsonに固定UUIDで記録する。

APIの機能:

- 人物検索: 名称・別名から候補を返し、同名候補の内部IDを区別する。
- 近傍取得: Entity IDから、主体側・対象側の両方向のClaimを一段階取得する。
- 関係詳細: Claim IDから期間・限定条件・Citation・Sourceを返す。
- Entity詳細: 再展開時の名称や種別を取得する。

経路・レスポンス・展開上限は末尾の採用仕様に従う。初期は1段階ずつ展開し、無制限の多段探索を提供しない。

### グラフ表示

保存モデルのClaimやCitationを、そのまま全て画面上のノードにしない。APIはEntityを表示ノード、Claimを表示辺として投影する。同じ主体・関係タイプ・対象の表示辺をまとめる場合も、所属するClaim IDの一覧を保ち、詳細で各主張と出典を分離して表示する。

辺の識別はClaim ID、集約辺なら安定した集約キーを使う。Entity IDとClaim IDで追加展開の重複を防ぐ。方向と関係名を示し、矛盾や出典未確認を隠さない。否定のClaimを、肯定された関係と同じ線として無説明で表示しない。

### 受け入れ基準

- 人物検索から、隣接する人物・作品・組織の追加展開まで行える。
- 主体側・対象側のどちらからも同じ関係を発見できる。
- 循環するグラフを展開してもEntityやClaimが重複しない。
- 関係から複数のClaimと、それぞれの出典・参照箇所を確認できる。
- 期間・公開日・登録日時を混同せず、未知の情報を推測で補わない。
- 同名対象を区別でき、展開上限に達した場合は続きがあると分かる。
- fixture再投入で重複せず、必須接続やIDの不整合を検出できる。

検証はこの探索経路とモデル上の重要な例に集中する。現在は実装順序1〜2の検証までを行い、API・画面の受け入れ基準は次の実装段階で確認する。

## 将来問題になり得る点と未確定判断

| 論点 | 問題と今後の判断 |
| --- | --- |
| 高次数ノード・性能 | 有名人物や出版社で展開が巨大になる。件数上限、絞り込み、検索索引、必要なら投影を検討 |
| Claimの同一性 | 期間・限定条件・肯否の違いを含む重複判定と統合規約が必要 |
| 限定条件・多項関係 | 役割、場所、共同作業、家系等を二者関係に押し込めない。QualifierやEventモデルを検討 |
| 不確かな日付 | 年単位、推定、複数説、歴史的暦の表現が必要。初期で対応する精度範囲を決める |
| 多言語・同一性 | 別名、表記揺れ、同名人物、組織改称、作品版違いの扱いが必要 |
| 出典品質 | 独立した資料数と同じ記事の転載数は異なる。信頼度の自動算出は未採用 |
| 投稿・審査 | スパム、誤情報、編集競合、通報、訂正、プライバシーへの運営方針が必要 |
| 履歴・削除 | 過去のClaim再現、Source訂正、統合・削除後のBookmarkと監査参照を設計 |
| 複数DBの整合性 | 書き込み失敗・再試行・公開反映の遅れを扱い、両DBを同時に復旧できる計画が必要 |
| 外部データの更新 | QID統合、statement変更・削除、変換ルール変更に追従する必要 |
| 提供基盤・コスト | Neo4jの提供形態、運用・バックアップ、利用条件、ホスティングは未選定 |
| UI・アクセシビリティ | 大きなグラフの可読性、モバイル操作、キーボード操作、一覧による代替表示を検討 |

次の実装は以下の初期採用仕様を基準に進める。投稿・審査の詳細や大規模取り込みは、最小の探索体験が成立した後に設計する。

## 最小Vertical Sliceの初期採用仕様

この節は実装準備として採用する初期仕様。上記の将来案より具体的な条件を優先する。実装順序1〜2は実装済み。API・画面・グラフ描画は次の実装段階とする。

### 1. 技術スタック

| 項目 | 採用 | 理由 |
| --- | --- | --- |
| 実行環境 | Node.js 24 LTS、npm、TypeScript | UI・API・seedで同じ言語と型を使う |
| Web / API | Next.js App Router、React、Route Handlers（Node runtime） | 一つのアプリで画面と読み取りAPIを提供する |
| グラフ | Cytoscape.js、直接呼び出す小さなReactコンポーネント | 方向付きの辺、並行辺、クリックと追加展開を扱う |
| レイアウト | 内蔵のbreadthfirst、中心Entityをrootに指定、レイアウト時は無向として扱う | 追加プラグインを入れず、入出両方向の近傍を表示する |
| スタイル / 状態 | CSS Modules、React標準のstate | UIキットやグローバル状態管理を先に導入しない |
| DB | Neo4j Community 5.26 LTS、Docker Composeの単一サービス | Claimモデルを実際のDBで検証し、ローカルで再現する |
| DBアクセス | 公式neo4j-driver、パラメータ化したCypher | 小さなモデルにORMを追加しない |
| 入力検証 | Zod（fixtureとAPI入力）、共通TypeScript型 | DB投入前とAPI境界で整合性を確認する |
| 検証 | Vitest、必要なブラウザ経路のみPlaywright | 日付・seed・API・探索体験の重要な動作を確認する |

Next.js、React、ドライバー等の正確なバージョンは実装開始時の互換性のある安定版を選び、package-lock.jsonへ固定する。NodeとNeo4jは上記系列のパッチ版を固定し、Dockerのlatestタグは使わない。DBとドライバーの組み合わせを接続・クエリ実行で確認する。Neo4j接続設定はサーバー用環境変数に置き、クライアントへ渡さない。

初期はPostgreSQL、認証、投稿、Wikidataアクセス、外部検索基盤、Redisを起動しない。fixture投入だけが書き込み経路で、Web APIはGETのみ。アプリはローカル実行を対象とする。

選定時に参照した公式資料: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)、[Neo4jドライバー](https://neo4j.com/docs/javascript-manual/current/install/)、[Cytoscape.js](https://js.cytoscape.org/)、[Node.jsリリース計画](https://github.com/nodejs/Release)。

### 2. fixture

実在人物の事実確認を待たずにモデルとUIを検証できる、完全な架空データを採用する。画面には「架空のデモデータ」を常時表示する。次のキーはfixture内の読みやすい参照名で、公開APIのIDは固定UUID v4とする。

| キー | kind | 名称 / 区別用description |
| --- | --- | --- |
| P1 | person | 青葉ハル / 漫画家、星の航路の作者 |
| P2 | person | 黒川レン / 漫画家、師匠として語られる人物 |
| P3 | person | 白石ミオ / 漫画家、共同制作参加者 |
| P4 | person | 橘ソラ / 漫画家、月の工房の作者 |
| P5 | person | 水野ナツ / 編集者 |
| P6 | person | 佐藤アキ / 漫画家 |
| P7 | person | 佐藤アキ / 編集者、P6と別人 |
| P8 | person | 森ユウ / 関係が未登録の漫画家 |
| W1 | work | 星の航路 / 架空漫画 |
| W2 | work | 月の工房 / 架空漫画 |
| O1 | organization | 青空出版 / 架空出版社 |
| O2 | organization | 月刊コミック灯 / 架空雑誌編集部 |

別名の例はP1に「あおば はる」を登録する。初期の雑誌は作品自体ではなく編集部組織として明示する。Eventはkindとして予約するがfixtureに追加しない。外部IDは空で、架空QIDを割り当てない。

SourceはS1「黒川レン創作記」（book、URLなし、2010年）、S2「青葉ハルへのインタビュー」（interview、2011-06）、S3「月刊コミック灯 特集号」（magazine、2012-03-15）、S4「創作活動メモ」（web、公開日不明）、S5「漫画制作の共同作業に関する研究」（paper、2015年）の5件とする。すべて架空資料であることを注記し、ISBN/DOIを捏造しない。URLを持つ資料はexample.invalid配下のデモURLとして表示するが、外部リンクとして有効にしない。実データのURLはhttp/httpsのみリンク化する。

| Claim | 主体 → predicate → 対象 | polarity / 期間 | 支持するSource・参照箇所 |
| --- | --- | --- | --- |
| C01 | P1 → ASSISTANT_OF → P2 | affirmed / 2001〜2003 | S1 pp.12–13、S2 第2節 |
| C02 | P1 → ASSISTANT_OF → P2 | affirmed / 2002〜2004 | S3 p.8 |
| C03 | P1 → ASSISTANT_OF → P2 | denied / 2001〜2003 | S4「制作経歴」節 |
| C04 | P3 → ASSISTANT_OF → P2 | affirmed / 両端不明 | S1 p.20 |
| C05 | P1 → INFLUENCED_BY → P4 | affirmed / 両端不明 | S2 第3節 |
| C06 | P4 → INFLUENCED_BY → P1 | affirmed / 両端不明 | S3 p.10 |
| C07 | P1 → CONTRIBUTED_TO → W1 | affirmed / 2005〜2007 | S3 p.12 |
| C08 | P3 → CONTRIBUTED_TO → W1 | affirmed / 2006-04〜2006-09 | S5 p.5 |
| C09 | P4 → CONTRIBUTED_TO → W2 | affirmed / 2008〜終了不明 | S3 p.14 |
| C10 | P5 → CONTRIBUTED_TO → W1 | affirmed / 両端不明 | S5 p.6 |
| C11 | P1 → AFFILIATED_WITH → O1 | affirmed / 2005〜終了不明 | S2 第4節 |
| C12 | P5 → AFFILIATED_WITH → O1 | affirmed / 両端不明 | S3 p.16 |
| C13 | P6 → CONTRIBUTED_TO → W2 | affirmed / 両端不明 | 出典未確認 |
| C14 | P7 → AFFILIATED_WITH → O2 | affirmed / 両端不明 | S4「編集部」節 |
| C15 | P3 → AFFILIATED_WITH → O2 | affirmed / 両端不明 | S3 p.18 |

合計はEntity 12、Claim 15、Source 5、Citation 15。C03を否定する主張として支持するCitationのstanceはsupportとする。polarityとCitationのstanceを混同しない。各Citationは専用の固定IDを持つ。

実装時はfixtures/demo.jsonに全件を置き、schemaVersionを1とする。seedは全件検証後、データ全件を一つのトランザクション内でIDをキーにMERGEし、二度実行しても件数が増えないようにする。参照先不在、重複ID、predicate/kind違反、複数SUBJECT/OBJECT、日付不正は投入前に拒否する。初期seedは内容の更新・削除の同期を担わず、fixture変更は開発専用DBを明示的に再作成して投入する。通常seedに全DB削除を含めない。

### 3. 関係タイプ辞書

lib/domain/predicates.tsに固定辞書を置き、APIとseedから共有する。自由入力、編集画面、辞書APIは設けない。

| predicate | 主体kind → 対象kind | 表示名 / 逆方向表示 | 意味 |
| --- | --- | --- | --- |
| ASSISTANT_OF | person → person | アシスタントだった / アシスタントに迎えていた | 対象人物の制作補助を行ったという主張 |
| INFLUENCED_BY | person → person | 影響を受けた / 影響を与えた | 主体が対象から影響を受けたという主張 |
| CONTRIBUTED_TO | person → work | 制作に関わった / 制作関係者 | 作品への関与。作者・編集者等の役割は初期は区別しない |
| AFFILIATED_WITH | person → organization | 関わりがあった / 関係者 | 組織との関わり。雇用や所属を断定しない |

師弟関係はアシスタントから推論しない。作品と出版社の関係等は新しいpredicateの意味を決めてから追加する。初期はこの4種で検索・探索経路を成立させる。

### 4. 日付表現

APIとfixtureの部分日付は、`{ value: "2001", precision: "year" }`、`{ value: "2006-04", precision: "month" }`、`{ value: "2012-03-15", precision: "day" }`のいずれか、またはnullとする。初期は西暦0001〜9999のグレゴリオ暦のみ対応する。桁数とprecisionの一致、閏年を含む実在日付を検証する。

Claimのperiodは`{ from: PartialDate | null, to: PartialDate | null }`。どちらのnullも不明であり、現在も継続中・無期限という意味にはしない。表示は「2008年〜終了不明」などとする。年・月はその精度のまま表示し、便宜的な1月1日を保存しない。

両端は指定された年・月・日を含む。妥当性チェックのみ、fromの最早日とtoの最遅日を比較し、開始が終了より確実に後なら拒否する。範囲が重なる場合は受け入れ、詳細な成立日を推定しない。期間で絞り込む検索は初期に設けない。

Neo4jではPartialDateをネストしたpropertyとして保存せず、`validFromValue / validFromPrecision / validToValue / validToPrecision`のスカラーへ展開する。SourceのpublishedAtも同じ方式。APIで元の形へ戻し、値なしはnullで返す。createdAt/updatedAtはUTCのISO 8601日時、CitationのaccessedAtは日単位のISO日付またはnullとし、関係期間とは分離する。概数・推定・歴史的暦は今回は対象外。

### 5. 読み取りAPI契約

同一オリジンのJSON API、接頭辞は/api。日付以外の任意値も欠損時はnull、配列は空配列とし、undefinedを契約に使わない。fixture読取はライブクエリとし、初期はHTTPレスポンスをCache-Control: no-storeにする。

共通の返却型:

- EntitySummary: `{ id, kind, name, description }`。descriptionは同名判別用でnullable。
- ClaimSummary: `{ id, subjectId, objectId, predicate, polarity, period, sourceCount }`。sourceCountはCitationが指す異なるSourceの件数を導出し、信用点数にはしない。
- SourceDetail: `{ id, kind, title, authors, publisher, url, publishedAt, edition, note, isDemo }`。authorsは文字列配列、id/kind/title/isDemo以外のスカラーはnullable。
- CitationDetail: `{ id, locator, note, accessedAt, stance, source }`。locatorはページ・節等を表す文字列、noteとaccessedAtはnullable。sourceはSourceDetail。

| GET経路 | 入力 | 200のレスポンス |
| --- | --- | --- |
| /api/entities | q必須、limit省略可 | `{ items: EntitySummary[], hasMore: boolean }` |
| /api/entities/{id} | Entity UUID | `{ entity: EntitySummary + { aliases: string[] } }` |
| /api/entities/{id}/neighbors | limit、after省略可 | `{ centerId, nodes: EntitySummary[], claims: ClaimSummary[], page: { nextCursor, hasMore } }` |
| /api/claims/{id} | Claim UUID | `{ claim: ClaimSummary + { createdAt, updatedAt, citations: CitationDetail[] }, relatedClaimIds: string[] }` |

検索はpersonのみ。qをtrimし、Unicode NFKCと小文字化を行う。1〜100文字を許可し、空文字は400。表示名称・別名から同じ正規化で作った検索用配列に対する部分一致を用い、Cypherのパラメータとして渡す。検索索引・日本語形態素解析は初期不要。完全一致、名称、IDの順で安定して並べ、limit既定10・最大20でlimit+1件からhasMoreを判定する。初期検索はページングせず、候補が多い場合は検索語の絞り込みを促す。

近傍はvisibility=publishedのClaimを主体側・対象側の両方から1段階だけ取得する。Claim ID昇順で並べ、afterは直前のnextCursor（Claim UUID）を渡す。IDがafterより大きいものからlimit+1件を取得し、返却した最後のIDを次のcursorとする。続きがなければnextCursor=null。nodesは中心と返却Claimの全端点を重複排除したもの。否定するClaimも返す。孤立Entityは中心ノードのみ、claims=[]。静的fixtureが前提であり、投稿時の変更に耐えるページングは後で再設計する。

関係詳細のrelatedClaimIdsは同じsubjectId/predicate/objectIdを持つ他の公開ClaimのIDを、期間・肯否を問わずID昇順で返す。選択中のClaimは含めない。詳細画面はそれぞれのIDから内容を取得して比較できるようにする。初期fixtureでは件数が小さいため、この一覧は全件返却する。全データへ拡張する前に上限を設計する。自動的な矛盾ラベルや優先順位付けは行わない。

不正なUUID、q、limit、afterは400、存在しないEntity/Claim（非公開も含む）は404、DB接続不能・タイムアウトは503、予期しない失敗は500。整数limitは1以上・上限以内のみ受理し、黙って補正しない。エラー本文は`{ error: { code, message } }`。codeはINVALID_ARGUMENT / NOT_FOUND / SERVICE_UNAVAILABLE / INTERNAL_ERRORとし、DBエラーや認証情報を本文に出さない。未対応のHTTPメソッドは405。

### 6. グラフ展開上限とUIの動作

| 制限 | 初期値 |
| --- | --- |
| 1回の近傍取得 | Claim既定20件、最大50件 |
| 探索深度 | クリックごとに1段階。自動再帰なし |
| 画面全体 | Entity最大100件、Claim最大200件 |
| 読み取りDBクエリのタイムアウト | 5秒 |

近傍取得はClaim単位のページングで、nodesは最大51件（中心を含む）。一つのClaimを一本の辺として表示し、初期は集約しない。並行辺を分け、矢印、関係名、否定の表示を付ける。出典未確認は詳細と辺の説明で分かるようにする。否定の辺には「否定」の文字と破線を用い、色だけに依存しない。

追加展開はEntity IDとClaim IDで重複排除し、既存のノード位置は極力維持する。中心と隣接関係のテキスト一覧も提供し、一覧から展開・詳細確認ができるようにする。複雑なレイアウト最適化やモバイル専用画面は後回し。

ページのマージ前に、重複を除いた追加件数と全端点を確認する。画面全体の上限を超える場合はそのページを丸ごと追加せず、cursorも進めない。「表示上限に達したため、別の人物を中心に探索してください」と示す。中心を選び直すとグラフと全cursorをリセットする。受理できたページだけcursorを更新し、hasMoreがtrueなら「続きを表示」を出す。同じEntityの同時リクエストを防ぎ、失敗時は再試行可能にする。

初期値は小さなデモで操作と上限処理を確認するための値で、性能保証ではない。上限・ページングは別の生成したテストデータで検証し、手作業fixtureを巨大化しない。

### 実装順序と完了条件

1. Node/Next.js/Neo4jの最小環境、環境変数例、READMEを用意する。DockerはNeo4jのみ、WebアプリはローカルNodeで動かす。
2. 共通型、predicate辞書、日付検証、fixture JSONを作る。Neo4jに各ノードのid一意制約を作り、seedを二度実行して件数と接続の冪等性を確認する。
3. パラメータ化した読取クエリと上記4経路のAPIを実装する。複数出典、否定、両方向探索、同名検索、日付精度、404、ページングを実DBで確認する。
4. 検索・グラフ・詳細パネルを一画面で繋ぐ。空結果・孤立人物・失敗・続きを表示・上限の状態も表示する。
5. 検索→人物選択→作品へ展開→関係選択→参照箇所確認の経路をブラウザで検証する。型検査・lint・重要なテストを通し、起動と再投入手順をREADMEに記録する。

次の実装の想定配置はapp/（画面とAPI）、components/（検索・グラフ・詳細）、lib/domain/（型・辞書・検証）、lib/server/（DBとクエリ）、fixtures/、scripts/seed.ts、tests/。APIとseedは型・検証を共有するが、汎用リポジトリ基盤やプラグイン機構は作らない。

6項目はこの仕様で実装を開始できる。残るのは実装時のパッチ版固定、実測によるレイアウト調整と応答時間の確認。本番運用・投稿・履歴・同期・複雑な限定条件は今回の完了条件に含めない。

### 実装順序1〜2で具体化した点

- Node 24.21.0、Neo4j Community 5.26.31、Next.js 16.3.8、React 19.3.0、neo4j-driver 6.2.0、Zod 4.6.5へ固定。その他はpackage.jsonとpackage-lock.jsonを参照する。
- seedのデータトランザクションは60秒、対話的な読み取りは5秒とする。初回の一括投入が5秒でタイムアウトしたため、全件の原子性を保つためのseed専用の上限を設けた。
- Neo4jの制約作成はデータ投入とは別トランザクションで行う。データの投入失敗では全件がロールバックされるが、既に作成した制約は残る。
- 同じIDの既存ノードに異なる属性・接続がある場合は拒否する。ON CREATEでのみ属性を書き込み、seed再実行による暗黙の更新を防ぐ。
- app/layout.tsxのみ作成し、ページ・API・グラフ描画は未実装。Next.jsの標準404で起動・ビルドを確認する。
- Next.jsが生成したAGENTS.md / CLAUDE.mdは保持し、AGENTS.mdにプロジェクト文書の参照指示を追加する。next-env.d.tsは生成物としてGit対象外とし、型検査の前にnext typegenを実行する。
