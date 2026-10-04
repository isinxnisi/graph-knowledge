import { PREDICATES, type Predicate } from "../domain/predicates";
const ja = {
  unsupported: "関係概要では探索条件を指定できません。",
  open: "関係概要を見る", title: "このデータセットに登録された関係概要",
  scope: "現在の探索条件では絞っていません。未登録の関係は含まれません。",
  countsUnit: "公開された主張の件数",
  countsHelp: "件数は公開された主張（Claim）の数です。人数・Graphの線・独立した出典の数や、関係の強さや対象の重要性を示しません。",
  scopeHelp: "役割は主張の限定です。巻・版・期間などの適用範囲と根拠は、Graphの関係詳細で確認してください。全巻・全版・全期間の担当を示すものではありません。",
  noClaims: "公開された関係の主張はまだ登録されていません。",
  loading: "関係概要を取得中…", retry: "関係概要を再試行", close: "閉じる",
  broad: "この対象から広く見る", same: "同じ条件でこの対象から見る",
  notSaved: "直前の探索は保存上限を超えたため復帰できません。",
  restore: "直前の探索へ戻る", restored: "直前の探索を復元しました。中断した取得は必要に応じて再試行してください。",
  interrupted: "切替時に取得を中断しました。受理済みの範囲は保持しています。", unavailable: "対象が見つからないため起点を切り替えられません。",
  unqualified: "役割を限定していない主張", roleDetails: "制作役割の内訳", explanation: "集計の範囲について",
  counts: (affirmed: number, denied: number) => `肯定 ${affirmed}件 ／ 否定 ${denied}件`,
  relation: (predicate: Predicate, perspective: "subject" | "object") => predicate === "CONTRIBUTED_TO" && perspective === "object" ? "この作品の制作関与についての主張" : predicate === "AFFILIATED_WITH" && perspective === "object" ? "この組織との関わりについての主張" : `${perspective === "subject" ? PREDICATES[predicate].label : PREDICATES[predicate].reverseLabel}関係についての主張`,
};
export function overviewLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
