# Discovery：対象の位置と関係パターンの意味レビュー

後続指示で基本方針を採用。名前UIは1入力＋照合先バッジ、選択対象はB方式とする。[採用契約・実装記録](DISCOVERY_SUBJECT_CONNECTIONS.md)を現行の追補とする。以下は採用前の比較・観測記録。

2026-10-19。調査対象 `c174a12`（STEP 4aと安定性修正）。**次の実装方針の提案であり、採用済み契約・UI・API・保存形式を変更するものではない。** [共通関係契約](DISCOVERY_RELATION_CONTRACT.md)、[対象検索](DISCOVERY_TARGET_SEARCH.md)、[Entity操作統一](DISCOVERY_GRAPH_ENTITY_INTERACTION.md)を再利用する。今回は文書と公開KGの読み取りだけ。

## 1. 結論と現行の不一致

①入口を探す／②Entityを探す／③追う関係を指定する、という構造を維持することを推奨する。修正すべきは、**関係の形、結果にする位置、名前を照合する位置、Graphの開始Entityを同一視している部分**である。

現行 `other-works` revision 1は `作品A ← 人物P → 作品B`。両Claimの正規方向は人物→作品、A・P・Bは相異なる。実装上も正しくこの契約を実行しており、今回の不一致は単なるバグではなく、当初の「作品から始める」適用範囲による。

| 現行箇所 | 固定している意味・影響 |
| --- | --- |
| [`discovery-targets.ts`](../../lib/domain/discovery-targets.ts) `targetCriteriaSchema` | patternのkind未指定をworkへ正規化。person指定は不適合。応答の証拠先頭ID＝結果Entity ID |
| [`server/discovery-targets.ts`](../../lib/server/discovery-targets.ts) `targetEntitiesQuery` | qは結果Entity `e.searchNames`だけに照合。完全EXISTSをEntityのLIMIT前に評価する点は維持すべき |
| [`relation-pattern-execution.ts`](../../lib/server/relation-pattern-execution.ts) | EXISTS、最初の証拠、経路ページがいずれも作品eから始まる。関連人物の名前条件はない |
| [`relation-patterns.ts`](../../lib/domain/relation-patterns.ts) `validateRelationRoute` | 線形順序W-P-Wとroot＝先頭作品を一体で検証する |
| [`pattern-graph.ts`](../../lib/domain/pattern-graph.ts)、[`graph-state.ts`](../../lib/client/graph-state.ts) | rootはwork。追加取得sourceも作品。人物の展開は保持済み完全経路に参加するClaimと、関連する作品sourceの追加取得を使う。人物を任意の新規取得rootにはできない |
| [`DiscoveryConnections.tsx`](../../components/DiscoveryConnections.tsx)、[`discovery-connections.ts`](../../lib/domain/discovery-connections.ts) | 「対象の名前・別名」と選択Entity・先頭証拠を接続。kind変更だけで検索位置を変える処理はない |

よってA「person＋浦」は400、B「work＋浦沢」は正常0件となる。関係先の名前から作品を探す能力がないことと、公開Claimがないことは別である。

## 2. 比較した案と推奨

| 案 | 意味・利点 | 欠点・判断 |
| --- | --- | --- |
| 作品起点のまま説明を補う | 現契約・保存を変更しない | A・Bの検索方法は増えない。説明の改善だけで解決扱いにしない |
| 起点ごとに別パターンを作る | 「複数作品に関わる人物」等を独立定義でき、既存root型に近い | 同じW-P-Wの方向・Role・成立検証が重複。Graphで人物へ進むたび別パターンへ切替えると共通操作の意味が弱い。別の事実条件が必要な形には有効だが、今回は保留 |
| **登録済みの関係の形＋明示的な対象位置** | W-P-Wを一つの意味として検証し、作品／中央の人物を結果にできる。Graphは選んだEntityから同じ形を辿る | rootと証拠の先頭を分離する必要があり、API・証拠・保存まで変更が必要。**推奨** |
| 任意位置の名前を一つの入力で横断検索 | 入力操作は少ない | 対象名なのか関係先名なのか、ORかANDか分からない。無関係な証拠への付替えも起きやすい。今回は不採用 |

推奨案では、名称を一つの万能な検索文として解釈しない。有限の位置をregistryに登録し、②の「何を探すか」と組み合わせる。任意長・任意変数・複雑な式は導入しない。

## 3. 推奨する意味の分離

