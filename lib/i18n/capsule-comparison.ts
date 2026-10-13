const ja = {
  title: "共有時からの変更", open: "現在の保存内容と比較", close: "比較を閉じる", retry: "現在の保存内容を再取得して比較",
  loading: "比較する保存内容を確認しています…", failed: "比較する保存内容を取得できませんでした。再確認してください。",
  direction: (before: number, after: number) => `共有時の内容版 ${before} → 取得時の現在版 ${after}`,
  help: "題名・説明と、選んだ対象・主張の差分です。知識や出典の更新履歴、事実の訂正を示すものではありません。共有リンクとコメントの版は変わりません。",
  before: (revision: number) => `共有時（内容版 ${revision}）`, after: (revision: number) => `取得時の現在（内容版 ${revision}）`,
  titleField: "題名の変更", noteField: "説明の変更", noNote: "説明なし", unchangedText: "題名・説明は同じです。",
  unchanged: "題名・説明・選んだ対象と主張に変更はありません。",
  entities: "対象の構成", claims: "主張の構成", added: "加えた参照", removed: "外した参照", none: "なし",
  counts: (added: number, removed: number, retained: number) => `追加 ${added}件 · 除外 ${removed}件 · 共通 ${retained}件`,
  referencesLoading: "変更した参照の現在の名称・主張を確認しています…",
  referencesHelp: "名称・主張は現在のデータです。外した参照も、現在の内容・根拠を別タブで確認できます。",
  referencesFailed: "一部の参照を確認できませんでした。IDと構成差分は保持しています。",
  referenceUnavailable: "現在の内容を確認できません", inspect: "現在の内容・根拠を開く（別タブ）",
};
const en: typeof ja = {
title: "Changes since sharing", open: "Compare with the current saved content", close: "Close comparison", retry: "Reload current content and compare",
  loading: "Loading content for comparison…", failed: "Could not load the content to compare. Please retry.",
  direction: (before: number, after: number) => `Shared version ${before} → Current version ${after} at retrieval`,
  help: "Changes to the title, description and selected references. This is not a history of knowledge or source updates, or a correction of facts. The shared link and comment version stay the same.",
  before: (revision: number) => `When shared (version ${revision})`, after: (revision: number) => `Current at retrieval (version ${revision})`,
  titleField: "Title changes", noteField: "Description changes", noNote: "No description", unchangedText: "Title and description are unchanged.",
  unchanged: "Title, description and selected entities and claims are unchanged.", entities: "Entity selection", claims: "Claim selection", added: "Added references", removed: "Removed references", none: "None",
  counts: (added: number, removed: number, retained: number) => `Added ${added} · Removed ${removed} · Retained ${retained}`,
  referencesLoading: "Checking current names and claims for changed references…",
  referencesHelp: "Names and claims use current data. You can open removed references in another tab to check their current content and evidence.",
  referencesFailed: "Some references could not be checked. IDs and selection changes are retained.", referenceUnavailable: "Current content unavailable", inspect: "Open current content and evidence (new tab)",
};
export function capsuleComparisonLabels(locale = "ja"): typeof ja {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
