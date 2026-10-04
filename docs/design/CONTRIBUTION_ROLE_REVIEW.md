# CONTRIBUTED_TOの最小Role対応・設計レビュー

2026-10-03。**推奨案を採用・Phase 06実装の設計根拠**。Phase 05完了後の設計。レビュー作成時は文書だけを変更した。現在の採用契約は[CONTRIBUTION_ROLE_CONTRACTS.md](CONTRIBUTION_ROLE_CONTRACTS.md)、検証と受入結果は[Phase 06記録](../archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)を参照。以下は採用前レビューの判断過程であり、凍結pilot v1は変更しない。

基準は[ARCHITECTURE](../ARCHITECTURE.md)、[Predicate意味契約](PREDICATE_CONTRACTS.md)、[関係語彙レビュー](RELATION_VOCABULARY_REVIEW.md)。[実データパイロット設計](REAL_DATA_PILOT.md)と[実施記録](../archive/phase-04-real-data-pilot/IMPLEMENTATION_REAL_DATA_PILOT.md)、[条件付き探索](CONDITIONAL_EXPLORATION_PHASE.md)、[探索モデル](EXPLORATION_MODEL_REVIEW.md)、[分類・プリセット](EXPLORATION_PRESETS_REVIEW.md)との整合を確認した。

## 1. 推奨する最小構成

**ClaimのCONTRIBUTED_TO専用限定として、一つのRole IDと刊行物の適用範囲を持たせる。** 制作イベントNode、汎用qualifier配列、全分野Role辞書を導入しない。個別Claimは独立したまま、表示Relationは現行のsubject / predicate / objectでまとめる。

Roleだけを足す案では、巻・版の違う肯否が作品全体の対立に見えてしまう。したがって、今回の最小対応にはRoleと適用範囲を一緒に含める。資料の参照箇所はCitation、主張の適用範囲はClaimの限定、関与期間は既存periodで分ける。

```text
Claim
  id / subjectId / predicate / objectId / polarity / period / ...（現行どおり）
  contribution: null | {
    roleId: ContributionRoleId | null,
    scope: null | {
      kind: "publication",
      isbn13: string,
      volumeLabel: string | null,
      editionLabel: string | null,
      language: string
    }
  }
```

これは将来の論理型案。CONTRIBUTED_TOはcontributionオブジェクト、他predicateはnullとする。旧schemaのCONTRIBUTED_TOは読取境界で `{ roleId: null, scope: null }` と解釈する。roleId=null、scope=nullを無断で具体的値へ補完しない。

publicationのscopeはClaimのobjectである漫画作品のうち、指定した刊行物に限る。現行パイロットで巻・版・ISBNを確認できる3資料に限定して始める。volumeLabel / editionLabelは人間が確認した表示用表記で、IDや比較キーにはしない。volumeLabel / editionLabelは原資料の表記としてlanguageを持ち、UI翻訳と分ける。今回の3資料ではja。言語やラベルの変更で刊行物の識別を変えない。未確認の「通常版」を埋めずnullにする。ISBNはハイフンなしの検証済み13桁とし、同じ刊行物なら表記差では別scopeを作らない。

scope=nullは適用範囲が構造化されていない状態であり、全巻・全版を指定したことにはならない。初期はwork全体や巻の範囲、任意の部位のDSLを追加しない。ISBNで対象を特定できない新しい資料は、この小さいモデルへ無理に入れず、広いClaim・注記または保留とする。

## 2. 現在の実装との接続点

| 現行箇所 | 再利用するもの | Role対応時に必要な変更 |
| --- | --- | --- |
| lib/domain/fixture.ts | 独立Claim、端点検証、period、Citation→Source | 専用限定のschemaと旧版からの読取正規化 |
| lib/server/pilot-dataset.ts | 原役割・言語・確認日・理由・資料限定の台帳 | 新版の人間によるRole / scope受入、変換版と旧Claim参照 |
| lib/server/seed.ts / mappers.ts | 固定UUID、差異拒否、DB→API変換 | 限定のスカラー化・復元、旧版の欠損をnullへ正規化 |
| lib/server/queries.ts | 両方向一段階、published、Claim ID順 | Role条件をLIMIT前に適用 |
| lib/server/neighbor-cursor.ts | 起点・条件へのcursor拘束 | Role条件・条件版・dataset版の対応 |
| lib/client/graph-state.ts | 受理ページ、開閉・休止復元、上限 | 条件判定をRoleまで拡張。旧条件ページを混ぜない |
| lib/client/graph-presentation.ts | 三つ組のDisplayRelationとclaimIds | Role概要と肯否混在の表現。集約キーは増やさない |
| components/ClaimDetails.tsx | 関連Claimの個別取得と縦比較、条件外・未表示の区別 | Role・適用範囲・原表記を明示し、比較区分と条件外判定を更新 |

