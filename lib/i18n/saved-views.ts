const ja = {
  launch: "保存・再訪", title: "このブラウザの保存ビュー", close: "保存ビューを閉じる",
  help: "起点と適用中の条件を保存します。開くと現在のデータを取得します。展開した枝・配置・根拠の内容は保存しません。",
  local: "この端末・ブラウザ内だけに保存されます。ブラウザのデータを消すと失われます。他端末への同期・共有はありません。",
  name: "保存ビューの名前", save: "現在の起点と条件を保存", saved: "保存しました。次回も「保存・再訪」から開けます。",
  list: "保存したビュー", empty: "まだ保存ビューはありません。起点を選び、気になる条件で保存できます。",
  noRoot: "探索の起点を選ぶと保存できます。", open: "開く", opening: "起点を確認中…", remove: "削除", removed: "保存ビューを削除しました。",
  root: "保存する起点", limit: "保存は20件までです。不要なビューを削除すると追加できます。",
  savedAt: (value: string) => `保存：${new Date(value).toLocaleString("ja-JP")}`,
  openNamed: (title: string) => `${title}を開く`, removeNamed: (title: string) => `${title}を削除`,
  storage: "ブラウザの保存領域を利用できません。保存設定や空き容量を確認して再試行してください。",
  invalid: "保存データの形式に対応していないか、破損しています。元のデータは変更していません。",
  retry: "保存一覧を再読込", missing: "保存した起点が見つかりません。現在の探索はそのままです。",
  failed: "起点を確認できませんでした。現在の探索を保ったまま、もう一度「開く」で再試行できます。",
};
export function savedViewLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
