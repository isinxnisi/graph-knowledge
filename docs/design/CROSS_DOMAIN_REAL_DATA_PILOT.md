# 別分野実データパイロット：量子物理学者と研究機関

2026-10-05。**設計・候補資料確認まで。受入済みdatasetではない。** Phase 09のコードを基準に、5人物・3 organization・9 Claimの受入候補を提案する。DB・API・UI・schema・fixture・凍結pilot・語彙は変更しない。以下のP/O/C/S番号は文書内参照用であり、内部UUIDや外部IDではない。

## 結論と目的

ゲッティンゲン大学、コペンハーゲンの理論物理学研究所（現ニールス・ボーア研究所）、ケンブリッジ大学に関わった5名を第一候補として採用することを推奨する。まず既存AFFILIATED_WITHとINFLUENCED_BYだけで、機関を介した合流、人物間の明示的影響、起点変更・復帰を検証する。work・制作Role・新分類体系は必要ない。

これは1920年代を主な接点とする小さいネットワークであり、全Claimを1920年代の同時在籍として扱う企画ではない。ディラックのケンブリッジでの教授期間は1932〜1969年。年代を同じに揃えるために資料を弱めたり、期間を切り詰めたりしない。

候補9件のうち8件は人物→機関の広い関わり、1件はハイゼンベルク→ボーアの明示的な知的影響。全件、人間の受入判断はまだ必要。期間に不整合がある資料から所属開始日を確定しない。影響候補を受け入れられなければ8件の機関経由だけで開始できるが、人物間の影響を含む検証は未達と報告する。

## 読んだ現行設計とコード

[PROJECT_CONTEXT](../PROJECT_CONTEXT.md)、[ARCHITECTURE](../ARCHITECTURE.md)、[複数分野レビュー](CROSS_DOMAIN_EXPLORATION_REVIEW.md)、[Predicate契約](PREDICATE_CONTRACTS.md)、[既存パイロット](REAL_DATA_PILOT.md)、[関係俯瞰レビュー](ENTITY_RELATION_OVERVIEW_REVIEW.md)、[Phase 09実施記録](../archive/phase-09-entity-search/IMPLEMENTATION_ENTITY_SEARCH.md)を基準とする。

vocabulary/catalog.jsonの意味定義、lib/domain/predicates.ts・fixture.ts・dataset.ts、lib/server/queries.ts、components/EntityOverview.tsx・ClaimDetails.tsx、lib/i18n/entity-overview.ts、lib/client/graph-presentation.tsを照合した。検索はperson/work/organization、近傍はSUBJECT/OBJECT両方向。表示Relationはsubject/predicate/objectの三つ組。概要は公開Claimをpredicate・視点・肯否・制作Roleだけで集計する。非制作の役割・学生／教員の区別を構造化する契約はない。

## 選定理由と代替案

- 機関が主な接点になる。作品の共通クレジットに依存せず、大学を逆方向から辿れる。
- ハイゼンベルクとパウリが二機関を共有し、開閉・共有対象・循環を小さい連結成分で確認できる。
- 教員、助手、Visitorという異なる原表記があるため、「広い関わり」と具体的な関与の情報差を評価できる。
- 大学・研究所の公式紹介、CERNアーカイブ、本人の回想の公開テキストを確認できた。
- ディラックを介して第三機関へ進め、2つの密な機関と1つの端の機関を比較できる。

単なるノーベル賞受賞者一覧や引用ネットワークでは、人物間の意味を推測しやすい。映画の制作クレジット追加では今回避けたい制作中心の構造を揺さぶりにくい。この題材で候補を作れるため、別題材へ切り替える必要は現時点ではない。歴史全体の代表性・国や性別の均衡を達成したサンプルではなく、モデル検証の範囲を明示する。

## 候補Entityと同一性

