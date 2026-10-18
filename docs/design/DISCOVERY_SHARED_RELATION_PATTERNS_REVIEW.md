# Discovery：プリセット・対象検索・Graphの共通関係パターン調査

2026-10-18。調査時mainは `875dce5ea3206f042fcc4d1f19085362afa54628`、対象のbeta試作は `b846cf74a24390fcfe4cf303f3e516040ea6342e`。**設計・技術調査と推奨方針であり、以下の新しい契約は未実装。UI・API・Graph・公開KG・収集処理・実行環境を変更しない。** [前回の代表対象から直接実行する案](DISCOVERY_PRESET_LAUNCH_REVIEW.md)は、今回の判断が済むまで実装保留とする。

## 1. 成立性と推奨

**提示された基本構造を推奨する。共有するのは、対象に依存しない「追いたい関係」の意味定義。対象検索とGraphの実行処理は分ける。**

- プリセット検索は編集された入口のカタログ検索。分野・おすすめ順位・公開日等を扱う。
- 対象検索は、名前が空でも、指定した関係パターンが成立するEntityそのものを返す。
- Graphは選択したEntityから、同じ定義に一致する具体的なClaimと経路を取得・表示する。

「同じつくり手の別作品」はプリセット専用の機能ではなく、`作品 ← 制作Claimの人物 → 別作品` という共通の関係パターンとして成立する。プリセットはその定義を参照でき、プリセットを使わない対象検索・Graph設定も同じ定義を選べる。プリセット同士の親子関係や、世界からDB分類への変換は不要。

現在すでに4つの対象非依存の経路形がある。ただし、それをそのままGraphのpredicate配列へ変換しても共通化にはならない。`CONTRIBUTED_TO` だけでは、作品→人物→別作品という順序・別対象であること・全段の成立を表せない。

今回の実データ検証では、**成立する対象の検索は可能だが、現行の有界経路APIだけでは正しく代用できない**ことも確認した。東京大学は2段の機関パターンが実在するのに、現在の経路APIでは上限内0件になる。これを不一致として落とす実装は採らない。

## 2. 現行実装：何を設定・検索しているか

### 2.1 Graph「見る関係を編集」

主な対応箇所：

- UI：[`components/RelationFilter.tsx`](../../components/RelationFilter.tsx) の `ConditionEditor`。
- 入口分類：[`lib/client/relation-facets.ts`](../../lib/client/relation-facets.ts) の `RELATION_FACET_CATALOG`／`RelationSelection`。
- 条件の意味：[`lib/domain/exploration.ts`](../../lib/domain/exploration.ts) の `matchesClaim`／`explorationKey`。
- 適用：[`lib/client/use-graph-explorer.ts`](../../lib/client/use-graph-explorer.ts) の `changePredicates`／`expand`、[`lib/client/graph-state.ts`](../../lib/client/graph-state.ts) の `projectGraph`。
- DB：[`lib/server/queries.ts`](../../lib/server/queries.ts) の近傍クエリ、[`lib/server/http.ts`](../../lib/server/http.ts) の入力検証。

| 設定 | 現在の意味 | 共通化に際しての評価 |
| --- | --- | --- |
| すべての関係／関係の種類から選ぶ／個別の関係を指定 | 全predicate、3つのfacet、5つのpredicateの選択。facetは制作・組織との関わり・イベント参加への対応表 | 表示上の選び方。facet・predicateを独立した検索エンジンや意味モデルにしない |
| predicate配列 | 選択した関係のOR。各Claimに適用 | 順序付きの2／3段パターンではない |
| 制作Role | 8値。CONTRIBUTED_TOのClaimだけを限定 | 型付き限定として共有可能 |
| 組織での立場 | VISITOR／ASSOCIATE_PROFESSOR。AFFILIATED_WITHだけを限定 | 制作Roleとは別の型を維持 |
| イベントでの役割 | CHAIR。PARTICIPATED_INだけを限定 | 上記2型へ統合しない |
| 未指定／空集合 | nullは限定しない。[]は適用predicateの一致を空にする | 「全enum選択」と無条件も異なる。この区別を共有する |
| 適用／キャンセル | draftを編集し、適用時に同じ対象からGraphを再取得。直前の探索へ戻せる | 即時反映の対象検索と同じUI操作である必要はない |

近傍取得は両端から一段ずつ。取得前にClaimのpredicate／型付き限定を評価し、20件ずつcursorで取得する。Graphの表示上限は100 Entity／200 Claim、cacheは400／800。`projectGraph` は開いている取得済みの枝から到達するClaimを表示するもので、完全な関係パターンに参加するClaimだけを投影する処理ではない。

