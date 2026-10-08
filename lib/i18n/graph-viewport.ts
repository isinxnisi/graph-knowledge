const ja = {
  title: "Graphの表示操作",
  zoomIn: "Graphを拡大",
  zoomOut: "Graphを縮小",
  zoom: "Graphの表示倍率",
  fit: "全体を表示",
  selection: "選択を表示",
  selectionHelp: "選択中の対象、または関係と両端を表示します。枝の開閉は変えません。",
};

export function graphViewportLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