| 文書ID | 表示名候補 | kind | 原語名・検索別名候補 | 同一性の注意・確認資料 |
| --- | --- | --- | --- | --- |
| P1 | ニールス・ボーア | person | Niels Bohr | Aage Bohrと別人物。S1/S2 |
| P2 | ヴェルナー・ハイゼンベルク | person | Werner Heisenberg | S3/S4/S9。日本語表記・中黒なし等は次段階の名称受入で確認 |
| P3 | マックス・ボルン | person | Max Born | S5。Bornを原語名とし、日本語表記を関係の意味キーにしない |
| P4 | ヴォルフガング・パウリ | person | Wolfgang Pauli | Wolfgang **Paul**とは別人物。S6/S7 |
| P5 | ポール・ディラック | person | Paul A. M. Dirac / Paul Adrien Maurice Dirac | S8/S10 |
| O1 | ゲッティンゲン大学 | organization | Georg-August-Universität Göttingen / University of Göttingen | 都市Göttingen、学内研究所、Max Planck研究所と別。S3/S5 |
| O2 | ニールス・ボーア研究所 | organization | Niels Bohr Institute / Niels Bohr Institutet / University Institute of Theoretical Physics | 旧称と1965年改称はS2/S11で確認。コペンハーゲン大学そのものとは別Entity |
| O3 | ケンブリッジ大学 | organization | University of Cambridge | Cambridge市、St John's College、Cavendish Laboratoryとは別。S10 |

O2は資料が旧研究所と現研究所の連続性・改称を直接説明しているため同じ組織の名称候補とする。大学全体への関わりを研究所へ転写する／研究所への関わりを親大学へ自動追加する処理はしない。今回コペンハーゲン大学を第四のEntityへ増やす必要はない。

QIDは今回照合・確定していない。資料で人物／機関の同一性を確認したことと、Wikidata外部IDの受入は分ける。次段階では8 Entityだけ個別照合し、名称・組織粒度・旧称を確認する。QIDが未確認なら外部IDなしでも内部UUIDで成立する。曖昧なQIDを埋めない。既存漫画pilotとの同一性照合・物理統合は今回対象外。

日本語名は上表の表示候補、資料の原語名と原表記の言語を収集記録に残す。英語・ドイツ語・デンマーク語のページを同じ日本語訳で置換しない。現行APIのname/aliasesへ投影しても、収集台帳に言語・出典・翻訳／採用判断を残す。

## 確認した資料

確認日はいずれも2026-10-05。Sourceは読んだWebページ（kind=web）とし、大学沿革も本人文章の転載も元の本や講演を直接確認したSourceとして偽装しない。S9は一次証言を掲載するサイト上の英語テキストで、原講演・原版・翻訳者の照合は未完了。

