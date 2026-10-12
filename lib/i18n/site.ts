const ja = {
  name: "関係性を探索する", navigation: "サービス内の移動",
  explore: "探索", exploreLink: "探索を開く（別タブ）",
  account: "アカウント", accountLink: "アカウントを開く（別タブ）",
  appearance: "表示テーマ", dark: "ダークモード", toLight: "ライトモードへ", toDark: "ダークモードへ",
  palette: "ダーク配色", brown: "ブラウン", blue: "ブルー",
  settings: "設定", accountSettings: "アカウント設定", library: "自分のCapsule",
  appearanceHelp: "表示テーマはこのブラウザに保存します。ログインは不要です。",
  appearanceFailed: "テーマを保存できません。この画面には反映しています。",
};
export function siteLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
