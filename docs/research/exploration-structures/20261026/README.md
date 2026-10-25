# 初回観測：4事例の探索構造と検索能力

2026-10-26 JST。[探索構造カタログ v1](../README.md)の最初の観測。**役割の違う制作記録を渡る条件、公開1辺による群の合流、機関記録の時間限定、書誌同定による行き止まり**を分離できた。型や面白さの評価は、この4事例で固定しない。

## 観測条件と比較の範囲

| 項目 | 今回固定した観測 |
| --- | --- |
| 公開API | 正式origin `https://plunode.net`、public-kg、revision `b74a4b00-9454-412f-af5d-1317713a543c` |
| 公開取得時間 | 2026-10-26 **02:41:39〜02:46:01 JST**。最初・最後と追加能力照合の前後で同revision。以後の増加は追わない |
| 取得範囲 | 固定18起点の全公開近傍を50件ページで最終cursorまで取得。接続先を含め48 Entity・64 Claim。全64 Claimの詳細・Citation・Sourceを取得。全KGのbackup・最新全件数・全体成分数ではない |
| 正式受入 | 02:54:11 JSTまでに既存runtimeの正式receipt **10件**を読取。既存 `Inventory.formal_receipts` が184参照を検証、issues=0。受入集合は66 Entity・51 Claim・44 Source・52 Citation。公開状態は別に照合 |
| 受入と今回の範囲 | 64 Claimのうち当該receipt集合と対応する9件は、UUID・端点・predicate・肯否・Role・scope・期間が公開APIと一致。今回の4事例に**確認された受入済み未公開Claimはない**。この照合で他領域の未公開0件を主張しない |
| 保存レビュー・Worker | GitHub `codex/collection-control` の固定 `c189e0634c5c18596df968f68a48003da2153056`。Issue #16の結果・status・再利用レビュー・preparationの4 blobを接続ツールで確認。保存mirrorのbyte/hashと一致 |
| 検索コード監査 | main固定 `d1e3b99603645f327f5d98c61bc6aa73cbd2bc6a` とファイルSHA-256。実行APIの対応状況は別途実測。公開APIから配置物の厳密なGit SHAは取得できず、同じ配置コードと断定しない |
| 過去の基準線 | Issue #34の2026-10-20保存fixture／manifest／report。revision `88437056-b74f-42ab-88c0-33ed435bdccc`。その時点の公開観測と、当時の候補仮説を現在と区別 |

入力hash・定義hash・取得条件は [provenance.json](../../../../datasets/exploration-structures/20261026/provenance.json)、比較値・必要条件・10代表経路は [observations.json](../../../../datasets/exploration-structures/20261026/observations.json)。元応答、受入票の原byte相当、固定control資料は同ディレクトリのgzipに保存した。外部の出版社・NDL・日本棋院の原資料を今回再取得したものではない。

同じ18起点に接続する過去の63 Claimと比較すると、**追加1件・削除0件・検索条件に関わる内容変更0件**。この比較は端点・predicate・肯否・Role・scope・期間のfield比較であり、登録日時・Citation本文を含む全レコード不変の主張ではない。

## 1. PLUTO・浦沢直樹・長崎尚志：形だけでなくRoleの組合せを問う

**問い。**「PLUTOの制作に関わった人は、ほかの作品では何をしている？」「浦沢直樹の別作品から、別の担当者へ進める？」。S1の別作品発見と担当比較、S3の別担当者への展開を分ける。