| 概念 | 推奨する定義 |
| --- | --- |
| 関係パターン | `other-works`の意味は「同じ人物に、異なる2作品への条件適合Claimがある」。作品同士の直接関係・影響・共同制作・同時期を主張しない |
| 結果の対象位置 | `work`：端の作品。`contributor`：中央の人物。人物は2作品への完全な証拠を必要とし、単に制作Claimが1件あるだけでは一致しない |
| 対象自身の名前 | ②のq。選んだ結果位置のEntity自身の名前・別名だけを照合。人物＋浦なら中央人物に適用 |
| 関係先の名前 | ②の別条件。初回は作品検索時の中央 `contributor` にだけ適用。例「関係する制作担当者の名前：浦沢」。qと併用したらAND。同じ完全経路のPを照合する |
| Graphの開始Entity | 選択した結果Entityそのもの。中央人物を選んでも作品を代理選択しない |
| Graphでの継続 | 適用中の③に一致する完全経路のClaimだけを受理し、通常のEntity操作で段階表示する。表示中の別Entityからも、登録された位置で新しい証拠を取得できる |

**名前条件の適用範囲は、対象を選ぶ②までとする案を推奨する。** 対象自身の名前と同様、関係先名も「なぜこの対象が候補になったか」の条件であり、③の関係そのものとは分ける。Graphには③に加えて、その名前条件を満たした完全な一致証拠を必須で渡す。初期の一致理由が別人物の経路に置換されてはいけない。

Graphでは「対象検索：制作担当者名『浦沢』で一致」「見る関係：同じ制作担当者を介した作品」の範囲を区別して示す。以後③を満たす別人物の接点も探索可能であることを明示する。検索条件をGraphの条件として表示したまま無視する実装は認めない。背後の②の条件は保持し、Graph編集で書き換えない。

代替として、関係先名を③の永続条件に含め、Graphでも全経路の中央人物を「浦沢」に限定する方式は成立する。ただしGraph編集・自由探索への切替・名前変更時の復元まで新しい限定条件の意味が必要になる。**今回は対象選択の条件とする案を採用候補、Graph全体の名前限定は保留案**とする。この範囲の違いは実装前のユーザー確認事項である。

対象kindは位置の代用品にしない。今回の形ではwork→作品位置、person→中央人物が一意なので、その対応を明示して選べる。未指定時の現行プリセットは作品を初期選択する。自由入力の未指定は「作品／人物から選択」を示し、混合結果を勝手に返さない。将来、同じkindが異なる役割で現れる形では位置の選択を別途示す。organizationやeventへの変更でpatternを解除したり、別対象を自動選択したりしない。

## 4. 型・API・証拠・Graphへの影響

以下は実装前に契約へ反映する最小案。現行v1へ意味を上書きしない。

- 関係条件の`adjacent`／`pattern`、Role・肯否の型は再利用。registryに `other-works revision 2` を追加し、形W-P-Wと対応位置work／contributorを定義する。共通条件の構造は変えず、version 1のpattern参照に登録版2を追加する。rev1は作品位置のみの既存仕様として残す。
- 対象検索POSTはrequest／response **version 2**を追加。`subjectPosition: work | contributor`と任意の`relatedName: { position: contributor, q }`をcriteriaへ追加する。初回relatedNameはwork位置だけに対応し、他の組合せは明示拒否。q・kind・位置・関係条件・関連名を正規化し、cursorとcache keyへすべて束縛する。GETとPOST v1は維持。
- 証拠 **version 2**は、完全経路のW-P-W順と、`subject: { entityId, position, nodeIndex }`を別に持つ。中央人物ならindex 1。両端は対称なので、安定した作品ID順と対応Claim順で正規化し、対象作品がindex 0／2のどちらかを明示する。証拠の一意性と結果Entityの重複排除は別処理にする。
- 共通`conditionKey`だけでは名前一致を証明できない。証拠に正規化した検索criteria・`criteriaKey`・一致した人物IDを持つ有界の`matchContext`を付ける。Graphへ渡す初回証拠は同一公開revisionで、③だけでなくこの検索条件も再検証する。qに一致した人物と別の人物の証拠を合成しない。
- Graph POST pathsも **version 2**で、取得rootの位置と完全証拠内の位置を分離する。W-P-Wを人物先頭の線形経路へ回転しない。人物→作品A→人物→作品Bでは同一人物を再訪し、別の意味になる。内部の完全証拠はW-P-Wのまま、人物をGraph rootにできるadapterを追加する。
- [`graph-state.ts`](../../lib/client/graph-state.ts)のsourceは作品限定から、登録位置を伴う取得元へ拡張。人物から取得する場合も完全証拠を直接取得し、保持済み作品ページの範囲だけを人物の全範囲としない。開閉・選択・Undo・配置・zoomは通常Graphの既存操作を継続する。

