# 関係モデルの第2回比較：組織の変化・会議参加・対象を限定した評価

2026-10-05 / Phase 13。**資料収集・比較まで完了。新しい意味契約・schema・語彙・DB/API/UIは未実装。**

[第1回比較](RELATION_MODEL_COMPARISON_REVIEW.md)の仮説をD/E/Cで検証する。[研究台帳v2](../research/phase-13-relation-model/v2/README.md)と[ledger.json](../research/phase-13-relation-model/v2/ledger.json)が候補・参照・各5方式11項目の正本。projection内の語彙・型名は設計記号であり正式IDではない。

**結論は、小さな限定Vertical Sliceの契約を決めるには材料が十分、全関係の共通モデルを採用するには不十分。** 独立命題をpredicate、同じ命題内の立場等を限定、型処理を共通化する組合せは有効な仮説として残る。ただし、二項関係の端点・Entity同一性・変化の多項性を限定だけで解決しようとすると破綻する。

## 1. 版・受入・件数の区別

Phase 12のA02、B01–B04、F01–F02の7件は、今回のユーザー指示を根拠に**資料の狭い事実を比較材料として受入済み**とv2へ記録した。predicate ID、qualification schema、Role ID、派生方式enumの承認は全件pending。F01のadaptation / remakeの排他的正規化は明示的に未受入。以前のpending状態はacceptanceHistoryと凍結v1へ残した。

Phase 13はD/E/C各3、計**9研究記録・45比較票**。D03の改称はEntity同一性の対照でありRelation候補件数へ含めない。D02の合併は一つの変化の資料記述であり、二本の前身Claimへ水増ししない。C02の理論的提案は現在kindに受入先がなく、C03の影響源の端点正規化も未確定。

- 既存22独立Claim＋Phase 12の狭い事実7＋今回の関係材料8＝**約37件分の関係比較材料**、別に改称対照1。
- 37件をDBへ表現可能・受入済み・投入済みとした数字ではない。今回は9記録すべて人間受入pending。
- 台帳全体は既存Visitor対照を含む17記録、85比較票、16 Source。Sourceの数は独立一次証言の数ではない。
- 科学C09はpending維持。元講演・原版・翻訳・年代の問題を解決する追加根拠は今回得ていない。件数のため解除しない。

## 2. D：構造的包含、合併、改称

