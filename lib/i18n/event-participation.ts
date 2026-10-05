const ja = {
  roles: { CHAIR: "会議議長" }, invalid: "Event参加上の立場が不正です。",
  title: "出来事への参加上の立場", edit: "参加上の立場を調整", noRole: "参加上の立場で絞らない", specify: "参加上の立場を指定する",
  none: "参加上の立場の限定なし", empty: "立場の選択なし・参加関係は表示しない",
  help: "選んだ立場を明示した参加の主張だけを表示します。否定も含みます。他の関係は絞りません。",
  broad: "立場を限定していない参加の主張も含めて辿ります。",
  limitation: "この開催回への参加を伴う会議議長です。名誉議長・委員会役職・全日程出席を示しません。",
  evidence: "資料の原参加立場表記", language: "資料表記の言語",
  sameComparison: "同じ参加立場・期間の比較候補（真偽の判定ではありません）", differentComparison: "参加立場の限定または期間が異なる主張",
  comparison: "立場や期間の異なる主張と、立場を限定していない参加を含みます。互いの肯否を自動判定しません。",
  eventPeriod: "開催期間", periodHelp: "この開催回自体の期間です。人物の全日程参加を示しません。",
};
export function eventParticipationLabels(locale = "ja") { const resources: Record<string, typeof ja> = { ja }; return resources[locale] ?? resources[locale.split("-")[0]] ?? ja; }
