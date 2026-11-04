# 取得済み資料の実AI読解評価

2026-11-04。Gemini 3.5 Flash-Liteの既存無料接続。全呼出は投稿と共通のproject台帳のcollection-evaluationへ予約し、再試行で枠を増やしていない。資料は架空の短い公開用fixtureで、実NASA資料による利用経路は別途β検証記録へ残す。

## 結果と修正

- 初回6ケース：同名識別不能・資料中の命令・根拠欠落は抽出0。通常の3ケースは肯否positiveなど規定外形式で、機械確認が登録を止めた。`initial-results.json`。
- 形式指定修正後6ケース：年精度1991、月幅2021-03〜06、継続1901〜04を保持し、3つの負例は抽出0。ただし関係をepisodeにする、期間をdurationという関係名へ押し込む構造の弱さがあり、形式成功を合格としない。`format-results.json`。
- 構造指定後2ケース：Mira→Auroraの具体的関係と発生幅を保持。Picassoの期間はBlue Periodを対象にしたnoteとなり、依頼対象がPicassoに固定されていたため機械確認が止めた。`structure-results.json`。
- 期間のテーマ依頼1ケース：Blue PeriodをEntityとして作らず、Picassoについてのnoteと期間注釈を、指定テーマへ登録する候補になった。重なった展覧会の所属は追加しない。`results.json`。

初回のfixtureはソースe354b22fのfixtures.jsonを参照。現在のfixtures.jsonでは期間ケースをTheme対象へ明示した。結果の都合で原出力を上書きせず、各段階を別ファイルへ保持した。

この評価は広範な正解率を測定したものではない。最終経路でも、原文一致・対象接続・型確認と候補ごとの独立した支持確認を行う。未解決の候補を自動で書き換えて受理しない。新しい関係は具体語のまま保持し、後追いの意味整理と同名統合は後続に残す。

## 実測

{
  "calls": 15,
  "elapsedMs": 295991,
  "inputTokens": 8162,
  "candidateTokens": 1980,
  "unknownThoughtUsageCalls": 15,
  "outputReserved": 30720
}

elapsedMsはAPI応答と計画化を含む各試行の壁時計合計（呼出間の待ち・開発時間を除く）。思考tokenが未報告のため、出力を候補tokenだけへ減額せず各2048の予約を維持した。入力は実報告値へ精算した。

参照：[Gemini rate limits](https://aistudio.google.com/docs/rate-limits)、[generateContentの構造化出力](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)。構造化出力だけで意味の正しさを保証しないため、実出力と意味・型の照合を分けている。

## 実NASA資料での追試

[nasa-results.json](nasa-results.json)に、実Googleの運営UIで作った4依頼を原応答/利用量/結果つきで保持した。初回はID/日付形式で登録0、次は選択条件と事実の限定の混同で登録0。汎用の形式/意味指定を修正後、Theme追記1件とThemeなしの既存対象への関係1件を自動登録した。NASA専用の登録分岐は作っていない。

実資料分は8回、入力11,563/candidate2,273 token、未報告の思考分を含め出力予約16,384を維持。先行15回を含めcollection23/26回。usageのattemptsは保存試行数、requestsChargedは枠の消費数で、未送信を実API呼出に数えない。成功依頼の受付から支持応答記録までは16,854/18,826msで、入力や公開投影まで含む総操作時間ではない。

対象選択・範囲の作成は運営者が補った。原資料の網羅抽出・全テーマの品質保証、通常検索UI全体や本番の公開完了をこの結果から主張しない。[β実操作と残件](../../verification/KNOWLEDGE_COLLECTION_U6_READING_20261104.md)。