現在のClaimSummaryはClaim schemaから導出される。限定を詳細にしか返さない設計では、Graphや受理ページでRoleを検証できないので、summaryにも必要。GraphのラベルをCitation.noteの解析で生成しない。

## 3. 初期Role集合と資料上の限界

台帳に実際に残っている表記を基準に、**4種類**を初期候補とする。下記IDはCONTRIBUTED_TO専用カタログ内の安定キー案で、predicateキーとは型・管理namespaceを分ける。表示名や原語をIDにしない。

| Role ID案 | ja表示 | 台帳で確認した原表記・対象 | 意味の境界 |
| --- | --- | --- | --- |
| SCRIPT_WRITING | 脚本 | 勝鹿北星・長崎尚志→MASTERキートン：「脚本」 | 脚本としての関与。作画、原作、ストーリー共同制作と自動同義にしない |
| SUPERVISION | 監修 | 手塚眞→PLUTO：「監修」 | 当該作品・適用範囲の監修。監督、作画、作者とはしない |
| PRODUCING | プロデュース | 長崎尚志→PLUTO：「長崎尚志プロデュース」 | プロデュースと明示された関与。資金提供、雇用、脚本を推論しない |
| STORY_CO_CREATION | ストーリー共同制作 | 長崎尚志→BILLY BAT：「ストーリー共同制作」 | その表記が示す共同制作。脚本と同義扱いせず、他の共同相手を新規関係として生成しない |

**作画は初回に登録しない。** v1台帳の浦沢直樹3件は「浦沢直樹×手塚治虫」「浦沢直樹」「著」で、roleSummaryも制作／著者クレジット。作画という明示表記を採用根拠として保存していない。実施記録の「作画等」という総括や、漫画家という肩書きからRoleを認定しない。将来、確認できた資料と比較票が揃った時だけ作画Roleを追加する。監督等も今回列挙しない。

このため、「作画だけ」は将来の条件意味を検討する例であり、初期4 RoleのAPIへ未知IDを送れば400。将来の選択肢として表示して対応済みに見せない。

初回のRole候補は5 Claim分。Role ID案と個々のClaim受入は別であり、このレビューは再審査・新規データ投入を済ませたものではない。

## 4. 一Claim一RoleとRoleなしの意味

一Claim一Roleを推奨する。資料に複数役割があるなら、同じSourceを参照する役割別の独立ClaimとCitationに分ける。Role配列にpolarityを掛けると「全部の否定」「組合せの否定」の区別が曖昧になるため、初期は使わない。

roleId=nullは、**このClaimは具体的役割で制作関与を限定していない**という意味。全役割の肯定でも、現実に役割が不明という断定でもない。「Role導入前の広いClaim」と「新しく作った広いClaim」で命題の意味を変えない。

旧版由来か、資料に明示がないか、表記はあるが未正規化かは、台帳の受入・変換provenanceで区別する。必要な最小記録は元dataset / Claim参照、Role受入のdecisionと理由、確認日、変換版。ClaimにlegacyRole等の恒久的意味フラグを足さない。UIでは「役割の限定なし」と説明でき、未正規化の「著」が注記に残っていても矛盾しない。

Role限定のClaimがあっても、Roleなしの広いClaimを否定したり削除したりしない。旧Claimから作る新しいRole限定は意味の強化なので、同じClaim UUIDの属性更新では扱わない。

## 5. 原表記・言語・根拠の分離

正規化RoleはClaim、資料の実際の表記はそのClaimを裏付けるCitation単位で持つ。将来CitationDetailへnullableな `roleEvidence: { originalText, language }` を加える最小案を推奨する。これは資料の表記で、Role IDの別名辞書ではない。

