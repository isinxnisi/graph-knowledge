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
export function capsuleHistoryLabels(locale = "ja") { const resources: Record<string, typeof ja> = { ja }; return resources[locale] ?? resources[locale.split("-")[0]] ?? ja; }
