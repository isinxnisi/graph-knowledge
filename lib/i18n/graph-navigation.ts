const ja = {
  title: "表示中の対象へ移動",
  compactTitle: "対象へ移動",
  filter: "表示中の名前・説明で絞り込む",
  help: "今のGraphに表示されている対象から選びます。位置と詳細へ移動し、枝の開閉は変えません。",
  count: (matched: number, total: number) => `${total}件中 ${matched}件`,
  empty: "表示中の対象に一致しません。別の名前や説明で絞り込んでください。",
  move: "位置と詳細へ移動",
  descriptionMissing: "説明なし",
};

const en: typeof ja = {
  title: "Go to a visible entity",
  compactTitle: "Go to entity",
  filter: "Filter visible names and descriptions",
  help: "Choose an entity already in this graph. Move to its position and details without opening or closing branches.",
  count: (n: number, total: number) => `${n} of ${total}`,
  empty: "No visible entities match. Try a different name or description.",
  move: "Go to position and details",
  descriptionMissing: "No description",
};
export function graphNavigationLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
