import { organizationParticipationLabels } from "./organization-participation";
import { eventParticipationLabels } from "./event-participation";
import { overviewLabels } from "./entity-overview";
import { explorationLabels } from "./exploration";
import { dataReleaseLabels } from "./data-release";
import { searchLabels } from "./entity-search";
// 探索画面のUIだけ。Entity名・原資料・locator・noteには適用しない。
const ja = {
  language: "表示言語（探索画面）", languageHelp: "このブラウザに保存します。会員・共有・保存画面の英語対応は次の工程です。", languageFailed: "表示言語を保存できません。この画面には反映しています。",
  detail: "詳細", unselected: "未選択", selected: "選択中", graphLoading: (n: number) => `Graphを取得中…（${n}件）`, expanded: "近傍は展開済みです。", closed: "展開は閉じています。クリックで取得済みの枝を復元します。", expandHelp: "クリックで一段階展開します。", grouped: "線ごとに同じ関係の主張をまとめて表示しています。",
  graphAria: "人物・作品・組織・出来事の関係グラフ。操作できるテキスト一覧は下にあります。", shapes: "丸：人物 ／ 四角：作品 ／ 六角形：組織 ／ ひし形：出来事", edges: "矢印：方向 ／ 破線：否定", nodeStates: "二重枠：展開済 ／ 淡い外枠：新規表示",
  kinds: { person: "人物", work: "作品", organization: "組織", event: "出来事" }, unknown: "不明", periodUnknown: "期間不明", fromUnknown: "開始不明", toUnknown: "終了不明", affirmed: "肯定", denied: "否定", descriptionMissing: "説明は未登録です。", noDescription: "説明なし", aliases: "別名", unregistered: "未登録",
  entityDetails: "Entity詳細", entityLoading: "Entity詳細を取得中…", entityRetry: "Entity詳細を再試行", closeBranch: "展開を閉じる", reopenBranch: "展開を再開", expand: "近傍を展開", restoreHelp: "取得済みの枝も復元します。明示的に閉じた子孫は閉じたままです。", moreLoading: "続きを取得中…", neighborsLoading: "隣接関係を取得中…", graphRetry: "Graph取得を再試行", fetched: "このEntityの近傍は取得済みです。", more: "続きを表示",
  listHelp: "Nodeを選ぶと、そのEntityの隣接関係をテキストで確認できます。", adjacent: (name: string) => `${name}の隣接関係`, adjacentAria: "選択Entityの隣接関係", closedHelp: "展開は閉じています。再開すると取得済みの枝を復元します。", noAdjacent: "表示中の隣接関係はありません。", selectExpand: (name: string) => `${name}を選択・展開`, claimOpen: "主張と出典を見る", sourceCount: (n: number) => `出典 ${n}件`, unverified: "出典未確認", navigatorCount: (n: number) => `（${n}件）`,
  claimDetails: "Claim詳細", claimTitle: "主張と出典", claimLoading: "主張の詳細を取得中…", claimRetry: "主張の取得を再試行", otherRetry: "他の主張を再試行", claimNavigation: "主張への移動", claimNumber: (n: number) => `主張 ${n}`, selectedClaim: "選択した主張", otherClaim: "他の主張", related: "同じ関係についての他の主張", noRelated: "他の主張は登録されていません。", assertion: "関係についての主張", subject: "主体", object: "対象", polarity: (denied: boolean) => `${denied ? "否定" : "肯定"}する主張`, relationPeriod: "関係の期間", noCitations: "この主張の出典はまだ登録されていません。", evidence: "根拠となる出典と参照箇所", citation: "出典と参照箇所", source: (n: number) => `出典 ${n}`, sourceKinds: { book: "書籍", interview: "インタビュー", magazine: "雑誌", web: "ウェブ", paper: "論文" }, stances: { support: "この主張を支持", refute: "この主張への反証", background: "背景資料" }, locator: "参照箇所", openSource: "出典のURLを開く", demoUrl: "デモURL（リンク無効）", published: "公開日", authors: "著者", publisher: "発行者", edition: "版・号", accessed: "アクセス日", entityLink: "この対象の閲覧リンク", claimLink: "この主張の閲覧リンク",
};
const en: typeof ja = {
  language: "Language (explorer)",
  languageHelp: "Saved in this browser. Account, sharing and saved-content screens will support English in the next step.",
  languageFailed: "Could not save language. It is applied to this page.",
  detail: "Details",
  unselected: "None",
  selected: "Selected",
  graphLoading: (n: number) => `Loading graph… (${n})`,
  expanded: "Adjacent relations are expanded.",
  closed: "Branch closed. Click to restore fetched branches.",
  expandHelp: "Click to expand one step.",
  grouped: "Each line groups claims about the same relation.",
  graphAria: "Graph of people, works, organizations and events. An interactive text list is below.",
  shapes: "Ellipse: person / Rectangle: work / Hexagon: organization / Diamond: event",
  edges: "Arrow: direction / Dashed: denied",
  nodeStates: "Double border: expanded / Pale outline: newly shown",
  kinds: { person: "Person", work: "Work", organization: "Organization", event: "Event" },
  unknown: "Unknown",
  periodUnknown: "Period unknown",
  fromUnknown: "Start unknown",
  toUnknown: "End unknown",
  affirmed: "Affirmed",
  denied: "Denied",
  descriptionMissing: "No description registered.",
  noDescription: "No description",
  aliases: "Aliases",
  unregistered: "Not registered",
  entityDetails: "Entity details",
  entityLoading: "Loading entity details…",
  entityRetry: "Retry entity details",
  closeBranch: "Close branch",
  reopenBranch: "Reopen branch",
  expand: "Expand adjacent relations",
  restoreHelp: "Fetched branches are restored. Explicitly closed descendants stay closed.",
  moreLoading: "Loading more…",
  neighborsLoading: "Loading adjacent relations…",
  graphRetry: "Retry graph",
  fetched: "Adjacent relations have been fetched.",
  more: "Show more",
  listHelp: "Select a node to read its adjacent relations in text.",
  adjacent: (name: string) => `Adjacent relations of ${name}`,
  adjacentAria: "Selected entity's adjacent relations",
  closedHelp: "Branch closed. Reopen to restore fetched branches.",
  noAdjacent: "No adjacent relations are shown.",
  selectExpand: (name: string) => `Select and expand ${name}`,
  claimOpen: "Read claim and sources",
  sourceCount: (n: number) => `Sources: ${n}`,
  unverified: "Source unverified",
  navigatorCount: (n: number) => ` (${n})`,
  claimDetails: "Claim details",
  claimTitle: "Claim and sources",
  claimLoading: "Loading claim details…",
  claimRetry: "Retry claim",
  otherRetry: "Retry other claims",
  claimNavigation: "Jump to claim",
  claimNumber: (n: number) => `Claim ${n}`,
  selectedClaim: "Selected claim",
  otherClaim: "Other claim",
  related: "Other claims about the same relation",
  noRelated: "No other claims registered.",
  assertion: "Claim about the relation",
  subject: "Subject",
  object: "Object",
  polarity: (denied: boolean) => `${denied ? "Denied" : "Affirmed"} claim`,
  relationPeriod: "Relation period",
  noCitations: "No sources have been registered for this claim.",
  evidence: "Supporting sources and references",
  citation: "Source and reference",
  source: (n: number) => `Source ${n}`,
  sourceKinds: { book: "Book", interview: "Interview", magazine: "Magazine", web: "Web", paper: "Paper" },
  stances: { support: "Supports this claim", refute: "Refutes this claim", background: "Background material" },
  locator: "Reference",
  openSource: "Open source URL",
  demoUrl: "Demo URL (link disabled)",
  published: "Published",
  authors: "Authors",
  publisher: "Publisher",
  edition: "Edition / issue",
  accessed: "Accessed",
  entityLink: "Reading link for this entity",
  claimLink: "Reading link for this claim",
};
export function explorerLabels(locale = "ja") { return locale.split("-")[0] === "en" ? en : ja; }