方向指定・肯否による絞込・期間／scope条件・対象kind・パターンID／段番号はGraphの設定にない。現在の文言も「条件は探索全体に適用します。検索の候補は絞り込みません。」であり、対象検索との共通条件にはなっていない。日英betaの実際の編集ダイアログでも確認した。これは現状の責務説明であり、将来も候補へ使えないという制約ではない。

現在の限定正規化は、適用predicateを外すと不要になった限定を解除する。新しいパターンや未対応条件をこの処理へ通し、黙って単純条件へ縮退させてはならない。

### 2.2 現在のプリセット8件

[`lib/domain/discovery-preset-catalog.ts`](../../lib/domain/discovery-preset-catalog.ts) の `CatalogPreset.execution` は `fixed | template` のunion。カタログの分野・種別・関係性・Roleによる絞込は、KGの対象検索とは別である。

| プリセット | 現行分類 | 実行時の定義 |
| --- | --- | --- |
| PLUTOのつくり手 | fixed | PLUTO＋制作の一段記録 |
| Princetonの人々 | fixed | Princeton University＋所属の一段記録 |
| 研究所で出会う | fixed | ニールス・ボーア研究所＋所属の一段記録 |
| 同じつくり手の別作品 | template | other-works：作品→人物→別作品 |
| 別作品のつくり手へ | template | work-creators：作品→人物→別作品→別の人物 |
| 作品を介して別のつくり手へ | template | co-creators：人物→作品→別の人物 |
| 人を介して別の機関へ | template | institution-bridge：組織→人物→別の組織 |
| 著者の記録から別作品へ | template | other-works＋各段AUTHORSHIP |

後半5件は代表対象のIDも持つが、定義自体は任意の適合kindへ適用できる。`DiscoveryExplorer.selectCatalog` はtemplateの主操作を名前検索へ送る。kindの適合は検査するが、その対象に完全な経路があるかは対象候補段階では判定しない。現在の3つの目立つ対象は固定のおすすめであり、利用可能対象の全体ではない。

現在のfixedも、選択後はDiscovery内の記録表示に進む。**Aの「対象検索を省略して設定済みGraphへ進む」は、現行の主操作そのものではなく、次工程で接続する動作**である。

### 2.3 対象検索・記録検索・経路取得・Graph

| 現行処理 | 実際の契約 | 共有設計に使える部分／不足 |
| --- | --- | --- |
| `GET /api/entities` | q必須の名前・別名検索、任意kind、既定10・最大20件 | 名前照合を再利用可能。関係パターンで対象を選ぶAPIではない |
| `GET /api/discovery/entities` | q任意、kind、predicate、制作Role、around等。**同じ公開Claim**へのEXISTSをEntityのLIMIT前に評価。20件＋続き、条件・公開revisionに束縛したcursor | 対象一覧・安定ページングの基盤。一段の存在と完全パターンの存在は違う。現在の入力schemaにはpatternもexpected revisionもない |
| `GET /api/discovery/claims` | 対象未指定でも実行可能。同じClaimに名前／kind／predicate／Roleが成立する記録を返す | 独立Claimと一致理由・根拠を保てる。Entity検索の代用品にしてClaim件数を対象件数としない |
| `GET /api/discovery/paths` | anchor必須。2／3段、版付きpreset、predicate、全段共通の制作Role、expected revision | 具体的な経路の有界取得・方向検査・独立Claim・根拠・制限理由を再利用。対象未指定の成立対象検索ではない |
| Graphの近傍取得 | 選択Entityの一段を、全枝共通の条件で取得 | 自由探索を再利用。順序付きパターンの段別探索は未実装 |
| `discoveryPathHref` とGraph復元 | 実際の端点列・段ごとのClaim ID・revisionをviaへ入れ、各枝の最初の1ページを再取得・検証 | 確認済みの一経路を開く基盤。ただしパターンID／意図は引き継がない |

対象検索は [`lib/server/discovery-search.ts`](../../lib/server/discovery-search.ts)、記録検索は [`lib/server/discovery-records.ts`](../../lib/server/discovery-records.ts)、経路は [`lib/server/discovery-paths.ts`](../../lib/server/discovery-paths.ts)／[`lib/domain/discovery-paths.ts`](../../lib/domain/discovery-paths.ts) を確認した。

経路の形は [`lib/domain/discovery-path-presets.ts`](../../lib/domain/discovery-path-presets.ts) の4定義と `presetAcceptsStep` にすでにある。各段のkind・predicate・正規subject／object方向を検査する。全ノードを異なるEntityにし、循環を除外。並行Claimは段ごとのID配列に保持する。単に人物kindが隣接しているだけでは制作と判定しない。

現在の経路取得上限は対象ごと20 Claim、全段24展開対象、128中間経路、12結果。Claimのpredicate／Roleは取得LIMIT前、経路のkind列・正規方向はその後に検査する。条件に合わない隣接記録が先頭を占める場合もある。未取得理由がある0件は「未確認」であり不一致ではない。

