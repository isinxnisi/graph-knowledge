const ja = {
  title: "探索してみる", help: "追加条件なしで開始します。",
  start: (name: string) => `${name}から探索を開始`,
};
const en: typeof ja = {
  title: "Try exploring",
  help: "Start without additional conditions.",
  start: (name: string) => `Explore from ${name}`,
};
export function startExampleLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
