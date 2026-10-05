# Relation・Claim・Predicate・typed qualificationの基本設計

2026-10-06 / Phase 16。**現行の基本設計として採用**。Phase 12・13の意味比較とPhase 14・15の三用途実装・実資料観察を根拠とする。新しい語彙・型・dataset・DB・API・UIは追加しない。これから関係を追加する際は、本書の境界と各domainの意味契約を併せて参照する。

本書は責務を固定する。個別のpayload・有限語彙・受入範囲は[制作Role契約](CONTRIBUTION_ROLE_CONTRACTS.md)、[制作・組織の限定契約](TYPED_QUALIFICATION_CONTRACTS.md)、[Event参加契約](EVENT_PARTICIPATION_CONTRACTS.md)、[Predicate契約](PREDICATE_CONTRACTS.md)を正本とする。API・探索の具体仕様は[ARCHITECTURE](../ARCHITECTURE.md)。過去の比較文書の提案やarchiveの当時の仕様は、新しい型を実装する許可にはならない。

## 1. 採用する九つの原則

1. **独立した命題差はPredicate候補にする。** 参加と招待、親子と配偶者、参加と組織関与、影響と批判を単なるRole差へ潰さない。独立性は肯否・端点の意味・方向／対称性・含意・失われる意味を合わせてレビューする。新Predicateの採用には別途意味契約が必要。
2. **同じ命題内の限定はdomain固有typed qualification候補にする。** 制作上の役割、組織との関わり上の立場、特定Event参加上の立場、刊行物scope等を、base Predicateの意味を維持して限定する。PRODUCING、VISITOR、CHAIRを一つの共通Role語彙にしない。
3. **機械処理の小さい境界を共有する。** 適用先・strict payload・enum・未指定・条件正規化／一致・LIMIT前取得・比較キー・実効条件拘束cursor・探索世代・ページ受理・開閉／復帰は共有してよい。現行の固定三型と専用handlerを出発点とし、動的登録や万能generatorへ作り替えない。
4. **共通機構から意味を推論しない。** 同義性、制度語の対応、Sourceの支持、値の意味階層、domain間のRole対応は個別契約・資料・人間レビューの責務。型が通ったことは意味の受入ではない。
5. **Claimの未指定と条件の省略を分ける。** qualification=nullは「このClaimではその限定を指定しない」。全Roleの肯定、役割の不存在、原資料に役割表記がないという断定ではない。条件省略は「その限定では取得を絞らない」。nullの収集理由は台帳へ残す。
6. **polarityは限定を含む命題全体へ掛ける。** 主体・Predicate・対象・typed限定・scope・期間を含む内容への肯否。否定を別Role、広いClaim、別期間／scopeへ自動波及させない。
7. **Entity自身の期間とClaim期間を分ける。** Eventの開催期間を人物の参加期間へ自動転記しない。将来の組織存在期間、作品刊行期間、名称有効期間にも同じ境界を適用する。これらの新属性は今回実装しない。
8. **identity・比較・表示を分ける。** Claim UUID、DB一意性、命題比較キー、relatedClaimIds、DisplayRelation、Entity概要集計は別責務。比較キーは真偽・矛盾・同一Claim・DB一意制約を認定しない。SPO一本への表示集約もClaimを統合しない。
9. **由来・根拠・受入・意味を分ける。** import元／dataset／投稿元、Source、Citation、人間受入状態、Claim意味を統合しない。同じSourceを複数Claimが参照しても独立した根拠が増えたとは扱わない。

三用途で成立したことは、全領域の一般解を証明したことではない。今後もこれらの境界を使って、小さい実例と反例で新しい意味を検証する。

## 2. 新しい関係候補を判断する順序