③の継続は「どのEntityでも同じ段番号から検索し直す」ことではなく、「そのEntityが登録位置に参加する同じ形の証拠を追加する」こと。workからpersonへ展開しても、Graph rootや検索時の位置は自動変更しない。未対応位置の展開は理由を示し、単純predicateへ縮退しない。自由探索への明示切替では、作品／人物どちらのrootもそのままに、制作Roleとaffirmedを維持して複数段の形だけを解除する。

### 検索処理と上限

作品位置では現行EXISTSに中央人物の名前条件を追加する。人物位置では人物を外側Entityとして、**異なる作品2件の完全な存在条件をEntity LIMIT前に評価**する。一致後、同じ条件・同じREAD transactionで最低1本の完全証拠を選ぶ。EXISTSと証拠取得は同じ位置・名前・Role・肯否の述語を共有する。

Graphの人物ページに全作品対を列挙すると次数nに対してn²になる。初回は、人物の適合作品を一意にページングし、各新規接点へ別作品を伴う完全証拠を添える方式を推奨する。例えばID最小の適合作品を伴う証拠を使い、全組合せを生成しない。これは**接点のページであり、全経路対の一覧ではない**と応答・件数表示で区別する。作品位置の既存経路ページとはcursorのoperationを分ける。

存在判定に近傍20件のprefixを使わない。表示・証拠保持・source数の既存予算は別に維持する。予算超過やtimeoutは未確認／取得中断であり、不一致・正常0件にしない。安定したEntity keyset、重複排除、同版の証拠、409の再検索、Abort／遅着応答の排除を再利用する。新位置のクエリplanと高次数性能は実装時に重点検証し、今回の小規模公開観測で保証しない。

### Role・肯否・期間・scope

両段affirmedを継続。Role未指定nullは未構造化Roleも含み、[]は一致なし。Role配列は各Claimそれぞれに適用し、複数値なら両段が同じ値である必要はない。人物位置でも「著者RoleのClaimが少なくとも2つの異なる作品にある」が必要。人物の別ClaimからRole・名前一致・scopeを継ぎ足さない。

各Claimの正規方向・Role・Source／Citation・scope・期間欠損を保持する。両段の同一刊行物・期間重複・現在の担当は推論しない。期間やscopeによる追加フィルタは今回の最小実装に含めず、指定された未対応条件は拒否する。adjacentの従来all-recordsや保存された否定Claimをaffirmedへ変更しない。

### 保存・復元

[`saved-views.ts`](../../lib/client/saved-views.ts)、[`saved-workspace.ts`](../../lib/client/saved-workspace.ts)、[`exploration-url.ts`](../../lib/client/exploration-url.ts)は、現行の版付き条件・経路再検証・非破壊移行を再利用する。新しい証拠・source位置・`matchContext`は現行strict形式へそのまま足せない。**新形式は明示的に版を上げ、旧形式はrev1・作品位置の意味で読み、書込み直さない。** 外側の正確な新version番号は実装開始時のschemaを基準に割り当てる。

未知pattern／位置／証拠版は拒否し、旧一段条件へ落とさない。保存Viewは③を保存し、検索由来の名前限定を③へ混入させない。Workspace／共有URLで検索の一致理由も保持する場合は任意の由来metadataとして分離し、同版で再検証する。公開版変更時は元Claimと一致理由を再確認し、確認失敗を別経路で補ったり、古い理由を現在も成立するよう表示したりしない。Undo・Discovery復帰は検索criteria／位置／スクロールとGraph枝を別に保持する。

## 5. 公開KGで確認した具体例

3200の**公開KG用既存read API**を使用。調査前後の `/api/dataset` はともに `82b01515-594c-48ca-b4b6-515eefac83ca`。fixture・未公開r0003・収集候補は使っていない。APIの正常応答・証拠・元Claimを照合したもので、新方式の検索APIを実装・測定した結果ではない。

現行POST entitiesでq空・work・other-works rev1・Role未指定の9作品を取得。各作品のPOST pathsをnextCursorがなくなるまで読み、全9対象で取得完了を確認した。向きを区別した証拠70本、選択された正規Claim14件。並行Claimを全部数えた値ではない。中央人物をまとめると浦沢直樹8作品、長崎尚志4作品、工藤かずや2作品だった。AUTHORSHIP条件も6作品すべての経路ページを読み切り、中央人物は浦沢直樹のみと確認した。

