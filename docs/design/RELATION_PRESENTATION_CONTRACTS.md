# Graphの関係概要と独立Claim詳細

Phase 21〜22の採用契約。Phase 16の[意味モデル原則](RELATION_MODEL_PRINCIPLES.md)を維持し、既存データを読み取るpresentationだけを変更する。詳細の整合・不足は[Phase 21](../archive/phase-21-relation-presentation/README.md)、Graphラベルの意味優先は[Phase 22](../archive/phase-22-semantic-edge-labels/README.md)を参照。

## 線が表す範囲

DisplayRelationは表示中の同じsubjectId / predicate / objectIdのClaim UUIDをまとめたもの。方向・表示ID・独立Claim・比較キー・DB保存意味は変更しない。条件外やGraph未表示の関連Claimを線のラベル・肯否・限定内訳へ加えない。

線では「この二者がどう関係するか」を先に示す。構造化済みの具体値がある場合、短い見出し（制作／組織／参加）と具体語を表示し、長いpredicate表示名を繰り返さない。制作Role、組織関与立場、Event参加立場の語彙は別々の辞書を使う。短い見出しは表示文言であり、新taxonomy・保存語彙・条件ではない。

2026-10-07の視覚調整：具体値がある場合だけカテゴリを小さいpatch（11px・控えめな背景と境界・4px角丸）として具体語の左へ添える。具体語は既存15pxのCytoscapeラベル。「影響を受けた」「アシスタントだった」や具体値なしのfallbackにpatchを付けない。Cytoscapeの部分文字装飾を補う小さいDOMレイヤーで、公開labelのboundsに合わせ、pan／zoom／移動／選択に追随する。patchのクリックも同じRelationを選択する。Graphのテキスト代替・選択説明にはカテゴリを含む従来の文字列を残し、描画用の`badge`と`canvasLabel`だけ分離する。新しいGraph要素・保存分類ではない。

同日の追加比較：具体Roleなしの制作fallbackは、文言「制作に関わった」を変更せず、ラベル全体を小さい背景・境界線・角丸のbadge風に描く。Cytoscapeの既存ラベルへ13px・背景・1px境界線・4px余白を適用し、別のカテゴリpatchや二重ラベルは追加しない。選択時は既存アクセント背景に境界線も追随する。具体Roleがある線の`[制作] プロデュース`等は従来どおり。影響・アシスタント等の自然なラベルも変更しない。

追加比較は既存UI unit 71件と漫画Playwright 2件で確認した。浦沢起点のスクリーンショットでラベル全体のbadge表示を確認し、ラベルクリックから独立Claim／Sourceへ移動できること、PLUTO起点の具体Role patch・条件変更・座標保持も検証した。意味文言・API・DB・datasetは変更していない。

具体語は二値まで表示する。ID順で安定させ、信頼度・頻度・期間で順位付けしない。二語の合計が区切り込み24文字を超える場合、語の間で改行する（文字数はUnicodeコードポイント）。長い語を「N種類」へ置き換えない。三値以上は具体語二つと「ほかN件」を示す。このNは未表示の限定値数で、Claim／Source／接続Entity数ではない。全ての値は詳細で確認できる。

Graphでは「指定なし」「Claim件数」「期間」「scope」「Source数」をラベルへ出さない。Role／立場の具体値がない場合は従来のpredicate表示名へfallbackする。例えば浦沢直樹→PLUTOは「制作に関わった」のまま。具体値がある線でも刊行物・期間等の適用範囲を全作品・全期間へ一般化しない。

affirmed / denied混在は全predicateで「肯定・否定あり」＋点線。異説・矛盾・信頼度・正しさを判定しない。否定だけなら「否定」＋破線を維持する。特定の限定値だけに否定がある場合、値を列挙するラベルには「否定のみ」「肯否あり」を添え、否定のRoleを肯定済みRoleへ変換しない。省略された値も全て肯定済みとは解釈しない。

指定なしのClaimも独立して保持し、Relation詳細の限定内訳と個別Claimで確認できる。具体語のラベルは、線に含まれる全Claimが同じ限定を持つという意味ではない。nullを全Role・全期間・全巻の認定へ変換しない。Citation.noteやEntity descriptionからRole等を推定しない。

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


## 局所badge調整の検証（2026-10-07）

`tests/ui-state.test.tsx`の71件と、既存Playwrightの漫画PLUTO・science・Event・demo代表表示4ケースが成功。patchの有無・11px・クリック対応・pan／zoomへの追随、条件変更後のpatch削除、自然なラベル／fallback、独立Claim／Sourceと既存座標を検証した。実ブラウザのPLUTO・science・Eventのスクリーンショットで視覚階層も確認した。typecheck・変更したTS/TSXへのeslint・buildも成功。専用API integration／seedは実行せず、意味モデル・API・DB・datasetには差分なし。新しい画像アーカイブは追加していない。
