const ja = {
  pageTitle: "関係性を探索する",
  restoring: "URLから探索を復元しています…", copy: "探索URLをコピー", retry: "再試行", abandon: "復元をやめて検索から始める",
  long: "長い探索URLです。共有先によっては利用できません。",
  limit: "この探索はURLの保存上限を超えています。URLは前の状態です。「探索途中を保存・再開」を利用してください。",
  updateFailed: "探索URLを更新できませんでした。URLは前の状態です。「探索途中を保存・再開」を利用してください。",
  detached: "起点から再取得できない休止枝があるため、URLを更新していません。URLは前の状態です。起点を選び直すか、探索途中の保存を利用してください。",
  rootMissing: "起点の対象が現在見つかりません。", dataset: "このURLは別のデータセットの探索です。",
  invalid: "探索URLの状態が無効です。復元していません。",
  restoreFailed: "探索を完全には復元できませんでした。データ更新・通信状態を確認して再試行してください。",
  copied: "探索URLをコピーしました。", manualCopy: "アドレスバーのURLをコピーしてください。",
};
const en: typeof ja = {
  pageTitle: "Explore relations",
  restoring: "Restoring exploration from URL…", copy: "Copy exploration URL", retry: "Retry", abandon: "Cancel restore and start with search",
  long: "Long exploration URL; some sharing services may reject it.",
  limit: "This exploration exceeds the URL limit. The URL still represents the previous state. Use workspace save/export.",
  updateFailed: "The exploration URL could not be updated. It still represents the previous state. Use workspace save/export.",
  detached: "Some dormant branches can no longer be replayed from the root. The URL is unchanged. Choose a new starting point or use workspace save/export.",
  rootMissing: "The starting entity is currently unavailable.", dataset: "This URL belongs to another dataset.",
  invalid: "Invalid exploration URL; nothing was restored.",
  restoreFailed: "The exploration could not be fully restored. Check data changes or connectivity and retry.",
  copied: "Exploration URL copied.", manualCopy: "Copy the URL from the address bar.",
};
export const explorationUrlLabels = (locale = "ja") => locale === "en" ? en : ja;