| 操作／提案検索 | 現行での観測／提案方式で成立する内容 |
| --- | --- |
| 現行person＋q=浦＋other-works | 400 `INVALID_CONDITION`。通常の人物名検索なら浦沢直樹を含む9人物が返るが、2作品の存在条件では絞られていない |
| 現行work＋q=浦沢＋other-works | 0件。対象自身の名前検索として正しい結果であり、浦沢の作品が未収録という意味ではない |
| **A：contributor位置＋対象名=浦** | 上記の完全証拠集合では浦沢直樹1人物。PLUTO←浦沢→MONSTERを証拠にできる。人物候補の新APIは未実装 |
| **B：work位置＋対象名空＋制作担当者名=浦沢** | 20世紀少年、BILLY BAT、MASTERキートン、MASTERキートン Reマスター、MONSTER、PLUTO、YAWARA!、パイナップルARMYの8作品。各作品と同じ浦沢を結ぶClaim＋別作品へのClaimを添えられる |
| B＋AUTHORSHIP | 上記のうち6作品。YAWARA!とパイナップルARMYはこの完全条件の候補に含まれない。制作一般から著者へ読み替えない |
| 制作担当者名=長崎＋AUTHORSHIP | 0人物／0作品となるべき。長崎の著者ClaimはReマスターで確認できるが、異なる2作品の著者条件はこの版で成立しない。別人物の著者経路と合成すると誤一致する重要な負例 |

**一致証拠の実物**（すべてaffirmed・人物→作品、sourceCount各1）：

| Claim ID | 接続・Role・確認範囲 |
| --- | --- |
| `839b0bb8-1781-4a3e-8446-9a22d08d1658` | 浦沢直樹→PLUTO、AUTHORSHIP、ISBN 9784091874313・第1巻。NDL書誌・責任表示のCitationを取得確認 |
| `6d5ff5e4-5f59-4948-8248-cbdac3888a7c` | 同じ浦沢→MONSTER、AUTHORSHIP、ISBN 9784091817907・完全版第1巻。NDL書誌のCitationを取得確認 |
| `dbc08a85-9165-4cc8-a3af-d133c83d8f67` | 長崎尚志→PLUTO、PRODUCING、ISBN 9784091874313・第1巻。小学館商品情報のCitation。これを浦沢のAUTHORSHIPへ合成しない |

期間は各Claimともfrom／to不明。PLUTOとMONSTERのscopeは別の刊行物で、全巻全版の著者証明ではない。BでPLUTOを返す場合も、名前に一致する浦沢のClaimを証拠に含める。長崎の経路が先に取得できても代用しない。

再確認方法：既存POST `/api/discovery/entities` に `{version:1,dataset:"public-kg",criteria:{q:"",kind:"work",relation:{version:1,type:"pattern",pattern:{id:"other-works",revision:1},polarity:"affirmed",contributionRoles:null}},revision:null,after:null}` を送る。返却revisionを固定し、各EntityのPOST paths `operation:{type:"page",after:null,requiredWitness:そのEntityのwitness}` からcursorを辿る。Claim詳細は `/api/claims/{id}?revision={revision}`。9件や70本を将来の期待値・コード定数にしない。

## 6. 日英名称とUIで必要になる表示

現在registryの英語は `Other works, same contributor`、対象検索・Graphの英語は `Same creator, other works`。Role未指定にはプロデュース等も含まれるため、creatorやauthorだけでは狭い。内部IDは表示名と分離し、意味を変えず次のように文脈別に表示する案を推奨する。

| 表示場面 | 日本語案 | English |
| --- | --- | --- |
| 共通の関係設定 | 同じ制作担当者を介した作品 | Works linked by a shared contributor |
| 作品を探すとき | 同じ制作担当者が関わった別作品がある作品 | Works sharing a contributor with another work |
| 人物を探すとき | 複数の作品に関わった人物 | Contributors to multiple works |
| 自身の名前 | 対象自身の名前・別名 | Subject name or alias |
| 関係先の名前 | 関係する制作担当者の名前・別名 | Contributor name or alias |

名称は採用候補で、人間評価が必要。「同じつくり手の別作品」という既存アイキャッチを即座に全廃する必要はなく、目的に応じた説明を併記できる。人物から見ることは同じ形の中央位置を選ぶことであり、人物を「別作品」と呼ぶことではない。