1. **原資料の狭い事実を書く。** 実対象の粒度、端点、時期、scope、原表記と言語、locator、未確定事項を先に残す。根拠や対象の同一性が不足する場合は保留する。型へ入れるために対象を作者へ置き換えたり、招待を参加に変えたりしない。
2. **そもそも関係命題かを確認する。** 同一Entityの改称は名称履歴候補。表示別名はalias／翻訳、閲覧上の分類はtaxonomy／classification、条件テンプレートはpreset、Graph上の圧縮はpresentation。独立Entity間のClaimとして保存する必要があるかを確認する。
3. **既存語彙と比較する。** 同じ意味なら既存IDを利用し、単なる別名を新IDにしない。近いが別の意味、または新しい意味なら差を明記する。保存済みIDの定義を広げて吸収しない。
4. **既存のbase命題を維持する限定かを検討する。** 立場・方式・適用範囲であり、限定付きの肯定がその資料の範囲内でbase命題も述べるならtyped qualification候補。限定なしClaimとの共存、肯否の対象、条件取得、適用先とdomain語彙を確認する。広いClaimを自動生成する意味ではない。
5. **独立命題ならPredicate候補にする。** 限定として押し込むと端点・方向・肯否・含意が変わる場合は独立契約を検討する。単に「既存命題でない」だけでPredicate採用とはしない。多者の変化や未モデル化の実対象は現二項モデルでは保留になり得る。
6. **意味と実装方式を別々に承認する。** 狭い事実の人間受入、語彙の意味レビュー、payload／検索／比較／表示の採用判断を分ける。資料に呼称があることから排他的enumや意味階層を自動採用しない。

### Predicateを分ける判断材料

| 材料 | 確認すること |
| --- | --- |
| 肯否の独立性 | Aを肯定しBを否定しても自然か。批判の肯定を影響の否定へ変換していないか |
| 端点の意味 | 親→子と配偶者、人物→組織と人物→開催回、理論への批判と人物評価を同じ命題へ押し込んでいないか |
| direction / symmetry | 正規方向・対称性の違いをRole値の隠れたルールへ移していないか |
| 含意の独立性 | 招待の成立が参加を意味しない等、一方から他方を認定していないか |
| 限定へ還元した損失 | base命題に入れることで存在しない参加や異なる対象を主張しないか |

これは判断材料の組合せであり、いずれか一つで自動決定しない。**CHAIRの否定と一般参加の肯定が両立することだけで、CHAIR_OF_EVENTを独立させる必要はない。** 今回のCHAIRは参加を伴う会議議長という狭い契約だから限定として自然。一方、非参加の議長職までこの型へ入れることはできない。

### qualificationを追加する判断材料

- base Predicateの意味と端点・方向を保つか。対象Eventの取り違え等を限定で隠していないか。
- 限定なしの広いClaimと共存でき、両者が同じ内容にならないか。
- 値ごとの肯否・期間・scopeを区別する必要があるか。未指定を全値の肯定として扱わないか。
- 注記保存に加えて、値の条件取得や限定比較を行う価値があるか。
- 適用Predicate、strictなpayload、有限の値集合、原表記との対応を定義できるか。
- domain固有の定義・包含／除外／境界例・近接値との差を管理できるか。

現三用途は一Claimに一つの役割／立場を指定する小さい契約。**将来の全qualificationを必ず単一値にする原則にはしない。** Phase 12のadaptation／remakeは排他性未確定であり、勝手に一値へ正規化しない。

## 3. 三用途の具体契約

| Predicate / 型 / 有限語彙 | baseと限定の意味 | 原資料・scope・期間の責務 |
| --- | --- | --- |
| CONTRIBUTED_TO / contribution / SCRIPT_WRITING・SUPERVISION・PRODUCING・STORY_CO_CREATION | 人物が作品制作に関与。Roleはその制作上の関わり方 | 指定刊行物のクレジットの適用scope。元役割表記／言語はCitation。刊行日からClaim期間を補わず、指定巻だけの担当とも全巻の担当とも認定しない |
| AFFILIATED_WITH / organizationParticipation / VISITOR・ASSOCIATE_PROFESSOR | 人物と組織に資料で述べられた関わり。立場はその関わりを限定 | HeisenbergのVisitor 1924–25とAssociate professor 1926–27を別Claimに保持。原制度語を雇用形態や日本の職位へ変換しない。説明的scopeは台帳／Citation |
| PARTICIPATED_IN / eventParticipation / CHAIR | 人物が特定開催回に参加。今回のCHAIRは参加と同時に明示された会議議長 | Lorentzの広い参加とCHAIR、Diracの広い参加を独立保持。Solvayシリーズと1927年第5回を区別。Event開催期間は1927-10-24〜29、各参加Claim期間は不明 |

