const ja = {
  title: "対象を探す", name: "名前・別名", kind: "検索対象", all: "すべて",
  kinds: { person: "人物", work: "作品", organization: "組織", event: "出来事" },
  discoverConnections: "つながりを見つける", searchByName: "名前で検索",
  submit: "検索", submitting: "検索中…", loading: "検索結果を取得中…",
  emptyInput: "名前や別名を入力してください。", descriptionMissing: "説明なし",
  help: "人物・作品・組織・出来事を選んで、関係とその出典を辿ってください。",
  noResults: "検索結果はありません。名前や検索対象を変えて検索してください。",
  more: "他にも候補があります。検索語や検索対象を絞り込んでください。",
  invalidKind: "検索対象の種類が不正です。", unsupported: "未対応の検索条件です。",
  aliases: "別名", count: (count: number) => `${count}件の候補`,
};
const en: typeof ja = {
  title: "Find an entity",
  name: "Name or alias",
  kind: "Search for",
  all: "All kinds",
  kinds: { person: "Person", work: "Work", organization: "Organization", event: "Event" },
  discoverConnections: "Discover connections",
  searchByName: "Search by name",
  submit: "Search",
  submitting: "Searching…",
  loading: "Loading search results…",
  emptyInput: "Enter a name or alias.",
  descriptionMissing: "No description",
  help: "Choose a person, work, organization or event to explore its relations and sources.",
  noResults: "No results. Try a different name or entity kind.",
  more: "More matches exist. Narrow the name or entity kind.",
  invalidKind: "Invalid search kind.",
  unsupported: "Unsupported search condition.",
  aliases: "Aliases",
  count: (n: number) => `${n} result${n === 1 ? "" : "s"}`,
};
export function searchLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
