# 小さい探索分類と条件解決の検証

2026-10-06 / Phase 19。**設計検証完了・次フェーズへの提案。runtimeへの分類導入ではない。** Phase 18の`3ada26d`を基準に、[関係探索モデルの再レビュー](RELATION_EXPLORATION_MODEL_REVIEW.md)、[基本設計](RELATION_MODEL_PRINCIPLES.md)、[24比較記録](../research/phase-18-exploration-model/v1/SAMPLES.md)、[完了記録](../archive/phase-18-exploration-model/README.md)と現コード・凍結JSONを確認した。

今回の[仮付与24行・検証prototype](../research/phase-19-exploration-classification/v1/README.md)は研究用。DB・公開API・UI・語彙・schema・dataset・fixtureを変更しない。新規資料確認・人間受入も行わない。

## 1. 結論

**三つの狭い関係入口は現条件へ正確に解決できる。一方、「学術」は独立した横断軸として自然だが、現APIだけでは実行できない。「仕事関係」は今回は採用しない。** すべてを同じ分類catalogの実行可能な選択肢にする構成には進まない。

次の実装候補は、relation facetの三項目だけを持つ小さいcatalog／resolver。活動領域は研究上の仮付与に留める。controlled tagを別要素として導入する必要性は今回得られなかった。原語検索は有用だが、現在のEntity名称検索とは別の能力・結果契約である。

Phase 18の多軸案は支持された。ただし「複数facetが自然」と「全部のfacetを今のPredicate集合へ解決できる」は違う。分類→条件という一段の矢印だけでは足りず、**解決済み・未解決・非採用を区別する境界**が必要になった。

## 2. 現コードで検証できる境界

| 現コード／契約 | 今回確認したこと |
| --- | --- |
| `lib/domain/exploration.ts`・`qualifications.ts` | Predicate集合、三型の値条件、null／空／全値、適用先限定の一致を再利用できる |
| `lib/server/http.ts:neighborsInput` | 公開入力はpredicates／contributionRoles／organizationPositions／eventRoles／limit／after。facet、語検索、polarity、期間／scope filterは未対応で400 |
| `lib/server/queries.ts` | publishedと条件をLIMIT前に適用、両視点でClaimを取得。新しいclassification propertyや原語索引はない |
| `neighbor-cursor.ts`・GraphState／探索hook | 条件は起点・dataset・cursor・探索世代へ拘束。分類名を条件キーへ足す必要は、現三入口にはない |
| `overview-presentation.ts`・EntityOverview | 種類・視点・向きを優先、限定記録を補助表示し統計を折り畳む。概要は探索条件外も含む登録範囲。分類所属を返すAPIではない |
| `graph-presentation.ts`・ClaimDetails | 表示中SPOを一線へ集約、詳細は各Claimの限定・期間・根拠へ戻れる。旧「異説あり」が二Predicateに残るが今回は変更しない |

型・意味値・肯否・Source支持を分類から新たに生成しない。原語を索引対象にできることと、その語の意味条件を公開できることも別。

## 3. 五つの入口候補

IDは検証内の言語非依存参照。将来の採用・永続IDを今回確定していない。labelはlocaleで別解決する設計とし、原語の言語とも分ける。日本語名の変更だけで実効条件を変えない。