台帳にはCitation ID、原表記・言語、正規化先Role ID、判断理由、確認日・変換版を紐付ける。文字列からの機械抽出はしない。資料ごとに違う原表記を、Claimの一つのoriginalRole文字列へ潰さない。既存Citation.noteの限定や理由は残すが、検索・比較の正本にはしない。

Roleのlocale別label / 説明と、資料の言語・原表記は別。Role IDにlangを付けて別概念を増やさない。機械翻訳や原表記の一致だけで正規化しない。否定の資料に役職名が出ているだけで肯定の根拠へ変えない。

CitationのstanceはそのClaimに対する支持／反証。denied Claimを明示的に裏付ける資料はstance=supportでよく、polarityとstanceを同一視しない。

## 6. 巻・版・期間：資料範囲と命題範囲

Sourceは今回読んだ出版社Web商品情報、Citation.locatorはクレジット欄。scope.isbn13はそのClaimが適用すると判断した刊行物の識別子であり、Web Sourceの識別子でも、作品Entityの外部IDでもない。新しいBook / Edition EntityやSource.kind=bookへの変更は不要。

候補scopeの識別:

| 対象 | 刊行物ISBN | volumeLabel / editionLabel案 |
| --- | --- | --- |
| PLUTO | 9784091874313 | 第1巻 / null（版名未確認） |
| MASTERキートン | 9784091841612 | 第1巻 / 完全版 |
| BILLY BAT | 9784063729221 | 第4巻 / null（版名未確認） |

**第1巻の資料を読んだことと、第1巻だけへの関与を主張することは同じではない。** 新版の受入時に、資料が「当該刊行物へのRole関与」を支持するか、作品全体のクレジットを転記しているだけかを判断する。後者を勝手に「第1巻で監修した」として登録しない。適用範囲を資料から決められないなら、Role付きClaimを保留するか、限定未構造化であることを保持する。

初期の新しい実データRole Claimは、判断できたpublication scopeと少なくとも一つの支持Citationを必須とする受入方針を推奨する。これはパイロット受入ポリシーであり、全Claimの恒久的出典必須schemaにはしない。Roleとscopeを別々に追加して、限定が落ちたRole主張を公開しない。

物理schemaはRoleあり・scope=nullも表せる案だが、今回の新パイロット公開には受け入れない。将来の確かな作品全体の関与や別媒体に対応する時は、そのscopeを別途設計する。

periodはその限定付き関与の期間。両端nullは不明のまま。刊行日、商品発売日、Source公開日、アクセス日から関与期間を作らない。刊行物のscopeが既知でも期間が不明であることは両立する。

## 7. polarityの作用範囲と比較

polarityは `(主体, CONTRIBUTED_TO, 作品, Role限定, 適用範囲, period)` の主張に掛かる。否定はその限定付き主張の否定で、Roleの欠落・クレジットへの未掲載・今回未収録をdeniedへ変換しない。

| 仮説ケース（新データではない） | 解釈 |
| --- | --- |
| 同じ人物・作品・刊行物で作画affirmed、監修denied | 両立可能。異なるRoleについて述べている |
| 同じ監修で第1巻affirmed、第2巻denied | 両立可能。scopeが違う |
| 同じ監修・刊行物で肯定と否定、periodが違う | 同じ限定の比較候補。時期差だけで矛盾としない |
| 同じRole・scope・periodで肯定と否定 | 対立を検討する候補だが、機械は真偽・優先順位を決めない |
| Roleなしaffirmedと監修denied | 両立可能。別の制作関与があり得る |
| Roleなしdeniedと監修affirmed | 同じ適用範囲・時期なら緊張関係の候補。ただし不明範囲を補完して自動矛盾判定しない |

「役割なし＝全役割」や「scopeなし＝全巻」という展開はしない。否定されたRoleから他Roleの肯定を生成することもない。

## 8. ID・比較キー・relatedClaimIds

永続的な同一性はClaim UUID。語彙・限定の比較キーをDBの一意制約やMERGEキーにしない。同じ内容でも別の主張記録があり得る。hash一致は意味の等価性を保証しない。

| 用途 | キー・範囲案 | 保証しないこと |
| --- | --- | --- |
| 表示Relation / 広い関連Claim | subjectId + predicate + objectId | 同じRole・scope、同内容、矛盾 |
| 同じ限定の比較候補 | 上記 + roleId（nullは広い主張）+ publication ISBN | 同期間、同内容、真偽 |
| 同一内容の照合候補 | 上記 + periodの値と精度 + polarity | 同じ根拠、同じ主張記録、自動統合 |

