const ja = {
  launch: "保存・再訪", title: "このブラウザの保存ビュー", close: "保存ビューを閉じる",
  help: "起点と適用中の条件を保存します。開くと現在のデータを取得します。展開した枝・配置・根拠の内容は保存しません。",
  local: "この端末・ブラウザ内だけに保存されます。ブラウザのデータを消すと失われます。ファイルで控えを残せます。自動同期はありません。",
  name: "保存ビューの名前", save: "現在の起点と条件を保存", saved: "保存しました。次回も「保存・再訪」から開けます。",
  list: "保存したビュー", empty: "まだ保存ビューはありません。起点を選び、気になる条件で保存できます。",
  noRoot: "探索の起点を選ぶと保存できます。", open: "開く", opening: "起点を確認中…", remove: "削除", removed: "保存ビューを削除しました。",
  root: "保存する起点", limit: "保存は20件までです。不要なビューを削除すると追加できます。",
  savedAt: (value: string) => `保存：${new Date(value).toLocaleString("ja-JP")}`,
  openNamed: (title: string) => `${title}を開く`, removeNamed: (title: string) => `${title}を削除`,
  storage: "ブラウザの保存領域を利用できません。保存設定や空き容量を確認して再試行してください。",
  invalid: "保存データの形式に対応していないか、破損しています。元のデータは変更していません。",
  retry: "保存一覧を再読込", missing: "保存した起点が見つかりません。現在の探索はそのままです。",
  failed: "起点を確認できませんでした。現在の探索を保ったまま、もう一度「開く」で再試行できます。",
  backup: "ファイルに控える・読み込む",
  backupHelp: "保存ビューの控えをJSONファイルに残し、同じデータセットを使う別のブラウザでも読み込めます。ファイルはサーバーへ送信しません。",
  export: "保存ビューを書き出す", downloadStarted: "ダウンロードを開始しました。保存先をブラウザで確認してください。",
  importFile: "保存ビューのJSONファイル", fileHelp: "100 KB以下・20件まで。内容を確認してから追加します。",
  readingFile: "ファイルを確認中…", preview: "読み込む内容の確認", rootId: "起点ID",
  importPlan: (added: number, skipped: number) => `追加予定：${added}件 / 保存済みで追加しない：${skipped}件`,
  importHelp: "既存の保存ビューは上書きしません。追加後は一覧から開けます。起点の存在と現在の関係は開くときに確認します。",
  confirmImport: "確認したビューを追加", cancelImport: "読み込みを取り消す", emptyBackup: "ファイルに保存ビューはありません。",
  imported: (added: number, skipped: number) => `${added}件を追加しました。保存済みの${skipped}件はそのままです。`,
  backupInvalid: "対応した保存ビューファイルではないか、破損・上限超過があります。保存済みのデータは変更していません。",
  dataset: "別のデータセットのファイルです。同じデータセットの画面で読み込んでください。",
  conflict: "同じ保存IDで内容の異なるビューがあります。上書きを避けるため追加していません。別のブラウザで確認するか、別の控えを選んでください。",
  fileFailed: "ファイルを扱えませんでした。ファイルを選び直すか、もう一度お試しください。",
};
export function savedViewLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
