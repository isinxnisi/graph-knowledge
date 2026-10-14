const ja = {
  linkedEntity: "リンク先の対象", linkedDataset: "リンク先", exploreFrom: (name: string) => `${name}から関係を探索する`,
  title: "個別表示", entityTitle: "対象の詳細", claimTitle: "記録と出典",
  entityLink: "この対象の閲覧リンクを開く",
  claimLink: "この主張の閲覧リンクを開く",
  close: "探索画面へ戻る",
  help: "この対象や記録だけを、URLで再訪・共有できます。Graph全体の共有は、探索画面の「探索URLをコピー」を使ってください。",
  invalid: "閲覧リンクの形式が正しくありません。対象・主張のリンクを開き直してください。",
  mismatch: "このリンクは別のデータセットを指しています。この環境では読み込めません。",
  missing: "この参照は現在閲覧できません。削除・非公開・未登録の可能性があります。",
  loading: "リンク先を取得中…",
  retry: "取得を再試行",
  explore: "この対象から関係を探索する",
  exploreHelp: "追加条件なしで探索を始めます。今の探索があれば「直前の探索へ戻る」で復帰できます。",
  endpoints: "この記録に出てくる対象",
  subject: "主体",
  object: "対象",
  claim: "このURLの記録",
  individual: "この画面では、一つの記録とその出典を表示しています。同じ二者の別の記録は、探索画面で確認できます。",
  url: "この表示のURL", urlDetails: "URLの詳細", identity: "参照ID",
  copy: "この表示のURLをコピー",
  copied: "URLをコピーしました。",
  copyFailed: "コピーできませんでした。URL欄を選択してコピーしてください。",
  linkHelp: "URLを開くと、その時点で登録されている内容を表示します。探索の枝・条件・配置は含まれません。", accessHelp: "閲覧にログインなどが必要な場合、相手にも同じ条件が必要です。",
};
const en: typeof ja = {
  linkedEntity: "Linked entity", linkedDataset: "Linked dataset", exploreFrom: (name: string) => `Explore relations from ${name}`,
title: "Individual view", entityTitle: "Entity details", claimTitle: "Record and sources", entityLink: "Open this entity's reading link", claimLink: "Open this claim's reading link",
  close: "Return to exploration", help: "Revisit or share just this entity or record by URL. To share the whole graph, use Copy exploration URL in the exploration screen.",
  invalid: "This reading link is invalid. Open an entity or claim link again.", mismatch: "This link points to a different dataset and cannot be read here.",
  missing: "This reference is unavailable. It may have been removed, made private or not registered.", loading: "Loading linked content…", retry: "Retry loading",
  explore: "Explore relations from this entity", exploreHelp: "Start without additional conditions. Return to previous exploration restores your earlier exploration, if available.",
  endpoints: "Entities in this record", subject: "Subject", object: "Object", claim: "Record at this URL",
  individual: "This view shows one record and its sources. Explore from an entity to find other records about the same pair.",
  url: "URL for this view", urlDetails: "URL details", identity: "Reference ID", copy: "Copy URL for this view", copied: "URL copied.", copyFailed: "Could not copy. Select and copy the URL field.",
  linkHelp: "Opening the URL shows the content registered at that time. Graph branches, conditions and positions are not included.", accessHelp: "If viewing requires a login or other access, the recipient will need that access too.",
};
export function readingLabels(locale = "ja"): typeof ja {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
