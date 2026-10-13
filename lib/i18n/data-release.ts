const ja = {
  changed: "登録データが更新されました。古い探索へ混ぜず、同じ起点と条件で読み直してください。",
  readingChanged: "登録データが更新されました。保存内容を読み直してください。",
  workspaceChanged: "登録データが更新されました。探索途中の復元をやり直してください。",
  preparing: "公開データを準備中です。",
  reload: "更新データで探索を読み直す",
  withdrawn: "撤回された主張",
  withdrawnHelp: "現在の探索には含まれません。元の主張と、その参照資料を表示しています。",
  replacement: "差替え先の主張を読む",
};
const en: typeof ja = {
  changed: "The dataset has changed. Reload from the same starting entity and conditions without mixing it into the old exploration.",
  readingChanged: "The dataset has changed. Reload the saved content.",
  workspaceChanged: "The dataset has changed. Restore the exploration again.",
  preparing: "Preparing public data.",
  reload: "Reload exploration with updated data",
  withdrawn: "Withdrawn claim",
  withdrawnHelp: "Excluded from current exploration. The original claim and its sources are shown here.",
  replacement: "Read replacement claim",
};
export function dataReleaseLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
