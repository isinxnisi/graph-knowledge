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
export function capsuleComparisonLabels(locale = "ja") { const resources: Record<string, typeof ja> = { ja }; return resources[locale] ?? resources[locale.split("-")[0]] ?? ja; }
