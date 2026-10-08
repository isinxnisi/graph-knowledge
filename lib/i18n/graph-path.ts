const ja = {
  title: "起点からの経路",
  summary: (count: number) => `表示中の最短経路（${count}関係）`,
  help: "今のGraphに表示中の線を辿る最短経路の一つです。実際に操作した履歴ではありません。矢印は主張の向きです。",
  meaning: "否定を含む線も辿ります。経路があっても、両端の直接の関係・因果関係や、各主張の成立を示すものではありません。",
  empty: "表示中のGraph内には経路がありません。未取得の関係や閉じた枝は含めていません。",
  read: "関係と根拠を見る",
};

export function graphPathLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
