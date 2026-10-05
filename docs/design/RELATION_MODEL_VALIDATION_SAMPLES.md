# 関係モデルを比較する実データサンプル構成

2026-10-05 / Phase 11。設計案。今回実装するのは既存datasetの固定開始例のみ。新Claimの受入・投入、新predicate／Role／qualificationの採用は行わない。

[意味契約](PREDICATE_CONTRACTS.md)、[関係語彙レビュー](RELATION_VOCABULARY_REVIEW.md)、[制作Role契約](CONTRIBUTION_ROLE_CONTRACTS.md)、[科学観察](../archive/phase-10-science-pilot/IMPLEMENTATION_SCIENCE_PILOT.md)を基準にする。完全なontologyや自由key/value方式を結論として先取りしない。

## 1. 現在の不足と既存の比較材料

漫画v1の9 Claimはv2にも残っているので合算しない。v2の14 Claim（広い制作8、人物影響1、限定制作5）と科学v1の8 Claimを合わせた**22独立Claim**を既存比較材料とする。物理的統合や再seedは不要。demoは別途、否定・異なる期間・複数Citation・同名・循環・共有・空状態の回帰に使う。実在する否定を架空に作らない。

既存材料で確認できるもの：広い制作と刊行物限定Roleの並存、別Roleの肯否を対立認定しない比較、SourceとClaim件数の分離、研究者の原職位をCitationへ残した場合の情報損失。科学のVisitor／Professor／Director等は同じ限定schemaで保存しているのではない。制作Roleが非制作にも再利用できると証明した扱いにしない。

不足しているもの：同じ二者の役割の変化、対称関係、異なる命題が同時成立する態度、組織同士の階層と時間的継承、出来事への参加、作品の派生と影響。端点kindが異なるだけでなく、方向・対称性・時間・限定対象・主張者の違いを検証する。

## 2. 推奨構成と件数

以下は**追加候補の枠**。事実として全件を認定した一覧ではない。受入可能な資料が不足した枠は減らす。逆向きのコピー、同じ関係のSource違い、限定を付け直しただけの版を件数達成に使わない。

| 枠 | 新規候補の目安 | 題材・資料の状態 | このサンプルで判断できること |
| --- | ---: | --- | --- |
| A 同じperson→organizationの変化 | 2–3 | ハイゼンベルク→NBIのVisitor 1924–25とassociate professor 1926–27。前者は科学C05で既存、後者が新規候補。さらに同じ人物・同じ機関の学生→教員等を公式略歴から一組収集 | 職位をpredicateに分けるか、関与の限定にするか。期間変更だけで職位変化を表せないこと、肩書と雇用種別の区別 |
| B 家族person→person | 4–5 | キュリー家の親子と配偶者を中心にする。siblingは資料に明記される場合だけ追加 | parentの方向とspouse/siblingの対称性を、単一の広いRELATED_TO＋typeで扱う利点があるか。制作Roleの流用が不自然な反例 |
| C 態度・評価・影響 | 2–3 | 既存浦沢→手塚の影響を対照。科学C09は保留維持。追加の尊敬／批判等は本人の文章の全文文脈から選ぶ。今回は確定人物ペアなし | 好き・尊敬・影響は段階や肯否ではない。批判対象が人か作品・学説か、発言時点・対象aspectが必要か |
| D organization→organization | 2–3 | NBIとコペンハーゲン大学の組織構造、およびラジウム研究所／キュリー財団の統合史を候補資料から再確認 | 構造上の包含と前身／後継は別命題。改称＝別Entityか、合併を二項関係だけで言える範囲はどこまでか |
| E person→event | 2–3 | 1911または1927の**特定回**ソルヴェー会議。公式の参加者記録／議事録を収集 | 参加と議長等を同じRole限定で扱えるか。event自体の日時と参加期間は別、招待／写真掲載だけで出席を認定しない |
| F work→work | 2–3 | 『七人の侍』→派生作品、『用心棒』→派生作品を映画資料で確認。派生作品→元作品を保存候補方向とする | adaptation/remakeと影響は別命題。媒体の変更と制作上の役割は異なる。原作全体／部分・版を限定すべきか |
| 合計新規 | **14–20** | 下限優先、弱い資料で埋めない | 既存22と合わせ**36–42 Claim程度** |

