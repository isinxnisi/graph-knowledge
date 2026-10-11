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
export function dataReleaseLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