| 候補 | 対象・狭い資料事実 | Source / locator | 時間・受入状態 |
| --- | --- | --- | --- |
| D01 | NBI → コペンハーゲン大学理学部。departmentとして理学部一覧に掲載 | [大学理学部Departments](https://science.ku.dk/english/contact/department-and-centres/) S08、冒頭とNBI項目 | 現行一覧。関係の始期／終期不明。人間受入待ち |
| D02 | Institut du radiumとFondation Curieが1970年に財団内で合併し、財団が1978年にInstitut Curieの名を採る | [Cour des comptes報告](https://www.vie-publique.fr/files/rapport/pdf/154000159.pdf) S10、PDF第15ページ／印刷p.15 Introduction | 変化の年1970と名称の年1978を分離。法的継続性・前身Claimは保留 |
| D03（同一性対照） | Institute for Theoretical Physicsの1965年のNiels Bohr Instituteへの改称 | [NBI公式歴史紹介](https://nbi.ku.dk/english/www/niels/bohr/de_sidste_aar/) S09、1957年写真caption直後の改称文 | 変更年1965。Relationへ変換しない。今回の名称履歴事実は人間受入待ち |

D01の直近の掲載上位は**Faculty**である。「大学サイトで見つかった」ことだけで大学直属を作らない。現在の一覧は1920年代の包含も、理学部の設立以来の連続包含も保証しない。法的所有・所在地・協働も別命題。大学歴史ページはinstitutが建物と組織双方に使われてきた曖昧さを説明するので、名称一致だけのEntity統合は避ける。[大学のinstitut史](https://universitetshistorie.ku.dk/organisation/institutter/)は補助調査先で、今回の受入候補の正本はS08/S09。

D02は重要な反例。報告は**財団内で**合併したと記すため、「旧二組織は消滅、新しい第三法人が1970年に生まれた」というモデルは資料以上の主張になる。二項MERGED_WITHなら参与二者を表せても、結果・継続性・一つの同じ変化であることは失われる。二本のPREDECESSOR_OFでも結果のEntity同一性を先に決めなければ解決しない。法令／定款を読むまでは参与者・年・原文の範囲を保持し、汎用合併イベント実装を先行しない。

D03は旧称と新称を別組織へ分割しない例。資料が同一対象の改称を述べるなら名称履歴が自然。歴史的名称も出典付き事実であり、無検証のaliases追加と同じではない。1920年代の旧研究所から現在の全組織再編まで同一性を包括認定したことにはしない。

**純粋なPREDECESSOR_OFを支持する受入候補は今回確保していない。** PART_OFとPREDECESSOR_OFを分ける提案は、構造的包含と時間的継承の異なる命題・方向・時間の契約に基づく設計判断であり、D02をそのまま継承の証拠として使うものではない。

## 3. E：特定開催回、参加役職、招待と欠席

[主催者索引](https://solvayinstitutes.be/home/archives/conferences-archives/)と、そこから配信される[1928年議事録のULB複製](https://solvayinstitutes.be/wp-content/uploads/2025/10/Proceedings-Physics-1927.pdf)を読んだ。検索抄録や写真の顔の認識を根拠にしていない。

| 候補 | 対象・資料の意味 | locator | 受入・推測禁止 |
| --- | --- | --- | --- |
| E01 | Lorentz → 1927年第5回物理会議。chair / Président | S11 Physics 1927、S12 PDF第12ページ／印刷p.VIIの参加者先頭 | 人間受入待ち。この回の参加を伴う議長。科学委員会／名誉議長一般と同義にしない |
| E02 | Deslandres → 同回。招待されたが欠席を届けた | S12 PDF第13ページ／印刷p.VIII、Deslandresを述べる文 | 人間受入待ち。**招待の肯定は参加の肯定ではない**。欠席を別denied Claimとして自動生成しない |
| E03 | Dirac → 同回。実際の参加者一覧に記載 | S12 PDF第12ページ／印刷p.VII、Dirac de Cambridge行 | 人間受入待ち。参加から全日程出席、報告者、主導者を推論しない |

議事録の表題・開催説明は**1927-10-24〜29**、出版年は1928。特定回はseriesと別の研究対象refを持つ。seriesの恒常的会員・全回の議長へ拡大しない。会議の期間はevent自身の期間であり、各人の参加valid periodは不明のまま。招待状の日付も参加始期ではない。

[2018年年報](https://solvayinstitutes.be/wp-content/uploads/2025/08/Annual_report-2018.pdf) S16、PDF第182ページ／印刷p.181はDirac/Pauliへの1927年9月の招待と開催前の一覧を記す。これは補助的な招待・予定の資料。E03の参加根拠は後の正式議事録である。W.H.Bragg（父）の欠席とW.L.Bragg（息子）の参加を名前の短縮で統合しない。写真掲載・レセプション参加・会議参加の三つも同義ではない。

E01はPARTICIPATED_IN＋chairを支持する。ただし「chairなら必ず参加した」という全分野の含意は採らない。資料に会議議長としての参加が明記された範囲での限定案。名誉議長や委員会職は別の受入契約が必要。E02は**全event関係をPARTICIPATED_IN＋roleへ押し込む仮説を壊す**。招待は独立命題が自然であり、role=invitedでは明示欠席者を参加者へ変えてしまう。

## 4. C：評価の内容と本当の対象

| 候補 | 原資料が述べる範囲 | Source / locator | 未確認部分・受入状態 |
| --- | --- | --- | --- |
| C01 | EinsteinがLorentzの1911年会議運営と科学的洞察を称賛 | [Leidenの書簡抜粋掲載](https://www.lorentz.leidenuniv.nl/history/Solvay/solvay.html) S13、Einstein→Zangger 1911-11-07の引用 | 帰属付き英訳抜粋は確認。元書簡画像・全集番号・訳者・全文未照合。恒常的RESPECTSへの正規化は保留、人間受入待ち |
| C02 | EinsteinがMachの慣性の理論的提案は整合した場の理論に適合しないと論じる。同頁で問題提起の妥当性も認める | [本人自伝の英訳複製](https://sites.pitt.edu/~jdnorton/teaching/cosmology_2025/pdf/Einstein_Autobiog_1946.pdf) S14、PDF第3ページ／印刷p.29 | 批判対象は理論的提案。現在kindでは対象未モデル化。人格批判へ変換しない。狭い文章事実は人間受入待ち |
| C03 | 本人自伝の再引用で、Hume/Machの哲学的著述を読むことが、発見に必要な批判的推論を助けたと述べる | [Nortonの著者公開版](https://sites.pitt.edu/~jdnorton/papers/Phil_in_Einstein_final.pdf) S15、PDF第4ページ／印刷p.98、自伝引用と脚注7：原資料1949 p.53 | 本人文章の再引用は確認。原版p.53・独語全文未照合。特定著作題も未特定。人への帰属と著述集合の端点を決めず保留、人間受入待ち |

資料の種類を均一に扱わない。C02は本人文章の印刷複製、C01は大学掲載の帰属付き書簡英訳抜粋、C03は研究章内の本人文の再引用。C01/C03の原版が未確認であることを、本人一次資料の全文を確認済みと報告しない。Cは3件とも即投入できる候補という意味ではなく、**対象・来歴・語義の保留を含む反例材料**である。

C01の発言日1911-11-07は態度が成立し始めた日ではない。1911年会議の運営についての評価を1927年会議へ結びつけない。隣接する掲載写真は1930年であり証拠箇所とは別。

C02は「批判がある」ことを肯定する命題なので、将来CRITICIZESを使うならpolarity=affirmedになる。denied INFLUENCED_BYではない。同頁の肯定評価と批判はaspect・対象が違い、肯否矛盾ではない。**Mach(person)＋targetAspect=理論**で、実際の評価対象である理論的提案を隠してしまわない。人物の能力評価を限定するC01と、人物でない対象へ評価するC02は別問題。

C03も、Nortonの解釈を本人引用へ混ぜない。原文はHumeも挙げ、著述の読書による批判的推論への寄与を述べる。特定の一冊、唯一の影響源、思想全体の受容は保証しない。原版確認と、person→personの限定影響として受け入れる意味を決めるまでは現行INFLUENCED_BYへ変換しない。

## 5. 候補別の5方式比較

以下は要点。全85比較票には表現／損失／過剰主張／条件検索／肯否／期間・scope／identity／比較キー／方向・対称性／未指定／機械保証の11項目を保持している。M3は命題構成、M4は値のdomain、M5は実装処理の共有であり併用可能。

| 候補 | M1 広いpredicate | M2 細分predicate | M3 typed限定 | M4 domain限定 | M5 共通typed機構 | 今の見立て |
| --- | --- | --- | --- | --- | --- | --- |
| D01 包含 | ORG_RELATEDでは包含が落ちる | PART_OFが構造命題を固定 | type=partはpredicate相当の意味を型値へ移す | 大学の単位粒度が必要な時だけ | PART_OFに必要なscopeを登録可能 | M2、限定は必要時だけ |
| D02 合併 | 広い関連では変化が消える | MERGED_WITHは参与二者のみ。PREDECESSORは今回未支持 | type=mergerでも結果・参与者・identity不足 | 財団内という範囲は残せるが法律上の効果を認定不可 | 型共有は可能、arityとidentityは解決しない | 現段階は原資料・多者の変化を保持し保留 |
| D03 改称 | 関係にすると二組織を捏造 | RENAMED_TO / PREDECESSORは不要 | type=renameにしても端点の誤りは残る | 期間付き名称としての固有情報 | Relation限定ではなく名称履歴の責務 | 同一Entity内の名前事実 |
| E01 議長 | 参加は残るが役職が落ちる | CHAIR_OF_EVENTでも表現可、役職数分の語彙が増える | 参加＋chairがこの資料に自然 | SolvayのPrésident原語・制度の範囲 | event型の適用先・条件処理を共有 | M3、domain値をM5へ |
| E02 招待／欠席 | 広いevent関連では参加との差が落ちる | INVITED_TOが参加と独立 | **参加＋invitedは意味を変える** | 招待の文脈限定なら可 | 招待predicateに必要な型だけ | M2、参加Roleにしない |
| E03 参加 | PARTICIPATED_INの広い命題で足りる | ATTENDED等を増やす意味差は要審査 | roleなしの参加を保持 | Membres原語を無審査でrole化しない | 無限定と条件無指定の境界を共有 | 広い参加＋必要な時のM3 |
| C01 能力の称賛 | ATTITUDEでは内容とaspectが落ちる | PRAISES / ADMIRES / RESPECTSの語義審査が必要 | 狭い評価predicate＋対象aspectが候補 | 科学会議の運営評価は固有値 | 登録した限定の型処理のみ | M2＋M3候補、原書簡と語義は保留 |
| C02 理論批判 | 関連では評価対象が消える | CRITICIZESは実対象を端点へ | aspectは使えても**対象を人物へ代入不可** | 理論の具体性は固有に保持 | 機構では未モデル化対象を解決不可 | 対象モデルを決めるまで保持・保留 |
| C03 読書による影響 | 関連と影響は違う | INFLUENCED_BY候補、現行端点受入は未完了 | 推論aspect・読書媒介を保持可能 | 哲学著述の集合は一冊と違う | 条件処理は共有可、来歴・対象審査は不可 | 狭い影響候補、原版と端点は保留 |

### 肯否・比較・nullを共通化する時の最低境界

- Claim identityは内部UUIDを維持。内容キーは同一性・MERGE・自動重複削除に使わない。
- 比較キーには**実対象、predicate、意味に関与する型付き限定、scope、期間の値・精度・未指定**を含め、polarityを除く。同一内容候補はpolarityも含める。期間重複や年／日精度の対応は自動矛盾判定をしない。
- 招待のaffirmedと参加のdeniedは同一命題の対立ではない。称賛と批判と影響も強度・肯否の違いではない。chairの否定は一般参加の否定ではない。
- D02は結果・参与者・変化時点の確定前に二項比較キーを完成させない。D03にRelationキーを割り当てない。C02/C03は実対象の同定が型処理より先。
- 限定未指定Claimは、その限定を主張していない。全role／全aspectの肯定ではない。検索条件の「絞らない」は対象集合への制限なしという別契約。
- 条件はLIMIT前。将来、型付き条件のcanonical表現・版をdataset／起点とともにcursorへ拘束し、探索世代を変える。role=chair条件はroleなし参加から推測しない。
- GraphのSPO表示束は比較キーではない。現在のrelatedClaimIdsは広い関連候補。限定の違う肯否を「異説あり」と誤表示しない見直しは実装時に必要。今回は表示変更なし。

## 6. A/B/Fと合わせた仮説の評価

| 仮説 | 支持する例 | 制限・壊す例 |
| --- | --- | --- |
| 独立命題差はpredicate | Bのparent／spouse、Dの包含／時間的継承、Eの招待／参加、Cの称賛／批判／影響 | D02ではpredicateの細分だけで参与者・結果・法人同一性を復元できない |
| 同じ関係内の立場・方式は限定 | AのVisitor／Associate professor、E01の参加として明記されたchair、C01の能力aspect | E02のinvitedは参加Roleでない。C02の理論対象はpersonのaspectだけで代替できない |
| 型の共通処理は再利用できる | 制作Role、Aの立場、Eの参加役職に適用先・null・比較・取得条件の共通責務がある | 共通role enumは自然でない。organization Visitorとevent chair、ISBN scopeと開催回scopeは別値／別構造 |
| 一つの二項モデルで全て表現 | A/Bと今回の多くの参加・評価は二項候補になる | D02の合併の多項性、D03の名称履歴、C02の未モデル化対象は範囲外 |
| 派生方式を排他enum化できる | F02はremakeと記述 | F01はadaptation/remakeが併記され、この追加調査でも排他性は未解決 |

今回の資料は主として肯定的な事実記述である。E02の欠席やC02の批判は負の意味を含むが、「同一限定命題について肯定と否定の独立Sourceが対立する」サンプルではない。肯否の整合は契約検証に使えても、実在の矛盾解消ルールを導いたとは言わない。

## 7. 今回の十の問いへの回答

| 問い | 推奨案／残る制限 |
| --- | --- |
| PART_OFとPREDECESSOR_OF | 独立predicateが自然。現在の同時点包含と、時間をまたぐ継承は肯否・方向・時間規則が異なる。純粋継承の受入例は未確保なのでcatalog追加はしない |
| 改称はRelationか | 同一性が確認された単純改称はEntity名称履歴。似た名前だけなら同一性は保留。D03は自己前身Claimにしない |
| 合併を二項で十分表せるか | 参与二者の要約なら可能。全参与者・結果・継続性・同じ一回の変化を保証するには不十分。D02は原資料を保留し正式多項モデルを先行しない |
| 参加＋roleで議長を表せるか | この資料の参加を伴う会議議長なら自然。名誉議長・委員会長の一般化、invitedの参加化は不可 |
| 特定開催回のEntity | 今回の参加・chair・招待には必要。seriesを参照するだけでは1927回を限定できない。event期間と個人期間は分離。今回は研究refのみ |
| respect／criticize／influence | 独立命題として扱う。C01がどの語彙に適合するかは原書簡と語義を審査。批判はdenied influenceでない |
| attitude対象aspect | 実対象がpersonの能力等なら限定候補。実対象が学説／作品の場合、作者personを代入してaspectで誤差を隠さない |
| organizationとeventの限定構造共有 | 型・適用先・原語／言語・未指定・比較処理は共有可能。立場の値集合、制度、scopeは別。event開催回のidentityは限定の共通化とは別責務 |
| domain値と共通機構 | domainは意味・値・同義対応・scopeの妥当性を定義。共通機構は登録型の検証、条件正規化、比較、cursor等を実行。全領域共通role enumへ潰さない |
| 共通機構の最低範囲 | 既存制作限定と、新しい組織立場限定の**二つの実利用者**で重複した処理だけ共有する。値やscopeを任意key/valueへ変更せず、登録された有限の型・専用handlerまで |

## 8. 現行コードとの接続と未実装の責務

確認した現行コード：`lib/domain/predicates.ts`、`lib/domain/contribution.ts`、`lib/domain/exploration.ts`、`lib/domain/api.ts`、`lib/server/queries.ts`、`lib/server/neighbor-cursor.ts`、`lib/client/graph-presentation.ts`。現4語彙の端点制約にD/E/B/Fを無理に通さない。

- 制作限定は専用のstrict schema、4 Role、publication ISBN scopeと原語／言語を持つ。組織／eventにこの値集合やscopeを流用しない。
- `comparisonCategory`は制作Role／ISBN比較の小さな分類であり、全限定・期間の意味比較機構ではない。直接汎用化せず、次の二用途で必要な境界を決める。
- 取得queryはpredicate条件と制作Role条件をLIMIT前に適用。cursorは実効条件とdataset等へ拘束。既存の探索世代・受理ページ・開閉復元を再利用できるが、新型条件の契約は次Phaseで決める。
- DisplayRelationはSPO集約を維持し、制作以外の肯否混在は現在「異説あり」。組織限定導入時に、Visitor否定とProfessor肯定を対立扱いしない局所見直しが必要。
- Entity概要の件数表示は圧縮UI。元資料の役職が条件検索できないschema不足、詳細で原語が読みにくい情報階層、概要の圧縮を別問題として扱う。今回UI再設計なし。

**機械に載せられそうな責務**：登録された限定型・値・適用先、原語言語欄、未指定の型境界、内容比較の決定性、LIMIT前取得、実効条件キー／cursor、未対応型の拒否、語彙契約の変更票。今回はそれらを新実装した意味ではない。

**人間／個別契約に残る責務**：職位の同義性、参加を伴う役職か、招待の方向、評価の実対象、改称の同一性、合併の法人継続性、引用来歴、派生方式の非排他性。namespaceやvalidatorで意味審査を代替しない。

## 9. 次Phaseの最小範囲と着手判断

これ以上同種サンプルの件数を増やすより、**Aの時期別組織立場と既存制作Roleを使う小さいVertical Sliceの意味契約・実装範囲を決める段階へ進む**ことを推奨する。汎用ontology採用ではなく、二用途で処理共有の価値を実測する段階。

次Phaseで先に決める：

1. A01のVisitor限定の人間受入（広い既存C05受入から引き継がない）。A02の狭い事実受入から型ID採用を分離し、Visitor／Associate professorの有限値と原語、未指定、年精度期間の契約を確定する。
2. AFFILIATED_WITHへ限定を足しても広い既存契約を変えないこと、肯否は立場・scope・期間を含む命題へ掛かることを明文化する。
3. 制作と組織の二用途に必要な型検証／比較／条件処理の共有範囲を決める。任意型のplugin基盤や全role統一は作らない。既存API／凍結datasetとの移行は次Phaseで具体化する。
4. 条件LIMIT前、条件拘束cursor、開閉・休止復元、関係詳細と原表記への復帰、限定違いの肯否表示を一つの縦経路で検証する。
5. D/E/Cは型の誤適用・対象置換・無根拠の参加含意を防ぐ**反例の契約チェック材料**にする。家族・派生・event・合併・理論対象まで同時実装しない。

後回し：純粋継承の追加資料、合併の定款／多項モデル、期間付き名称schema、eventの正式導入、C01/C03原版照合と態度語彙、対象理論のEntityモデル、F01方式値。これらの意味を共通型で解決済みと扱わない。

**実装へ進む最小案を次Phaseで決める状態には達した。現在の受入と今回のレビューだけで、全D/E/Cをseed／catalog登録できる状態ではない。**