| Source候補 | 資料・発行主体 | 言語／公開日候補 | 確認箇所・位置づけ |
| --- | --- | --- | --- |
| S1 | [Niels Bohr](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/niels_bohr/)・NBI／コペンハーゲン大学 | daページ、対象欄en／2010-06-02 | 本文の研究所役職欄。Director表記と期間を確認。ただし開始年にS2との不整合 |
| S2 | [The establishment of an institute](https://nbi.ku.dk/english/www/institute/History/history/)・NBI、著者Finn Aaserud | en／Web公開日不明 | 研究所の沿革、旧称、開設、ボーアの設立活動。見出しの1921-01-01は沿革上の時点で、公開日やClaim開始日ではない |
| S3 | [Werner Heisenberg, Physics](https://www.uni-goettingen.de/en/62607.html)・ゲッティンゲン大学 | en／不明 | 冒頭経歴。助手、1924年の資格取得、その後のPrivatdozent。都市と別研究所を区別 |
| S4 | [Werner Heisenberg](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/werner_heisenberg/)・NBI | daページ、対象欄en／2010-06-02 | 研究所欄。Visitor 1924-25とAssociate professor 1926-27を別の記述として確認 |
| S5 | [Max Born, Physik](https://www.uni-goettingen.de/de/62603.html)・ゲッティンゲン大学 | de／不明 | 冒頭経歴。1904〜1907の学業、1909以降のPrivatdozent、1921から教授との記載 |
| S6 | [Wolfgang Pauli's biography](https://archives.web.cern.ch/Pauli_archive/biography/)・CERN Archives | en／不明 | 冒頭、学位後の経歴段落。winter term 1921-1922のゲッティンゲン大学での助手。参考文献番号も保持対象 |
| S7 | [Wolfgang Pauli](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/wolfgang_pauli/)・NBI | daページ、対象欄en／2010-06-02 | 研究所欄。Visitor 1922-23 |
| S8 | [Paul A.M. Dirac](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/paul_dirac/)・NBI | daページ、対象欄en／2010-06-02 | 研究所欄。Visitor 1926-27。受賞時所属Cambridgeの記載とこの滞在を混同しない |
| S9 | [Science as Means of International Understanding](https://files.heisenberg-gesellschaft.de/adpersonam/section-1/students.html)・Heisenberg-Gesellschaft掲載 | en／Web公開日不明 | ボーアの講義と会話を回想する連続段落。ページ題名と本文見出しに表記差がある。本人の回想を転載する資料候補 |
| S10 | [Asymptopia June 2002: Paul Dirac: predictor of antimatter](https://www.maths.cam.ac.uk/friends/node/16)・Cambridge数学部、著者Peter Goddard | en／2002-06（月精度の号） | Dirac Centennial節の冒頭と退任段落。1932〜1969のLucasian Professorを明記。Web掲載日と号の日付は別に記録 |
| S11 | [Nobel Laureates associated with the Niels Bohr Institute](https://nbi.ku.dk/english/www/nobel/associated_with_nbi/)・NBI | en／不明 | Info節。旧称と改称、常勤と短期滞在を含む一覧である旨。個人Claimには具体的なS1/S4/S7/S8を使う |
| S12 | [History of the University](https://www2.uni-goettingen.de/en/52652.html)・ゲッティンゲン大学 | en／不明 | Bornの教授開始年を1922とする記述。S5の1921と不一致。日付候補の照合資料であってdenied Claimの根拠ではない |
| S13 | [Research Profile: Werner Heisenberg](https://mediatheque.lindau-nobel.org/laureates/heisenberg/research-profile)・Lindau Mediatheque | en／不明 | Bohr FestivalをJune 1922とする経歴、研究所滞在、科学形成の記述。S9の年代不一致の確認補助。初回Claimを増やすためには使わない |

S6はwebツールではタイムアウトしたが、Python urllibによるページ本文取得で該当経歴段落を確認した。NobelPrize.orgの候補伝記は403となり、検索断片しか確認できなかったため採用資料にしていない。AIPの口述史も本文未取得のため候補根拠には使わない。検索結果の断片だけで受入可能と判定しない。

## 最初の候補Claim：9件

「採用候補」は根拠と既存意味契約が適合するという設計上の判断。**公開受入済み／seed許可を意味しない。** 全件affirmed候補。否定を述べる資料は今回確認していないためdeniedを人工的に追加しない。各Claimに少なくとも一件のsupport Citationを付けることが投入時の条件。

| ID | subject → predicate → object | 原資料の具体性と広いClaimの意味 | 主根拠・Citation locator案 | period案 | 判断 |
| --- | --- | --- | --- | --- | --- |
| C01 | P3 → AFFILIATED_WITH → O1 | 教授としての関わりが述べられる。正規化Claimは教授職・雇用そのものを認定しない | S5「冒頭のPrivatdozent／Professor経歴」 | from=null / to=null | 採用候補。教授開始年の1921/1922は保留。学業期間を混ぜない |
| C02 | P2 → AFFILIATED_WITH → O1 | 学業・助手・Privatdozentの経歴から具体的な大学との関わり。初回はこの早期経歴の確認として扱う | S3「冒頭、学業と1924年資格取得の段落」 | null / null | 採用候補。1924は資格取得年で関与開始年ではない。単一の連続在籍期間へまとめない |
| C03 | P4 → AFFILIATED_WITH → O1 | Max Bornの助手として大学に関与したとの明記 | S6「winter term 1921-1922の段落」 | 1921 / 1922、year | 採用候補。冬学期の原表記を残す。月日・雇用・人物間の制作補助を推定しない |
| C04 | P1 → AFFILIATED_WITH → O2 | Directorと設立・活動の明示から研究所への関わり | S1「研究所役職欄」＋S2「設立と研究・教育開始」 | null / null | 採用候補。S1の1916-1962をそのまま採らない。期間は保留 |
| C05 | P2 → AFFILIATED_WITH → O2 | Visitorとしての滞在を資料範囲で広い関わりにする | S4「研究所Visitor欄」 | 1924 / 1925、year | 採用候補。1926-27の別役職を同じ連続期間へ結合しない |
| C06 | P4 → AFFILIATED_WITH → O2 | Visitorとしての関わり | S7「研究所Visitor欄」 | 1922 / 1923、year | 採用候補。全期間の所属／在籍を認定しない |
| C07 | P5 → AFFILIATED_WITH → O2 | Visitorとしての関わり | S8「研究所Visitor欄」 | 1926 / 1927、year | 採用候補。Cambridgeの受賞時所属とは別の関係 |
| C08 | P5 → AFFILIATED_WITH → O3 | Lucasian Professorとしての大学との関わり | S10「Dirac Centennial冒頭／退任段落」 | 1932 / 1969、year | 採用候補。大学とCollegeの同一視、全経歴への一般化をしない |
| C09 | P2 → INFLUENCED_BY → P1 | 本人がボーアの講義と会話による自身の科学観・原子物理学への姿勢の変化を述べる | S9「Bohr Festivalの講義と散歩での会話を回想する段落」 | null / null | **条件付き採用候補・要重点人間審査**。転載の帰属／訳と、直接影響という解釈を確認。年代は受け入れない |

年は現行PartialDateの`{value:"1924",precision:"year"}`等へ投影できるが、原資料のwinter termやVisitorという限定を年だけに置換しない。nullは不明であり現在も継続・無期限ではない。periodは「この人物と機関の全関与期間」や「その範囲外は関係なし」を表さない。

C09は単なる共在・引用・後世の評価から作るものではない。本人の「将来の科学への姿勢を決めた」という回想が候補根拠で、引用箇所は例えば “These conversations left a deep impression on me.”（9語）までに留め、前後の文脈は自分の要約として残す。師弟・共同研究・理論の唯一の起源へ強めない。S9の講義年は1921、S13は1922であり、影響期間へどちらかを黙って採用しない。これは影響そのものを否定する資料対立とは別。

## 保留・除外する情報

| 情報 | 判断・理由 |
| --- | --- |
| ボーア→O2のDirector期間1916-1962 | 期間保留。S2は研究所開設を1921とし、1916は大学教授任命と説明する。1916を研究所の所属開始へ採用しない。設立日から代わりに1921を開始へ自動補完もしない |
| ボルンの教授開始1921／1922、教授期間の終わり | 期間保留。S5/S12の開始年差をそのまま残す。渡英年から雇用終了を推定しない |
| ハイゼンベルク→O2のAssociate professor 1926-27 | 今回の9件から保留。資料は具体的だが初回Visitorだけで検証可能。追加時は別エピソードとして審査し、1924〜1927連続在籍へ合成しない |
| ボルン→O1の学生1904-1907 | 根拠はS5で確認。初回は教授としての関わりだけに絞り、学生エピソードは追加候補として保留。学生・卒業生・教員を一つの役割認定にしない |
| C09の元講演年・原版のページ番号・翻訳者 | 未確定。掲載ページにない情報を他の検索断片から補填しない。現物未確認の本をSourceにしない |
| ディラック→ハイゼンベルクの影響 | 保留。S10の講義参加・研究への展開を、人物間の影響として自動登録しない。現在の初回ではC09だけにする |
| パウリ→ボルン、ハイゼンベルク→ボルンのASSISTANT_OF | 除外。学術的助手を制作補助の既存predicateへ変換すると使用済みIDの意味変更になる |
| O2での活動→コペンハーゲン大学の追加Claim | 自動転写を除外。親子組織の接続・所属伝播は未実装であり、第四機関を増やさない |
| 後年のGöttingenという地名→O1 | 除外。別研究所・都市への移動を大学所属へ変換しない。後年の名誉教授等は今回の早期経歴と分けて再審査 |

## 既存predicate契約との境界

AFFILIATED_WITHの定義は「人物と組織との関わりが資料に述べられる」であり、漫画出版社限定ではない。教員・研究員・学生・Visitorという具体的関与から、この弱い命題へ投影すること自体は意味拡張ではない。資料が述べる職位を**Claimそのものが構造化して保証する**わけではない。

| 資料の記述 | 広いClaimとしての可否 | 失ってはいけない情報・限界 |
| --- | --- | --- |
| 明示された教員・研究員・助手 | 可。組織が明記されている時 | 原職名・部局・時期を台帳／Citationへ残す。現行Claimから雇用・職位・契約を照会できるとは言わない |
| 明示された学生・学業 | 可 | 学生であることと卒業・取得学位は別。卒業生認定を追加しない |
| 明示された卒業・学位 | 広い関わりは候補にできるが今回は採用不要 | 卒業日を在籍開始・終了にしない。学位は現行predicateの出力意味ではない |
| 明示された研究滞在・Visitor | 可 | Visitorはこの資料の語。常勤／学生／雇用へ正規化しない |
| 所属者一覧だけ、曖昧な交流紹介 | 個別判断・保留 | 具体的な関わりと対象機関を確認できなければ埋めない。今回NBIの個別Visitor欄を優先 |
| 同じ都市・同じ学会参加・同じ研究テーマ | 不可 | 対象大学・研究所との関わりを示さない |

具体的な所属・雇用を「関わりがあった」に弱めて保存する場合、広い知識としては成立するが、教員と訪問者の探索軸は失われる。これは既存IDの意味が変わったという問題ではなく、必要な命題の細かさがまだ実装されていない問題。組織関与Roleやqualificationを今先行導入せず、このパイロットで需要と誤読を観察する。

INFLUENCED_BYは人物→人物の影響。C09は影響を受けた方向P2→P1を保存する。組織への所属、研究成果の引用、理論の先行、好き・尊敬、人物を介した間接経路を影響へ変換しない。追加の科学専用意味契約は初回には不要だが、実資料の意味審査は必要。職位を構造化する場合、期間・役割限定の肯否や比較キーを別フェーズで決める必要がある。

## 元資料から概要まで：失われるものの診断

「関わりがあったが粗い」だけで新predicate／Roleを要求しない。以下の層を区別して観察する。

| 段階 | 保持できるもの | 落ちる／扱えないもの | 今回の判別方法 |
| --- | --- | --- | --- |
| 元資料→収集記録 | 職位・Visitor・winter term、原語、対象機関、日付原表記、資料の不一致、帰属・限定 | 記録しなければ再取得不能になる情報 | 次フェーズで短い原表記・自分の要約・locator・取得URL／時刻／内容hash・受入理由を残す。資料全文の再配布は不要 |
| 収集記録→Claim意味 | person→organizationの広い関わり、肯否、受入可能なperiod、根拠参照 | Director／Visitor／学生等を機械的に区別する資格情報、部局、複数の非連続区間、影響の領域 | 「Visitorだけを見る」ができないのはClaimの限定不足。既存predicate定義の誤りやlabelだけの問題とは違う |
| Claim／Citation→詳細表示 | 既存Citation.locator/noteとSourceで具体的な原職位・学期・不一致理由を読める | 非制作qualificationの専用欄・並列比較・言語付き原表記。重要な説明がCitationまで降りないと見えない | noteに情報があるのに探しづらいなら詳細の情報階層の問題。note自体に記録がなければ収集／投影の欠落 |
| 表示Relation→Graph | 関係タイプ・方向、三つ組ごとの束、詳細への導線 | 具体的な機関役職と時期はGraphに出ない。同じ機関の人物同士が同時在籍に見える危険 | 線の意味を「関わり」で維持し、教師・同僚・共同研究と読まれていないか観察。期間の表示を増やして無理に解決しない |
| Claim集計→Entity概要 | predicate・主体／対象視点、肯定／否定の主張数 | 関係先種別、具体的役職、関係先、時期、distinct Relation数、Citation。件数は相手人数ではない | 「どんな関係が伸びるか」が分からず数字だけ目立つなら、概要の圧縮と提示の問題。predicateの意味を変更して直さない |

**利用者の主目的はClaim統計ではなく、どの方向の関係を辿れるかの把握。** 概要APIの正確なClaim集計は根拠層の情報として必要だが、そのまま最前面に出すことが最適とは限らない。例えばO2では「人物との関わり」、P2では「機関との関わり／人物からの影響」をまず理解したい。この言い方は観察のための期待であり、新taxonomyやUIの採用指示ではない。

現在のO2概要はAFFILIATED_WITH/objectの一項目と肯定4件が想定される。これは今回たまたま4人物・4Relationと一致するだけ。将来期間違いのClaimが増えれば不一致になる。C02の助手／PrivatdozentとC05のVisitorの違いを概要だけでは読めない。原情報がCitationに残っているなら「情報をUIが圧縮した」、機械検索が必要なら「qualificationがない」と診断する。数字を消すだけで原資料の具体性が戻るわけでもない。

Deniedしかない関係を「存在する関わり」と言い切らない前提は維持する。本候補には否定資料がないのでこの点はdemo回帰で確認し、今回の実データで確認できたと報告しない。

## この範囲で想定する探索経路と受入後の確認

すべて候補9件を受け入れた場合の期待。**実ブラウザでの操作結果ではない。** API・UI変更やseedを今回していない。

1. 「ゲッティンゲン大学」をorganization検索→O1起点でP2/P3/P4を得る。4 Entity / 3 Claim。各線の詳細で教授・助手・早期経歴の違いを読む。
2. P4を選択・展開→O2が加わる。O2を展開するとP1/P5と追加の共有線が加わる。O1とO2の間にP2/P4を介した合流・循環ができ、共有対象を閉じても別経路から残ることを確認。
3. P2の関係概要→AFFILIATED_WITH/subject肯定2件、INFLUENCED_BY/subject肯定1件。現在の取得条件がAFFILIATED_WITHだけでも、概要には影響候補が現れる。
4. O2概要→AFFILIATED_WITH/object肯定4件。Director／Visitorの区別を短時間で理解できるか、詳細まで読む必要があるかを観察する。
5. P2→P1の明示影響を選び、本人回想・影響の限定・期間不明を確認。O2を共有しているだけで他の人物間に影響を作らない。
6. AFFILIATED_WITH条件でP2を新起点に「同じ条件で見る」→P2/O1/O2の3 Entity / 2 Claim。「広く見る」ならP1への影響も含む4 Entity / 3 Claim。直前探索へ戻り、元の起点・条件・open意図・選択・受理範囲・座標・pan/zoomを確認。
7. P5を選択・展開→O3へ到達。O3からの逆方向はP5のみ、2 Entity / 1 Claim。関係概要を見ても新しい起点にしても同じ取得契約を使う。
8. 既存のCONTRIBUTED_TO Role条件を有効にしても、このパイロットのAFFILIATED_WITH／INFLUENCED_BYには作用しない。predicateをCONTRIBUTED_TOだけにすれば0件になり、未登録／条件内0件／取得失敗を区別できることを確認する。

全展開は8 Entity / 9 Claim / 9表示Relation。上限や大量ページング性能の実験ではなく、既存demoの上限／cursor回帰を維持する。候補Sourceは複数あり、同じ資料を根拠として共有してもCitation数で概要の件数を増やさない。起点変更と直前復帰の境界はPhase 08、検索の種別分離はPhase 09をそのまま適用する。

漫画pilotと異なり、organizationを中心に合流でき、人物を制作Roleから切り離せる。大学と内部研究所、常勤とVisitor、原職位と広いpredicate、影響の領域・年代不一致、異なる年の所属が同じ絵へ並ぶ誤読を検証できる。一方、論文・著書・event、新しい人物関係、他分野への実際の橋渡しは検証できない。既存漫画pilotとの物理統合をしていないので「映画→漫画」等の実際のGraph横断を確認したことにはならない。

## 次の投入フェーズの最小範囲と未決事項

推奨は上記8 Entity / 9 Claimだけを版付き台帳へ起こし、人間受入後に生成・検証・専用環境へ投入する一フェーズ。単に同じschemaが使えるだけでは現在の実行環境へ投入できない。lib/domain/dataset.tsはdemo/v1/v2しか許可せず、概要DTOのdataset enum、接続先保護・seed・表示ラベル・テスト環境にも小さい追加が必要になる。これは知識モデルの分野分割ではなく誤投入防止。今回その追加は実装しない。

投入前に決める事項：

- 9件それぞれの受入、特にC09の証言の帰属／解釈／翻訳、C01/C02/C04を期間不明の広い命題として受け入れること。
- 機関O2の旧称と現在名を同一Entityへ扱う受入、O1/O3の大学粒度、8件だけの外部ID・日本語別名照合。
- 台帳に原職位／言語／日付原表記・矛盾候補・受入理由を残す方法。非制作Roleを制作用contributionやroleEvidenceへ入れない。既存Citation.noteへの自分の要約を最低限用意する。
- 独立したdataset名・版、専用DB／ポート／Next出力、混在投入拒否と確定版冪等seed。既存凍結pilotを保持する。
- SourceのWeb公開日不明をnull、資料号の日付や沿革上の見出し年を台帳の別項目に分ける。今回年代補正は自動化しない。

今回新predicate・意味契約改定は不要。教員／学生／訪問者の機械的な条件指定、非連続期間、部局の限定、影響の領域が実際に必要と判明した場合には、非制作qualification・命題の粒度・比較キーを別フェーズでレビューする。先に汎用Role、organization間の関係、taxonomy、科学専用画面を完成させない。

概要UIは今回再設計しない。次のブラウザ観察で「関係の方向を把握できたか」「具体的な役職はどこで分かったか」「件数を人物数や重要性と読んだか」を分けて記録し、データ不足・意味モデル不足・詳細の可読性・概要の圧縮のどこを先に直すか判断する。

## 今回実施した確認

公開資料の本文閲覧と現行コードの読み取り、候補・期間・意味境界・探索期待の文書化のみ。QID照合、受入台帳・投入JSONの生成、seed、実ブラウザでの科学dataset操作は未実施。変更はこの設計文書とdocs入口のみ。文書内参照・差分を検証し、アプリコードが変わらないためtypecheck／lint／unit／integration／Playwright／buildは再実行しない。
