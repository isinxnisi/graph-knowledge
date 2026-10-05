# 関係モデルの第1回比較：時期別立場・家族・作品派生

2026-10-05 / Phase 12。**資料確認・設計比較のみ完了。新規候補の人間受入、語彙採用、DB/API/UIへの実装・投入は未実施。**

[Phase 11の収集計画](RELATION_MODEL_VALIDATION_SAMPLES.md)を具体化した。[版付き台帳と再確認手順](../research/phase-12-relation-model/v1/README.md)、[収集・全候補の5方式比較](../research/phase-12-relation-model/v1/ledger.json)を正本とする。記号は設計比較用であり、predicate ID／Role IDの予約やcatalog登録ではない。

## 1. 件数と受入状態

既存材料は漫画v2の14 Claim＋科学v1の8 Claim＝**22独立Claim**。漫画v1を再加算しない。今回の新規候補はA02×1、B01–B04×4、F01–F02×2の**7件**。したがって第1回比較は**約29 Claim分の材料**であり、29件を受入・seedしたという意味ではない。

台帳には既存Visitorを対照A01として含めるため、候補記録は8件。各記録を5方式へ投影した**40比較票（新規分35）**を残す。5案の投影、逆向き表示、複数Sourceを追加Claimとして数えない。

- 新規7件：本文の関係表記を確認でき、提示した狭い意味で**人間レビューに提出可能**。全件humanAcceptance=pending。Codexの資料確認をユーザー受入に置き換えない。
- A01：科学C05の広いAFFILIATED_WITHは既に人間受入済み。Visitorの構造化された限定としての受入・再投入は未実施。既存UUID・期間・Citationを変更しない。
- sibling：今回読んだ資料にはIrèneとÈveを姉妹と直接述べる採用箇所を確保していない。共通の親から生成せず保留。資料に存在しないという断定ではない。
- 科学C09：今回再審査せずpendingを維持。家族・派生の確認から人物影響を生成しない。

## 2. 原資料と候補命題

