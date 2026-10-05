import { PREDICATES, type Predicate } from "../domain/predicates";
const ja = {
  unsupported: "関係概要では探索条件を指定できません。",
  open: "関係概要を見る", title: "このデータセットに登録された関係概要",
  scope: "現在の探索条件では絞っていません。未登録の関係は含まれません。",
  countsUnit: "登録された主張の内訳",
  countsHelp: "件数は公開された主張（Claim）の数です。人数・Graphの線・独立した出典の数や、関係の強さや対象の重要性を示しません。",
  scopeHelp: "役割は主張の限定です。巻・版・期間などの適用範囲と根拠は、Graphの関係詳細で確認してください。全巻・全版・全期間の担当を示すものではありません。",
  noClaims: "公開された関係の主張はまだ登録されていません。",
  loading: "関係概要を取得中…", retry: "関係概要を再試行", close: "閉じる",
  broad: "この対象から広く見る", same: "同じ条件でこの対象から見る",
  notSaved: "直前の探索は保存上限を超えたため復帰できません。",
  restore: "直前の探索へ戻る", restored: "直前の探索を復元しました。中断した取得は必要に応じて再試行してください。",
  interrupted: "切替時に取得を中断しました。受理済みの範囲は保持しています。", unavailable: "対象が見つからないため起点を切り替えられません。",
  unqualified: "役割を限定していない主張", roleDetails: "制作役割の内訳", explanation: "集計の範囲について",
  outgoing: "この対象から伸びる関係", incoming: "この対象へ向かう関係",
  registered: "登録された主張にある関係の種類と向きです。関係の成立を認定するものではありません。",
  mixed: "肯定・否定の主張あり", deniedOnly: "否定の主張のみ",
  deniedHelp: "この種類の関係を肯定する主張は登録されていません。",
  statistics: "主張・限定の内訳", backToGraph: "Graphに戻って関係を選ぶ",
  detailHelp: "各主張の期間・適用範囲・出典は、Graphの線または隣接関係一覧から確認できます。",
  contributionTerms: "制作役割の記録", organizationTerms: "組織立場の記録", eventTerms: "参加立場の記録",
  organizationDetails: "組織立場の内訳", eventDetails: "参加立場の内訳",
  unqualifiedPosition: "立場を限定していない主張", unqualifiedEvent: "参加上の立場を限定していない主張",
  termDenied: "否定のみ", termMixed: "肯定・否定あり",
  moreTerms: (count: number) => `ほか${count}種類`,
  center: { person: "この人物", work: "この作品", organization: "この組織", event: "この出来事" },
  kinds: { person: "人物", work: "作品", organization: "組織", event: "出来事" },
  counts: (affirmed: number, denied: number) => `肯定 ${affirmed}件 ／ 否定 ${denied}件`,
  relation: (predicate: Predicate, perspective: "subject" | "object") => perspective === "subject" ? PREDICATES[predicate].label : PREDICATES[predicate].reverseLabel,
};
export function overviewLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
