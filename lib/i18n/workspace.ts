const ja = {
  launch: "探索途中を保存・再開", title: "探索途中の保存", close: "探索途中の保存を閉じる",
  help: "枝の開閉・取得したページ数・配置を、このブラウザに1件保存します。再開時は現在のデータを読み直すため、関係や表示件数が変わることがあります。",
  local: "データセットごとに1件。自動保存・同期はありません。ブラウザのデータ削除で失われます。保存ビューのJSONファイルには含まれません。",
  name: "途中保存の名前", save: "現在の探索途中を保存", replace: "保存済みの途中を現在の探索で置き換える",
  saved: "探索途中を保存しました。再読込後もここから再開できます。",
  stored: "保存済みの途中", empty: "探索途中はまだ保存していません。", noRoot: "起点を選び、探索を進めると保存できます。",
  savedAt: (date: string) => `保存：${new Date(date).toLocaleString("ja-JP")}`,
  scope: (branches: number, pages: number) => `保存した枝：${branches}件 / 取得済み：${pages}ページ`,
  open: "保存した途中を再開", cancel: "再開を中止", remove: "途中保存を削除", removed: "途中保存を削除しました。",
  opening: (done: number, total: number) => `現在のデータを取得中… ${done} / 最大${total}ページ`,
  loading: "Graphの取得が終わってから保存してください。",
  unfetched: "保存時に取得済みの枝がありません。近傍を取得して続けられます。",
  invalid: "途中保存の形式に対応していないか、破損しています。元の保存は変更していません。",
  storage: "ブラウザの保存領域を利用できません。保存設定や空き容量を確認してください。",
  conflict: "別のタブで途中保存が変わりました。再読込して内容を確認してください。",
  limit: "途中保存は40ページまでです。現在の関係が表示・取得の上限を超えた場合も再開できません。起点と条件の保存ビューから探索を始め直せます。",
  response: "現在の関係を確認できませんでした。今の探索はそのままです。もう一度再開してください。",
  timeout: "再開に時間がかかりすぎたため中断しました。今の探索はそのままです。再試行できます。",
  missing: "保存した対象が見つかりません。今の探索と途中保存はそのままです。",
  retry: "途中保存を再読込",
  restored: (skipped: number) => `現在のデータで探索途中を再開しました。保存時から関係が変わることがあります。${skipped ? `現在の関係から辿れない枝${skipped}件は再開していません。` : ""}`,
};
export function workspaceLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
