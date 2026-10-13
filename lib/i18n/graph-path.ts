const ja = {
  title: "起点からの経路",
  summary: (count: number) => `表示中の最短経路（${count}関係）`,
  help: "今のGraphに表示中の線を辿る最短経路の一つです。実際に操作した履歴ではありません。矢印は主張の向きです。",
  meaning: "否定を含む線も辿ります。経路があっても、両端の直接の関係・因果関係や、各主張の成立を示すものではありません。",
  empty: "表示中のGraph内には経路がありません。未取得の関係や閉じた枝は含めていません。",
  read: "関係と根拠を見る",
};

const en: typeof ja = {
  title: "Path from the starting entity",
  summary: (n: number) => `A shortest visible path (${n} relations)`,
  help: "One shortest path along the lines in this graph, not your navigation history. Arrows show the direction of claims.",
  meaning: "Paths can include denied claims. A path does not establish a direct relation, causation, or the truth of its claims.",
  empty: "No path in the visible graph. Unfetched relations and closed branches are excluded.",
  read: "Read relation and evidence",
};
export function graphPathLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