**実際の関係構造。** [根拠索引のpluto各経路](evidence.md#pluto-billy-role)を参照。

| 成立した経路 | 段ごとの独立Claimと必要Role |
| --- | --- |
| PLUTO ← 長崎尚志 → BILLY BAT | `dbc08a85-9165-4cc8-a3af-d133c83d8f67` PRODUCING → `29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1` STORY_CO_CREATION |
| PLUTO ← 長崎尚志 → MASTERキートン | 同PLUTO Claim → `7142e160-c0d5-4358-9b70-63c03bfd44ad` SCRIPT_WRITING |
| PLUTO ← 長崎尚志 → MASTERキートン Reマスター | 同PLUTO Claim → `4ad66ba5-a65d-4942-939e-c84a67e735d9` AUTHORSHIP |
| PLUTO ← 浦沢直樹 → MASTERキートン Reマスター ← 長崎尚志 | `839b0bb8-1781-4a3e-8446-9a22d08d1658` → `88c2e0d1-f65e-4d6c-818d-3a7f39d9b45f` → 上記長崎AUTHORSHIP Claim |

PRODUCINGはPLUTO第1巻ISBN `9784091874313`、STORY_CO_CREATIONはBILLY BAT第4巻 `9784063729221`、SCRIPT_WRITINGはMASTERキートン完全版第1巻 `9784091841612`、ReマスターのAUTHORSHIPは `9784091867261` に限定された記録。別作品のscopeを同じISBNに揃えず、各段で保持する。広いClaimも並存し、同じ資料を引用している限定Claimと二重に証拠を強めない。

**現在の対応。** 本番GET other-worksは11経路、work-creatorsは9経路、いずれもscanの制限理由なし。肯定・完全経路を探すPOST other-worksも11候補、hasMore=false。ただしPOSTは `claimCoverage=witness-only` であり、各候補の最初の成立証拠だけ。今回のPLUTO→長崎→BILLY BATでは広いClaimが証拠になり、Roleのある全Claimを返す一覧ではない。担当比較にはClaim詳細・relatedClaimIdsまたは今回の全近傍記録が必要である。

全段PRODUCING指定は0件。PRODUCING→STORY_CO_CREATIONの段別指定は未対応（未知queryとして400）。**データは存在するが、問いを正確に指定する検索能力が不足**している。scopeとRoleは現行モデルにあり、新predicateや新収集はこの代表例の解決条件ではない。表示上も広いClaim一つから役割を推定してはならない。

探索の価値仮説は、同じ人物の「担当が違う」ことを原資料へ戻って比較できる点。11という頻度の多さを面白さの順位にはしない。

## 2. ヒカルの碁・小畑健・バクマン。：公開1辺が旧2群をつなぐ

**問い。**「ヒカルの碁の作画担当の別作品は？ そこから別の原作担当へ進める？」「追加されたどの記録で、どこまで辿れるようになった？」。

**実際の関係構造。** `ヒカルの碁 ← 小畑健 → バクマン。 ← 大場つぐみ`（S1／S3）。[Claim・根拠索引](evidence.md#hikaru-bakuman)。

- 小畑→ヒカルの碁：`7ae1c51b-9ba0-46fb-a070-41ac310e8c94`、DRAWING、scope=null、両期間端不明。Citation `995e3891-aa9c-4af6-a2ba-3114dfb61fec`／Source `932fb74b-9292-4fb9-9f8a-29ce35d83823`。日本棋院の作品単位の作画明示。特定ISBN・全巻・全版の証明ではない。
- 小畑→バクマン。：`cd294bb9-a7de-4f21-95c2-84b878c0e7cc`、AUTHORSHIP、ISBN `9784086196901` の出版社著者欄。DRAWINGへ読み替えない。
- 大場→バクマン。：`48a9f51e-beb1-4c3a-9c30-5923bc852925`、ORIGINAL_STORY、同ISBNのNDL責任表示。両人の接続を新しい人物間の共作Claimにはしない。

10月20日fixtureでは、ヒカルの碁＋ほったゆみの2対象群と、バクマン。＋小畑＋大場＋DEATH NOTEの4対象群は別々。現在は上記DRAWINGの1辺により6対象の一群になった。6対象すべての近傍を今回完走しており、この小群は取得範囲内で閉じている。**本番全KGの成分数を新たに数えた結果ではない**。

| ヒカルの碁からの異なる到達先（起点除外、累積） | 10月20日保存fixture | 今回の公開小群 |
| --- | ---: | ---: |
| 1段以内 | 1 | 2 |
| 2段以内 | 1 | 3 |
| 3段以内 | 1 | 4 |

旧候補資料の2／4／5は、任意の**小畑→DEATH NOTE**も追加した2辺の仮説。現在の小畑の公開近傍はヒカルの碁とバクマン。の2件で、その任意辺はない。今回の1辺だけの観測2／3／4と混同しない。DEATH NOTEへは大場を介して4段であり、現行2〜3段経路APIの範囲外。

**現在の対応。** 本番GETはS1・S3とも1経路、制限理由なし。POST other-worksも1候補、hasMore=false。全段DRAWINGまたは全段AUTHORSHIPでは各0件だが、共通Role集合DRAWING,AUTHORSHIPなら1件になる。ただしこの集合は段ごとの指定を表していない。先頭DRAWING、次AUTHORSHIP、最後ORIGINAL_STORYを正確に問う能力は不足する。

[10月21日の正式receipt](../../../verification/SAVED_EVIDENCE_ACCEPTANCE_20261021.md)の「受入済み未公開」は当時の状態。今回は同じUUID・本文・Citationが公開APIにある。公開日を今回の発見時刻やreceipt時刻から推定しない。面白さの仮説は件数増加より**以前は渡れなかった対象群へ渡れること**である。

## 3. NBI・Princeton：接続、立場、時間の意味を分ける

**問い。**「NBIに関わった人物を通じて、Princetonへの接点を探したい」「同じ時期に両方へ所属していたの？」。後者は単純な接続とは別の条件である。

**実際の関係構造。** `NBI ← パウリ → Princeton University`（S4）。NBI側Claim `c23fe1f3-fae6-43c1-9ed7-af1d94e4712c` は1922〜1923年、根拠にVisitorの記載があるが、**構造化したorganizationParticipationはnull**。Princeton側 `554bbc81-73df-498e-b867-c90219496e2f` はNobel公式の**1945年受賞時affiliation**を根拠にする広い関わりで、Claim.periodは両端不明。[両Claimの出典・locator](evidence.md#nbi-pauli-princeton)。

この経路は人物を介する接点を示す。Princetonへの移動順序、1945年からの連続所属、1922年の同時所属、共同研究・交流は示さない。資料の1945年はClaim期間ではないため、これらの記録だけでは「同時所属あり／なし」のどちらも認定できない。

対照としてハイゼンベルク→NBIには、広い1924〜25年Claimに加え、VISITOR（1924〜25年）とASSOCIATE_PROFESSOR（1926〜27年）が別Claimで存在する。`e71f548b-65c2-4032-a40f-342ab75b5d3e` と `ffbe8c65-5435-4373-85c7-c091892e51d9`。原語のVisitorが同じでも、パウリの広いClaimへこの型を補完しない。これがデータの構造化範囲の差である。

**現在の対応。** 本番GET institution-bridgeはNBI起点6経路、Princeton起点2経路、いずれも制限理由なし。一段neighborsのVISITOR指定はハイゼンベルクで1件、パウリで0件。0件はVisitorという資料記載の不存在ではなく、構造化条件に一致するClaimがないことを示す。

経路APIのorganizationPositionsと期間条件は400で未対応。一段の立場検索と、複数段の立場指定を同じ対応状況にしない。段別立場・期間検索を実装しても、受賞時点限定の構造化や未知期間が解けるわけではない。受賞時点限定は現在Citation.noteであり、意味を保存するモデル／条件契約の検討が先行する。

件数の多い所属名簿ではなく、同一人物の異なる種類の記録を通して次の機関を見つけ、資料の限定を読み分けることが価値仮説となる。

## 4. あだち充・H2・MIX・タッチ：検索不足と同定保留を分ける

**問い。**「H2と同じ作者の別作品を見たい」「タッチへ進めないのは、検索が弱いからか、データを確認できていないからか？」。

**公開済みの経路。** `H2 ← あだち充 → MIX`（S1）。`f1260c3f-2637-416f-b407-2052a7c36717` と `c72262df-ce7b-4514-9341-55d242f94bca`、両方AUTHORSHIP。scopeはそれぞれ第1巻ISBN `9784091231512`／`9784091238672`。[根拠索引](evidence.md#h2-mix)。本番GET／POST other-works各1経路で、取得制限なし。

**候補・保留。** 本番のwork名検索「タッチ」「Touch」は各0件・hasMore=false。固定controlの最新Issue #16結果はcompletedだが、内容は **published Claim再利用2件、既存保留再利用1件、新準備作品0、新準備人物0、保留1件**。Workerの完了を知識の受入・公開や保留解消と扱わない。

保留理由は `publication-identity-unconfirmed`。保存NDL `I000001790190`／ISBN `9784091218612` は題名「タッチ. vol.1」、責任表示「あだち充 原作」、genre「児童図書／漫画」。今回も漫画本体の刊行物としての一致は確認済みになっていない。旧QID候補・ISBNを新しい公開Entityへ採用せず、RoleもAUTHORSHIP／ORIGINAL_STORYへ自動変換しない。今回のAPI名検索0件は全ての別名・翻案の非存在証明ではない。

**不足の所在。** H2→MIXの検索能力は既に足りる。タッチは刊行物同定と、その媒体・原語が支持する制作Roleの根拠確認が先であり、取得上限の拡大やプリセット追加では埋まらない。受入済み未公開のタッチClaimも今回の正式票にはない。将来1作品1辺が支持されても作者中心の枝が増えるだけで、別担当者への3段単純経路が増えるとは限らない。シリーズ／続編を問うなら別の命題・根拠・モデル判断が要る。

## 優先して検討する検索能力

| 優先 | 能力候補 | この代表例で必要な理由と境界 |
| --- | --- | --- |
| 1 | **段ごとのRole指定と完全経路の証拠** | PLUTOのPRODUCING→STORY_CO_CREATION、ヒカルのDRAWING→AUTHORSHIP→ORIGINAL_STORY。既存型・既存Claimで必要性を説明できる。Roleを混ぜたOR検索で代用しない。実装する場合もまず2段の少数条件から検討 |
| 2 | **比較対象の中継人物・終点を明示して探す** | 長崎の担当差、NBI→パウリ→Princetonを意図した問いとして指定したい。現行GETに終点／中継点条件はない。今回の候補は上限内で見つかるため、性能改善の実証ではなく条件の表現能力として評価する |
| 3 | **複数段の立場条件と時間の扱いを分離して設計** | ハイゼンベルクのtyped立場を使う条件は保存済みデータで説明できる。期間の重複、期間不明、受賞時点限定は先に意味・不明方針を検討。パウリのVisitorを検索時に自動構造化しない |

取得上限の拡張は継続観測項目だが、この4事例の代表GETで上限由来の欠落は確認していないため、今回の最優先実装根拠にしない。汎用DSL・任意長最短経路・日次AI・分類／プリセット本番追加も提案しない。GraphではRole・scope・選択経路を読めることが課題だが、画面改修は完了条件に含めない。

## 検証・反映と残る判断

保存入力から同じ観測JSONを再生成し、入力hash・公開revision・ページ完走・代表経路の正規方向／支持根拠・正式票との対応を確認する。比較はデータの追加削除、Claimの条件field変更、証拠変更、検索コード変更、定義変更、取得範囲変更を独立に出す。具体的な実行結果は[検証記録](verification.md)へ残す。

本件は研究資料と手動分析CLIだけで、Web／検索runtimeに変更はない。3200は旧KG revision `82b01515-594c-48ca-b4b6-515eefac83ca`、本番は上記新revision。betaの匿名HTTPは403で、今回その経路は確認できない。環境間のデータ差を同期・修復せず、再build・配置・DB操作を行わない。研究branchの成果を実行環境へ直接配置しない。

次の判断は、段別Role条件の小さい実装を選ぶか、時間限定の意味検討を先に行うか。担当差や群の橋渡しの面白さは利用者による評価が残る。タッチの同定・Roleの確定、パウリのtyped限定や受賞時点の扱いは人間の意味判断を要する。今回の分析・再現成果を完成させるための追加承認・人間操作は残さない。