## 3. 実公開KGでの成立性検証

### 3.1 検証対象と方法

ローカル3200が利用する公開KGを**読み取り専用transaction**で照合した。release `20261014-credits-001`、revision `82b01515-594c-48ca-b4b6-515eefac83ca`。以下は公開データのこの版に対する観測で、未公開r0003の経路を含まない。

登録済みの固定長2／3段の形をCypherの相関EXISTSに変換し、開始Entityのkind、各Claimのpublished・predicate・Role・正規方向、各段のkind、Entity非再訪をすべて満たす対象を抽出した。全経路を列挙して数える方式ではない。Neo4jのEXISTS subqueryは外側の変数を参照でき、存在を確認した後は残りの探索を止められる（[公式Cypher 5：EXISTS](https://neo4j.com/docs/cypher-manual/5/subqueries/existential/)）。

| パターン | 成立する対象数 | 実際の対象例 | 全段肯定だけでも同数か |
| --- | ---: | --- | --- |
| 作品→人物→別作品 | 9作品 | PLUTO、MONSTER、MASTERキートン、BILLY BAT、信長等 | 同数 |
| 作品→人物→別作品→別の人物 | 9作品 | 上記と同じ9作品 | 同数 |
| 人物→作品→別の人物 | 6人物 | 浦沢直樹、長崎尚志、勝鹿北星、工藤かずや、池上遼一、手塚眞 | 同数 |
| 組織→人物→別の組織 | 115組織 | NBI、Princeton、CERN、University of Tokyo等 | 同数 |
| 作品→人物→別作品・両段AUTHORSHIP | 6作品 | PLUTO、MONSTER、20世紀少年、BILLY BAT、MASTERキートン、Reマスター | 同数 |

件数は経路数でもClaim数でもなく、成立した開始Entityを一度ずつ数えたもの。検証では取得上限400対象とし、いずれも上限未満まで取得され、この版の成立対象を取り切ったことを確認した。**400件取得を新APIの既定にする提案ではない。**

現行一段APIの「制作につながる作品」は10件。そのうち「鉄腕アトム」は今回の完全パターンには一致せず、9件との差になった。したがって単に一段のpredicate条件へ置換すると、該当しない対象まで出す。

### 3.2 取得上限を不一致と扱えない実例

| 確認 | 東京大学の結果 |
| --- | --- |
| 現行API `paths?anchor=31e2b0cd-dcfc-48f5-b7fc-ebe1022f3e50&preset=institution-bridge&presetRevision=1` | HTTP 200、0経路、`scan.reasons=["neighbors"]`、21対象を展開 |
| 同じ公開KGでの完全パターンの存在照合 | 一致。`University of Tokyo — Hideki Yukawa — Columbia University` |
| 使用した公開Claim | `0810c645-fe2a-4f4e-bfe2-b17ed34c5d06` と `b68e15f4-217c-4a88-b3bf-b915624050d3`。どちらもAFFILIATED_WITH・affirmed |

東京大学には所属970記録があり、最初20記録だけではこの経路が現れない。Harvardは部分範囲内で1経路、University of Californiaは2経路だった。**肯定的な一致証拠は利用できるが、部分取得の0件は否定の証拠にならない。** この問題は仮のfixtureだけの懸念ではない。

上記2 Claimは現在の個別Claim APIでも同revision・各1出典を確認した。東京大学側はWikidata P108の明示statement、Columbia側はNobel Prize APIの1949年受賞時所属で、両方ともClaim期間は不明。この経路から移動順序・同時在籍を作れないことも、根拠表示で保持する必要がある。

### 3.3 ページングと性能の観測

- 新しいEXISTS条件をEntityのLIMIT前に置き、名前＋UUIDのkeysetで2件ずつ取得する読み取り検証を実施。作品9件は5ページ、機関115件は58ページ、著者限定6件は3ページ。単一取得の集合・順序と一致し、欠落・重複なし。同revision内の検証であり、新APIのcursor実装が完成したという意味ではない。
- 初回の対象集合取得は約0.49〜2.11秒。planが温まった状態の先頭21対象取得は、4形＋著者限定で約17〜135ms。ローカル環境・現在のデータ・単回観測であり、beta／本番の応答保証・負荷試験ではない。
- DBの索引は現在ID等の一意索引が中心で、今回の照会に特化したEntity.kind／名前の複合索引はない。索引・データは変更していない。増加時はPROFILEと負荷測定から最適化を決める。
- 取得前後とページング検証前後で公開release／revisionが不変であることを照合。独立したprobe間の結果を混在させていない。

## 4. 共有する定義と、分ける処理

### 4.1 プリセットの分類

推奨の概念は `subjectBinding = bound | unbound` の2値。実装型では関連プロパティの不正な組合せを避けるdiscriminated unionにする。

```ts
type PresetSubject =
  | { binding: "bound"; entityId: EntityId }
  | { binding: "unbound" }; // 適合kindは関係定義、または対象条件から決まる

type DiscoveryPreset = {
  id: string;
  subject: PresetSubject;
  relation: RelationCriterion;
  // 表示名・説明・編集タグ・掲載優先度・公開日時・利用統計は別のカタログ責務
};
```

現在のfixed3件はbound、template5件はunboundに対応できる。boundでも複数段パターンを持てるし、unboundでも一段条件を持てる。「対象の決まり方」と「一段／複数段」は別軸。代表例を持つなら補助メタデータとし、unboundの実行時に自動選択しない。preset間の継承・親子関係・Graphの保存形式へのカタログ丸ごと埋込は不要。

### 4.2 共通のRelationCriterion

次は責務を示す案であり、新しい汎用DSLではない。

```ts
type RelationCriterion =
  | { type: "adjacent"; conditions: ClaimConditions }
  | { type: "pattern"; pattern: { id: RelationPatternId; revision: number };
      conditions: RegisteredPatternConditions };
```

| 共通項目 | 意味／初回の範囲 |
| --- | --- |
| adjacent | 既存predicate ORと型付き限定。一段に一致するClaimが存在する対象を検索し、Graphでは同じ条件の近傍を表示。無条件もこの型で表現 |
| pattern参照 | 既知の2／3段の形。開始kind・順序付き端点kind・各段predicate・正規方向と辿る向き・Entity非再訪を定義。初回はother-worksから |
| 型付き限定 | contribution／organizationParticipation／eventParticipationを区別。各段の**同じClaim**へ適用。null／[]／全enum指定を区別 |
| 肯否 | `affirmed` と `all-records` 等を明示。deniedを事実のつながりへ変換しない。後述の既定方針を決める |
| 期間・scope | 各Claimから欠損と精度も含めて返す。初回は保存・根拠表示を維持し、期間重複・刊行物同一性の条件は未対応とする |
| capability | 対象検索・経路取得・Graph表示の各adapterが実行できる条件を検査。未知ID／版／条件はエラー。条件の自動削除や代表対象による代用は禁止 |

[`discovery-path-presets.ts`](../../lib/domain/discovery-path-presets.ts) の形を、カタログから独立した関係パターンregistryへ移すか抽出する。現在のID・版付き参照・正規方向検査は再利用できる。UI表示名・分野・掲載順はカタログ側に置く。異なるプリセットが同じパターンを参照してよい。

初回から任意のpredicate列や、複数パターンのAND／OR、任意長、ユーザー定義式を受け付けない。段別限定を内部の意味として持てる構造にはするが、最初は既存の全段同一Roleだけを編集可能にしても成立する。将来「第一段は原作、第二段は作画」は同じ型から拡張できるが、未実装段階では受け付けない。

単純predicateと複数段は**同じ選択体系の別variant**にできる。ただし選択肢を同じ意味へ潰さない。「制作」を複数チェックしたことから別作品パターンを推定したり、パターンに追加predicateをORして成立条件を弱めたりしない。初回はパターン1つ、または既存の単純条件を選び、解除・置換の作用範囲を明示する。

### 4.3 共有しないもの

| 項目 | 対象検索 | Graph |
| --- | --- | --- |
| 質問 | この対象を開始点に、定義に合う完全な経路が1本以上あるか | 選択した対象から、どの具体的な経路・Claimを表示するか |
| 結果単位 | Entity。何経路あっても1件 | 経路、独立Claim、Entity。1対象に複数経路あり得る |
| 名前・kind | 名前／別名は開始Entityに評価。kindはpatternの開始kindと整合させる | 名前を全中継Entityの除外条件にしない。開始対象を変更した際だけkind適合を検査 |
| 取得制限 | Entityの一致判定後にページ上限。タイムアウトはページの失敗・未確認 | 確認済み経路を有界に表示し、未取得・残り範囲を保持 |
| 表示状態 | 順序・cursor・選択・検索へ戻る位置 | 開閉枝・選択Claim・座標・zoom・履歴 |
| 意味上の注意 | 一致は完全な1本の存在保証。全経路数は保証しない | 表示は取得範囲。未表示の経路が存在しないとは限らない |

名前条件や掲載タグ、対象検索のページサイズ、Graphの座標・枝状態まで共通条件に入れる必要はない。**共有条件にすることと、共通コンポーネントに全フォームを押し込むことも別である。**

## 5. 対象検索：一致・不一致・未確認を区別する方式

### 5.1 推奨：登録済み固定長のEXISTSをLIMIT前に評価

初回は既存 `/api/discovery/entities` を拡張し、版付きpattern参照を任意で受ける方式を推奨する。既存の呼出しは従来動作を維持し、新条件がある要求だけ新しい成立判定へ分岐する。内部関数・応答型は、一段候補とパターン一致対象を区別する。新しい画面や独立検索エンジンは不要。

契約の具体例は `GET /api/discovery/entities?kind=work&pattern=other-works&patternRevision=1&polarity=affirmed`。qは省略できる。制作Roleを付けるなら現在の `contributionRole=AUTHORSHIP` を両段へ適用する。これらの追加パラメータ名は提案で、**現在のAPIへ送れば未対応として拒否される**。応答は次の情報を持つ形を想定する。

- `revision` と正規化済みの `relation`：実際に評価した共通条件。
- `items`：従来のEntity概要に、そのEntityから始まる最小1本の `matchWitness`（端点ID・各段のClaim ID・公開revision・pattern参照）を対応付ける。
- `hasMore`／`nextCursor`：一致Entityの続き。`total`は未計数を明示できる型とする。

`matchWitness` はGraphへ無条件に描画する許可ではなく、再検証可能な参照。公開revisionの変化や条件変更時には失効する。応答サイズを抑えるため、最初から全引用本文・全経路をEntity一覧へ重ねて返す必要はない。

「同じつくり手の別作品」の中心は、次のような有限のサーバー側照会になる。文字列をユーザーに入力させず、登録済みqueryと型検証済みの値だけを使う。

```cypher
MATCH (e:Entity)
WHERE e.kind = 'work'
  AND EXISTS {
    MATCH (a:Claim)-[:OBJECT]->(e), (a)-[:SUBJECT]->(p:Entity)
    MATCH (b:Claim)-[:SUBJECT]->(p), (b)-[:OBJECT]->(w:Entity)
    WHERE p.kind = 'person' AND w.kind = 'work' AND e.id <> w.id
      AND a.visibility = 'published' AND b.visibility = 'published'
      AND a.predicate = 'CONTRIBUTED_TO' AND b.predicate = 'CONTRIBUTED_TO'
      AND ($role IS NULL OR a.contributionRoleId = $role)
      AND ($role IS NULL OR b.contributionRoleId = $role)
      AND ($polarity IS NULL OR a.polarity = $polarity)
      AND ($polarity IS NULL OR b.polarity = $polarity)
  }
  // 実際のqueryでは開始Entityの名前・別名条件、cursor条件もここへ加える。
RETURN e.id, e.name
ORDER BY e.name, e.id
LIMIT 21
```

実際のprobeは全ノード対のID不一致も検査した。制作の正規方向は人物→作品で、探索の第一段は逆向き、第二段は順向き。1本目のRoleを別のClaimから補完して成立扱いにしない。新しい直接関係・因果関係も作らない。

- **上限の位置**：先に20 Entity、20 Claimだけを取り、それを後で完全パターンで絞ってはいけない。EXISTSは完全な形の成立を評価し、その後EntityのLIMIT。内部に「最初20隣接Claimしか検査しない」を加えない。
- **資源の上限**：2／3段の登録済み形、適合する開始kind、Entity非再訪、固定ページ、DB transaction timeoutを使う。全経路の組合せを返す／数えるqueryにしない。timeout時に途中結果や空配列を「正常な該当対象」として返さない。取得失敗・未確認として再試行可能にする。
- **ページング**：既存の完全一致rank→名前→UUID順を維持。cursorには名前等に加え、正規化した共通条件・pattern ID／定義版・公開dataset/revisionを束縛。違う条件・版のcursorは拒否する。対象が見つかった後でGraph都合の上限により対象結果から削除しない。
- **revision**：現在の応答revision・cursor照合・取得前後照合を再利用。初頁にも任意のexpected revisionを受け、対象一覧→経路証拠→Graph→根拠のすべてを同じ公開版へ束縛する。公開revisionとpattern定義revisionは別物として保持する。
- **総件数**：現行APIのtotal集計を無条件にパターンへ適用すると高コスト化する。新条件の結果にはまず20＋1のhasMoreを保証し、totalは省略可能／未計数という明示型へ拡張する。既存UI・schemaも対応させる。部分的な走査数を総一致数として返さない。
- **対象の一致理由**：1対象につき少なくとも1本の証拠経路参照を返す、または同じrevision・条件で必ず1本を取得できるサーバー処理へ接続する。本文の経路数を全件数に見せない。Graphで再利用できる1本を同一read transaction内で確保する方式を第一候補とする。

固定長でも高次数や否定判定の多いデータでは負荷は増える。現在の測定だけで永続的な性能を保証せず、深さ・ページ数を増やす前にdeadlineとquery planを検証する。必要なら対象kind／順序用索引を通常のDB変更手順で検討する。**今回索引の追加や公開KGの変更はしない。**

### 5.2 代替：有界候補走査／版別の成立索引

- 既存一段候補＋有界経路APIで検査する方式は、`match | no-match | unknown` と走査cursor・未確認件数を明示すれば実装可能。しかし東京大学を落とせず、成立対象だけの自然な一覧・安定ページングが複雑になる。今回の第一候補にしない。
- 将来の高負荷では、登録済みpattern／限定条件／公開revisionごとの成立索引を検討できる。作成完了した版だけを原子的に切り替え、部分生成・古い索引の「登録なし」を不一致としない。索引未作成の条件はexact照会か未対応へ。収集データを改変する機構ではなく検索用派生物だが、現段階では導入不要。
- 全Entityへクライアントから経路APIを一斉実行、無制限の可変長経路、全経路の事前生成は推奨しない。

## 6. Graphに同じ定義を適用するための不足

### 6.1 現行viaは「経路証拠」で、持続する探索条件ではない

[`lib/client/discovery-path-navigation.ts`](../../lib/client/discovery-path-navigation.ts) は具体的な経路をworkspaceの枝へ変換し、[`lib/client/exploration-url.ts`](../../lib/client/exploration-url.ts) の `rebuildExplorationUrl` が全Claimの再取得・端点・revisionを検証する。現在は各中継Entityの最初20記録もGraphへ入るため、選択経路以外の記録も現れる。さらにGraphで展開すれば、同じpredicate／Roleの一段近傍を辿る。

したがって、Graphに具体的なother-works経路を1本開けても、**Graph設定がother-worksになったことにはならない。** `via` は初回確認用であり、現在の通常の保存／共有URLにはpattern意図や経路注釈そのものが残らない。

また、exact対象検索で得た経路は、近傍の21件目以降にある可能性がある。現行の「各枝1ページ」の復元ではそれを再現できず、欠落として拒否する。東京大学のケースが具体的な検証対象になる。成立対象だけを増やして既存Graph URLへ渡せば完成、とは扱えない。

### 6.2 必要なGraph実行adapter

1. 共通条件にpatternを保持し、選択rootから**完全な経路単位**で取得する。初回は最小1本を保証した有界経路集合を表示。各ノードのkindだけから段番号を推定せず、root・pattern・段位置を保つ。
2. 検索時に確認した証拠経路のIDを受け、同じ公開revisionでEntity／Claim／正規方向／全段条件をサーバーで検証・取得する処理を追加する。既存APIの通常の20件に見つからなくても直接検証できるようにする。URLのID列を信用して未検証表示しない。
3. `GraphState` に、通常の近傍ページとは別の**検証済み経路の取得状態**を持たせる。`projectGraph` はその完全経路に参加するClaimの和集合を投影。cacheへ記録を追加するだけでは、現在の「受理済みの枝」からの到達性検査を満たさないため不十分。
4. 「さらに経路を見る」は予算内の経路追加で、通常の「このEntityの関係を自由に見る」への切替は条件を広げる明示操作にする。BのGraphで黙って一段の制作全体へ戻さない。再起点化する場合は開始kindを検査し、合わない対象へ同じpatternを無理に適用しない。
5. 各段のClaim ID・肯否・型付き限定・scope・期間・Source／Citationへの到達を保持する。完全経路を投影しても、並行Claimを「共同制作した」という単一の事実へ統合しない。

全体の線を対象パターンへ制限する意味を曖昧にしないため、初回は**pattern modeでは一致する完全経路の和集合、adjacent modeでは既存の自由な一段展開**を推奨する。別の周辺Claimも併記する拡張は可能だが、パターンの一致部分と区別が必要で、最小構成には含めない。

### 6.3 設定・URL・保存・戻る

[`saved-views.ts`](../../lib/client/saved-views.ts) の `viewConditionsSchema` は現在predicate＋3限定のstrict schema。[`saved-workspace.ts`](../../lib/client/saved-workspace.ts) とworkspace URLも版1で、patternのフィールドをそのまま足すと拒否される。必要な変更は次のとおり。

- 共通条件の判別型、`GraphState.conditionKey`、通信取消／generation、cache keyへpattern ID・定義版・限定・公開revisionを入れる。
- URL／workspace／保存viewの版を上げ、既存版1はadjacentへ移行。未知pattern版はエラーとし、predicateだけを残して復元しない。
- 共有URLは条件と必要な参照を保持し、復元時は現公開版に対して再検証。検索時の証拠経路はexpected revision付きで固定し、版変更なら409／再検索。古い経路が削除されたときに別経路へ黙って置換しない。
- Graph編集は既存どおり適用／キャンセル、条件変更前の探索へ戻るを保持。Discoveryへ戻る場合はEntity検索の条件・順序・cursor・選択・スクロールを復元する。Graphの条件編集で、背後の検索結果やプリセットを自動で書き換える必要はない。検索へ適用するなら明示操作にする。

これはGraph UIの全面改装を意味しない。「見る関係を編集」の同じ場所へ関係パターンを選べる項目を加え、適用中の意味を表示する。ただし処理・永続化の変更は必要であり、チェックボックスや文言の追加だけでは完成しない。

## 7. 意味の整合性と、次工程で決めること

| 論点 | 推奨／制約 |
| --- | --- |
| 肯否の既定 | 新しい「同じつくり手」等の成立検索は、全段affirmedを既定にする案を推奨。deniedを含む現行の「記録間経路」はall-recordsとして区別し、旧条件を自動変更しない。現データの対象件数はどちらでも同じだが、意味は同じではない。実装前にこの既定を確認する |
| Roleとscope | Role指定は各段の同じClaimに成立。刊行物scopeが異なるClaimは別々に表示。共通人物が同じRole・同時期・同一刊行物で関わったとは推論しない。最初の全段同一Roleから、段別指定へは後続拡張 |
| 不明期間 | 全期間・現在在籍・同時在籍に置き換えない。期間の共通部分を必要とする検索は別能力として未対応表示 |
| 方向 | 保存方向はClaimのsubject→object。辿る向きは各段の別属性。対象検索・Graph・根拠の3箇所で同じ検査関数を使う |
| その他の限定 | 既存Graphの組織立場／Event Roleはadjacentで維持。新pattern adapter未対応の限定を持ち込んだ場合は実行前に拒否・説明。制作Roleへ読み替えない |
| 集計・重複 | Entity一覧はEntity IDで一意。経路は端点列で整理し、段ごとの独立Claimを残す。Claim数・経路数・対象数を区別 |
| 取得上限 | Entityの存在判定とGraphの表示予算を別にする。検索成功・Graph取得失敗なら対象の一致は取り消さず、経路表示失敗を示す。全検索がtimeoutなら0件と表示しない |
| capability | searchEntities／materializePaths／graphProjection／persistの対応可否を別に確認。型を共通化しただけで全adapter対応済みとしない |

世界の11分類はプリセットの編集タグとして引き続き使える。対象kind以外を根拠なくDB条件へ変換しない。r0003等の正式受入済み・公開未適用データは、対象一致や証拠として使わない。

## 8. A／B／Cの具体的な操作と成立条件

| ケース | 推奨する利用者の流れ | 現状との差 |
| --- | --- | --- |
| A：対象指定済み | 「PLUTOのつくり手」→PLUTO＋adjacentの制作条件を確定→Graph。制作のClaimと根拠を読み、対象／関係を変更できる | Entity検索を省略できる。現在のカタログはDiscovery記録表示へ進むため、Graphへの接続調整は必要。既存Graphの一段能力は再利用できる |
| B：対象未指定 | 「同じつくり手の別作品」→patternを条件に設定→名前空欄で一致する作品9件→作品を選択→同patternを保持したGraphと証拠経路 | 不要な名前入力・代表対象の自動選択なし。新しい完全パターンの対象検索・証拠経路取得・Graph mode／保存が必要 |
| C：プリセットなし | 自由な対象検索。関係未指定なら従来検索、制作なら一段の一致対象、other-worksなら完全経路が成立する作品。選んだ条件でGraphへ進み、同じ体系で編集 | カタログを経由しない。名前・kindは対象検索、関係条件は共通。Graph上の編集で背後の一覧条件を黙って変えない |

BでPLUTOを選べば、公開済みの `PLUTO — 浦沢直樹 — MONSTER` 等へ進める。一覧の名前入力は任意の追加絞込であり、必須ステップに戻さない。機関パターンで東京大学を選んだ場合も、存在確認済みの湯川経由を少なくとも1本開けることを受入条件とする。

## 9. 必要な変更・再利用範囲・実装順序

### 9.1 変更の単位

| 層 | 再利用 | 必要な変更 | 規模の見方 |
| --- | --- | --- | --- |
| 意味定義・プリセット | 既存4形、版付き参照、型付き限定、編集metadata | RelationCriterion／pattern registry、bound／unbound、capability検査 | 小〜中 |
| 対象検索 | 空欄検索、名前照合、kind、keyset、公開版照合 | 完全パターンEXISTS、証拠参照、cursorの条件拡張、total未計数の型、expected revision | 中 |
| 経路取得 | Claim取得／mapper・根拠、循環排除、並行Claim、制限理由 | 成立証拠を確実に1本取得する照会・検証。段別条件を実行できる境界 | 中 |
| Graph | canvas、Claim詳細、枝操作、Undo、版変更通知 | pattern状態・完全経路の投影、通常近傍との実行切替、証拠経路の受理 | 中〜大 |
| 永続化・往復 | workspace・URL codec、history、復元検証 | 条件schema版移行、pattern意図と取得参照の復元、Discovery一覧復帰 | 中 |
| UI | 現在の3タブ・カタログ・結果・Graph編集箇所 | unboundから名前空欄の対象一覧へ接続、適用関係表示、必要最小のGraph設定項目 | 小〜中。全面再設計しない |

全体は**複数層にまたがる中規模以上の機能変更**。前回の代表対象へ直結するUI修正とは異なる。新エンジン・汎用DSL・公開KGの構造変更は必要ない。上の規模は依存範囲の比較であり、未見積の工数保証ではない。

### 9.2 推奨する段階

1. **意味契約を固定**：bound／unbound、adjacent／pattern、肯否の既定、パターンGraphが表示する範囲を決める。旧保存条件は従来意味を保持。4つのregistryの意味は共通化するが、初回の実行対応を広げ過ぎない。
2. **other-worksの縦断実装**：名前空欄の一致Entity検索→証拠経路→同じ条件のGraph→編集／戻るまでを1つ完成。PLUTOの一段boundもAとして維持・接続する。Cはプリセットなしでも同じ条件を選べるようにする。対象一覧だけ実装しGraphを従来の一段全体へ落とした状態を完成にしない。
3. **既存パターンの移行**：co-creators、institution-bridge、3段work-creators、AUTHORSHIP条件を順次adapter対応。東京大学の上限外証拠を表示できることも、この段階の必須試験とする。対応前のパターンを新しい対象成立検索で実行できるように見せない。
4. **必要が出た条件を拡張**：段別predicate／Role、組織立場・Event限定、期間・scope条件、複数パターンの組合せ、版別索引は実利用と測定から選ぶ。今回の設計をこれらの実装承認として扱わない。

次工程の検証には、同一Claim上の条件評価、正規方向、肯否／scope／期間の保持、Entity非再訪、並行Claim、Entityページング、存在照合timeout、経路表示上限、公開revision衝突、未知pattern版、旧URL移行を含める。Graphは存在証拠のClaimが近傍1ページ目にないケース、表示上限と部分復元の拒否も確認する。PC／スマホ・日英でA／B／C、Graph編集とBackを操作する。

### 9.3 代替案の評価

- **共通の意味定義＋別adapter（推奨）**：利用者が選んだ関係を保ちつつ、対象の存在判定とGraphの有界表示の違いを扱える。
- **対象検索だけpattern、Graphはpredicateに縮退**：改修は軽いが、同じ設定で同じ関係を追うというBを満たさず、推奨しない。一回の経路例を開く機能としてなら別途明記が必要。
- **代表対象から直ちに実行**：発見例への導線にはなるが、パターンに合う対象を検索・選択する今回の基本構造の代案にはならない。前回案は保留。
- **全処理を一つのquery／状態へ統合**：存在判定・表示上限・手動の枝・座標まで結合し、現行Graphの自由度を失いやすい。共通化する境界が広すぎる。

## 10. 今回の検証・反映状態

- 参照設計、8件のcatalog、対象／Claim／経路API、Graph編集・近傍・投影・URL／保存／復元のコードを照合した。古い設計記述だけを現行仕様としない。
- 公開KGへの固定長EXISTS、現行APIとの一段／複数段差、東京大学の上限内0件と実在証拠、Role・肯定のみの対象集合、keysetの欠落／重複を読み取り検証した。新しいAPI・共通条件型・Graph modeの操作試作は作っていない。
- 日英PCのbetaでPLUTOから現在のGraph編集を開き、現行の条件範囲・対象候補へ作用しない案内を確認した。確認は編集キャンセルまでで、設定・データの保存は行わない。
- query・パラメータ・結果・測定記録と画面確認用スクリプトはGit外の `/tmp/plunode-common-pattern-review-20261018/` に保持。認証情報は文書・出力へ含めない。
- 変更は本書、前回案の保留注記、文書入口のみ。コード・API契約・beta試作・他2タブ・Graph UI・本番・公開KG・収集処理は変更しない。文書変更のためbuild／3200再起動／beta再配置／VPS更新は不要で、実施しない。
- 3200／betaは既存build `czsf7NCjh0d5yFZ7QqP3b` のHTTP 200、同じ公開revisionと制作接続作品10件を再確認した。新設計は未反映であり、既存試作をそのまま評価できる。本番への更新は行っていない。

実装へ進む判断に必要な残点は、**肯否の既定**と**pattern modeで表示する範囲**。本書は「新しい成立検索では全段肯定」「Graphは一致する完全経路の和集合、自由な近傍探索へは明示切替」を推奨する。画面の全面再設計や、代表対象の自動選択でこの判断を代替しない。
