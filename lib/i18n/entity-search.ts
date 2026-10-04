const ja = {
  title: "対象を探す", name: "名前・別名", kind: "検索対象", all: "すべて",
  kinds: { person: "人物", work: "作品", organization: "組織" },
  submit: "検索", submitting: "検索中…", loading: "検索結果を取得中…",
  emptyInput: "名前や別名を入力してください。", descriptionMissing: "説明なし",
  help: "人物・作品・組織を選んで、関係とその出典を辿ってください。",
  noResults: "検索結果はありません。名前や検索対象を変えて検索してください。",
  more: "他にも候補があります。検索語や検索対象を絞り込んでください。",
  invalidKind: "検索対象の種類が不正です。", unsupported: "未対応の検索条件です。",
  aliases: "別名", count: (count: number) => `${count}件の候補`,
};
export function searchLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