保存の正規方向は各Predicate契約に従う。subject側・object側からの探索は同じClaimの別視点であり、逆方向の第二Claimを自動生成しない。person、work、organization、特定eventは同じ探索契約を使うが、意味値やscopeが共通ということではない。

### null・条件・肯否・期間

| 状態 | 意味と現行の扱い |
| --- | --- |
| Claimの型付き限定null | このClaimは限定を指定しない。制作はAPI読取で `{roleId:null, scope:null}` に正規化する場合がある。roleId=nullでもpublication scopeを持てる。三型のpayloadを見かけだけ統一しない |
| 条件省略／null | 限定あり・なしの両方を取得できる。その条件を全値の肯定に変換しない |
| 条件に具体値を指定 | 適用Predicateの明示値だけ一致。限定なしClaimをCitationの原語から推定して混ぜない |
| 条件に全enum値を指定 | 限定なしClaimを除くため無条件ではない。全Predicate指定を無条件へ正規化する規則とは異なる |
| 条件に空集合 | 当該Predicateの取得を空にする。他Predicateへ作用しない。適用Predicateを外した場合は入力検証後に不要な限定条件を解除 |
| deniedの限定Claim | その限定／scope／期間込みの命題の否定。例えばdenied CHAIRから参加、別Role、招待の否定を作らない |
| period端点null | 未記録。全期間・現在継続・永遠を意味しない。値と精度、未指定を比較へ保持 |
| Entity期間とClaim期間が一致 | 独立した資料確認により一致する可能性はある。同じ値を機械的に禁止するのでも、自動コピーするのでもない |

polarityの型は検証できても、資料が限定込みの肯否を支持するかは人間判断。異なるRoleや時期の肯否混在は自動的な矛盾ではない。同じ比較キーの肯否混在も、資料解釈やscope不足を検討せず矛盾確定とはしない。

## 4. identity・比較・表示の境界

| 責務 | 現行単位 | 何を保証しないか |
| --- | --- | --- |
| Claim identity | 内部UUID。各Claimを独立保持 | 内容が同じだから同じUUIDになるわけではない |
| DB MERGE／一意性 | Claimのid、一意制約。seedは既存属性・接続の不一致を拒否 | SPOや内容比較キーの一意性、真実性、一般更新／統合 |
| 命題比較キー | 正規subject／Predicate／object、登録型の意味値／構造化scope、periodの値・精度・null | Claim同一性、全ての自由記述限定の一致、Source独立性、矛盾・真偽 |
| relatedClaimIds | 同じSPOの他の公開Claim。探索条件・期間・限定で狭めない | 同じ限定、同一内容、同じ根拠、対立Claimであること |
| DisplayRelation | 表示中のSPO＋claimIds。逆方向・別Predicateは別線 | 全登録Claimの網羅、同じ限定・期間、肯定された実績一覧 |
| Entity概要 | 登録dataset内の公開ClaimをPredicate／視点／肯否ごとにDISTINCT集計。制作のみRole小集計 | 接続人数、Graph Edge数、独立Source数、関係強度、重要性 |

`claimComparisonKey`はpolarity、Claim UUID、Source／Citation、原表記、表示名、provenance、受入状態、システム時刻、Entity自身の期間を含めない。肯否を並べる**候補の機械的一致**として利用する。polarity込みの同一内容候補キーや自動重複削除は現行では実装していない。

制作scopeの比較にはkind／ISBN／languageを使い、volumeLabel／editionLabelの表示文言は使わない。同じISBNを異なる対象として誤同定していないか、注記に別の限定が残っていないかは人間が確認する。組織・Eventの説明的scopeは台帳／Citationに残り、現行の比較キーでは構造化比較できない。**比較キーが一致しても自由記述まで同じ命題と認定しない。** 比較関数は検証済み入力を前提とし、単独で適用先や資料を検証しない。

