const ja = { tools: "探索の道具" };
const en: typeof ja = { tools: "Exploration tools" };
export function designLabels(locale = "ja") { return locale.split("-")[0] === "en" ? en : ja; }
