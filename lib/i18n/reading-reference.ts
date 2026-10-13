const ja = {
  linkedEntity: "リンク先の対象", linkedDataset: "リンク先", exploreFrom: (name: string) => `${name}から関係を探索する`,
  title: "リンク先の対象・主張",
  entityLink: "この対象の閲覧リンクを開く",
  claimLink: "この主張の閲覧リンクを開く",
  close: "探索画面へ戻る",
  help: "現在の登録内容を読みます。探索の枝・条件・配置は、このURLには含まれません。",
  invalid: "閲覧リンクの形式が正しくありません。対象・主張のリンクを開き直してください。",
  mismatch: "このリンクは別のデータセットを指しています。この環境では読み込めません。",
  missing: "この参照は現在閲覧できません。削除・非公開・未登録の可能性があります。",
  loading: "リンク先を取得中…",
  retry: "取得を再試行",
  explore: "この対象から関係を探索する",
  exploreHelp: "追加条件なしで探索を始めます。今の探索があれば「直前の探索へ戻る」で復帰できます。",
  endpoints: "この主張の対象",
  subject: "主体",
  object: "対象",
  claim: "リンク先の主張",
  individual: "このURLが指す一つの主張です。同じ関係の他の主張は、対象から探索して確認できます。",
  url: "閲覧URL",
  copy: "URLをコピー",
  copied: "URLをコピーしました。",
  copyFailed: "コピーできませんでした。URL欄を選択してコピーしてください。",
  linkHelp: "同じ環境へアクセスできる人向けの参照です。内容の版を固定したり、公開範囲を変えたりするリンクではありません。",
};
const en: typeof ja = {
  linkedEntity: "Linked entity", linkedDataset: "Linked dataset", exploreFrom: (name: string) => `Explore relations from ${name}`,
title: "Linked entity or claim", entityLink: "Open this entity's reading link", claimLink: "Open this claim's reading link",
  close: "Return to exploration", help: "Read the current registered content. This URL does not include exploration branches, conditions or positions.",
  invalid: "This reading link is invalid. Open an entity or claim link again.", mismatch: "This link points to a different dataset and cannot be read here.",
  missing: "This reference is unavailable. It may have been removed, made private or not registered.", loading: "Loading linked content…", retry: "Retry loading",
  explore: "Explore relations from this entity", exploreHelp: "Start without additional conditions. Return to previous exploration restores your earlier exploration, if available.",
  endpoints: "Entities in this claim", subject: "Subject", object: "Object", claim: "Linked claim",
  individual: "This is the single claim identified by the URL. Explore from an entity to find other claims about the same relation.",
  url: "Reading URL", copy: "Copy URL", copied: "URL copied.", copyFailed: "Could not copy. Select and copy the URL field.",
  linkHelp: "A reference for people who can access this environment. It does not pin a content version or change access permissions.",
};
export function readingLabels(locale = "ja"): typeof ja {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