// 既存state/snapshotに保存する通知文は変更しない。既知のUI通知だけ表示時に解決する。
const messages: Record<string, string> = {
  "qは1〜100文字で指定してください。": "Enter a name or alias of 1–100 characters.",
  "UUID v4を指定してください。": "Specify a UUID v4.",
  "制作Roleが不正です。": "Invalid production role.",
  "対象のデータが見つかりません。": "This entity or claim was not found.",
  "処理中にエラーが発生しました。": "An error occurred while processing the request.",
  "情報を取得できませんでした。再試行してください。": "Could not fetch information. Please retry.",
  "データベースを利用できません。時間をおいて再試行してください。": "The database is unavailable. Please try again later.",
  "応答を読み取れませんでした。再試行してください。": "Could not read the response. Please retry.",
  "取得に時間がかかりすぎたため中断しました。再試行してください。": "The request timed out. Please retry.",
  "通信に失敗しました。再試行してください。": "Connection failed. Please retry.",
  "表示上限に達したため、他の展開を閉じて再試行してください。": "Graph limit reached. Close another branch and retry.",
  "一時キャッシュの上限に達したため、中心を選び直してください。": "Temporary cache limit reached. Choose a new starting entity.",
  "展開を閉じました。別の展開が支える関係は残ります。": "Branch closed. Relations supported by other open branches remain.",
  "取得済みの枝を復元しました。": "Fetched branches restored.",
  "以前の枝はキャッシュから外れたため、近傍を再取得します。": "The previous branch is no longer cached. Fetching adjacent relations again.",
  "取得済みの枝がないため近傍を取得します。": "No fetched branch is available. Fetching adjacent relations.",
  "名前または別名を入力してください。": "Enter a name or alias.",
};
export function explorerMessage(message: string, locale = "ja"): string {
  if (!locale.startsWith("en")) return message;
  const dictionaries = [overviewLabels, explorationLabels, dataReleaseLabels, searchLabels, organizationParticipationLabels, eventParticipationLabels];
  for (const labels of dictionaries) {
    const original = labels("ja") as Record<string, unknown>, translated = labels("en") as Record<string, unknown>;
    const key = Object.keys(original).find(key => typeof original[key] === "string" && original[key] === message);
    if (key && typeof translated[key] === "string") return translated[key] as string;
  }
  return messages[message] ?? message;
}
