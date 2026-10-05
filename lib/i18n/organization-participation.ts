const ja = {
  invalid: "組織関与の立場が不正です。",
  positions: { VISITOR: "Visitor", ASSOCIATE_PROFESSOR: "Associate professor" },
  title: "組織との関わりの立場", edit: "組織との関わりの立場を調整", noPosition: "立場で絞らない", specify: "立場を指定する",
  none: "立場の限定なし", empty: "立場の選択なし・組織との関わりは表示しない",
  help: "選んだ立場を明示した主張だけを表示します。否定も含みます。立場の限定なしの主張は対象外です。他の関係は絞りません。",
  broad: "立場を限定していない主張も含めて辿ります。",
  limitation: "資料上の立場の表記です。雇用形態・常勤・日本の職位への対応を示しません。期間は各主張で確認してください。",
  evidence: "資料の原立場表記", language: "資料表記の言語", count: (count: number) => `立場 ${count}種類`,
  sameComparison: "同じ立場・期間の比較候補（真偽の判定ではありません）", differentComparison: "立場の限定または期間が異なる主張",
  comparison: "立場・期間の違う主張や、立場の限定なしの主張も含みます。同じ二者の関わりとしてまとめており、互いの肯否を自動判定しません。",
};
export function organizationParticipationLabels(locale = "ja") { const resources: Record<string, typeof ja> = { ja }; return resources[locale] ?? resources[locale.split("-")[0]] ?? ja; }
