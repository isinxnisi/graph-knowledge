# Graphの関係概要と独立Claim詳細

Phase 21〜22の採用契約。Phase 16の[意味モデル原則](RELATION_MODEL_PRINCIPLES.md)を維持し、既存データを読み取るpresentationだけを変更する。詳細の整合・不足は[Phase 21](../archive/phase-21-relation-presentation/README.md)、Graphラベルの意味優先は[Phase 22](../archive/phase-22-semantic-edge-labels/README.md)を参照。

## 線が表す範囲

DisplayRelationは表示中の同じsubjectId / predicate / objectIdのClaim UUIDをまとめたもの。方向・表示ID・独立Claim・比較キー・DB保存意味は変更しない。条件外やGraph未表示の関連Claimを線のラベル・肯否・限定内訳へ加えない。

線では「この二者がどう関係するか」を先に示す。構造化済みの具体値がある場合、短い見出し（制作／組織／参加）と具体語を表示し、長いpredicate表示名を繰り返さない。制作Role、組織関与立場、Event参加立場の語彙は別々の辞書を使う。短い見出しは表示文言であり、新taxonomy・保存語彙・条件ではない。

2026-10-07の視覚調整：具体値がある場合だけカテゴリを小さいpatch（11px・控えめな背景と境界・4px角丸）として具体語の左へ添える。具体語は既存15pxのCytoscapeラベル。「影響を受けた」「アシスタントだった」や具体値なしのfallbackにpatchを付けない。Cytoscapeの部分文字装飾を補う小さいDOMレイヤーで、公開labelのboundsに合わせ、pan／zoom／移動／選択に追随する。patchのクリックも同じRelationを選択する。Graphのテキスト代替・選択説明にはカテゴリを含む従来の文字列を残し、描画用の`badge`と`canvasLabel`だけ分離する。新しいGraph要素・保存分類ではない。

同日の間隔調整では、patch右端から主ラベルの背景bounds左端までの距離を8→3に縮めた（Graphの座標単位、zoomに追随）。約5px分だけ具体語へ近づけ、文字・色・意味・選択対応を維持する。

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

2026-10-07の取得改善：関連主張は一件ごとの応答到着時に表示し、遅い一件のために他の根拠を待たせない。取得中は入口Claimを含む取得済み件数／全ID件数を表示する。失敗件数と未完了の説明を残し、進行中の一括取得が終わってから失敗IDだけを再試行する。取得済みカードと書誌情報の開閉状態は再試行中も維持する。Relation詳細の主張番号は入口とrelatedClaimIdsの全IDをUUID順に並べて先に割り当て、未取得分は欠番として、応答順や再試行で読んでいる番号が変わらないようにする。移動ボタンは取得済みカードだけに提供する。

対象切替・探索世代変更で詳細セッションを破棄し、進行中の通信をabortする。取消後に到着する成功・失敗は受理しない。個別Claim詳細にも同じ逐次表示と失敗分再試行を適用する。APIの全ID返却・並列取得は小規模datasetを前提とした既存仕様を維持し、大量データ向けの上限・ページングは別途設計する。

「主張 Nを読む」でカードへ移動し、「根拠を読む」でそのClaimの最初のCitationへ移動できる。Graph座標・選択・pan/zoomは変えない。個別Claimを選ぶテキスト一覧では、選んだClaimを基準とする従来比較を維持する。

### 関係する対象の詳細へ進む（2026-10-08追加）

Relation／個別Claim詳細の上部に、主体・対象それぞれの「詳細を見る」を置く。根拠を読んだ後、その人物・作品等の概要確認や起点切替へ直接進める。既存GraphのClaimSummaryとEntitySummaryから表示し、主張詳細の取得中・失敗中も使える。表示中GraphにないEntityへの操作は提供せず、同名の対象には既存の補助ラベルを使う。

選択をEntityへ切り替え、詳細領域の先頭へフォーカスとスクロールを移す。狭い画面でも詳細領域に留まる。既存のEntity詳細読取だけを行い、近傍取得・枝の開閉／復元・起点・条件・cursor・座標・pan／zoom・直前探索のsnapshotは変更しない。起点切替や展開はEntity詳細で明示的に行い、既存の一件復帰を維持する。主張詳細を離れた時の通信取消・旧応答排除も既存の詳細セッション境界を使う。

この導線は画面内の選択操作であり、Saved View・永続履歴・共有URLではない。主張カード自体の保存や詳細画面専用の戻る履歴は追加しない。

検証：`npm test -- --no-file-parallelism` 246件、typecheck・lint・build・`git diff --check`が成功。追加unitは両表示モードの取得失敗中の導線、同名識別、表示外対象の除外を確認。API固定応答のPlaywrightは追加4件（390px／1440px × 個別Claim／Relation）と既存の詳細取得・Graph移動・狭い画面4件、計10件が本番ビルドで成功した。両端へのキーボード移動、Entity詳細取得、追加近傍通信なし、座標・pan／zoom維持、明示起点切替／復帰を確認した。DB integration・実機タッチ操作は未実施。

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

同日のオーバーレイ・間隔調整はUI／概要unit 77件とPlaywright 5件で検証した。漫画PLUTOで選択状態・再復元通知・通知消去前後の座標／pan／zoom保持、表示の下のNodeクリック、既存中央スクロール／縦リサイズ、具体RoleとSource・条件変更を確認。science／Eventではpatchと主ラベルbounds間の距離・pan／zoom追随・patchクリックとRelation詳細を確認した。復元通知はUIだけで消し、再復元で出し直す。文字列・独立Claim・API・DB・datasetは不変。

## 詳細の逐次取得・再試行の検証（2026-10-07）

`npm test -- --no-file-parallelism` の240件、typecheck・lint・build・`git diff --check`が成功。追加した4ケースで、遅い関連主張と独立した表示、固定番号、個別／Relation双方の繰り返し失敗と失敗分だけの再試行、既存カード・書誌開閉の維持、取得中の重複再試行抑止、対象切替時のabortと旧応答排除を確認した。最初の全体並列実行では既存の条件editorテストが5秒でtimeoutしたため、テスト内容や制限時間を変えず直列で再検証した。

API応答を固定したPlaywrightの `claim-loading.spec.ts` と既存 `graph-navigation.spec.ts` が成功。実ブラウザで逐次表示・失敗分だけの追加通信・書誌情報の開閉維持・番号維持・近傍通信とGraph件数の不変、および既存移動操作を確認した。初回の通信回数アサーションは開発Strict Modeの取消済み初回要求も数えて失敗したため、再試行前後の増分を検証するよう修正した。API／DB／datasetは変更しておらず、DB integrationや全datasetのE2Eは実行していない。
