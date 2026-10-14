const ja = {
  navigation: "探索画面の切り替え",
  search: "検索",
  graph: "Graph",
  detail: "選択の詳細",
  toRelations: "隣接一覧へ",
  backToGraph: "Graphへ戻る",
  backToRelation: "元の関係へ戻る", backToClaim: "元の記録へ戻る",
  touchHelp: "対象をタップして展開。線を選ぶと主張と出典へ。",
};

const en: typeof ja = {
  navigation: "Explorer panels",
  search: "Search",
  graph: "Graph",
  detail: "Selection details",
  toRelations: "Adjacent relations",
  backToGraph: "Back to graph",
  backToRelation: "Back to the relation", backToClaim: "Back to the record",
  touchHelp: "Tap an entity to expand. Select a line to read claims and sources.",
};
export function explorerPaneLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
