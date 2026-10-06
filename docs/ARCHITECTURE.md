# 現行技術設計

更新日: 2026-10-07 / 状態: 初期Vertical Sliceと探索の開閉・Node再クリックまで実装済み。既存predicateと限定制作Roleによる条件付き探索を追加。v2 Role Claim 5件を人間受入後に投入・検証済み。関係概要・明示起点切替・直前一件復帰、人物・作品・組織の統一検索入口も実装。科学・研究機関pilot v1を別環境へ投入・観察済み。Phase 14では科学v2と組織立場のtyped限定を追加し、制作Roleと独立した語彙を保って条件・比較処理を共有。Phase 15の特定Event参加（第三のtyped限定）を実装。実資料E01/E03と特定開催回・開催期間を人間受入後に生成・専用DBへ投入・観察済み。Phase 20で三relation facetを条件editorへ接続し、具体条件を使う既存取得・復帰を維持。Phase 21でGraphの限定概要・中立的な肯否と、関係全体から独立主張／根拠へ降りる詳細を整合。Phase 22でGraphラベルを短い関係見出しと構造化済みの具体語優先へ変更。汎用taxonomy・プリセット・会員保存は未実装。[文書の入口](README.md)に現役設計とフェーズ別履歴をまとめる。

## 前提と設計の位置づけ

Phase 16で[Relation・Claim・Predicate・typed qualificationの基本設計](design/RELATION_MODEL_PRINCIPLES.md)を採用した。独立命題とdomain固有限定、null／polarity／期間、identity・比較・表示、根拠と取込由来の境界を今後の設計基準とする。三用途の実装は維持し、新しい語彙・schema・API・UI・datasetは追加していない。下記の初期仕様とPhase別記録を読む際は、後続の採用契約とこの基本設計を併せて確認する。

[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)を目的とスコープの基準とする。Neo4jを関係性データの正本、PostgreSQLをサービス運営データの正本とする構成を想定する。初期はClaimノード方式を採用し、fixtureで検証する。今回決めた実装範囲は末尾の「最小Vertical Sliceの初期採用仕様」にまとめる。将来の拡張案と初期仕様を区別する。

成熟したプロダクト像と、投稿・議論・保存・履歴等の初回設計で守る境界は [PRODUCT_VISION_AND_PRINCIPLES.md](design/PRODUCT_VISION_AND_PRINCIPLES.md) を参照する。構想の保存であり、現行API・DB契約や着手範囲を変更しない。

Global／localのidentity・読取範囲、投稿／審査、保存／公開共有／議論、provenance、AI構造化、import／exportの変更前には[Capsule・User Contribution・Global KG構想](design/CAPSULE_AND_USER_CONTRIBUTION_VISION.md)も参照する。下記の知識正本・Claim由来の表示・published読取は現行KGの契約であり、Capsule-localの保存先や全公開コンテンツのGlobal受入を定めていない。Capsuleの内容とSaved View、公開と受入を分ける。Capsuleの物理schema・投稿flowは未決・未実装。

## 多言語対応の設計前提

多言語対応は必須の設計前提であり、将来選択するオプションではない。現在は日本語のみの実装だが、新しい設計では以下の境界を守る。対応言語、翻訳の拡充、言語切替UI、名称モデルとAPIの具体的な移行時期は別途決める。

- 内部ID、predicate、polarity、Relationの同一性は言語から独立させる。翻訳文字列を保存条件や識別キーに使わない。
- UIメッセージ、predicate・taxonomy・プリセットの表示labelは安定キーとlocaleで解決し、意味や条件の版と翻訳の変更を分ける。
- Entityの名称・別名・説明は言語を持つ知識データとして設計し、UI翻訳とは分ける。Sourceの原題・原文言語を保持し、翻訳表示で原資料を置き換えない。
- ラベルの言語切替だけで探索条件、受理済みページ、cursor、開閉意図、Graph座標を変えない。将来検索を言語で絞る場合は、その取得条件を表示localeとは別に明示する。
- locale解決と未翻訳時のフォールバックを明示する。既定言語と対応言語は未確定であり、日本語への固定を永続的な契約にしない。