scope=nullは適用範囲を比較できないので、「同じ限定」と断定せず未構造化群に置く。periodのnull同士も同じ実期間の証明ではない。同一内容候補キーは符号化が一致するだけの候補で、未知値があれば確認が必要。初期はキーによる自動統合も重複候補APIも作らない。

periodは同じ限定の比較群のキーに入れず、並べて違いを確認する。polarityも比較群のキーに入れない。原表記、Citation / Source ID、locale、受入由来、登録時刻、volumeLabel / editionLabelは意味比較キーに入れない。根拠や由来が違うことは同一内容判定とは別に保持する。

**relatedClaimIdsは現行の広い関連Claim集合のまま維持する。** 同じ三つ組の他の公開Claimを、Role・scope・period・polarityを問わず返す。名前を維持する代わりに契約とUI説明を明確にする。同じ限定だけへ狭めると、Roleなしの旧Claimや別RoleがRelation詳細から欠落するため推奨しない。

初期は別のsameClaimIds等をAPIへ増やさない。個別詳細を取得した後、共通domainの純粋な比較補助で「同じ限定の候補」「Role・適用範囲が異なる」「適用範囲未構造化」を区分する。全カードを同格に表示し、区分を信頼度や正しさの順位に使わない。小規模で全件取得する現契約の上限問題は残るが、今回の最大14 Claim規模には新しいページングAPIを先行導入しない。

## 9. DB・投入・APIの最小変更案

Role Nodeや新Relationshipは不要。Claimのスカラーpropertyに `contributionRoleId`、`contributionScopeKind`、`contributionScopeIsbn13`、`contributionScopeVolumeLabel`、`contributionScopeEditionLabel`、`contributionScopeLanguage` を保存する。nullはproperty欠損、APIでは明示的nullに復元。旧Claimの欠損を広いClaimとして読むが、未知Role IDやscopeの部分的な破損はnullへ丸めない。

Citationは `roleOriginalText / roleOriginalLanguage` のスカラーを追加し、両方あり／両方なしを検証する。predicateがCONTRIBUTED_TO以外なら限定を持てない。Roleは既知ID・一つ、scopeは既知kind・ISBNチェック・刊行物と作品の台帳対応を検証。ISBNとvolume/editionの対応を機械だけで証明できるとはしない。

投入はschemaVersion=2案。schemaVersion=1のファイルをそのまま受け入れる読取adapterと新版validatorを分け、v1ファイルや旧台帳を一括書換えしない。新しい書込形式はv2、旧版は旧内容を正規化して比較する。seedのON CREATE・属性差異拒否を維持し、v1とv2を同じDBへ追加seedする更新処理にしない。

APIは既存経路を維持し、ClaimSummary / ClaimDetailへcontributionを追加、CitationDetailへroleEvidenceを追加する。原表記は詳細、正規化Role / scopeはsummaryにも返す。DBのスカラー名を公開せず、共通mapperで論理型へ変換する。SourceDetailやEntity型・外部ID構造は変更不要。

返却schemaは現在Claimから導出され、strictな受け手もあるため、フィールド追加を無条件に互換変更と呼ばない。初期の唯一のWebクライアントとサーバーを一緒に更新し、API型・例・テストを更新する。外部クライアントや/v2 APIを先行実装しない。

## 10. Role条件とcursor・開閉

domainの確定条件へ、CONTRIBUTED_TO専用の `contributionRoles: RoleId[] | null` を追加する案。nullはRole制限なし、[]はそのpredicateの関与を返さない、配列はRole IDのOR。predicate集合との積として扱う。

```text
matchesClaim = matchesPredicate
  AND (predicate != CONTRIBUTED_TO
       OR contributionRoles == null
       OR roleId IN contributionRoles)
```

他predicateにはRole条件を掛けない。例えば影響＋制作関与を選び監修を指定した場合、影響と監修の制作関与を返す。「監修だけ」ならpredicateもCONTRIBUTED_TOだけにする。CONTRIBUTED_TOを選ばない場合のRole条件は意味がないため、入力を検証後nullへ正規化する。

