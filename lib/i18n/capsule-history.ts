const ja = {
  title: "共有した版を読み返す", open: "共有した版を選ぶ", close: "版の一覧を閉じる",
  help: "共有したことのある版だけを表示します。リンクが失効した版も本人は読めます。共有せずに更新した過去版は残りません。",
  empty: "まだ共有した版はありません。", loading: "共有した版を確認しています…",
  failed: "版の一覧を取得できませんでした。再確認してください。", retry: "版の一覧を再確認",
  read: (revision: number) => `内容版 ${revision} を読む`,
  reading: (revision: number) => `共有時の内容版 ${revision} を閲覧中`,
  snapshotHelp: "題名・説明・選んだ参照は共有時の内容です。対象・主張・出典は現在のデータを読みます。この画面を開いても共有リンクは再開しません。",
  current: "現在の保存内容へ戻る", updated: "内容の更新日時：",
};
const en: typeof ja = {
title: "Revisit shared versions", open: "Choose a shared version", close: "Close version list",
  help: "Only versions that have been shared are listed. You can read your own versions after their links expire. Unshared past versions are not retained.",
  empty: "No versions have been shared yet.", loading: "Checking shared versions…", failed: "Could not load the version list. Please retry.", retry: "Reload version list",
  read: (revision: number) => `Read version ${revision}`, reading: (revision: number) => `Reading shared version ${revision}`,
  snapshotHelp: "The title, description and selected references are from the shared version. Entities, claims and sources use current data. Opening this view does not reactivate the sharing link.",
  current: "Return to current saved content", updated: "Content updated: ",
};
export function capsuleHistoryLabels(locale = "ja"): typeof ja {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