詳細は [多言語labelの境界](design/EXPLORATION_PRESETS_REVIEW.md#多言語labelの境界) を参照する。今回の文書修正ではAPI・DB・fixtureを変更しない。

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

正本となる`ASSISTANT_OF`などの直接RelationshipをClaimと同時に保存しない。UI用の辺はAPIのClaimからフロントのpresentation層で導出する。将来必要なら再生成可能な投影を検討するが、第二の正本を作らない。

## Neo4jの論理モデル

### Entity

人物・作品・組織・出来事などの対象。共通の`Entity`ラベル、内部`id`、`kind`、表示名称、別名、登録・更新日時を持つ。初期の`kind`は`person / work / organization / event`を想定する。必要に応じて検索用ラベルを追加するが、人物専用の主キーや漫画専用の基本構造にしない。

多言語名称は設計上の前提とし、言語・表記・別名区分を持つ名称モデルを想定する。現在の単一name / aliasesは初期実装の制約であり、その具体的なモデル・API移行は別途設計する。生年月日などの出典付き事実まで無制限にEntity属性へ詰め込まない。初期はEntity間の関係を扱い、リテラル値や多項関係の正式モデルは別途設計する。

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

保存モデルのClaimやCitationを、そのまま全て画面上のノードにしない。APIはEntityとClaimを返し、フロントのpresentation層がEntityを表示ノード、同一関係のClaim群を表示辺に投影する。同じ主体・関係タイプ・対象の表示辺をまとめる場合も、所属するClaim IDの一覧を保ち、詳細で各主張と出典を分離して表示する。

辺の識別はClaim ID、集約辺なら安定した集約キーを使う。Entity IDとClaim IDで追加展開の重複を防ぐ。方向と関係名を示し、矛盾や出典未確認を隠さない。否定のClaimを、肯定された関係と同じ線として無説明で表示しない。

### 受け入れ基準

- 人物検索から、隣接する人物・作品・組織の追加展開まで行える。
- 主体側・対象側のどちらからも同じ関係を発見できる。
- 循環するグラフを展開してもEntityやClaimが重複しない。
- 関係から複数のClaimと、それぞれの出典・参照箇所を確認できる。
- 期間・公開日・登録日時を混同せず、未知の情報を推測で補わない。
- 同名対象を区別でき、展開上限に達した場合は続きがあると分かる。
- fixture再投入で重複せず、必須接続やIDの不整合を検出できる。

検証はこの探索経路とモデル上の重要な例に集中する。初期Vertical SliceのStep 1〜5と後続の開閉・再クリックを検証済み。件数や実行条件はフェーズ別の実施記録を参照する。

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

この節は実装準備として採用する初期仕様。上記の将来案より具体的な条件を優先する。初期Vertical Sliceおよび後続の開閉・再クリックを実装済み。Step別の当時の記録はarchive、継続検討はdesignを参照する。

### 1. 技術スタック

| 項目 | 採用 | 理由 |
| --- | --- | --- |
| 実行環境 | Node.js 24 LTS、npm、TypeScript | UI・API・seedで同じ言語と型を使う |
| Web / API | Next.js App Router、React、Route Handlers（Node runtime） | 一つのアプリで画面と読み取りAPIを提供する |
| グラフ | Cytoscape.js、直接呼び出す小さなReactコンポーネント | 方向付きの辺、並行辺、クリックと追加展開を扱う |
| レイアウト | presetと配置関数（初期は楕円状、追加時は既存位置を維持） | 追加プラグインを入れず、配置と意味を分離する。数値は後述のGraph全体のバランス調整を参照 |
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
| PARTICIPATED_IN | person → event | 参加した / 参加者 | 資料が指す特定開催回への参加。招待・写真・予定だけから認定しない |

師弟関係はアシスタントから推論しない。作品と出版社の関係等は新しいpredicateの意味を決めてから追加する。初期は4種で成立させ、Phase 15で独立の参加命題を5種目として追加した。

### 4. 日付表現

APIとfixtureの部分日付は、`{ value: "2001", precision: "year" }`、`{ value: "2006-04", precision: "month" }`、`{ value: "2012-03-15", precision: "day" }`のいずれか、またはnullとする。初期は西暦0001〜9999のグレゴリオ暦のみ対応する。桁数とprecisionの一致、閏年を含む実在日付を検証する。

Claimのperiodは`{ from: PartialDate | null, to: PartialDate | null }`。どちらのnullも不明であり、現在も継続中・無期限という意味にはしない。表示は「2008年〜終了不明」などとする。年・月はその精度のまま表示し、便宜的な1月1日を保存しない。

両端は指定された年・月・日を含む。妥当性チェックのみ、fromの最早日とtoの最遅日を比較し、開始が終了より確実に後なら拒否する。範囲が重なる場合は受け入れ、詳細な成立日を推定しない。期間で絞り込む検索は初期に設けない。

Neo4jではPartialDateをネストしたpropertyとして保存せず、`validFromValue / validFromPrecision / validToValue / validToPrecision`のスカラーへ展開する。SourceのpublishedAtも同じ方式。APIで元の形へ戻し、値なしはnullで返す。createdAt/updatedAtはUTCのISO 8601日時、CitationのaccessedAtは日単位のISO日付またはnullとし、関係期間とは分離する。概数・推定・歴史的暦は今回は対象外。

### 5. 読み取りAPI契約

同一オリジンのJSON API、接頭辞は/api。日付以外の任意値も欠損時はnull、配列は空配列とし、undefinedを契約に使わない。fixture読取はライブクエリとし、初期はHTTPレスポンスをCache-Control: no-storeにする。

共通の返却型:

- EntitySummary: `{ id, kind, name, description }`。descriptionは同名判別用でnullable。
- ClaimSummary: `{ id, subjectId, objectId, predicate, polarity, period, contribution, organizationParticipation, eventParticipation, sourceCount }`。三つのtyped限定は明示nullable。sourceCountはCitationが指す異なるSourceの件数を導出し、信用点数にはしない。
- SourceDetail: `{ id, kind, title, authors, publisher, url, publishedAt, edition, note, isDemo }`。authorsは文字列配列、id/kind/title/isDemo以外のスカラーはnullable。
- CitationDetail: `{ id, locator, note, accessedAt, stance, source, roleEvidence, positionEvidence, eventParticipationEvidence }`。locatorはページ・節等を表す文字列、note、accessedAt、各原表記はnullable。sourceはSourceDetail。

| GET経路 | 入力 | 200のレスポンス |
| --- | --- | --- |
| /api/entities | q必須、limit・kind省略可 | `{ items: EntityDetail[], hasMore: boolean }` |
| /api/entities/{id} | Entity UUID | `{ entity: EntitySummary + { aliases: string[], event: EventMetadata | null } }` |
| /api/entities/{id}/neighbors | limit、after、predicates、contributionRoles、organizationPositions、eventRoles省略可 | `{ centerId, nodes: EntitySummary[], claims: ClaimSummary[], page: { nextCursor, hasMore } }` |
| /api/claims/{id} | Claim UUID | `{ claim: ClaimSummary + { createdAt, updatedAt, citations: CitationDetail[] }, relatedClaimIds: string[] }` |

検索はperson / work / organization / event。kind省略時は四種すべて、指定時は一種のみ。kindはLIMIT前に適用し、探索条件には含めない。未対応kind・未知query・重複queryは400。EntityDetailはEntitySummaryにaliasesとnullable eventを加えた詳細型を再利用する。qをtrimし、Unicode NFKCと小文字化を行う。1〜100文字を許可し、空文字は400。表示名称・別名から同じ正規化で作った検索用配列に対する部分一致を用い、Cypherのパラメータとして渡す。検索索引・日本語形態素解析は初期不要。完全一致、名称、IDの順で安定して並べ、limit既定10・最大20でlimit+1件からhasMoreを判定する。初期検索はページングせず、候補が多い場合は検索語の絞り込みを促す。

近傍はvisibility=publishedのClaimを主体側・対象側の両方から1段階だけ取得する。Claim ID昇順で並べ、afterは直前のnextCursorを渡す。無条件ではClaim UUID、条件付きでは起点・正規化predicate集合・版を含む不透明cursorとする。predicate条件はLIMIT前に適用し、詳細は末尾の条件付き探索仕様を参照する。IDがafterより大きいものからlimit+1件を取得し、返却した最後のIDを次のcursorとする。続きがなければnextCursor=null。nodesは中心と返却Claimの全端点を重複排除したもの。否定するClaimも返す。孤立Entityは中心ノードのみ、claims=[]。静的fixtureが前提であり、投稿時の変更に耐えるページングは後で再設計する。

関係詳細のrelatedClaimIdsは同じsubjectId/predicate/objectIdを持つ他の公開ClaimのIDを、限定・期間・肯否を問わずID昇順で返す。選択中のClaimは含めない。詳細画面はそれぞれのIDから内容を取得して比較できるようにする。初期fixtureでは件数が小さいため、この一覧は全件返却する。全データへ拡張する前に上限を設計する。自動的な矛盾ラベルや優先順位付けは行わない。

不正なUUID、q、limit、afterは400、存在しないEntity/Claim（非公開も含む）は404、DB接続不能・タイムアウトは503、予期しない失敗は500。整数limitは1以上・上限以内のみ受理し、黙って補正しない。エラー本文は`{ error: { code, message } }`。codeはINVALID_ARGUMENT / NOT_FOUND / SERVICE_UNAVAILABLE / INTERNAL_ERRORとし、DBエラーや認証情報を本文に出さない。未対応のHTTPメソッドは405。

### 6. グラフ展開上限とUIの動作

| 制限 | 初期値 |
| --- | --- |
| 1回の近傍取得 | Claim既定20件、最大50件 |
| 探索深度 | クリックごとに1段階。自動再帰なし |
| 画面全体 | Entity最大100件、Claim最大200件 |
| 読み取りDBクエリのタイムアウト | 5秒 |

近傍取得はClaim単位のページングで、nodesは最大51件（中心を含む）。表示では同じsubjectId/predicate/objectIdの取得済みClaimを一つのRelationへまとめる。永続Claimは独立したまま。肯否が混在するRelationには「肯定・否定あり」と点線、否定のみには「否定」と破線を付ける。個別期間・出典未確認状態は詳細で確認する。Graphのラベルは取得済みClaimの範囲に基づき、未取得ページがある場合はその旨を表示する。詳細はrelatedClaimIdsで同一関係の全公開Claimを取得する。

追加展開はEntity IDとClaim IDで重複排除し、既存のノード位置は極力維持する。中心と隣接関係のテキスト一覧も提供し、一覧から展開・詳細確認ができるようにする。複雑なレイアウト最適化やモバイル専用画面は後回し。

ページのマージ前に、重複を除いた追加件数と全端点を確認する。画面全体の上限を超える場合はそのページを丸ごと追加せず、cursorも進めない。「表示上限に達したため、他の展開を閉じて再試行してください」と示す。中心を選び直すとグラフと全cursorをリセットする。受理できたページだけcursorを更新し、hasMoreがtrueなら「続きを表示」を出す。同じEntityの同時リクエストを防ぎ、失敗時は再試行可能にする。

初期値は小さなデモで操作と上限処理を確認するための値で、性能保証ではない。上限・ページングは別の生成したテストデータで検証し、手作業fixtureを巨大化しない。

### 実装順序と完了条件

1. Node/Next.js/Neo4jの最小環境、環境変数例、READMEを用意する。DockerはNeo4jのみ、WebアプリはローカルNodeで動かす。
2. 共通型、predicate辞書、日付検証、fixture JSONを作る。Neo4jに各ノードのid一意制約を作り、seedを二度実行して件数と接続の冪等性を確認する。
3. パラメータ化した読取クエリと上記4経路のAPIを実装する。複数出典、否定、両方向探索、同名検索、日付精度、404、ページングを実DBで確認する。
4. 検索・グラフ・詳細パネルを一画面で繋ぐ。空結果・孤立人物・失敗・続きを表示・上限の状態も表示する。
5. 検索→人物選択→作品へ展開→関係選択→参照箇所確認の経路をブラウザで検証する。型検査・lint・重要なテストを通し、起動と再投入手順をREADMEに記録する。

次の実装の想定配置はapp/（画面とAPI）、components/（検索・グラフ・詳細）、lib/domain/（型・辞書・検証）、lib/server/（DBとクエリ）、fixtures/、scripts/seed.ts、tests/。APIとseedは型・検証を共有するが、汎用リポジトリ基盤やプラグイン機構は作らない。

6項目はこの仕様で実装を開始できる。残るのは実装時のパッチ版固定、実測によるレイアウト調整と応答時間の確認。本番運用・投稿・履歴・同期・複雑な限定条件は今回の完了条件に含めない。

### 初期実装の補足記録（Step 1〜5の実施時点）

以下のStep別記述は経緯の要約。現在のGraphは後述のRelation集約・開閉・再クリック仕様に従い、当時の状態管理や表示方針より優先する。詳細履歴は [Phase 01](archive/phase-01-vertical-slice/README.md) を参照。

### 実装順序1〜2で具体化した点

- Node 24.21.0、Neo4j Community 5.26.31、Next.js 16.3.8、React 19.3.0、neo4j-driver 6.2.0、Zod 4.6.5へ固定。その他はpackage.jsonとpackage-lock.jsonを参照する。
- seedのデータトランザクションは60秒、対話的な読み取りは5秒とする。初回の一括投入が5秒でタイムアウトしたため、全件の原子性を保つためのseed専用の上限を設けた。
- Neo4jの制約作成はデータ投入とは別トランザクションで行う。データの投入失敗では全件がロールバックされるが、既に作成した制約は残る。
- 同じIDの既存ノードに異なる属性・接続がある場合は拒否する。ON CREATEでのみ属性を書き込み、seed再実行による暗黙の更新を防ぐ。
- 実装順序1〜2時点ではapp/layout.tsxのみ作成し、ページ・API・グラフ描画は未実装。Next.jsの標準404で起動・ビルドを確認する。
- Next.jsが生成したAGENTS.md / CLAUDE.mdは保持し、AGENTS.mdにプロジェクト文書の参照指示を追加する。next-env.d.tsは生成物としてGit対象外とし、型検査の前にnext typegenを実行する。

### 実装順序3で具体化したAPI境界

- Route HandlersをNode runtime / force-dynamicで提供する。成功・エラー応答ともCache-Control: no-store。
- lib/domain/api.tsで既存domainのZod定義を再利用し、lib/server/mappers.tsでDBスカラーを返却型へ変換する。保存用日付・visibility・searchNames・Neo4j内部IDは返さない。DBの内容が返却型を満たさない場合は500とし、入力不正400とは区別する。
- Neo4jのdriverはサーバー内で遅延初期化して共有し、リクエストごとにREADセッションを閉じる。server-onlyでクライアントからの誤importを防ぐ。Cypherへ入力を文字列補間せず、パラメータとして渡す。読み取りトランザクションは5秒。
- UUIDは既存domainと同じv4を受け付け、小文字へ正規化する。limitは十進数字の整数のみ、既知のqueryパラメータの重複は400。qは正規化後にUnicodeコードポイントで1〜100文字。未定義のqueryパラメータは無視する。
- nodesは中心を先頭に、返却ページ内のClaimの端点をIDで重複排除する。CitationとrelatedClaimIdsはそれぞれID順。関連Claimは選択中を除き、期間・肯否を問わず同じ主体・関係タイプ・対象の公開Claimのみ返す。
- GET以外の標準メソッドには405とAllow: GETを返す。既存のエラーcode集合を維持するため405はINVALID_ARGUMENTとする。HEADの本文はHTTP仕様に従って空になる。
- 実DBテストはHTTP経由で行い、専用Neo4jの一時停止と再起動で503と復旧も検証する。テストは直列実行し、途中変更したデータを復元して最終snapshotが元と一致することを確認する。

返却型や4経路を変更する大きな設計変更はない。HTTP統合テストの待ち時間30秒はNext.js初回コンパイルも含むテスト側の上限であり、DBの5秒上限とは別。この節はStep 3時点の記録であり、画面については次節を参照。

### 実装順序4で具体化したUI境界

- Cytoscape.js 3.34.3でEntityをNode、Claimを一本の有向Edgeに変換する。Claim/Citation/SourceのDBノードをGraphに表示しない。並行辺はbezierで分け、predicate辞書の表示名と矢印を付ける。deniedには「否定」の文字と破線を併用する。
- CSS Modulesの三列画面を使う。React標準stateと探索用hookで、ID辞書のnodes/claims、選択、Entityごとの展開状態・cursor・hasMore・loading・errorを保持する。refは進行中通信と直近stateの参照だけに使い、外部ストアは設けない。
- 中心変更時に通信をabortし、世代番号で遅い応答も除外する。同じEntityの進行中通信は一つに制限し、別Entityの応答は直近stateへ逐次マージする。上限を超えたページは全体を拒否し、cursorを維持してそのEntityの追加取得を停止する。
- 初回ページ受理時のみbreadthfirstレイアウトを実行する。追加Nodeは展開元の周囲へ8方向・同心円状に配置し、既存Nodeのモデル座標と表示範囲を変更しない。画面外は手動パン・ズームまたは「全体を表示」で確認する。高度な配置最適化は行わない。
- 詳細は同一オリジンの既存APIだけを利用する。選択Claimを先に表示し、relatedClaimIdsの詳細を並列取得してID順で縦に並べる。一部失敗では取得済みカードを残して再試行を案内する。順位・信頼度・自動矛盾判定は追加しない。
- デモSource URLはリンクにせず文字列で表示する。出典件数は評価点として扱わない。Graphと同じデータからテキストの隣接一覧を作り、Entity展開とClaim選択を提供する。

API契約、fixture、DBモデル、上限の変更はない。配置と非同期状態の扱いを具体化したのみ。ブラウザ検証は今回依頼されたStep 4の機能確認であり、Step 5の最終調整完了を意味しない。

### 実装順序5で具体化した探索表示

Step 4のDB/API契約と探索機能を維持し、表示のみ調整した。以下はStep 4記録の配置・画面サイズを更新する現在の仕様。

- 初期配置は中心を固定した横長の楕円。通常の横半径max(300, 周辺数×42)、縦半径max(220, 周辺数×28)、開始角-45度とし、横書きラベルの余白と縦の伸びすぎを抑える。追加時は既存Nodeを固定し、新規Nodeだけを接続先・接続先重心の近くの候補へ置く。接続距離、Nodeとの衝突、端点とラベルの余白、既存ラベルとの近さ、中心からの拡がりを評価し、最初に空いた枠への配置を避ける。pan/zoomは追加時に変更しない。詳しい条件は次の「Graph全体のバランス調整」を参照。
- 同じsubjectId/predicate/objectIdのClaimをpresentation層で一つの有向Relationへ集約する。表示IDは `relation:<subjectId>:<predicate>:<objectId>`、claimIdsは独立したClaim IDの配列。逆方向や別predicateは別Relation。単独端点組は制御点距離0、同じ端点組の別Relationには距離に応じた中程度のunbundled-bezier、重み0.5を使う。2本なら±clamp(線の長さ×0.32, 70, 115)、3本以上はこの範囲に均等に分ける。縦向きの複数Relationには最大±18pxの縦ラベルオフセットも付ける。個別期間をGraphに出さず、関係名・構造化済み限定の短い概要と、肯否混在時の「肯定・否定あり」を示す。混在はaffirmedとdeniedの両方が表示中の場合のみで、期間差・出典数の評価や自動矛盾判定ではない。現行presentationは末尾と採用契約を参照。
- 同名が表示中Graph内に存在するときのみ、descriptionの「、」「。」より前を補助ラベルにする。説明も同じ場合はIDの先頭8桁を添える。通常Nodeは名称だけ。元のEntityの名前・説明を変更しない。
- 三列はデスクトップで190px / 可変Graph / 300pxを基本とし、狭い画面では左右を150px / 220pxまで縮める。Graph列は280px以上を保ち、それ以下の幅では三列全体を横スクロールする。中央ペイン全体は縦スクロール可能。Graphは残り高さで縮めず、独立した高さ`clamp(480px, 70dvh, 900px)`、手動調整時も最低400pxを確保する。隣接関係は内容量に応じた高さとし、`clamp(260px, 45dvh, 480px)`を上限に内部スクロールする。左右の詳細・検索のスクロールは独立して維持する。
- Graphの右下でCSS標準の`resize: vertical`を使い高さだけ手動調整できる。サイズはDOMの表示値に留め、GraphState・探索snapshot・永続設定へ追加しない。同じ画面内の条件変更・起点切替では手動高を維持し、再読込で既定のレスポンシブ高へ戻る。既存ResizeObserverがCytoscapeをresizeし、座標・pan/zoom・選択を変えず再配置／自動fitしない。中央スクロールのクリック位置はCytoscapeの既存祖先scroll監視で追随する。
- 独立ブロック化後の漫画v2 PLUTO実画面では、Canvas高は1440×1000で約698px、1280×720で約502px。隣接5 Claimは上限付きスクロール、Role条件で1 Claimにすると内容高へ縮むことを確認。中央スクロール・実際の縦ドラッグ・Cytoscape寸法追随・幅切替と、座標／pan/zoom／選択維持・一覧からのClaim詳細をPlaywrightへ追加し、既存Phase 07の条件draft取消・通信・詳細幅回帰と合わせた2ケースが成功。初期配置のサイズ依存ルールは維持し、受理後のサイズ変更で座標を作り直さない。
- 2026-10-07のviewport調整では、Graph見出し・件数と探索起点を同じ行へまとめ、ヘッダー・パネル周囲・条件操作・凡例の余白を縮めた。選択状態と展開状態は横並びを基本とし、長い内容は折り返す。条件・起点・注意書き・操作は維持。漫画v2のPLUTOで、Canvas高は1440×1000で約442→559px、1280×720で約317→370px。既存PlaywrightのPLUTO関係詳細／Role条件とPhase 07のdraft取消・通信・座標・選択・pan/zoom・詳細幅切替の2ケースで回帰を確認した。変更はCSSと見出しの配置のみで、探索state・API・意味・dataset・Graph配置アルゴリズムは変更しない。
- 選択対象をGraph上部にも文字で表示する。展開済みは二重枠、直近に表示されたNodeは淡い外枠だけで識別し、操作を想起させる文字ラベルを付けない。Claimを選んでも主体の隣接一覧を維持し、該当ボタンのaria-pressedと枠線で選択を示す。
- 主張カード内の関係・肯否・期間・出典を区切り、CitationごとにSourceと参照箇所を表示する。関連主張は同じカード形式の縦並びのまま、表示順が正しさ・信頼度を意味しないことを明記する。

新しい依存ライブラリは追加していない。上限は変更せず、混雑したGraphを常に重なりゼロにする保証は行わない。拡大・パン、隣接一覧と出典詳細を併用する。

### Step 5追加調整: 表示Relationと独立Claim

最新のユーザー指定により、以前の「Claimごとに一本の辺」という表示方針を変更した。Step 4および過去のStep 5検証記録は当時の記録であり、現在のGraph表示は本節に従う。

- API契約とNeo4jモデルを変えない。Reactのclaims辞書は全Claimを独立保持し、Entity最大100・Claim最大200、cursorの扱いも維持する。
- Edge選択はRelation IDで保持し、そのclaimIdsの一件から既存Claim詳細APIを呼び、relatedClaimIdsの全公開Claimを取得する。Graph未取得ページの関連Claimも詳細で確認するが、Graphへ自動マージ・cursor更新はしない。
- 全ClaimカードをID順で同格に縦並びする。期間・肯否・Citation・Source・出典未確認を個別表示し、順序が信頼度を表さないことを明示する。一部取得失敗では成功したカードを残し再試行を案内する。
- 一覧はClaim単位を維持する。個別Claim選択では対応するRelation Edgeを強調し、Relation選択では所属Claimの一覧行を強調する。
- デモ初期Graphは7 Claim / 5 Relation、全展開Graphは15 Claim / 13 Relation。青葉ハル→黒川レンの3 Claimは1 Relationになる。Claim数とRelation数は別々に表示する。

### Graph全体のバランス調整

- 表示配置だけの変更。Claimの集約キー、独立保持、API、fixture、DBを変更しない。Nodeの距離に関係の強さ・真偽の意味を持たせない。
- 新規Nodeの候補は接続先の重心・各接続先から半径250/310/390/480、24方向、縦倍率0.8。既存Nodeを含む全体の反復レイアウトは行わない。
- 候補評価ではNode間の横180/縦120の楕円の衝突、および中心間距離200未満を強く避ける。接続距離の目安は225〜295（横方向ほど長め）。横差270未満かつ縦差150未満の辺は、横書きラベルが端点に近すぎる候補として避ける。
- 既存Nodeと辺の中点、既存ラベル中点との近さも評価する。中心からの広がりは縦を横より強めに抑える。有限の候補の比較であり、重なりの完全解消や最適配置を保証するものではない。
- Edge曲率は実際のNode間距離から計算し、追加配置後とNodeドラッグ終了後に更新する。単独Relationは直線。既存Nodeは移動させない。
- Node文字16px、Edge文字15px、Edgeラベル幅165px・背景余白5px。選択Edgeは線の強調と淡いラベル背景を使い、窮屈なラベル枠を付けない。
- 短いCanvasでは縦半径の基準をclamp((Canvas高−80)/2, 155, 220)へ縮め、180未満なら横半径の基準を360に広げる。周辺数による半径下限は維持する。
- 初期はfit後のzoomを0.8〜1.15（未取得ページがある場合は下限0.65）に調整し、可読性を優先する。狭い領域では一部が画面外に出る場合があり、パンか「全体を表示」で確認する。「全体を表示」は余白24pxのfitで全域の位置関係を確認し、文字が縮小する。

### 初期Vertical Sliceのテーマと完了範囲

- app/theme.cssで画面・Graphの共通CSS変数を定義。落ち着いた深緑、明るい紙色、personの淡い緑・workの紙色・organizationの淡い紫を使う。CSS ModulesとCytoscapeは同じテーマ値を参照する。ヘッダーにライト/ダークのトグルとダーク配色（ブラウン/ブルー）の選択を用意する。Graphはルートのdata-theme属性変更を監視し、CSS変数を再取得してstyleだけを更新する。既存Core・位置・選択・pan/zoomを維持する。初期表示はライトで、永続化・OSへの自動追従は追加しない。
- レイアウト、Node配置、曲率、意味表現、API・DB・fixtureは維持する。選択の太い枠、展開済みの二重枠、新規表示の淡い外枠、Node形状、否定の文字と破線、肯否混在の文字と点線も維持する。
- 検証した文字と背景の比率は4.5以上、Graph線・Node境界・入力境界は3以上を確認。包括的なアクセシビリティ適合の認証ではない。
- 初期の検索→探索→Claim比較→出典確認までのローカルデモを完了として区切る。将来機能や本番公開準備は対象外。配色と確認画像は [IMPLEMENTATION_THEME.md](archive/phase-01-vertical-slice/IMPLEMENTATION_THEME.md) を参照。

### 探索モデルの設計レビューと開閉フェーズ

閉じる・条件付き探索・時系列の設計提案は [EXPLORATION_MODEL_REVIEW.md](design/EXPLORATION_MODEL_REVIEW.md) を参照する。移行順序1〜4を採用し実装済み。React state内の取得キャッシュとページ所属・open意図から表示対象を導出する。単一起点のUIを維持し、閉じるでは当該展開の利用を解除する。共有対象は残し、起点から切れた循環は除く。休止した子孫の受理済み範囲は再到達時に復元し、明示的に閉じた子孫は閉じたまま。復元で通信は行わない。

- 表示上限は100 Entity / 200独立Claim。新規ページ・枝の復元を全体で検査し、超過時は拒否する。閉じる後に再試行でき、cursorは受理時だけ進める。
- 一時キャッシュは400 Entity / 800 Claim。非活動かつ非通信中の展開を古い利用順に所属・cursorごと破棄し、再取得を可能にする。起点変更で全てリセット。
- 起点の配列を内部境界に用意するが、複数起点UI・条件キーの汎用化は未実装。局所要求番号・abort・世代番号で旧応答を拒否。
- Graphと一覧は共通の表示対象を使う。差分削除と座標復元を行い、残存位置・pan/zoomを維持する。消失Entity選択は起点へ、消失Claim / Relation選択は解除する。Relation詳細は全公開Claim比較を維持し、Graph未表示を区別する。

仕様は [EXPLORATION_CLOSE_PHASE.md](archive/phase-02-exploration-close/EXPLORATION_CLOSE_PHASE.md)、検証結果は [IMPLEMENTATION_EXPLORATION_CLOSE.md](archive/phase-02-exploration-close/IMPLEMENTATION_EXPLORATION_CLOSE.md) を参照。開閉フェーズ時点でAPI・DB・fixture・predicate・日付の変更はなかった。その後、移行順序5〜6の最小predicate条件付き探索を追加した。kind・期間条件・複数起点・時系列は未実装。

### Nodeクリックの開閉と操作設定

Graphの未選択Nodeは即時に選択・必要な展開を行い、選択中Nodeは300ms後に開閉する。300ms以内の同じNodeへの二度目のクリックは開閉を取り消し、独立したダブルクリックのコールバックへ渡す（現在は未割当）。選択変更・他対象の操作・ドラッグ・中心変更・破棄では待機中の開閉を取り消す。一覧の選択・明示開閉ボタンは即時の既存操作を維持する。

判定値はlib/client/graph-interaction.tsのGRAPH_INTERACTION_DEFAULTSへ集約し、テスト可能なイベント判定から開閉処理を分離する。設定モーダルや設定永続化は未実装。利用者の操作設定、Graph表示調整、管理ポリシーの責務分担は [GRAPH_INTERACTION_AND_SETTINGS.md](design/GRAPH_INTERACTION_AND_SETTINGS.md) を参照。

### 探索軸プリセット・taxonomy・保存ビューの設計レビュー（未実装）

探索プリセットはアプリケーション層の版付き条件テンプレートとする提案。predicateの意味、閲覧分類、多言語label、個人の保存ビュー、実行セッションを分ける。初期の公式カタログはコード管理から始め、運営の画面編集と会員保存は必要時にPostgreSQLへ置く。Neo4jへ知識Graphの第二の正本を作らない。保存ビューは出自プリセットの版と確定した条件を持ち、公式更新へ黙って追従しない。詳細・未確定判断は [EXPLORATION_PRESETS_REVIEW.md](design/EXPLORATION_PRESETS_REVIEW.md) を参照。今回のレビューは提案で、条件API・認証・管理・保存機能は未実装。


### 既存predicateによる条件付き探索

今回の採用契約は [CONDITIONAL_EXPLORATION_PHASE.md](design/CONDITIONAL_EXPLORATION_PHASE.md)。4 predicateの集合を選び適用する。全件は無条件、空集合は関係なし。同一起点から再取得し、旧条件の通信・受理ページ・cursor・開閉意図は引き継がない。無条件の開閉・休止子孫復元は維持する。

neighborsは任意のpredicates CSVを追加し、published・predicate条件をLIMIT前に評価する。正規化した全件は従来のUUID cursor、部分集合は起点・条件・版と結び付いた不透明cursor。別条件や起点との混用、未知predicate・未対応queryは400。返却型・Claim詳細契約は維持する。

GraphStateは一つの有効条件スコープ（predicates / conditionKey）内にEntity別展開を保持する。世代変更で旧応答を排除し、受理・表示でもpredicateを検査する。同一起点では座標・pan/zoomを可能な限り保持し、選択は起点へ戻す。条件内空結果は孤立と区別する。新しい関係選択文字列はlocale解決境界を持つ日本語リソースに置く。taxonomy・プリセット・期間条件・複数起点・全面翻訳は今回追加しない。

### 少数実データパイロット v1

[REAL_DATA_PILOT.md](design/REAL_DATA_PILOT.md)を採用し、[Phase 04](archive/phase-04-real-data-pilot/IMPLEMENTATION_REAL_DATA_PILOT.md)で最小の実データ環境を実装した。5人物・3漫画作品・9 Claim・4 Source・9 Citation・8 ExternalIdentifier。Claimは確認した出版社・本人インタビューを根拠とし、Wikidataは外部ID・名称・同一性の確認と原取得記録に限定する。

- datasets/pilot-urasawa/v1/ledger.jsonが収集台帳。言語付き名称・役割原表記・資料の限定・取得由来・保留を保持し、原JSONのhash/revisionと照合する。data.jsonは現行schemaへの投影、manifestは凍結版と内容hash。生成・検証はオフライン。
- demo fixtureは維持。パイロットは別compose project/volume、Neo4j 7475/7688、Next 3211/.next-pilot。GRAPH_DATASETと接続先・seedの指定が一致しなければ拒否する。サーバーから表示モードだけをUIへ渡す。
- seedは同じ確定内容の投入だけ。トランザクション内で対象外の既存Node/Relationshipを拒否し、差異を上書きしない。既存6制約・知識モデル・読み取りAPI契約を維持する。任意の手動DB書込みを制御する権限基盤は未実装。
- Sourceは実資料、Wikidataの取得provenanceとは別。Citation.noteは台帳の役割・限定・理由から生成する。発売日・取材日をSource公開日やClaim期間へ転用しない。役割の汎用モデル・言語付き名称のAPI・履歴検索は未実装。
- 専用表示は少数実データ・非網羅・共通作品は人物同士の直接関係ではないことを明示する。新規文字列はlocale解決境界へ置く。Graphの配置・操作・条件・開閉・Relation集約は維持する。

一般更新・大量importを追加したわけではない。検証中は版を固定し、新版への切替は別DBを検証して探索を再開始する。demo統合テストはパイロット設定を拒否し、パイロットのテストは専用実行経路で分離する。

### 既存Predicateの意味契約・変更チェック

既存4語彙の実行辞書とClaim schemaは維持する。vocabulary/catalog.jsonに包含・除外・境界例、方向、近接概念、locale別表現、既存語彙との比較を記録し、baseline-v1.jsonを変更検出用の基準版とする。使用済みIDの意味は変更せず、追加・意味を保つ明確化・翻訳修正にもhashで変更前後を指定した比較票を要求する。端点変更・ID削除・辞書との不一致・無審査変更は開発時validatorで拒否する。意味の同一性・資料の解釈は人間レビュー。詳細と実行方法は [PREDICATE_CONTRACTS.md](design/PREDICATE_CONTRACTS.md)。Role・taxonomy・Graph表示束・DB/API/UI・凍結データは今回変更しない。

### 限定された制作Role（Phase 06）

[CONTRIBUTION_ROLE_CONTRACTS.md](design/CONTRIBUTION_ROLE_CONTRACTS.md)を現行の採用仕様とする。4 Role、一Claim一Role、publication scope、Citationの原表記・言語、LIMIT前条件、dataset付きv2 cursor、広いrelatedClaimIdsと三つ組DisplayRelationを実装。CONTRIBUTED_TOの混在は「肯定・否定あり」。既存demo/v1の無Role条件cursorは維持するが、Claim/Citationの返却にcontribution/roleEvidenceを追加しクライアントも更新した。凍結v1ファイル・DBは変更しない。

実データ5件の人間受入・検証結果は[Phase 06実施記録](archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)を参照。taxonomy等は未実装。

### 探索の入口・条件提示（Phase 07）

人物検索 → 候補を起点に自由探索 → 必要なら見る関係を調整、を既定の流れとする。Phase 09で同じ入口を人物・作品・組織へ一般化した。左は検索、中央は起点・適用条件・Graph・隣接一覧、右は選択詳細。検索語・起点・選択中のEntityを区別し、Node選択で起点は変更しない。

- 適用中のpredicate／Role条件を中央上部へ常時要約する。「見る関係を編集」からnative dialogを開き、確定条件から独立したdraftを初期化する。編集開閉・取消・Escapeでは通信や探索stateを変更しない。取消後の再編集は確定値から始める。ダイアログ表示中は背景操作を止めるが、既に開始した通信を中断する操作ではない。
- 変更の明示適用時だけ既存changePredicatesへ渡す。同じ条件では適用を無効にする。同一起点の再取得、旧通信／cursor／開閉状態の破棄、条件内ページングは既存契約を維持する。起点未指定でも条件設定でき、後の候補選択で使う。検索候補は探索条件で絞らない。
- 制作関与がdraftに含まれる場合だけ、追加の「制作の役割を調整」を提示する。無指定と個別指定をradioで分ける。全4 Roleの選択も役割未指定Claimを除くため、無指定とは異なる。Role空集合は制作関与だけを除き、他predicateは維持する。制作関与を外した適用ではRole条件も正規化して解除する。
- 要約は確定条件のみから、編集中の要約はdraftのみから作る。新規文字列はlib/i18n/exploration-entry.tsのlocale解決境界へ置く。全面翻訳・言語切替は追加しない。
- 選択詳細に「詳細を広く読む」を用意し、三列を維持したまま右を最大480pxへ広げる。Graphを再マウントせずResizeObserverでcanvas寸法を追従する。モデル座標・pan/zoom・選択を変更せず、必要な表示範囲の調整は既存pan/zoom／全体表示で行う。現在のGraph高と中央スクロールは上記の探索表示仕様に従い、低い画面でも残り高さへ圧縮しない。
- 閉じた枝の復元時は保存済みNode座標を優先する。既存の200px衝突判定による再配置を行わず、未表示だったNodeだけを候補評価で配置する。受理ページ・休止子孫・合流／循環の契約は変更しない。

DB・API・探索条件キー・cursor・上限・DisplayRelation集約・Claim／Citation／Source・datasetの変更はない。[採用レビュー](design/EXPLORATION_ENTRY_AND_CONDITIONS_REVIEW.md)、[実施記録](archive/phase-07-exploration-entry/IMPLEMENTATION_EXPLORATION_ENTRY.md)を参照。

### 複数分野の探索文脈・起点切替

[レビュー](design/CROSS_DOMAIN_EXPLORATION_REVIEW.md)に、論理的な共通知識と分野・テーマ・実効条件の分離、明示的な「広く見る」／条件維持の起点変更、直前探索への復帰、別分野の小さい検証案を記録した。起点切替・一件復帰はPhase 08で採用し、科学pilotはPhase 10で投入。分野分類・theme・presetは未実装であり、追加の採用判断を要する。現行の契約は以下のPhase 08以降を参照する。

## Phase 08：関係概要・起点切替・直前探索への復帰

関係概要は任意の読み取りであり、選択・展開・起点切替から独立する。Entity詳細の「関係概要を見る」が正規導線、Nodeのダブルクリックは同じモーダルへのショートカット。未選択Nodeの初回クリックは即時選択・必要時展開を保ち、300ms以内の二度目で開閉だけを抑止する。概要中も既に開始したGraph取得は完了し得る。

### 概要API

`GET /api/entities/{id}/overview`。UUID v4のみ、query parameterは受け付けず400。Phase 17で二つのdomain限定内訳を追加し、他の読み取りAPIは変更しない。

```ts
type EntityOverviewResponse = {
  entity: EntitySummary;
  scope: { dataset: DatasetMode; visibility: "published"; filtered: false; unit: "claim" };
  relations: {
    predicate: Predicate;
    perspective: "subject" | "object";
    counts: { affirmed: number; denied: number };
    contributionRoles: { roleId: ContributionRoleId | null; counts: { affirmed: number; denied: number } }[];
    organizationPositions: { positionId: OrganizationPositionId | null; counts: { affirmed: number; denied: number } }[];
    eventRoles: { roleId: EventRoleId | null; counts: { affirmed: number; denied: number } }[];
  }[];
};
```

現在datasetの公開Claimを、探索のpredicate／Role条件・ページング・Graph上限から独立して集計する。各視点でDISTINCT Claim IDを数え、Citation／SourceにはJOINしない。自己関係は両視点に一件ずつ現れ得るため、行を合計した全体総数は表示しない。否定も数えるが、成立認定・矛盾判定・重要度へ変換しない。CONTRIBUTED_TOの制作Role、AFFILIATED_WITHの組織立場、PARTICIPATED_INの参加立場を別々に集計し、非適用配列は空。nullは各domainの「限定していない主張」。刊行物・期間の違いを消して担当認定しない。詳細の限定・根拠は既存Claim詳細へ戻る。

対象不存在404、GET以外405、保存データ不正500、DB接続不能／読取予算超過503。ゼロ件は成功応答の空配列であり、取得失敗と区別。パラメータ化Cypher・既存読取timeout・no-storeを使用。概要取得はGraph通信と別のAbortControllerで、閉じる／対象変更時に取消す。404では概要からの起点切替を無効化し、その他の集計失敗では既知の対象から探索可能とする。

### 原子的な起点切替

「この対象から広く見る」はpredicate／Role追加条件をnullへ解除。「同じ条件でこの対象から見る」は確定条件（空集合も含む）を維持。無条件なら操作は一つ。同一起点・同実効条件は不要なリセット／通信をしない。直接Entity詳細からでも概要からでも同じ遷移を使い、概要成功を必須にしない。

起点＋条件を一度に確定し、新世代で新起点だけを一段階取得する。旧通信はabortし、旧応答は世代・要求番号で排除。旧cursor／受理ページ／open意図を新探索へ持ち越さない。同一起点での条件解除は既存の共通座標維持を利用。検索候補選択の条件維持は従来どおり。

### 直前一件の復帰

実際の明示切替直前に、受理済みGraph/cache、起点・条件、cursor、open意図（休止子孫と明示閉鎖を含む）、選択、表示／キャッシュ内Node座標、pan／zoomを保持する。現在のGraphと一件の復帰用探索は各400 Entity／800 Claim以内、合計最大800／1600。履歴のために表示上限100／200は変えない。上限を越える保存は拒否し、復帰ボタンを出さない（通常の正規状態は既存上限内）。

寿命は同じdatasetの画面内セッション。再切替で置換、復帰で消費、検索候補からの新探索・dataset変更による再mount・再読込で失効する。凍結datasetの読み取り環境で、時間による失効やDB版固定は導入しない。将来更新／認可を追加する前に版・認可変更時の失効を決める。検索語・検索結果・条件draft・概要・進行中通信は保存しない。

復帰も新世代にし、通信は再開しない。未完了要求があったEntityはloadingを解除して中断表示／明示再試行を提供し、受理cursorを進めない。座標・pan/zoomはCanvasの小さいview境界から取得／復元する。受理直後で未描画だったNodeは保存座標がないため、既知座標を固定して既存の追加配置ルールで補う。表示Nodeの座標が一つも保存できていなければ初期配置・fitを使い、同じ表示範囲の復元を保証しない。保存がない時は復帰操作を表示せず、元Graphの完全復元を約束しない。DB利用不可でも受理済みGraphへ戻れるが、詳細の再取得・続きを取得する操作は失敗し得る。


## Phase 09：既存Entity kindへの検索入口の一般化

検索対象はlib/domain/search.tsのSEARCH_KINDS（person / work / organization / event）。Phase 09時点では三種のみ。Phase 15で既存event kindに特定開催回の契約と参加predicateを実装したため検索へ公開する。新kind追加や探索範囲の限定ではない。

`GET /api/entities?q=...&kind=work&limit=10`。kindは任意の単一enum、省略は四種すべて。「すべて」はUI値でありAPIへallや空文字を送らない。qはtrim・NFKC・小文字化後1〜100 Unicode code point、limit既定10／最大20。空・欠落q、不正limit、空／未知kind、同じqueryの重複、未対応queryは400。0件は200／items=[]／hasMore=false。完全一致（nameまたはalias）、name、内部ID順。LIMIT+1でhasMoreを判定し、候補のページングは追加しない。

応答itemsは既存EntityDetail（id・kind・name・description・aliases・nullable event）であり、DB searchNamesや外部IDを露出しない。Webクライアントだけの契約を直接更新し、旧人物専用版のversioning／互換経路は追加しない。Phase 09ではneighbors等の応答を変更せず、Phase 15でnullable eventParticipation等を追加した。

左に一つの名前／別名検索と任意の検索対象selectを置く。初期はすべて。候補はkindの文字、名前、説明、別名で見分け、同じ名前・kind・説明が重なる場合は内部IDも補助表示する。候補取得・検索kind変更だけではGraph／探索条件／直前探索を変更しない。検索kind変更では旧検索を取消し候補をクリアするが自動取得しない。候補選択だけ既存chooseRootで確定predicate／Roleを保持した新世代へ移り、旧枝・通信・直前探索をリセットする。

検索kindはGraphState・探索conditionKey・cursorへ入れない。作品／組織から人物も通常どおり辿る。関係概要、明示的な広く見る／同条件切替、一件復帰、開閉／休止枝復元、Claim／Sourceは同じ契約を再利用する。UI文字列はlib/i18n/entity-search.ts等でlocale解決し、Entityの原語別名は知識データとして返す。言語付き名称のAPI、形態素解析、全文検索基盤は追加しない。

実装・検証は[Phase 09記録](archive/phase-09-entity-search/IMPLEMENTATION_ENTITY_SEARCH.md)を参照。

## Phase 10：科学・研究機関パイロット

`pilot-science-v1`を検証用datasetモードへ追加。person 5／organization 3、AFFILIATED_WITH 8 Claim、Source 9／Citation 9／外部ID 8。C09はpendingで台帳にのみ保持する。Node／Claim／Citation schema、predicate契約、検索・近傍・俯瞰の取得内容、Graph state・起点切替は変更しない。概要応答のdataset enumへ値を追加する。

`datasets/pilot-science/v1`の凍結ledgerから受入済みだけを生成。原職位・言語・期間原表記・受入範囲はCitation.noteと台帳に残し、制作用Roleへ変換しない。9候補のうち8件だけを受入投影する検証、raw QID／ledger／data／manifestの一致確認を行う。既存凍結datasetは不変。公開資料全文の再配布はせず、取得hashと短い原表記・要約・locatorを残す。

専用compose project／volume、Bolt7690／Browser7477／Web3213／.next-scienceを使用。dataset／接続先guardと対象外Node／Relationship拒否を維持し、全seedは既存の冪等・内容一致方式を再利用する。これは物理的な検証環境の分離であり、製品としての分野Graph分断ではない。

科学cursorは既存v2形式を使いdataset／中心／条件を検証。demo／漫画v1の既存cursor契約は維持。CONTRIBUTED_TO Role条件はAFFILIATED_WITHへ作用しない。人物・組織で同じPhase 08／09契約を適用する。

現在名と旧研究所名は公式の改称記述・人間受入により同一Entity。歴史的名称モデル、組織間関係、非制作qualification、Entity概要再設計は未導入。[datasetと起動](../datasets/pilot-science/v1/README.md)／[検証・情報損失の観察](archive/phase-10-science-pilot/IMPLEMENTATION_SCIENCE_PILOT.md)を参照。

## Phase 11：固定の探索開始例

既存dataset別の固定EntitySummaryをlib/client/start-examples.tsで定義する。科学4・漫画各4・demo5（同名2名を含む）。DB・ledger・fixtureの正本は変更せず、unitで各ID・kind・name・descriptionが凍結dataに一致することを検証する。ブラウザへledgerやSource全文を同梱しない。表示文言はlocale境界を持つlib/i18n/start-examples.ts、Entity名は知識データとして扱う。

StartExamplesは検索と並存する左ペインの小さい領域。例を押した時だけchooseRoot(entity, true)で新探索へ移る。既存検索はchooseRoot(entity)で確定条件維持という契約を継承。trueは追加predicate／制作Roleを解除する指定で、起点と条件を一つの世代で確定する。変更条件による旧起点の取得は行わず、旧通信をabort・旧ページ／cursor／開閉意図・直前履歴をリセットする。dataset・公開範囲・取得上限は変えない。検索語・検索kind・検索結果は変更しない。開始例も検索候補も直前復帰対象の起点切替操作とは別の新規開始として扱う。既存の広く見る／同条件で見るの復帰契約は維持する。

開始例は条件や表示法の保存preset・taxonomy・推薦ではない。新規関係モデル／追加データは[検証構成案](design/RELATION_MODEL_VALIDATION_SAMPLES.md)の未実装提案。

## Phase 14：制作Roleと組織立場のtyped限定Vertical Slice

現行仕様は[TYPED_QUALIFICATION_CONTRACTS.md](design/TYPED_QUALIFICATION_CONTRACTS.md)。CONTRIBUTED_TOの制作RoleとAFFILIATED_WITHのorganizationParticipationを別型・別語彙にし、適用先検査・条件正規化/一致・原表記schema・比較キー・探索世代/cache/復帰/cursor処理だけを共有する。組織立場はVISITOR / ASSOCIATE_PROFESSORの二値。雇用・専任・日本の職位への変換はしない。

投入schemaVersion=3、ClaimにorganizationParticipation、CitationにpositionEvidenceを追加。旧v1/v2入力は不変。Neo4jは新スカラーpropertyのみでNode/Relationship/制約を変更しない。neighborsにorganizationPositions CSVを追加し、両限定を独立にLIMIT前適用する。立場nullと空集合を区別し、広いClaimをnoteからVisitor条件へ含めない。立場条件ありまたはscience v2のcursorはv3で起点・dataset・両条件へ拘束。旧無立場条件のcursorは維持する。

比較キーはtyped限定・刊行物識別・periodの値/精度/nullを含み、polarityを除外する。真偽・矛盾判定、Claim UUIDやMERGEキーの代用ではない。relatedClaimIdsとDisplayRelationはSPO単位を維持し、詳細では個別限定へ戻る。AFFILIATED_WITH混在を「肯定・否定あり」とし異なる限定を自動対立表示しない。関係概要は現在のClaim集計構造のまま。

science v2は既存8 Claim＋限定2 Claim、8 Entity・9 Source・11 Citation。C09保留。専用Bolt7691/Browser7478/Web3214/.next-science-v2で検証。既存science v1・漫画v1/v2・demoは凍結不変。語彙追加・更新一般基盤は未実装。event参加は次節のPhase 15で追加。[dataset](../datasets/pilot-science/v2/README.md)、[実施記録](archive/phase-14-typed-qualification/README.md)を参照。


## Phase 15：特定Event参加と第三のtyped限定

[Event参加契約](design/EVENT_PARTICIPATION_CONTRACTS.md)を採用。PARTICIPATED_INはperson→特定開催回の独立命題、eventParticipationはnullまたは`{roleId:"CHAIR"}`。参加を伴う当該会議の議長に限定し、委員会職・名誉議長・招待を含めない。INVITEDはenumに存在せず、未知値を適用先の正規化より先に拒否する。参加資料の意味と人間受入の検証は型検証と別。

投入schemaVersion=4。Entityにnullable event（event kindだけ必須、granularity="occurrence"、period）、Claimにnullable eventParticipation、Citationにnullable eventParticipationEvidence（原語＋language）。旧schema 1/2/3と凍結入力は不変。Event kind／参加predicateにはv4入力を要求する。Eventはシリーズではなく開催回を内部UUIDで同定する。開催日からClaim.periodを補完しない。DBではeventGranularity・eventFrom/ToValue/Precision、eventRoleId、eventOriginalText/Languageへ展開する。既存Node/Relationship/制約は維持。

neighborsのeventRoles CSVは省略＝絞らない、空＝参加だけ除外、CHAIR＝明示限定Claimだけ。全Role enumの選択でもnullと区別する。制作Role／組織立場と独立にLIMIT前へ適用する。新型条件またはEvent datasetでcursor v4を使い、dataset・起点・predicate・三限定へ拘束。既存無Event条件のcursor形式は維持。GraphState・世代・受理ページ・開閉・snapshot/復帰に第三条件を渡し、広く見る／開始例で三限定すべてを解除する。

relatedClaimIdsとDisplayRelationはSPO単位のまま。比較キーにはEvent立場とClaim.periodを含み、Event.period・polarity・Sourceは含めない。広い参加と議長参加は同一内容ではなく、Graphの表示束に過ぎない。混在は中立な「肯定・否定あり」。詳細で参加立場・未知のClaim期間・原資料・限定へ戻る。Event開催期間はEntity詳細で別表示する。条件編集はPARTICIPATED_IN選択時だけ参加立場の編集を提示し、draft/明示適用契約を維持。概要の集計構造は変えず、参加Claim数が接続Entity数ではない現象を観察する。

`pilot-event-v1`は科学v2を対照としてコピーした新しい検証版。専用Bolt7692／Browser7479／Web3215／.next-event。台帳のE01/E03と開催回の人間受入がpendingなら生成・seedをDB接続前に拒否する。2026-10-06にユーザーが狭い事実・投影・開催回と期間を受入。生成・validate・専用DB seedと実画面検証済みの凍結版。10 Entity／13 Claim／11 Source／15 Citation／8外部ID、57 Node／64 Relationship。再seedは0／0、属性snapshotも不変。3参加Claimの期間は不明のまま。[受入記録](../datasets/pilot-event/v1/ACCEPTANCE.md)を参照。研究台帳E02は招待・欠席の反例として保留しruntimeへ入れない。

人工契約検証は別の破棄可能DB7693／Web3216／.next-event-contract-test、架空表示・架空Sourceを使う。実資料受入や実データ観察の代用にはしない。[Phase 15完了記録](archive/phase-15-event-participation/README.md)を参照。


## Phase 17：Entity概要の関係・方向優先表示

[概要presentation契約](design/ENTITY_OVERVIEW_PRESENTATION.md)を採用。モーダルは外向き／内向きの方向付き一覧で、視点別関係名と中心端点を先に示す。Claim統計と限定内訳は初期状態で折り畳み、指定されたdomain語彙を二種類まで補助表示する。肯否混在を対立認定せず、否定のみは文言・破線で識別する。既存の根拠詳細へ戻る導線、任意確認、ダブルクリック、起点切替／復帰は維持する。概要APIだけへ固定の組織立場／参加立場配列を追加し、専用DISTINCT集計を再利用する。保存・比較・Graph束・探索条件・cursor・datasetは変更しない。[完了記録](archive/phase-17-entity-overview/README.md)を参照。


## Phase 20：三relation facetと既存条件への解決

[採用契約](design/RELATION_FACET_CONTRACTS.md)に従い、作品制作への関与／人物と組織の関わり／特定開催回への参加を条件editorの小さい入口とする。catalog版1・stable IDとlocale labelはclient側に置き、選択のORをCONTRIBUTED_TO／AFFILIATED_WITH／PARTICIPATED_INへ解決する。三入口全部は三Predicateのみ。無制限nullと空集合[]は維持する。

editor内で「すべて」「種類」「個別」を分け、既存五Predicateの任意指定を残す。精密条件は別sectionとし、facet単独では生成しない。未適用draft・Cancelは探索へ作用せず、Apply時だけ具体Predicate＋三精密条件を既存changePredicatesへ渡す。

API・Cypher・GraphState・condition key・cursor・snapshotを変更しない。適用後の正本は具体条件であり、facet IDや対応版を保存しない。要約の逆引きは表示だけで、復帰や旧cursorをcatalogから再解決しない。Claim・DB・凍結dataset・語彙は不変。activity facet・tag・lexical検索・preset・汎用taxonomyは未実装。[実施記録](archive/phase-20-relation-facet/README.md)を参照。

## Phase 21：Graphの関係概要とClaim詳細の整合

[採用契約](design/RELATION_PRESENTATION_CONTRACTS.md)。線のSPO集約と独立Claimは維持し、三domainの構造化済み限定を示す（GraphラベルはPhase 22で下記へ更新）。全五Predicateの肯否混在を「肯定・否定あり」＋点線へ統一し、意味対立を自動認定しない。期間・scope・原資料の具体表記は詳細で保持する。

Edge選択時、表示中ClaimSummaryで関係全体の概要を先に示す。先頭UUIDは既存API取得の入口だけ。独立ClaimはUUID順で、Graph内／条件内だがGraph未表示／条件外の関連主張を分ける。部分取得・失敗を明示し、確認だけでGraphやcursorを進めない。個別Claim選択は従来の明示基準比較を維持する。

各主張と根拠へスクロールでき、Citationではタイトル・locator・URL・原表記／言語・確認範囲を先に、書誌情報を折り畳みに置く。Roleや著者性をCitation.noteから補完しない。API・DB・schema・語彙・条件／cursor・開閉／復帰・凍結data・レイアウトは不変。[実画面評価・検証・次の不足](archive/phase-21-relation-presentation/README.md)を参照。


## Phase 22：Graphの関係ラベルは意味を先に示す

[採用契約](design/RELATION_PRESENTATION_CONTRACTS.md)。構造化済みの具体語がある線は、短い見出し（制作／組織／参加）＋Role／立場の名前で表示する。長い二語は改行し、三値以上でも名前二つと「ほかN件」を残す。ID順は表示の安定性だけを目的とする。指定なし・種類数・Claim件数はGraphの主表示にせず、独立主張の構成を既存Relation詳細で確認する。具体値がない場合は従来のpredicateラベルへfallbackする。CitationからRoleを推測しない。

SPO集約・claimIds・方向・中立的な肯否表現・個別限定の否定注記・詳細の表示範囲区分は不変。変更は既存ClaimSummaryのpresentationとlocale文言だけで、API・DB・意味モデル・dataset・条件・開閉・復帰・座標・曲率は変更しない。[実画面と検証記録](archive/phase-22-semantic-edge-labels/README.md)を参照。


Phase 22後の局所視覚調整：構造化済み具体語を持つRelationだけ、カテゴリを11pxの小さい背景付きpatchとして左に添える。主表示は15pxの具体語で、自然なpredicate表示とfallbackにはpatchを付けない。Cytoscapeラベルと補助DOMの描画上の分離であり、Relationの意味・claimIds・API・DB・datasetは不変。詳細は[現行presentation契約](design/RELATION_PRESENTATION_CONTRACTS.md)を参照。