Graphは取得／受理／開閉による表示対象を先に決め、それからSPOへ束ねる。詳細でrelatedClaimIdsの条件外・未取得Claimを確認しても、Graphへ自動追加せずcursorを進めない。GraphのRole概要は表示中Claimの圧縮であり、deniedを含む場合も役割認定一覧にはしない。

## 5. 共通化する処理とdomain固有責務

| 境界 | 小さく共有する処理 | domain固有／人間に残ること |
| --- | --- | --- |
| 受入前の検証 | 登録型の適用Predicate、strict payload、enum、参照整合、日付形式・順序 | 値の意味、制度の同義性、Sourceが支持する限定、Entity同定 |
| 原表記 | originalText＋languageの小さいschema | 語義・翻訳・正規化受入、publicationの粒度、Event開催回 |
| 条件 | 重複排除／安定順、未知値拒否、未指定／空集合、適用先限定の一致 | 何を検索したいか、値間の同義／上下関係 |
| 取得・cursor | published＋条件＋afterをLIMIT前評価、両視点、実効条件と起点・datasetへの拘束 | 固有保存propertyとmapper、登録型ごとの明示query条件、旧形式の扱い |
| 比較・肯否 | 決定的な比較キーと限定込み命題へのpolarityという契約 | 内容同一性、矛盾認定、資料の独立性、自由記述scope |
| 探索 | GraphState、世代・要求番号、abort、受理ページ、上限、開閉／休止復元、直前一件snapshot | UIのdomain説明・ラベル、dataset投影と受入理由 |

現行の対応は`lib/domain/qualifications.ts`、`exploration.ts`、各domain schema、`lib/server/queries.ts`、`neighbor-cursor.ts`、`lib/client/graph-state.ts`と探索hook。全処理が一つの共通関数になっている必要はない。三型の固定API引数・nullable fieldで管理できたことから、無制限に同じ方式で増やせるとは決めない。

新条件はLIMIT後のフロント除外だけで代用しない。全段階で同じ実効条件を使う。新しい条件へ適用／起点切替する際は新探索世代とし、旧cursor・旧応答・旧open意図を混在させない。復帰は条件と受理済み範囲等を復元し、進行中通信そのものは再開しない。snapshotの寿命・上限は現行の探索契約に従う。

## 6. provenance・Source・Citation・受入

- **provenance**：どこからいつ・どの版を取得／投影したか。datasetやimport元はClaimの根拠と同一ではない。Wikidata由来であることも、原資料の関係支持を自動保証しない。
- **Source**：Claimの根拠資料。資料の公開日と関係期間は別。取込台帳の版やユーザー投稿元をSourceへまとめない。
- **Citation**：そのClaimが参照するSourceの箇所・原表記／言語・注記。複数Citation、同じSourceの共有を許す。原語が保存されていることとtyped値として受入済みであることは別。
- **人間受入**：資料が支持する狭い事実と投影範囲の判断。Codexの資料確認、schema成功、語彙設計レビュー票をその代用にしない。事実受入と構造化方式の採用も別。
- **Claim意味**：Predicate＋対象＋限定＋scope＋期間の命題。受入があることは世界の真実を確定した意味ではない。

Lorentzの広い参加／CHAIRが同じ議事録を参照しても独立した根拠が二つ増えたとは数えない。`sourceCount`は現行クエリで各ClaimのDISTINCT Sourceを数えるだけで、転載・翻訳・資料間依存を判定しない。Source UUIDが異なることだけでも証拠の独立性を認定できない。

## 7. taxonomy・表現・探索との分離

| 概念 | 責務 |
| --- | --- |
| Predicate | 保存する命題の意味、端点・正規方向・禁止推論 |
| typed qualification | その命題内の明示的限定、domain語彙と適用先 |
| taxonomy / classification | 閲覧・発見・選択の整理。同カテゴリから同じ命題や論理的subpropertyを推論しない |
| alias／多言語label | 同じ意味の表示。意味IDを増やさず、翻訳だけで命題や方向を変えない |
| exploration preset | 明示された条件テンプレート。適用条件へ解決するもので、知識の語義ではない |
| UI grouping / display bundle | 表示量の圧縮。Claimへ戻れることが必要で、保存意味や比較キーを変えない |
| Entity属性・名称履歴 | 対象自身の記述。確認された改称や開催回期間をRelationへ無理に変換しない |