| 記録 | subject → object / kind | 確認した関係・期間 | 資料とlocator | 意味を広げない境界 |
| --- | --- | --- | --- | --- |
| A01（既存対照） | Heisenberg → NBI / person→organization | Visitor、1924–1925、年精度 | [NBI公式略歴](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/werner_heisenberg/)のNiels Bohr Institute行 | 有給、雇用、専任、全期間の連続滞在を認定しない |
| A02（新規） | Heisenberg → NBI / person→organization | Associate professor、1926–1927、年精度 | 同じNBI行。記事日2010-06-02 | Professor一般への丸め、日本の助教授制度との同一視、Visitorの終期延長をしない |
| B01 | Pierre Curie → Irène / person→person | 親。期間不明 | [Nobel略歴](https://www.nobelprize.org/prizes/chemistry/1935/joliot-curie/biographical/)冒頭、[Musée Curie PDF](https://musee.curie.fr/.uploads/2018-01/03_irene-et-frederic-joliot-curie-7a8d5825.pdf) PDF第3ページ／印刷p.2のIrène紹介 | 娘という記述を親→子に反転。生物学的／養親区分や生年月日を関係始期に足さない |
| B02 | Marie Curie → Irène / person→person | 親。期間不明 | B01と同じ箇所 | 共同研究・指導・影響を親子から推論しない |
| B03 | Irène ↔ Frédéric Joliot / person↔person | 配偶者。始期1926-10-04、終期不明 | Nobel冒頭は1926年。Musée Curie PDF第3ページ／印刷p.2冒頭は婚姻日を明記 | 日精度はPDFを根拠とする。原資料の精度差を残す。死亡日から終期を補わない |
| B04 | Marie ↔ Pierre Curie / person↔person | 配偶者。始期1895-07-26、終期不明 | [仏高等教育・研究省記事](https://www.enseignementsup-recherche.gouv.fr/fr/celebration-du-150e-anniversaire-de-la-naissance-de-marie-curie-49204)の1896見出し直下の婚姻文、[Musée Curie MCP68_01](https://curiotheque.musee.curie.fr/s/en/item/15209)のTitle/Date（1895年） | 見出しの1896を婚姻年にしない。写真の人物の見た目から配偶者を判定せず、博物館の記述を根拠とする |
| F01 | The Magnificent Seven (1960) → Seven Samurai (1954) / work→work | 派生。adaptation / remakeと記述。関係期間不明 | [BFI 2021紹介](https://www.bfi.org.uk/news/bfi-japan-autumn-programme)の日本映画の影響段落、[BFI 2014論考](https://www.bfi.org.uk/features/seven-samurai-akira-kurosawa-classic-status)のMorheim/Sturges/1960年公開段落 | 同じペアに両語。排他的な二分類にしない。権利取得・許諾・全場面一致を一般化しない |
| F02 | A Fistful of Dollars (1964) → Yojimbo (1961) / work→work | remake。関係期間不明 | BFI 2021の同じ段落 | 部分的な場面対応の記述を全編一致・合法／非合法の認定へ変換しない |

日本語の表示名は台帳の編集用名称。原語名・原表記・言語・人物／映画の粒度は別に保持し、新Entityの内部UUIDや未確認QIDを作らない。NBIの旧名と現在名の同一性は科学v1の既受入判断を参照し、歴史名モデルや現機関の全期間同一性を新たに証明した扱いにしない。

Nobel本文は今回通常のHTTP GETで取得できた。ページが示す版は**Nobel Lectures, Chemistry 1922–1941, Elsevier, Amsterdam, 1966**であり、受賞時の略歴から編集・再刊されたとの注記がある。現本文全体を1935年当時の本人自筆証言としない。PDFのCreationDate=2013、URLの2018-01は公開日の証明ではない。省記事は2017-11-08公開、婚姻は1895年。資料の日付と関係期間を分離する。

BFIは映画専門機関の解説・編集記事であり、映画制作者の契約書や制作時の本人証言ではない。今回の候補は**その資料が二作品を派生関係として明示する**範囲に限定する。厳密な脚色対象・権利・制作経緯を構造化する前には別資料が必要。

## 3. 比較の共通契約（将来案）

以下は比較を成立させる仮定。現行schemaへの追加契約として採用・実装したものではない。

1. **Claim identityはUUID**。同じ二者・同じ語彙でも、時期・限定・資料による異なる主張を保持する。内容キーをDBの一意制約やMERGEキーにしない。同じ命題の複数Sourceを一Claimに紐づけるか、資料ごとに別Claimとするかは受入単位で判断し、今回自動統合しない。
2. **比較キーと同一内容候補キーを分ける**。比較キー候補は端点／predicate／意味に関与する型付き限定／scope／periodの値・精度・未指定状態。polarityは除外して同じ対象への肯否を並べる。同一内容候補ではpolarityも含める。原表記・引用・Source・作成時刻はprovenanceとして別に保持する。これらのキーで真偽・矛盾・重複を自動認定しない。
3. periodの完全一致は機械的な比較候補。年精度と日精度、重なる期間、同じ限定の一部期間の肯否は人間レビューに残す。`to=null`は終期未記録であり、現在も継続という主張ではない。parentの無期間は永遠を宣言せず、映画の公開年は派生関係の始期ではない。
4. **保存方向と探索視点は別**。parentは親→子、組織関与はperson→organization、派生は派生work→元work。object側からも探索する。対称配偶者は将来内部Entity IDで端点を正規化した一方向保存＋双方視点が候補。Sourceの元の記述順はCitationへ残す。逆向きの第二Claimは自動生成しない。
5. `null`／限定未指定はそのClaimが限定を主張しない状態。**全Roleの肯定、全期間・全scopeの保証、すべての限定値のORではない**。資料にない／まだ構造化していない／今回広い命題だけ受入、という収集理由は台帳に残し、値のnullから推測しない。必須の家族typeがnullなら「親か配偶者か何でもよい」とは読めず、家族関係の種類は未確定になる。
6. クエリ条件の「限定で絞らない」は取得集合への制限なし。一方、Claim側の限定なしは値の欠落／広い主張。これらを同じnullで実装するとしても**別の型・別の責務**にする。Visitor条件はVisitor明示Claimだけを取得し、既存の広いA01を注記検索で混ぜない。
7. 条件はLIMIT前、実効条件をcursor／探索世代キーへ拘束。predicate条件と、そのpredicateへだけ適用する限定条件を分ける。組織Visitor条件で家族や制作を無意識に排除しない。対称predicateの両視点検索も重複排除する。今回API・cursorは変更しない。
8. taxonomyは発見・探索の分類であり命題の契約ではない。家族カテゴリにまとめてもparentとspouseを同じ肯否・方向へ潰さない。共通typed機構は型・適用先・原語・版・検証を共有できても、全分野のRoleを一つの値集合へ統一しない。

## 4. 5方式の横断比較

ここでいう「保証」は、その方式を実装して契約とvalidatorを作った場合の可能性。**今回それらのvalidatorを追加したという意味ではない**。各候補の11項目の全比較はledgerのmodelComparisonsに残す。

| 方式 | 意味・再利用・語彙数 | 条件検索・肯否 | 主な問題と機械保証の限界 |
| --- | --- | --- | --- |
| M1 広いpredicateのみ | Aの関与・Bの家族・Fの派生は記録できる。職位、parent/spouse、派生方式は注記へ落ちる | 関係全体は検索可能。Visitor／parent／remakeを構造的に限定できない。広い命題へのdeniedと限定命題へのdeniedは違う | UUID・kind・期間形式は検証可。注記の意味や条件取得は保証不可。Bでは方向付き親子を対称familyへ潰す損失もある |
| M2 細分predicate | PARENT_OF／SPOUSE_OF等の独立命題に自然。職位・版まで細分すると語彙が増える | 各語彙をLIMIT前に選べる。語彙に埋め込んだ限定まで肯否が掛かる | kind／方向／対称性／語彙登録は検証可。同義語の乱立、Associate professorの制度対応、adaptation/remakeの包含は人間審査 |
| M3 predicate＋typed限定 | Aの関与＋立場、Fの派生＋方式の分離候補。parent/spouseをfamilyRoleに押し込む必然性はない | typed値をLIMIT前に選べる。肯否は限定・期間・scopeを含む命題へ | 適用predicate・型・enum・必須値を検証可。家族typeごとに方向／対称性が違うなら複雑さをqualifierへ移しただけになる |
| M4 domain固有限定 | Aの制度・職位原表記、Bの法域、Fの映画版等へ精密化できる | domainの明示条件なら検索可能。他分野同名語の共通検索は同義対応の審査が必要 | domain型・適用先は検証可。今回ない制度／法域／映像版を必須にすると未確認値の補完を誘発する |
| M5 共通typed機構 | M2の独立命題を残しつつ、限定定義のnamespace／適用先／型／比較／原語処理を共有する候補 | 登録型に従う条件取得と、限定全体への肯否を共通処理できる | 自由key/valueではない。未知キー・誤適用・null/wildcard混同を拒否可能でも、意味の同一性・資料の正しさは人間判断。最も高い初期コスト |

M3/M4/M5は排他的な三択ではない。M3は命題の構成、M4は値の意味がdomain固有であること、M5は型検証等の実装責務の共有。**M2の家族語彙＋M3の組織限定を、必要になった範囲でM5の共通処理へ載せる**という組合せも可能。五つを同じ階層の勝者選びにしない。

### 候補ごとの投影と推奨

| 候補 | M1 | M2 | M3 | M4 | M5 | 最も自然な仮説 |
| --- | --- | --- | --- | --- | --- | --- |
| A01 Visitor | AFFILIATED_WITH | VISITOR_AT | AFFILIATED_WITH＋関与種別Visitor | academic関与＋原制度語Visitor | 登録型organizationParticipation=Visitor | M3。共通処理候補M5、意味値は組織関与用。制作Roleの流用は不可 |
| A02 Associate professor | AFFILIATED_WITH | ASSOCIATE_PROFESSOR_AT | AFFILIATED_WITH＋原制度語に対応する立場 | academic職位＋Associate professor | 登録型organizationParticipation=Associate professor | M3。Visitorと別限定命題。Professor一般への同義対応は未承認 |
| B01 Pierre→Irène | FAMILY_RELATED | PARENT_OF | FAMILY_RELATED＋type=parent | kinshipType=parent（生物学的等は未指定） | PARENT_OFに必要な限定だけ登録可能 | M2。親子の方向をpredicate契約へ。現資料にないparent種別は増やさない |
| B02 Marie→Irène | FAMILY_RELATED | PARENT_OF | 同上、subjectはMarie | 同上 | 同上 | M2。B01と異なる二者であり、同じ親子typeでも別Claim |
| B03 Irène↔Frédéric | FAMILY_RELATED | SPOUSE_OF | FAMILY_RELATED＋type=spouse | kinshipType=spouse（法的区分は未指定） | SPOUSE_OFの対称規則を登録 | M2。開始日1926-10-04、終期不明。対称性はRole値の解釈に埋め込まない |
| B04 Marie↔Pierre | FAMILY_RELATED | SPOUSE_OF | 同上、別ペア／開始日 | 同上 | 同上 | M2。開始日1895-07-26、終期不明 |
| F01 Magnificent Seven→Seven Samurai | DERIVED_FROM | ADAPTED_FROM / REMAKE_OF | DERIVED_FROM＋派生方式 | film派生＋媒体／版の限定 | 登録型derivationMethod | M3候補。ただし**方式値は未確定**。今回確かなのは資料で明記された派生と原語2語。単一排他enumへ正規化しない |
| F02 Fistful of Dollars→Yojimbo | DERIVED_FROM | REMAKE_OF | DERIVED_FROM＋remake | film派生＋媒体／版の限定 | 登録型derivationMethod=remake | M3候補。F01と同じ値契約を先に決める。remakeをinfluenceの強さとして保存しない |

AのProfessorとVisitorは、同じ広い関与Relationの中の**別の限定命題**として扱える。職位別Relationを永続知識として別途生成する必要はない。Graphで一つにまとめるかは別のpresentation判断であり、詳細・条件では必ず区別する。期間が違うから役割が違う、役割が違うから期間が排他的、とは推論しない。

Bのparentとspouseは、「同じRoleが二種類」というより**独立した方向・対称性の意味契約**を持つ。広いFAMILY_RELATED＋typeでも表現は可能だが、typeごとの端点正規化・表示・肯否・必須値規則を実質predicate相当に持つことになる。少数の独立語彙の方が小さく明確。

F01はBFIが同じ二作品をadaptationともremakeとも呼ぶ実例。同義なのか、remakeがadaptationの下位概念なのか、映画限定の使用なのかはこの2資料だけでは一般化できない。両資料を肯否対立として扱わない。**資料の呼称を複数保持できることと、複数の意味限定を一Claimに付けることは別**。一Claim一派生方式の是非や集合値の仕様は、この観察だけで決めない。広い派生Claimを最小範囲として受け入れ、方式語は原文に残す案はあるが、方式での条件検索ができるとは報告しない。

## 5. 同一性・比較・表示への具体的な影響

| 問い | 今回の材料から言えること |
| --- | --- |
| Visitorだけ辿れるか | M1では不可。M2–M5なら意味契約と構造化受入・LIMIT前条件が必要。既存C05のCitationにVisitorがあっても限定済みClaimとはしない |
| 同じ二者・複数期間 | A01/A02は同じSPOだが期間と限定が異なる。UUIDを保持し、比較キーに期間の精度と立場を入れる。日精度へ補完しない |
| 肯否の対象 | denied VisitorはProfessorも広い関与も否定しない。denied parentはspouseを否定しない。denied remakeからdenied influenceを作らない。今回の実資料は肯定のみで、否定は契約検証用の仮定に留める |
| 配偶者の対称性 | canonical pairに一Claimとして保存する候補。どちらからも探索する。端点の逆転と、Source別・時期別の独立主張は混同しない。parentに同じ正規化を適用しない |
| nullと条件 | 限定なしClaim≠全Role肯定≠未指定の探索条件。Visitorのみの取得は広いClaimを除く。「関与すべて」は限定なしと限定ありの双方を取得できる |
| scope | NBI限定は対象組織と資料の立場記述、映画は同定した作品間の派生。刊行物ISBN scopeをそのまま流用しない。cut・法域等を資料なしで補わない |
| relatedClaimIds | 現行はSPOの広い関連候補。A01/A02は関連しても同一限定比較ではない。家族の別predicateは現契約では関連対象外。将来の比較候補と表示束を同じキーで管理しない |
| DisplayRelation | 現行SPO集約は個々のClaimを保持できる。制作以外は肯否混在を「異説あり」とするので、組織限定等を入れる時に限定の違う肯否を誤対立表示しない見直しが必要。今回UIは維持 |
| work同一性 | BFI 2014はSeven Samuraiが米国でThe Magnificent Sevenという題名でも公開されたと述べる。**題名だけでF01の端点を統合すると自己関係になる**。1954年黒澤作品と1960年Sturges作品を区別。2016年版も含めない |

## 6. 資料 → 命題 → 詳細 → 概要での損失

| 材料 | 意味schemaの損失 | 詳細／概要の損失（schemaとは別） |
| --- | --- | --- |
| A | 現行AFFILIATED_WITHではVisitor／Associate professorを条件として取得・比較できない。Citationは原表記と期間を残せる | 注記を読めば立場が分かるがGraphの「関わりがあった」と概要の件数では変化が分からない。限定を構造化しても統計だけを見せれば解消しない |
| B | 現4語彙には家族命題を表す語彙がない。ASSISTANT_OF等へ押し込むのは意味変更 | 親と配偶者を同じ家族ラベルへ圧縮すると方向と対称性が消える。predicate契約と視点別表現を先に決める |
| F | 現4語彙はwork→workを受け付けない。原語2種を排他enumにするとF01の二資料の情報を落とす | 派生と影響を単に「関連」と表示すると作品の由来が見えない。原文保存だけでは方式条件の検索はできない |

注記から読めることは構造化条件として辿れることではない。限定がないことはUIだけの問題ではない。一方、Sourceを読んでも原資料が特定cutや制度上の雇用種別を述べていない場合は、schema/UIでは解決できない資料不足。

## 7. 機械と人間の境界

**現行で既に効くもの**：fixtureのUUID、kind/predicate端点、期間形式・順序、参照整合、制作Roleの適用先・刊行物scope、語彙baselineと変更審査。新しい家族・派生・組織限定を既存schemaへ通せるという意味ではない。

**将来の最小validatorで担保可能**：登録された限定キー・型・適用predicate、未知値、必須限定、対称predicateの端点正規化、期間精度、限定なしとwildcardの区別、比較キーの決定性、実効条件cursorへの拘束。語彙追加は既存全語彙との比較票と人間受入を経る。今回は台帳の構造・参照・5方式比較の充足だけを検証する。

**人間に残るもの**：原資料の帰属・制度語の同義性、家族の法的／生物学的区分、adaptation/remakeの意味境界、Source同士の依存、広い命題として受け入れる範囲、異なる粒度・期間の比較可能性。どの方式でもこれをenum登録・類似語lintだけで保証できない。

## 8. 約29件で判断できること／できないこと

判断できる：すべての差をRoleへ押し込む単一方式は小さくない。独立命題はpredicateへ、関与の立場は適用先の限定へ分ける仮説が有望。Claim/Citationの保持、方向と視点、条件前置、限定とnull、期間精度は分野間で共通処理できる。制作Roleのenumを組織へ流用する理由はない。原語の別語を排他的分類とみなすのは危険。

まだ判断できない：共通typed機構がdomain型を二つ持つより安くなる時点、全分野で使えるRole値、組織合併等の多項性、eventと参加の時間、人物態度のaspect、家族の再婚・養子等、肯否対立の実資料、定量的なUI可読性・取得性能。今回は実ブラウザ観察を行っていない。既存22件は凍結記録を比較基準として照合し、全Sourceを再取得・再受入したものではない。

## 9. 第2回レビュー前に補うD/E/C

| 順序 | 収集する小さい材料 | 明らかにする判断・資料要件 |
| --- | --- | --- |
| D：2–3候補 | NBIの直接親と大学までの間接所属、Curie組織の合併・継承 | 公式組織図・沿革で即時親か推移関係かを区別。改称≠継承、合併前二者≠一つの旧名。PART_OFとPREDECESSORを限定一つで扱ってよいかを検証 |
| E：2–3候補 | 特定回Solvay会議の出席、明示された議長等 | 主催者記録／議事録の氏名と役割。招待≠出席、series≠開催回、会議日時≠参加期間。参加の限定とorganization関与の限定の共通部分を検証 |
| C：2–3候補 | 同じ人物／作品への尊敬・批判・影響の明示文章 | 本人の書簡・講演の帰属・原版・翻訳・前後の文脈と対象aspect。尊敬≠影響、学説批判≠人物批判。科学C09は原講演と掲載文の確認を先行し、今回の保留を解除しない |

件数を揃えるために弱いSourceや架空deniedを作らない。D/E/Cに8候補前後が揃えば、既存22＋新規7＋追加6–9＝35–38材料程度で第2回レビューできる。36–42は計画目安で、受入件数のノルマではない。

## 10. 次の最小フェーズと実装準備状態

**今回の資料・比較は揃ったが、7件の実投入と汎用qualification実装をそのまま開始できる状態ではない。**

次は「7候補の人間受入範囲の確認＋D/E/Cの小さい収集と第2回比較」を推奨する。組織立場だけへ局所最適化する前に、参加Role・組織継承・態度の反例を追加する。共通typed機構を先行実装する根拠はまだ足りない。

その後の最小実装候補はA01/A02。同じ二者・二立場・二期間を既存の広い関与と比較でき、現APIへの変更を最小にできる。先に決めるのは、(1) Visitor／Associate professorを資料の制度語としてどう登録するか、(2) 限定なしの広いC05を保持したまま限定命題を新dataset版で受け入れる単位、(3) polarity／期間／scope／比較キー／条件nullとcursor、(4) 非制作限定の肯否混在を表示上の自動対立にしない境界。制作Roleの正式enum、凍結科学v1、既存意味契約は黙って変更しない。家族／派生まで同時に実装する必要はない。

家族の対称保存契約と派生方式の語彙境界は比較資料として保持し、D/E/Cの第2回レビューで共通typed機構の必要範囲を再評価する。今必要なのは狭い意味契約の受入であり、ontology、taxonomy、自由qualifier基盤、管理UIの先行完成ではない。