v1由来の広いClaimと限定Claimは、正当な別命題・受入記録がある時だけ別IDで残す。比較中の5つのschema案に同じ事実を投影しても、5 Claimと数えない。手続き上「再確認して限定版を作る」場合の増分は別記する。

## 3. 実資料・候補命題・受入状態

確認日2026-10-05。下記は調査入口と、本文または検索抄録で確認できた範囲。**全件未受入**。web取得不能と資料が主張を支持しないことを区別する。原文・言語・所在・取得時点・版・人物／組織粒度・限定・判断理由を次の収集台帳に残す。

### A：まず一つの同じ二者・異なる役割

[NBI公式Heisenberg紹介](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/werner_heisenberg/)の本文にはVisitor 1924–1925とassociate professor 1926–1927が別記されている。C05の訪問期間を延ばさず、後者を別の候補命題として収集する。訳語「助教授」を日本の職制と同一視しない。制作のSUPERVISION等へ変換しない。

第二の時期変化ペアは未選定。Student／Professor／Directorの全種類を揃える必要はない。まず異なる資料由来でも同じ時期・同じ職位なら同じ限定候補、異なる役割なら別限定になることを検証する。資料にない役割deniedを生成しない。

### B：キュリー家の非制作関係

[NobelのIrène略歴](https://www.nobelprize.org/prizes/chemistry/1935/joliot-curie/biographical/)の検索抄録はPierre／Marieの娘、および1926年からFrédéricの妻との記述を示す。直接取得は403であり、全文と版の確認を次の収集段階へ残す。

候補：Pierre→Irèneのparent、Marie→Irèneのparent、IrèneとFrédéricのspouse。MarieとPierreのspouseは別の公式略歴で確認し4件にする。Èveとのsiblingは次の明示資料が得られれば5件目。親が共通という計算だけで自動生成しない。biological/adoptive等の区別が明示されなければ付けない。配偶者関係の終期を死亡日から補わない。

方向付きparent、対称spouse/siblingを少数で比較できるため、最初から広いFAMILY_RELATED＋roleを採用する理由は弱い。これは推奨仮説であり語彙審査前の候補。家族データ公開の範囲は亡くなった歴史的人物を基本に限定する。

### C：態度と影響は関係の強弱へ潰さない

科学C09は掲載テキスト帰属・原版・翻訳・年代・意味の受入待ちを維持する。今回は新たな受入判断を作らない。[NobelのEinstein教材](https://educationalgames.nobelprize.org/educational/physics/relativity/postulates-2.html)はMach等の影響に言及するが、本人証言ではなく教育的な説明で、影響のaspectと対象が人物／原理／著書のどれかを再確認する調査入口に留める。

「尊敬した人物」「批判した人物」の確定候補はまだない。本人書簡・講演の全文と対象箇所を先に収集する。学説への批判をその提唱者への態度へ変換しない。好き＝弱い影響、批判＝denied influence、尊敬＝強い好きという補完はしない。立場の表現と、資料の著者が歴史的影響を述べることも区別する。

### D：階層・継承と同一性

[大学公式QDev紹介](https://qdev.nbi.ku.dk/about/)はQDev→研究group→NBI→Faculty of Science→Universityという異なる粒度を示す。NBI→大学の上位所属を候補にするなら、直接の親組織か複数段階の所属かを組織図で確認する。「大学サイト上にある」だけを根拠にしない。

[ENS/CAPHÉSのアーカイブ案内](https://caphes.ens.fr/institut-curie/)は1970年のFondation CurieとInstitut du radiumの統合、翌年の研究室名称を記す調査入口。[Musée Curieの年表](https://musee.curie.fr/blog/la-creation-de-la-fondation-curie-chronologie)は検索抄録を確認できたが直接取得は403。統合前二組織・統合後組織の同一性と法的／研究組織の粒度を資料で確定するまで、前身／後継をseedしない。旧称NBIの改称を別組織の後継に作り替えない。

CERNとUNESCOの[公式沿革](https://home.cern/about/who-we-are/our-history/)は設立過程での会議を述べるが、それだけで親子／提携関係とは言えない。**無理な組織間Claimを拒否する境界例**として保存する。

### E：特定回の会議、参加という命題

[NobelのCurie資料](https://www.nobelprize.org/prizes/themes/marie-and-pierre-curie-and-the-discovery-of-polonium-and-radium/)は1911年会議への招待・訪問に言及する調査入口。[1927年紹介](https://educationalgames.nobelprize.org/educational/physics/quantised_world/intro-3.html)には参加者図の入口がある。次に公式会議記録／参加者氏名caption・議事録を確認し、2–3名だけ採用する。今回event Entityを新規実装しない。会議seriesと第何回という開催回を混同しない。議長・主導は参加者一覧から認定しない。

### F：作品同士で直接確認できる派生

[BFIの2021年紹介](https://www.bfi.org.uk/news/bfi-japan-autumn-programme)本文はSeven Samurai→The Magnificent Sevenのadaptation、Yojimbo→A Fistful of Dollarsのremakeを明示する。2組を候補にできる。ただし映画の年・リメイク版・シリーズを同定し、権利／クレジット・原作のkindと粒度は次に確認する。同ページの他作品への影響は紹介記事の評価なので、本人証言・制作資料と区別する。

原資料の「adapted」「remake」を共通DERIVED_FROM＋derivationTypeにするか、ADAPTED_FROM／REMAKE_OFへ分けるかの良い比較材料。人物向けINFLUENCED_BYへwork端点を黙って追加しない。個々の資料が両語を重ねて使う場合は同義・包含・別命題を人が審査する。

## 4. 比較する5方式

同じ受入候補を、DBではなく設計の比較表で表現する。各方式に「原文で述べられる範囲」「追加推論」「条件で取得可能なもの」「必要なvalidator」「肯否の対象」「period/scope」「向き／対称性」「失われる意味」を記入する。

| 方式 | 利点 | この構成で露呈する制約 |
| --- | --- | --- |
| 広いpredicateのみ | 少数語彙で取り込みやすい | Aの職位、Bの親子と配偶者、Fの派生と影響が検索・比較で消える。注記で救えることと構造化済みは別 |
| 細分predicate | Bの親子／配偶者、Dの階層／継承等の異なる命題を明確にする | Aの全職位・版・領域をpredicateへ展開すると語彙爆発。逆向き語彙も増やす必要はない |
| predicate＋typed qualification/Role | Aの関与種別や既存制作Role・publicationを型検証できる | Bの命題差までRoleと呼べるか、適用先・nullの意味・資格と雇用の区別を契約にしないと広すぎる |
| domain固有qualification | 原職位や特殊な刊行物限定を精度高く記述できる | domainをまたぐ共通条件が作りにくい。意味が同じに見える訳語でも同じ値とは限らない |
| 共通のtyped qualification機構 | 必須要素・言語原表記・scope・比較・cursor等の共通処理を再利用できる | 値の意味まで共通化できるとは限らない。自由key/valueは適用先、型、否定対象、条件取得を保証しない |

共通化できる可能性が高いのは、Claim ID／Source／Citation、period・限定原文・受入記録、限定を含む命題へのpolarity、条件をLIMIT前に掛けること、cursorの実効条件拘束。**値の同一性や意味まで共通化するかは未決定**。既存publication scopeをorganizationの職位へ流用しない。

「参加(role=議長)」の否定と「参加(roleなし)」の肯定は別命題候補。対称配偶者の保存方向は正規化一方向と表示両視点が候補だが、対称性だけで二件のClaimを保存しない。未指定限定は全種類を認定せず、未知・未構造化・限定なしの違いを資料に即して審査する。

## 5. Predicate候補・限定候補・原資料に留めるもの

候補名は便宜的な設計記号で、ID予約やcatalog変更ではない。

- Predicate候補：PARENT_OF / SPOUSE_OF / SIBLING_OF、PART_OF、PREDECESSOR_OF、PARTICIPATED_IN、ADAPTED_FROM / REMAKE_OF。REVERES / CRITICIZEDは直接人物を対象とする資料が得られてから。既存INFLUENCED_BYの端点拡張も語彙変更レビューを経る。
- typed限定候補：組織関与の立場・職位、参加上の役割、派生の方式、対象aspect、期間、資料で限定された版／巻。ここで全domain共通Role IDを作らない。
- 原文保持のみ：曖昧なassistant、Privatdozent等の制度差、招待と出席の混在、所属の法的粒度、態度の対象が不明な文、曖昧な継承、影響の対象が人物か理論か未確定な文。原文を残すことは受入済みという意味ではない。

taxonomyは探索時にまとめて見つける分類。家族カテゴリに入れたからparentとspouseが同じ意味になるわけではなく、「科学Role」という分類で制度差が解決するわけでもない。taxonomyを先に作って語彙の意味審査を代替しない。

## 6. 収集・レビュー・投入の順序

1. 既存22 Claimを比較表へ載せ、凍結版の意味と限定を基準化。新しい生成物へコピーして統合する必要はない。
2. **次の収集はAの時期変化1件、Bの親子・配偶者4件、Fの派生2件を優先**。7前後の新規候補を版付き台帳へ。これだけで「限定」「別predicate」「端点の異なる派生」を比較できる。受入前に投入しない。
3. この約29 Claim分の材料で第1回モデルレビュー。最低でも対称性・限定の肯否・scope・未知値・Claim同一性と比較・探索条件を評価。件数不足を理由にレビューを遅らせない。
4. Dの組織階層／継承、Eの特定回参加、Cの一次的な態度資料を補い36–42を上限目安に第2回レビュー。合併等の多項性は二項モデルの限界として記録し、全event基盤を先行しない。
5. **受入可能な最小predicate／限定契約を選んでから**語彙比較票・型・投入・API・条件／cursor・表示の小さいVertical Sliceを計画する。現行schemaに入らない候補は台帳で待つ。広いAFFILIATED_WITHへ押し込んで先にGraphを作らない。
6. 新dataset版の生成・hash・混在guard・冪等seed・ブラウザ観察。凍結漫画／科学版は変更しない。比較用dataset分離は検証上の安全境界で、製品の分野別Graph分割ではない。

今のモデルだけではB/D/E/Fを全て通せない。**収集台帳段階の意味比較 → 必要最小のモデル変更 → 実UI観察**の順が必要。「同じUIで比較したい」ために現行predicateの端点や意味を無審査で広げない。

## 7. 評価記録と終了条件

候補ごとに原文／言語／資料版・locator／対象の粒度／受入状態、5案の表現、失われる情報、過剰に主張される情報、同一限定／別限定の肯否、双方向探索の表示、条件とnullの意味を小さいレビュー票へ記録する。管理画面・汎用ontology validatorは不要。

同じ問い（例えばVisitorだけを辿る、親と配偶者を区別する、派生と影響を区別する）を各案へ投げ、API取得前に絞れるか／詳細だけで読めるかを比較する。長い注記を省略しただけのUI損失とschema損失を別欄にする。人間の意味判断を自動類似語判定へ置き換えない。

次のデータ投入フェーズを決められる状態は、少数候補の人間受入に加え、その候補を表すpredicate・限定の意味契約、比較キー、null、方向／対称性、条件適用とcursorへの影響をレビュー済みにした時。今の段階では新データのseedは未許可・未実施。
