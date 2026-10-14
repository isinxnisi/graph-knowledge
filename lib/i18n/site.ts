const ja = {
  signedIn: "ログイン中", signedInAs: (name: string) => `${name}でログイン中`, memberLink: (name: string) => `${name}のアカウントを開く（別タブ）`, datasetAbout: "表示中のデータ",
  name: "関係性を探索する", navigation: "サービス内の移動",
  explore: "探索", exploreLink: "探索を開く（別タブ）",
  account: "アカウント", accountLink: "アカウントを開く（別タブ）",
  appearance: "表示テーマ", dark: "ダークモード", toLight: "ライトモードへ", toDark: "ダークモードへ",
  palette: "ダーク配色", brown: "ブラウン", blue: "ブルー",
  settings: "設定", accountSettings: "アカウント設定", library: "自分のCapsule",
  appearanceHelp: "表示テーマはこのブラウザに保存します。ログインは不要です。",
  appearanceFailed: "テーマを保存できません。この画面には反映しています。",
};
const en: typeof ja = {
  signedIn: "Signed in", signedInAs: (name: string) => `Signed in as ${name}`, memberLink: (name: string) => `Open account for ${name} (new tab)`, datasetAbout: "Current data",
  name: "Explore connections",
  navigation: "Site navigation",
  explore: "Explore",
  exploreLink: "Open explorer (new tab)",
  account: "Account",
  accountLink: "Open account (new tab)",
  appearance: "Appearance",
  dark: "Dark mode",
  toLight: "Use light mode",
  toDark: "Use dark mode",
  palette: "Dark palette",
  brown: "Brown",
  blue: "Blue",
  settings: "Settings",
  accountSettings: "Account settings",
  library: "My Capsules",
  appearanceHelp: "Appearance is saved in this browser. No login is required.",
  appearanceFailed: "Could not save appearance. It is applied to this page.",
};
export function siteLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