「UIでまとめたいから同じ意味」「同じ分類だから同じPredicate」は採らない。多言語対応は設計前提。Predicate／Role ID、条件キー、Relation IDへ翻訳文字列を使わず、原表記の言語情報とUIのlocaleを分ける。taxonomy・presetの具体実装は[既存レビュー](EXPLORATION_PRESETS_REVIEW.md)の未実装領域であり、今回導入しない。

## 8. Phase 12〜15の根拠と反例

| 根拠 | 今固定できること | 一般化できないこと |
| --- | --- | --- |
| [Phase 12のA/B/F](RELATION_MODEL_COMPARISON_REVIEW.md) | Visitor／Associate professorは同じ組織関与内の限定候補。parent／spouseは方向・対称性を持つ独立命題候補。方式比較は排他的勝者選びでない | 家族保存の対称性規則、映画adaptation／remakeの排他的enum、全Role単一値 |
| [Phase 13のD/E/C](RELATION_MODEL_SECOND_COMPARISON_REVIEW.md) | 招待≠参加。単純改称は別組織間継承へ変換しない。批判≠denied influence。実際の評価対象を人物へ代入しない | D02合併の二項完全表現、純粋PREDECESSOR実例の受入、態度aspectの一般schema |
| [Phase 14の二用途実装](../archive/phase-14-typed-qualification/README.md) | 制作／組織の独立語彙を保って検証・条件・比較・復帰を共有できた。広い＋限定のClaim保持とSPO集約が両立 | 同じ制度語の国際対応、自由記述scopeの構造化、共通Role enum |
| [Phase 15の三用途実資料](../archive/phase-15-event-participation/README.md) | 特定回参加は独立Predicate、参加を伴うCHAIRは限定で自然。開催期間と参加期間を分離。第三型も同じ探索状態へ載る | 全Event、非参加CHAIR、招待語彙、Claim件数を接続数へ読み替えること |

実資料は主にaffirmedであり、限定肯否の反例は人工契約テストでも検証した。実在の矛盾事例を多数確認した、矛盾解消の一般法則を得た、という結論にはしない。Phase 12・13の研究受入と、Phase 14・15のruntime限定受入も区別する。

## 9. 現行実装の監査と残る限界

| 項目 | 判定／制約 |
| --- | --- |
| 三型の独立性、null、適用先、条件、cursor／世代／復帰 | 基本設計と整合。旧fixture schema 1〜3は凍結のまま受け付け、API読取時に三型のnullable欄へ正規化する。旧ファイルをschema 4へ書き換える意味ではない。未指定の理由はschemaから復元できない |
| 比較キーとUUID、SPO束、広いrelatedClaimIds | 整合。比較は登録型の構造化内容だけ。自由記述scope・制度語の同義・期間の重なりは判定しない |
| 制作の`comparisonCategory` | Role／ISBNの従来の粗い補助ラベルで、完全な命題一致ではない。共通キーはlanguage／periodも区別する。補助ラベルの「同じ」を内容同一認定に使わない。情報の揃え方は次のUIレビュー対象 |
| 肯否混在のGraph表示 | 三typed用途は「肯定・否定あり」で整合。ASSISTANT_OF／INFLUENCED_BYには旧「異説あり」が残る。異期間の混在にも出るため対立認定に見える余地がある。自動矛盾計算はないが、**表示表現の注意点として未解決**。今回は変更しない |
| Entity概要 | DISTINCT Claim集計として正しい。NBIの限定追加、Lorentzの広い＋CHAIRで、接続Entity／表示Relationが増えずClaim件数だけ増えた。探索用圧縮のpresentation課題 |
| 語彙変更チェック | 無審査変更・基準版書換えを検出できるが、意味の変質を完全判定できない。組織／Eventの固定catalogは変更自体を拒否し、新値の一般承認フローは未実装 |

