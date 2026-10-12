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

export function graphNavigationLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
