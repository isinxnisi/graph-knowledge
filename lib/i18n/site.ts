const ja = {
  signedIn: "ログイン中", signedInAs: (name: string) => `${name}でログイン中`, memberLink: (name: string) => `${name}のアカウントメニュー`, datasetAbout: "表示中のデータ",
  name: "Plunode", navigation: "サービス内の移動",
  explore: "探索へ戻る", exploreLink: "探索へ戻る",
  account: "アカウント", accountLink: "ログイン", posts: "自分の投稿", logout: "ログアウト", logoutFailed: "ログアウトを確認できません。再試行してください。", accountNavigation: "本人メニュー",
  appearance: "表示テーマ", dark: "ダークモード", toLight: "ライトモードへ", toDark: "ダークモードへ",
  palette: "ダーク配色", brown: "ブラウン", blue: "ブルー",
  settings: "表示設定", accountSettings: "アカウント設定", library: "保存したCapsule",
  appearanceHelp: "表示テーマはこのブラウザに保存します。ログインは不要です。",
  appearanceFailed: "テーマを保存できません。この画面には反映しています。",
};
const en: typeof ja = {
  signedIn: "Signed in", signedInAs: (name: string) => `Signed in as ${name}`, memberLink: (name: string) => `Account menu for ${name}`, datasetAbout: "Current data",
  name: "Plunode",
  navigation: "Site navigation",
  explore: "Back to exploration",
  exploreLink: "Back to exploration",
  account: "Account",
  accountLink: "Log in", posts: "My posts", logout: "Log out", logoutFailed: "Could not confirm logout. Try again.", accountNavigation: "Member menu",
  appearance: "Appearance",
  dark: "Dark mode",
  toLight: "Use light mode",
  toDark: "Use dark mode",
  palette: "Dark palette",
  brown: "Brown",
  blue: "Blue",
  settings: "Display settings",
  accountSettings: "Account settings",
  library: "Saved Capsules",
  appearanceHelp: "Appearance is saved in this browser. No login is required.",
  appearanceFailed: "Could not save appearance. It is applied to this page.",
};
export function siteLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