runtimeを基本原則へ合わせるための大規模改修は不要。今回はUUID／根拠件数・比較・SPO束の境界、刊行物scopeの表示文言と比較対象の区別に小さい契約テストを補う。意味の支持や自動矛盾判定のテストを形式チェックで代用しない。

### 次に意味モデルを広げる前のUIレビュー

優先対象は**Entity概要が「どんな関係が伸びるか」を先に示せるか**。Claim統計は根拠側の情報として扱う可能性を検討するが、図式／一覧／折り畳み／集計単位は今回決めない。単に接続数へ置換すれば解決するとも決めない。

併せて、広い＋限定を一線へ束ねた説明、取得済みだけのRole概要、肯否混在の中立表現、詳細でscope／原語／Citationへ戻る情報階層、制作比較ラベルと共通キーの関係を確認する。意味schema不足、Source不足、詳細情報の配置、概要の圧縮を区別して判断する。Claimの統合・Predicate細分化で表示問題を隠さない。

## 10. 今回固定しない領域

- 全domain共通Role語彙、自由key/value、任意型の動的登録、動的フォーム／万能Cypher generator。
- ontology推論、qualification間の自動意味階層・同義対応、共通機構による資料受入。
- 全Event一般モデル、非参加CHAIR、INVITED Predicate、シリーズと開催回間のRelation。
- 家族の対称性保存モデル、組織合併の多項モデル、attitude aspect、時点別名称。
- Entity概要の表示単位と再設計、複数Predicateの表示束、型数を無制限に増やす公開API形式。

必要になった時に本書の判断フローで個別レビューする。現三用途のpayloadや一値制約を、未確認の領域へそのまま一般化しない。

## 11. 新Predicate／qualificationを追加するレビュー手順

1. **資料・反例を揃える。** 最小候補、locator、原語／言語、対象粒度、期間・scope、禁止推論を台帳へ記録。狭い事実の人間受入と構造化方式の採用を分ける。
2. **意味比較票を書く。** 既存Predicate／同domain値との同義・近接・限定・独立命題を理由付きで比較。包含／除外／境界例、端点・方向／対称性、null、polarity、期間・scopeを明示。本書の判断フローで選び、UIの分類希望だけで新IDを決めない。
3. **使用済みIDを保護する。** 意味変更は新IDと移行案が原則。旧Claim／保存条件を黙って別意味へ置換しない。翻訳・明確化もレビューしてhash差分を残す。基準版を書き換えて通さない。
4. **変更チェックの範囲を決める。** Predicate／制作Roleは既存catalog・比較票・before/after hashと信頼できるGit baseで検証。組織／Eventは現行の固定catalog変更を拒否するため、追加を要する時に有限値・比較票・基準版保護の最小拡張を先に設計する。万能語彙管理へ広げない。
5. **取得から表示まで影響を整理する。** strict payload・適用先・旧形式、LIMIT前条件、null／空集合／全値、比較キー、cursor版／実効条件、世代・ページ受理・snapshot、SPO束と関連詳細、locale境界を確認。新条件の意味をGraphだけに実装しない。
6. **小さい縦経路で実装・検証する。** 誤適用／未知値／反例を拒否し、既存条件と開閉・復帰の回帰を確認。実データは受入済みだけを新dataset版へ投影し、凍結版を上書きしない。
7. **観察を反映する。** 原資料→Claim→詳細→Graph／概要の各段階で失われる情報を分けて記録。今回の原則を更新する必要があれば変更理由と影響を明記し、実装成功だけで全領域の意味を受入済みにしない。

確認コマンドは `npm run vocabulary:check -- --base-ref <変更開始前の信頼できるcommit>`、`npm run qualification:check -- --base-ref <同commit>`、関連する契約／取得／探索テスト。既定HEADは作業中の差分を検出するだけで、既にコミットした変更の前提版を自動復元しない。現在はCI・ブランチ保護や任意手動書込みの制御を備えておらず、チェックを迂回した変更まで防止するものではない。