今回UIは変更していない。実装時も左右ペインと3タブ、①→②（省略可）→選択後→Graphを維持。左のkindバッジと位置説明を連動させ、名前欄は対象名と必要時の関係先名を区別する。全条件を大きく常設せず、任意条件は小さな直接操作で追加・解除する。主要導線にselectを導入しない。右のEntity結果には一致した人物と作品の簡潔な理由を示し、Graphでは同じ証拠へ進める。①のカタログ絞込みと②のKG条件を混ぜない。

## 7. 非表示3プリセットと一段条件への拡張性

| 未移行の形 | 同じ方針を使える点 | 残る移行作業・意味の注意 |
| --- | --- | --- |
| 別作品のつくり手へ：W-P-W-P | 位置付き完全証拠と共通Claim検証を使える | 作品2位置・人物2位置は対称ではない。開始作品／経由作品／橋渡し人物／先の人物をkindだけで同一視しない。4ノード・3Claim証拠、完全EXISTS・Graph取得・保存の追加対応が必要 |
| 作品を介して別のつくり手へ：P-W-P | 人物端点と中央作品を登録位置にできる | 一作品に異なる人物2人のClaimがある条件。「複数作品に関わる人物」とは別の形。共同作業・同時期を推論しない |
| 人を介して別の機関へ：O-P-O | 対称な機関端点と中央人物を登録位置にできる | AFFILIATED_WITHの正規方向・組織立場を各Claimで検証。制作Roleは使わない。同時所属／転職順序とは異なる。高次数は完全EXISTSと接点ページで対処 |

形が共通化できても各adapterの対応完了を意味しない。3件の非表示は未移行状態であり、今回復活させない。既存のbound／unboundプロパティは保持し、presetの追加データとして対応位置を初期設定する。対象固定プリセットは選択Entityが宣言位置に適合することを検査し、②を省略できる。

adjacentは端点2つの形として意味を揃えられるが、初回は既存either方向・型付き限定を維持する。関連名を一段に拡張する場合も、その**同じClaimの反対端点**へ適用する別能力として実装する。すべての関係へ曖昧な全位置名前検索を足さない。

## 8. 最小実装順序・受入条件・確認事項

| 工程 | 最小変更と完了条件 |
| --- | --- |
| 1：契約改訂 | 推奨の位置・名前適用範囲をユーザー確認後、rev2 registry／対象POST v2／証拠v2のstrict契約を確定。rev1の作品専用意味と旧保存読込みを維持する |
| 2：対象検索・証拠 | work／contributorだけを実装。A・Bを名前なし検索と組合せて再現。長崎＋AUTHORSHIPの別人物合成を拒否。高次数21件目以降、同名別人、並行Role Claim、空Role、denied、ページ重複・欠落、timeout／revision変更を重点検証 |
| 3：Graph・永続化 | 位置を持つroot／sourceと証拠の直接検証。人物からも通常Entity操作で段階展開・閉じる・再開。有限ページ／保持上限で失敗しても元状態を保持。View／Workspace／URL／Undo、新旧保存、未知版、検索由来の一致理由の復元を確認 |
| 4：既存UIへ接続 | 左ペインの対象kind・位置・2種類の名前を明示。結果Entityと一致理由が同じ証拠に対応し、Graphへ引継ぎ・戻りを確認。PC／スマホ・日英を人間評価。他2タブ・旧探索に回帰がないことを確認 |

対象検索だけ対応してGraphや保存が失敗する状態を一般利用の完成扱いにしない。新エンジン、任意位置ビルダー、任意長、段別Role編集、期間／scopeフィルタ、全パターン移行は最小範囲に含めない。全体はUI文言だけでは済まない中規模変更で、まず1パターンの2位置に限定する。

**ユーザー確認を求める判断**は、(1) 同じ形の作品位置／中央人物位置として扱う推奨、(2) 関係先名を②の対象選択条件にして一致証拠をGraphへ渡す推奨（Graph全体の名前限定は保留）、(3) 日英の文脈別名称案。ここを確認するまでは実装へ進まない。

今回の確認は公開API読み取り・70＋30経路の方向／kind／肯否／Role／非再訪の照合、代表3ClaimのCitation、文書内15リンク・差分検査に限定。新APIや保存の回帰試験は未実装なので行っていない。3200／betaは同じbuild `9VxYo4-dS_uvQ8TFt-Oqd` と公開revisionで、betaの9作品・証拠付き応答も確認した。文書のみのため再build／再配置せず、本番・公開KG・収集処理も変更していない。