Roleありの全4種類を選んでも、Roleなしの広いClaimは含まれないためnullへ正規化しない。ここは現行「全4 predicate＝無条件」と異なる。Roleなしを全Role条件へ自動包含しない。Roleなしだけの選択、Role条件のNOT、scope/期間条件は初期不要。浦沢直樹の既存3件にRoleを推定しないため、同人物を起点にRole限定すると周辺が出ない可能性がある。これは正規化・収録範囲の制約であり、役割を担わなかった証明ではない。条件内の空結果として説明し、広いClaimを黙ってRole条件へ混ぜない。

将来のquery案は `contributionRoles=SUPERVISION` のCSV。省略はnull、空文字は[]、未知ID・重複パラメータは400、並び・同一ID重複は正規化。Roleフィルタは、published・predicate・afterとともに **LIMIT / limit+1の前** に適用する。人物側・作品側の両方向で同じ条件を使う。肯定・否定の両方を返し、「監修だけ」は監修したことを肯定する主張だけという意味にしない。

フロントの非表示処理だけでは、狙ったRoleが後続ページにある場合に取得漏れを起こす。server query、ページ受理、projectGraph、詳細の条件外判定が同じmatchesClaimの契約を使う。Graph用だけのRoleフィルタを別に作らない。

条件キーは条件schemaの版、正規化predicate集合、正規化Role集合を含める。locale、ラベル、資料の原表記は含めない。一つの有効条件スコープという現行stateを維持し、適用時の世代変更・abort・ページ／cursor／開閉意図の初期化、共通座標の保持を継承する。同条件では閉じる・休止復元・続きを取得・上限拒否の原子的な受理が変わらない。

cursorはRole限定がある場合に新版（v=2）の不透明形式を使い、起点、実効条件キー、dataset版、最終Claim UUIDへ拘束する。dataset版はセッションの取得スコープにも含め、新しいdatasetのセッションへ旧cursorを持ち込まない。limitはキーへ入れず変更可能にする。

既存demo / 凍結v1ではRole条件を付けない従来操作に限り、無条件UUIDとpredicate条件v1 cursorを維持する案。これらの環境でも実効Role条件がある要求にはv2 cursorを使う。新dataset v2は無条件を含めv2 cursorに統一し、旧UUID・v1 cursorを400で拒否する。形式判定をRoleの有無だけに頼ると新版の無条件cursorがdatasetを跨ぐので避ける。dataset切替はセッション再開始。cursorに署名やスナップショット整合を保証する意味は追加しない。

## 11. DisplayRelationとGraph・詳細の案

三つ組で一Relationという現行キー・relationId・claimIdsを維持する。Roleや刊行物ごとに矢印を増やす案は、今回解消したい情報過多を再発させるため推奨しない。複数predicateを束ねる仕組みは作らない。

presentationで取得・表示対象のClaimからRole集合、Roleなしを含むか、肯否混在を導出する。これらは保存された関係でも全データの概要でもない。期日・ISBN・原表記はGraphラベルへ詰め込まない。

推奨ラベルは、具体的Roleがある時だけ `制作に関わった\n監修` や `制作に関わった\n脚本・監修`。最大2 Role名までにし、それ以上は「ほかN役割」として詳細へ戻す。ただし長いRole名の組合せが既存ラベル幅に収まらない場合は「制作役割 N種類」に留め、詳細へ戻す。省略によりGraphの線を増やさない。順序はRole ID等の安定順で、重要度・信頼度ではない。Roleなしだけなら現行の短い関係名を維持する。複数scopeがあっても全作品にそのRoleが成立する見せ方を避け、Graph共通説明と詳細で「Claimの適用範囲に限定、表示は取得済み範囲」と分かるようにする。

「制作（作画・監修）」は代替案として可能だが、肯定された実績だけのように読めるため、関係名を残す二行案を推奨する。Role名は肯否を問わず主張の対象として列挙し、肯定成立の一覧としない。

CONTRIBUTED_TOの肯否混在は、Role / scope / periodが違っていても全体の極性が混在するため、**「異説あり」を使わず「肯定・否定あり」**など記述的な表示にする。否定だけは「否定」と破線、混在は文字＋点線を併用できる。線の方向は人物→作品のまま。UIが対立を判定したように見せない。他predicateの現行表現はこのRole対応で変更しない。

