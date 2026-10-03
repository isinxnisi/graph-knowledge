import type { Predicate } from "../domain/predicates";

// 表示言語と条件IDは別。今はjaのみ、将来のlocale追加はここで解決する。
const ja = {
  unsupported: "未対応の探索条件です。", invalidPredicates: "predicatesには既存の関係タイプを指定してください。",
  invalidCursor: "cursorが不正、または起点・関係の条件が一致しません。",
  title: "辿る関係", apply: "適用", all: "すべて選択", none: "選択を解除",
  help: "適用すると同じ起点から取得し直します。開閉状態はリセットされます。",
  active: "適用中", allRelations: "すべての関係", noRelations: "関係を表示しない",
  empty: "この条件に一致する関係はありません。",
  outside: "現在の探索条件の対象外の主張",
  shown: "Graphに表示中の主張", unseen: "Graphには未表示の主張",
  changed: "関係の条件を変更しました。同じ起点から取得し直します。",
  predicates: {
    ASSISTANT_OF: "アシスタントだった", INFLUENCED_BY: "影響を受けた",
    CONTRIBUTED_TO: "制作に関わった", AFFILIATED_WITH: "関わりがあった",
  } satisfies Record<Predicate, string>,
};
const resources: Record<string, typeof ja> = { ja };
export function explorationLabels(locale = "ja") {
  // 未対応localeはjaへフォールバック。既存UI全体の言語切替ではない。
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