| 名前／候補ID | facet軸・利用者への約束 | 含む例／含まない例／境界 |
| --- | --- | --- |
| **作品制作への関与** / relation.work-production | 関係種類。登録された「人物が作品の制作に関わった」という主張を辿る | R24の指定刊行物クレジット、広い制作Claim、Role指定ありなし、肯否を含む。ASSISTANT_OFの人物補助、作品の原作派生R21、好意・評価は含まない。R11の映画音楽は対象同定、R12の職能は個別限定が未決定 |
| **人物と組織の関わり** / relation.organization-involvement | 関係種類。登録された広い組織関与を辿る。雇用一覧ではない | R01/R02、立場なしの広いAFFILIATED_WITH。組織間の包含や合併は含まない。R03の辞任、R04のBoard scope、R07の当選、R14の共同設立は広い要約だけでは原命題が不足する |
| **特定開催回への参加** / relation.event-participation | 関係種類。資料で述べられた特定回の参加主張を辿る | R22の広い参加／CHAIR、Diracの広い参加。シリーズ、招待・欠席R23、開催前のjury任命R13は含まない。mission R09/R10は対象・参加契約が未確認 |
| **学術に関する関係** / activity.academic | 活動領域・文脈。関係資料が研究・高等教育・学術交流／運営を述べるものを横断する仮説 | R01/R02/R17/R18の関与、R22の物理会議、R23の招待資料。科学者の家族R19/R20は含まない。R09/R10の運航、教育活動R14/R15を学術へ自動包含しない。R16は学術的職位の予定記載であり実在籍は保証しない |
| **仕事関係** / candidate.work | 包含範囲が未確定の入口仮説。今回は公開候補から外す | 企業のCEO／Board、選手／監督、制作、研究立場、公職、無償運営を含むか割れる。雇用定義ならVisitor／無償活動を含められず、広い職業活動定義なら必要な根拠が不明。親族・作品派生を人物の職業からここへ移さない |

「制作の関係」はアシスタント・出版組織・原作派生まで期待されやすいため、今回はより狭い「作品制作への関与」へ改めた。「人物と組織」も将来の全組織間関係を含むようには名付けない。分類名を狭める方が、既存Predicateを意味拡張して合わせるより小さい。

## 4. 条件解決表

以下は新API形式ではなく、現neighbors入力への解決結果。追加条件なしでは、三qualification条件は省略／null。肯否は両方、公開範囲・dataset・既存取得上限は維持する。

| 候補 | 実効Predicate集合 | 精密条件／polarity等 | 解決状態 |
| --- | --- | --- | --- |
| relation.work-production | `[CONTRIBUTED_TO]` | Role・刊行物scope・期間では絞らない。肯否両方 | resolved |
| relation.organization-involvement | `[AFFILIATED_WITH]` | 組織立場では絞らない。肯否両方 | resolved |
| relation.event-participation | `[PARTICIPATED_IN]` | 参加立場では絞らない。肯否両方 | resolved |
| activity.academic | Predicate集合だけでは決まらない | 関係側の文脈付与／規則が必要。根拠・対象・版が未実装 | unresolved。適用不可とし、部分条件へ退避しない |
| candidate.work | 決まらない | 含む職業活動・雇用・公職・無償活動の定義から未確定 | not-adopted。この名で全AFF／全制作を返さない |

```text
作品制作への関与
  → predicates=CONTRIBUTED_TO
人物と組織の関わり
  → predicates=AFFILIATED_WITH
特定開催回への参加
  → predicates=PARTICIPATED_IN
組織との関わり + Visitor指定
  → predicates=AFFILIATED_WITH&organizationPositions=VISITOR
特定回への参加 + 会議議長指定
  → predicates=PARTICIPATED_IN&eventRoles=CHAIR
制作への関与 + プロデュース指定
  → predicates=CONTRIBUTED_TO&contributionRoles=PRODUCING
```

追加限定は利用者が別途明示した精密条件。入口名の裏でPRODUCING、VISITOR、CHAIRを自動設定しない。現APIにはaffirmedのみ、期間、ISBNで絞る条件はなく、公開APIへ追加したようには説明しない。明示値の検索もdeniedを含む「その限定を述べる主張」であり、役職・担当が成立した人物一覧ではない。

### 条件の合成と変更

