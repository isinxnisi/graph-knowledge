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
