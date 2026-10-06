# Graphの関係概要と独立Claim詳細

Phase 21の採用契約。Phase 16の[意味モデル原則](RELATION_MODEL_PRINCIPLES.md)を維持し、既存データを読み取るpresentationだけを変更する。実画面・不足の観察は[完了記録](../archive/phase-21-relation-presentation/README.md)を参照。

## 線が表す範囲

DisplayRelationは表示中の同じsubjectId / predicate / objectIdのClaim UUIDをまとめたもの。方向・表示ID・独立Claim・比較キー・DB保存意味は変更しない。条件外やGraph未表示の関連Claimを線のラベル・肯否・限定内訳へ加えない。

線にはpredicateの既存表示名と、構造化済みのdomain限定の短い概要を示す。制作Role、組織関与立場、Event参加立場の語彙は別々の辞書を使う。単なる期間・Source数はラベルへ出さない。限定値が多い／長い場合は「役割 N種類」「立場 N種類」へ圧縮し、値はRelation詳細で全て読める。限定値と指定なしが併存すると「＋指定なし」を添える。指定なしだけの場合、通常のpredicateラベルに説明を増やさない。

affirmed / denied混在は全predicateで「肯定・否定あり」＋点線。異説・矛盾・信頼度・正しさを判定しない。否定だけなら「否定」＋破線を維持する。特定の限定値だけに否定がある場合、値を列挙するラベルには「否定のみ」「肯否あり」を添え、否定のRoleを肯定済みRoleへ変換しない。種類数への圧縮は値の存在の概要であり、全値を肯定する意味ではない。

「＋指定なし」は当該domainの役割／立場を指定しないClaimも含むことを示す。scopeや期間まで無限定という意味ではない。nullを全Role・全期間・全巻の認定へ変換しない。Citation.noteやEntity descriptionからRole等を推定しない。

## 関係全体から根拠へ

Edge選択では、取得済みClaimSummaryから関係全体の概要を即時表示する。詳細取得失敗でも、線が何をまとめているかは残す。概要は主体→既存predicate表示名→対象、Graph内のClaim数と肯否、domainごとの限定値／指定なしを示す。限定の注意は「限定の読み方」に置き、個別Claimの刊行物・期間・根拠を省略する根拠にはしない。

Relation詳細で先頭Claimを意味比較の基準にしない。最初のUUIDは既存API取得の入口だけであり、強さ・代表性・確からしさを持たない。ClaimはUUID順で安定表示し、番号はその画面内の移動用。次の区分を見出しとして分離する。

| 区分 | 判定と役割 |
| --- | --- |
| Graphに表示中 | 選択DisplayRelationのclaimIdsに含む。線の構成そのもの |
| Graphには未表示 | 同一SPOの関連Claimで現在の具体条件には合うが、その線のclaimIdsにない |
| 現在の探索条件の対象外 | 同一SPOの関連Claimでpredicate／三typed条件に合わない。比較のためだけに表示 |

Graph未表示は「通信で一度も取得していない」とは断定しない。未取得ページ、閉じた枝、休止等があり得る。現在の公開APIでは理由を区別できないため、取得履歴を推測しない。関連Claimを確認してもGraphへ追加せず、neighborsのcursor・受理ページ・展開意図を進めない。

APIは既存 `/api/claims/{id}` とrelatedClaimIdsを再利用する。広い関連Claimと比較同一性を混同しない。取得中・一部失敗は個別主張の先頭付近に表示し、取得できた範囲を全件と見せない。再試行とAbort／探索世代の境界を維持する。

「主張 Nを読む」でカードへ移動し、「根拠を読む」でそのClaimの最初のCitationへ移動できる。Graph座標・選択・pan/zoomは変えない。個別Claimを選ぶテキスト一覧では、選んだClaimを基準とする従来比較を維持する。

## 個別ClaimとCitation

肯否、期間、domain固有の限定、刊行物scope、出典未確認状態を個別に保持する。Role／立場未指定の場合は、その項目を指定しないことと、資料の具体的な記載は根拠で確認できることを説明する。

Citationでは、Sourceタイトル、支持／反証／背景、locator、URL、既存の原表記＋言語、Citation.noteの確認範囲を先に読む。書誌事項（公開日、著者、発行者、版、アクセス日、Source.note）は折り畳みで保持する。Source公開日を関係期間へ変換しない。同じSourceが複数Claimを支えても独立根拠が増えたとは説明しない。デモURLの無効化・外部リンクの安全設定も維持する。

## 既存の意味とデータの不足

浦沢直樹→PLUTOは現在のv2でRoleも刊行物scopeも構造化されていない。Citationには指定刊行物のクレジット・受入範囲があるため根拠を読めるが、「作画」へ補完しない。台帳の保留判断と一致させる。

今後の不足は、構造化済み情報の表示漏れ／資料・noteにあるが未構造化／datasetにない／現在の意味契約では表せない、に分けて記録する。表示上の不自然さを新しい事実で埋めない。出版クレジット・著者性・原作派生等の追加受入／モデル化は別の設計判断である。

## 変更境界

API契約、Cypher、DBモデル、語彙契約、Claim schema、三typed型、条件キー／cursor、GraphState、凍結dataset、レイアウト・曲率は不変。新しい表示文字列は `lib/i18n/relation-presentation.ts` のlocale境界へ置き、保存語彙と分離する。全面多言語化、分類・Capsule・投稿はこの実装に含まない。