- 同じ関係facetの複数選択はPredicate集合のOR。重複排除・安定順を現normalizerで処理。対象kindを人物だけに限定することとは違い、作品・組織・Event側からも同じClaimを取得する。
- 入口を選んでいない状態は現Predicate条件nullに相当する案。明示的な空集合`[]`は全件へ戻さず、関係を取得しない。UIで空選択を禁止するかは次の実装時に判断する。
- 精密限定は適用PredicateのClaimだけへANDする。複数関係を選びVISITORを指定した場合、Event参加は通常どおり通る。「Visitorの記録だけ」ならAFFILIATED_WITHの単独選択も必要。
- 同じClaimの意味条件へ適用する。別ClaimからVisitorとProfessorを拾ってVisiting Professorへ合成しない。全enum指定は限定なしを除外するため、省略と同義ではない。
- 学術を組み合わせたい場合、未対応の活動facetを無視して三関係のどれかだけで検索しない。複数facetのANDは解決済み条件・付与の両方が揃ってから提供する。
- 今回のprototypeは三入口の無追加条件だけを生成する。将来UIでは現在の確定条件とdraftを維持し、関係選択と精密条件を同じdraft内で明示的に解決・適用する。編集中・取消ではGraphを変えない。別の入口を選んだ時に精密条件を維持するなら、その条件も見える必要がある。
- 適用時は既存探索世代を切り替え、旧応答・cursor・受理ページを混在させない。開閉・snapshot／復帰は解決済みの実効条件を保存する。分類labelだけの変更・編集UI開閉では世代を変えない。

分類の説明・対応版を変えてもClaimのPredicate・qualification・UUID・肯否・比較キーを変更しない。既に適用した条件は分類catalogの更新で自動再解決せず、確定時の具体集合を維持する。取得範囲を変える新しい対応版は明示再適用する。三入口が同じ具体条件へ解決する限り、既存のcondition key／cursorを再利用可能。動的なactivity assignmentを将来条件へ加える場合は別途その版への拘束が必要。

## 5. relation facetとactivity facet

