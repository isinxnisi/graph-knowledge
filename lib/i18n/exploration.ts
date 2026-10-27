import type { Predicate } from "../domain/predicates";

// 表示言語と条件IDは別。翻訳を探索条件や知識IDへ混ぜない。
const ja = {
  unsupported: "未対応の探索条件です。", invalidPredicates: "predicatesには既存の関係タイプを指定してください。",
  invalidCursor: "cursorが不正、または起点・関係の条件が一致しません。",
  title: "辿る関係", apply: "適用", all: "すべて選択", none: "選択を解除",
  help: "適用すると同じ起点から取得し直します。開閉状態はリセットされます。適用前の探索には「直前の探索へ戻る」で戻れます。",
  active: "適用中", allRelations: "すべての関係", noRelations: "関係を表示しない",
  empty: "この条件に一致する関係はありません。",
  outside: "現在の探索条件の対象外の主張",
  shown: "Graphに表示中の主張", unseen: "Graphには未表示の主張",
  changed: "関係の条件を変更しました。同じ起点から取得し直します。",
  neighborsMore: "隣接関係の続きを表示",
  neighborsRetry: "隣接関係の取得を再試行",
  neighborsLoading: "隣接関係を取得中…",
  neighborsLoadingMore: "隣接関係の続きを取得中…",
  neighborsInteractive: "表示済みのGraphは操作できます。",
  neighborsShown: (count: number) => `この対象の主張を${count}件表示中。`,
  neighborsComplete: "この条件の取得は完了しました。",
  neighborsRanked: "条件に合う、その先の接続先が多い候補を優先します（範囲を限定した評価）。同じ対象の残りの主張は続きで表示します。",
  neighborsPartial: "取得済みの関係を表示しています。この対象には未取得の続きがあります。",
  neighborsPageHelp: "Graphの関係表示は取得済みの主張に基づきます。続きは各対象の隣接一覧または詳細から取得できます。",
  predicates: {
    ASSISTANT_OF: "アシスタントだった", INFLUENCED_BY: "影響を受けた",
    CONTRIBUTED_TO: "制作に関わった", AFFILIATED_WITH: "関わりがあった", PARTICIPATED_IN: "参加した",
  } satisfies Record<Predicate, string>,
};
const en: typeof ja = {
  unsupported: "Unsupported exploration condition.",
  invalidPredicates: "Use existing relation types in predicates.",
  invalidCursor: "Invalid cursor or mismatched starting entity or conditions.",
  title: "Relations to follow",
  apply: "Apply",
  all: "Select all",
  none: "Clear selection",
  help: "Applying refetches from the same starting entity and resets open branches. You can return to the previous exploration.",
  active: "Applied",
  allRelations: "All relations",
  noRelations: "Show no relations",
  empty: "No relations match these conditions.",
  outside: "Claims outside current conditions",
  shown: "Claims shown in the graph",
  unseen: "Claims not shown in the graph",
  changed: "Relation conditions changed. Refetching from the same starting entity.",
  neighborsMore: "Show more adjacent relations",
  neighborsRetry: "Retry adjacent relations",
  neighborsLoading: "Loading adjacent relations…",
  neighborsLoadingMore: "Loading more adjacent relations…",
  neighborsInteractive: "The existing Graph remains interactive.",
  neighborsShown: (count: number) => `Showing ${count} claims for this entity.`,
  neighborsComplete: "All relations for these conditions have been fetched.",
  neighborsRanked: "Candidates with more further connections matching these conditions come first (bounded evaluation). Further claims for the same entity remain available in later pages.",
  neighborsPartial: "Showing fetched relations. More are available for this entity.",
  neighborsPageHelp: "Graph relations summarize fetched claims. Fetch more from each entity's adjacent list or details.",
  predicates: { ASSISTANT_OF: "Was an assistant to", INFLUENCED_BY: "Was influenced by", CONTRIBUTED_TO: "Contributed to", AFFILIATED_WITH: "Was involved with", PARTICIPATED_IN: "Participated in" },
};
const resources: Record<string, typeof ja> = { ja, en };
export function explorationLabels(locale = "ja") {
  // 未対応localeはjaへフォールバック。
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