Edgeを選ぶと、現在どおり代表ClaimのrelatedClaimIdsから同じ三つ組の全公開Claimを取得する。Role条件外・Graph未取得のClaimも比較可能だが、その範囲差を明示してGraphへ自動追加しない。Role対応後もこの広いrelated契約を維持すれば、代表Claim方式を再利用できる。

各カードは正規化Roleまたは限定なし、刊行物・版・巻、period、polarity、Citationごとの原表記・言語・locator・Source・未確認状態を表示する。同じ限定の候補を同格に確認でき、別Role・別scopeも隠さない。一覧からの個別Claim操作は維持し、Relation選択と個別Claim選択を区別する。Role名をGraphから省略した場合でも、個別Claimを詳細と一覧から確認できる。

Entity100 / Claim200の上限とClaim単位ページングは維持する。Roleを一Relationにまとめても独立Claim件数を減らした扱いにしない。現在の配置・曲率・開閉・位置保持はそのまま使い、ラベルが長くなった箇所の可読性を実ブラウザで確認する。

## 12. 凍結v1から新datasetへの方針

v1の台帳・投入JSON・manifest・原取得・環境は変更しない。文字列を見てRoleを自動付与しない。将来はv2の候補台帳で資料を再確認し、Roleと適用scopeの受入理由、原表記・言語、確認日、変換版、元v1 Claim IDを記録する。

推奨は、**v2でもv1の広いClaimを保持し、受け入れたRole付きClaimを新UUIDで並置する**。広い主張と具体的な限定の主張は別で、同じ資料から作ったことを台帳・Citationで追えるようにする。Sourceは共有し、新Claimには専用Citationを付ける。新Claimの作成を独立した新資料の登場や信頼度の増加として扱わない。

| v1の候補 | v2の受入候補 | そのまま断定しないこと |
| --- | --- | --- |
| 長崎尚志→PLUTO | PRODUCING、確認できた第1巻のscope | 脚本、作画、全巻の同役割 |
| 手塚眞→PLUTO | SUPERVISION、確認できた第1巻のscope | 作者、監督、全期間 |
| 勝鹿北星・長崎尚志→MASTERキートン | 各SCRIPT_WRITING、完全版第1巻のscope | 全版・全巻で同じ担当 |
| 長崎尚志→BILLY BAT | STORY_CO_CREATION、第4巻のscope | 脚本との同義、人物同士の新しい共同作業関係 |
| 浦沢直樹の3件 | 広い既存Claimを保持 | 作画Roleの推定 |

5候補を全件受け入れた場合、v2は元9＋新5＝14 Claim、表示Relationは元と同じ9（制作8＋影響1）。Sourceは元4を共有し、Citationは最大14。これは新規投入の実績ではなく条件付き見積り。どの候補もscopeの受入審査で保留になり得る。

並置は旧主張を失わせない一方、詳細に同資料の広いClaimと限定Claimが並ぶ。台帳の由来を説明し、Source件数を信用点にしない。代替はv2で広いClaimを表示対象から外して旧版だけへ残す方法だが、既存主張の扱いを追加設計するため初期には採用しない。

v2は別の専用環境・manifest・dataset識別子で検証する。v1 DBへ差分seedして属性を強化する処理にしない。Entityの同一性が同じなら内部ID・QIDを保持。広いClaimは元の意味・UUID・根拠を保持する。新版で構造化するnull限定を、旧Claimの新しい役割やscopeの認定として扱わない。Role付きClaimの訂正はさらに別の受入判断が必要。

## 13. Phase 05への最小追加契約

Role定義には適用predicate=CONTRIBUTED_TO、安定ID、意味、包含・除外・境界例、他の初期Roleとの差、locale別label・説明、原表記からの採用例と禁止する変換を持つ。Role間の分類・継承を作らず、SCRIPT_WRITINGとSTORY_CO_CREATION等を自動同義にしない。

小さなCONTRIBUTED_TO専用Roleカタログと固定基準版・比較票を追加する案。Phase 05のhash・必須比較・変更検出を再利用できるが、**現在のvalidatorはRoleカタログの承認には対応していない**。既存review schemaにkind=roleはあるものの、承認対象をpredicateカタログで探し、比較先もpredicateなので、そのまま承認済みRoleを置くとエラーになる。Role定義用の検証と比較先を明示して拡張する必要がある。