[24行の仮付与](../research/phase-19-exploration-classification/v1/README.md#2-24記録への仮付与)で、次の構造が見えた。

| 具体関係 | 関係軸 | 活動軸／その根拠 |
| --- | --- | --- |
| HeisenbergのNBIでのVisitor／Associate professor | 組織関与 | 当該研究所での活動文脈。立場・機関名から雇用は導かない |
| Lorentzの1927年Solvay参加／CHAIR | 特定回参加 | 特定物理会議の資料文脈。役割なしの広い参加も同じ文脈を持つ |
| Deslandresの同回招待／欠席 | 未実装の招待 | 同じ学術会議の招待資料。学術へ分類しても参加は成立しない |
| Curie家の親子／配偶 | 未実装の家族関係 | 学術活動ではない。人物属性から活動領域を伝播しない |
| Chaplinの映画音楽 | 制作候補、対象scope未決定 | 映画／音楽の複数文脈。選択した五候補だけでは領域を網羅しない |

したがって`学術 → AFFILIATED_WITH OR PARTICIPATED_IN`は正しい定義ではない。他分野の組織関与・参加を拾い、未実装の学術招待を落とす。同じ科学datasetにあることも、学術に関する関係という根拠にはしない。

研究上の仮付与は、具体関係記録→活動facet候補→資料locator→付与理由→判定／版として残す。将来の保存単位は未決定だが、初期候補はClaim単位の編集投影。SPOだけへ付与すると別時期・別限定の文脈を混ぜる可能性があるため、Relationへの概要はClaim側の付与から派生させる案。根拠の同じ複数Claimへの付与でも、件数・Sourceの独立性は増えたと認定しない。

学術的職位の予定記録R16も「学術の資料」として分類はできるが、実在籍のClaimにはまだできない。分類の妥当性、事実の受入、構造化方式の承認、runtime取得可能性は別状態。この意味でactivity facetは有用だが、いま全候補をruntimeに載せる根拠は足りない。

## 6. Visitor三状態と三種類の検索

Aは科学v2の既知VISITOR Claim、Cは同じ二者の立場限定なしの受入済みClaimを対照とする。BはR17のVisiting Professorを優先し、R16の予定名簿と混同しない。Bは研究記録のみで、現在のruntimeには存在しない。

| 検索／約束 | A：VISITOR明示 | B：未正規化Visiting Professor | C：限定なしAFFILIATED_WITH |
| --- | --- | --- | --- |
| lexical：原語・指定欄でVisitorを探す | 原語Visitorにヒット候補 | 単純な部分文字列一致ではVisitorとVisitingは異なり、ヒットしない。接頭・同義検索は未提供 | 該当CitationにVisitorが残る場合はヒット候補。値がnullでも語は存在し得る |
| lexical：Visiting Professorを探す | 原語Visitorだけならヒットしない | 原語へのヒット候補。未正規化・未投入を明示し、Graphで辿れると約束しない | その語が該当欄にある場合だけ。限定なしから語の不存在は推論しない |
| classification：人物と組織の関わり | 対象 | 研究上は適合。runtime受入・登録後なら広い組織関与として取得できるが、今回は未投入 | 対象。限定がないため除外する条件ではない |
| classification：学術 | 研究上の付与に適合 | 大学での本人CVの文脈に適合 | 本件の研究所関与なら資料文脈で付与可能。nullだけでは学術か判断できない |
| precise：AFF＋VISITOR | 一致。肯否・期間・scopeは各Claimのまま | 非一致。VISITORへ丸めたりPROFESSORへ分解しない | 非一致。CitationのVisitor表記から値を生成しない |

現在の名称検索`/api/entities?q=...`はEntity name／aliasesを探すだけで、上表のlexical検索ではない。「客員」を入れたらVisitorが見つかる保証もない。原語と訳語の同義対応、語形処理、検索対象欄を別途定義する必要がある。

Cの実資料にVisitorという語が残ることは、lexical検索が精密条件より広い結果を返し得る具体例。広い＋限定を独立Claimとして保存した結果であり、重複バグでもない。lexicalの結果は同じClaim IDでCitation重複を排除し、どの欄・資料の語へヒットしたかを示す案。Source全体の一般注記を関係支持と誤認させない。

### その他の語での差

| 問い | lexicalなら | 分類なら | 精密条件なら |
| --- | --- | --- | --- |
| Chair／会議議長 | R04 Board、R13 jury、R18団体、R22会議の表記・承認labelが候補。現UI labelの翻訳一致は原語一致と別 | 特定回参加に入るのは参加を述べるR22。役職名だけでR04等を入れない | 現PARTICIPATED_IN＋CHAIRのみ。広いLorentz参加・Dirac参加は非一致 |
| Producer／プロデュース | 対象欄の表記が一致した場合だけ。ProducerとPRODUCINGは文字一致ではない | R24の制作関与と広い制作Claimを含む | CONTRIBUTED_TO＋PRODUCINGの既知限定だけ。publication scopeの意味を保持 |
| 学術 | 文字として学術がない英語資料は単純検索で落ち得る | 研究所関与・物理会議・招待へ横断する。未分類は不在ではない | 一つの既存Predicate／Role条件へは解決不能 |

lexical結果には否定・留保・背景の説明もヒットし得る。ヒットした語から役職成立、Claimのpolarity、参加や雇用を生成しない。分類検索も精密検索も、登録主張を発見する手段であり世界の真偽を判定しない。

## 7. 仕事関係とtagの判断

「仕事」を雇用・報酬の関係と定義するなら、Visitor、会議運営、制作クレジットの資料では不足する。職業活動全般と定義するなら、無償協力、公職、共同設立、招待、役職就任合意をどこまで含むか決まらない。AFFILIATED_WITHやCONTRIBUTED_TOを選ぶだけでは契約を満たさない。

分解するなら、関係種類、活動領域、制度上の立場、雇用・報酬の独立根拠等が候補。ただし今回これらを新facetやPredicateにしない。「仕事関係」は将来の説明付きテーマ入口として検証できる余地を残し、現時点では意味分類・検索条件として公開しない。

現三Role／立場は精密条件、原語はlexical発見、relation facetは粗い入口として役割が足りる。別のcontrolled tagへVISITOR／CHAIR／PRODUCINGを複写しても新しい能力は増えず、同期・翻訳・意味対応の負担が増える。したがって**今回の次実装にはtagを追加しない**案。

将来「委員会運営」のような編集横断入口が必要になれば、分類定義・付与規則として検討する。固定facetに収まらない編集語の必要性が出た段階でtagの責務を見直せる。意味限定をtagへ改称して肯否対象を隠さない。

## 8. 小さいprototypeによる確認

[check.mjs](../research/phase-19-exploration-classification/v1/check.mjs)は既存入力・一致・cursor関数をimportし、書込みなしで検証する。語の比較だけは限定した文字列対照。新分類runtime、汎用resolver、語検索APIを実装したものではない。

| 全公開Claimに対する対照（中心のneighbors件数ではない） | 期待結果 |
| --- | --- |
| demo：作品制作への関与 | 5 Claim |
| 漫画v2：作品制作への関与／PRODUCING追加 | 13／1 Claim |
| 科学v2：組織関与／VISITOR追加／全立場追加／空立場集合 | 10／1／2／0 Claim |
| Event v1：特定回参加／CHAIR追加 | 3／1 Claim |
| Event v1：組織関与OR参加 | 13 Claim |
| eventRoles=CHAIRだけ（Predicate省略） | AFF10＋CHAIR1＝11 Claim。議長参加だけを探す条件ではない |
| 漫画v2：contributionRoles=PRODUCINGだけ | 制作1＋影響1＝2 Claim。プロデュースだけを探す条件ではない |

他に、候補順・重複の条件キー一致、未解決候補の混在拒否、A/B/C、原語と訳語、肯否、未知値／未対応欄の400、広い条件のcursorを精密条件で使えないことを確認する。LIMIT前の順序対照はメモリ上だけ。実DBのquery実行・ブラウザを今回確認したとはしない。

## 9. 次フェーズの判断

**次の一フェーズは「三つの関係入口の最小catalog／resolverと既存条件編集への接続」を推奨できる状態。** 公開範囲はrelation facetだけ。学術／仕事を使える選択肢として出すことはまだ推奨しない。

| 判断対象 | 推奨／完了条件 |
| --- | --- |
| 小さいclassification catalog | 三項目の安定参照・locale label・包含／除外・対応版・具体Predicate集合。新しい知識語彙として保存しない |
| resolver | 三分類のOR→現実効条件、未知／未解決の明示エラー、精密条件の適用先限定。現在の任意Predicate編集を失わず、分類で表せない選択は「個別指定」等として正直に扱う |
| 探索UI接続 | 検索→まず辿る→必要時の条件編集を維持。分類選択はdraftだけ、明示適用で再取得、取消・開閉・復元・起点変更の既存契約を回帰検証 |
| activity facet | 次版の関係側付与台帳・未分類方針・LIMIT前の取得・版拘束を決めてから。dataset名や職業から実装しない |
| tag | 今は追加しない。分類／原語／精密条件で足りない発見責務が実例で出た時に再検討 |
| lexical検索 | 未知の具体語を探す要求を実装対象にするとき。最初はCitationの原語・明示した注記欄など小さい範囲とhit field／受入状態を決める。今回の三入口接続の前提ではない |
| Graph／Claim詳細 | 分類catalog完了を待つ必要はない。粗い関係名・明示限定・期間／scope・原語の区別、旧「異説あり」の中立化を局所改善できる。全面Graph刷新は不要 |
| 追加資料 | 三入口の条件解決には不要。R17の制度語対応、R13の実参加、仕事＝雇用／報酬という条件を公開するなら、その狭い問いの資料が別途必要 |

catalogを実装しても、今の五Predicateに三つの表示入口を足すだけでは発見が劇的に良くなるとは限らない。**主な検証価値は、粗い入口と精密限定を利用者が区別でき、何の条件で辿っているかを説明できること。** 利用者評価は今回まだしていない。既存の詳細・条件表示を改善する方が先に効くと判断した場合、そこを優先しても境界は壊れない。

今のモデルで足りるのは、登録済み命題と三用途の既知限定による取得・比較・探索。足りないのは、関係側の活動文脈、未正規化語の発見、辞任／共同設立・家族・派生等の未実装命題、公職・jury・mission等の対象同定。これらを新enumやtagへ押し込んで解決済みにしない。
