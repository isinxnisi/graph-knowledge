const ja = {
  navigation: "探索画面の切り替え",
  search: "検索",
  graph: "Graph",
  detail: "選択の詳細",
};

export function explorerPaneLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