Roleは既存Roleとの比較に加え、CONTRIBUTED_TOの限定である理由を審査する。predicate比較票の全4件比較を役割の同義性審査の代わりにしない。新しいRoleを別predicateとして承認する抜け道も作らない。使用済みRole IDの意味は不変、同義はlocale別名、意味変更は新IDというPhase 05の原則を継承する。

ISBN・限定・適用predicate・Role ID・Citation原語の形式はvalidatorで担保し、原資料がそのRoleとscopeを支持するかは人が判断する。人の承認票とClaim受入台帳は別の審査対象。

CONTRIBUTED_TO自体の広い意味・端点・方向は変えない。辞書の「初期は区別しない」の説明をRole対応時に明確化するなら、Phase 05の比較票を通し、baseline-v1.jsonを変更しない。初回4 Roleの基準化も、人間レビューの実施を偽装した承認記録を生成しない。

## 14. 代替案と範囲の判断

| 案 | 評価 |
| --- | --- |
| Role IDだけを追加、scopeは注記のまま | 変更は小さいが、限定の比較と肯否が曖昧。今回の目的には不足 |
| 専用Role＋publication scope（推奨） | 現行3刊行物の限定を保存・比較でき、DBノードを増やさない |
| 制作Roleを全部predicate化 | 語彙・条件・翻訳が増殖し、今回の意味契約との接続も重複する |
| Role配列や自由qualifier JSON | 否定や比較の意味を増やす。今回不要 |
| 巻・版Entityや制作イベントNode | 多項関係・刊行物探索には将来価値があるが、今回の限定に対して過大 |
| Roleごとに別Edge | 詳細を直に見せられるが、並行辺の情報過多を再発させる |

## 15. 実装前の残る判断と次フェーズ

技術境界と推奨仕様は、上記で実装対象を具体化できた。**この推奨案への合意後、次の1フェーズとして「限定された制作RoleのVertical Slice」に進める状態**。新しい資料や大きなtaxonomyを待つ必要はない。ただし、この設計レビューだけで実装を開始しない。

実装開始前に確定するのは、4 Roleの定義・ID、publication限定とnullの扱い、広いrelated / 同じ限定の候補という区分、CONTRIBUTED_TOの混在表示を記述的に変えること、v1保持＋v2並置という版方針。いずれも本文に推奨を示しており、追加の汎用設計を要求するものではない。

個々の資料がRole付き・publication限定のClaimを本当に支持するかは、新版受入時の人間判断として残る。作画の資料確認は今回の4 Role対応の前提条件にはしない。出版scopeを受け入れられない候補は件数を埋めず保留する。

次フェーズの移行順序案:

1. 専用Role意味契約・レビュー検証、v1 adapter / v2限定schema・比較補助の単体テスト。
2. 新版台帳の資料確認、元表記・scope・由来の受入。別環境の投入・mapper・API返却を変更し、seedの冪等性とv1不変を検証。
3. Role条件をLIMIT前へ適用、条件キー・v2 cursor・世代・受理／復元・詳細の条件外判定を一貫して更新。
4. 同じDisplayRelationのRole概要、混在表示、詳細の限定・原表記を実装。実DB・ブラウザで一つの経路として確認。

完了判定は、旧demo / v1の回帰、一Claim一Roleと不正限定の拒否、旧nullの意味維持、別Role／別巻の肯否が対立表示にならないこと、relatedに旧広いClaimが残ること、条件付きページング・cursor混用拒否・通信中の条件変更・開閉／復元・上限、各ClaimからSourceへ戻れること。実データにない否定・複数Role／scopeの組合せは専用テストデータで確認し、pilotへ架空Claimを混ぜない。

## 今回の確認範囲

コード：lib/domain/api.ts・fixture.ts・exploration.ts・vocabulary.ts、lib/server/queries.ts・graph.ts・mappers.ts・neighbor-cursor.ts・http.ts・seed.ts・pilot-dataset.ts、lib/client/graph-state.ts・graph-presentation.ts・use-graph-explorer.ts、components/ClaimDetails.tsx。凍結台帳の8制作Claim・原役割・scope注記・3刊行物ISBNを照合した。

原資料の再取得や新規受入は行っていない。文書の差分・ローカルリンクだけを検証し、アプリテスト・ブラウザ確認・DB操作は今回実施しない。Phase 04 / 05の既存テスト結果を今回の実行結果として扱わない。
