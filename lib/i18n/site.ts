const ja = {
  name: "関係性を探索する", navigation: "サービス内の移動",
  explore: "探索", exploreLink: "探索を開く（別タブ）",
  account: "アカウント", accountLink: "アカウントを開く（別タブ）",
  appearance: "表示テーマ", dark: "ダークモード", toLight: "ライトモードへ", toDark: "ダークモードへ",
  palette: "ダーク配色", brown: "ブラウン", blue: "ブルー",
};
export function siteLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
