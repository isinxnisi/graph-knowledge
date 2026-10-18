import type { RelationCondition } from "../domain/relation-conditions";
import { conditionSummary } from "./exploration-entry";
import { contributionLabels } from "./contribution";

export function relationText(locale: string) {
  return locale === "en" ? {
    adjacent: "Single relations", pattern: "Same creator, other works", mode: "Explore relations", affirmed: "Affirmed claims only", all: "Include negative claims",
    help: "Work ← creator → another work. Both claims must be affirmed and match the selected roles. Each connection retains its original direction and evidence.",
    incompatible: "This pattern requires a work in the public KG. The current subject will not change.", free: "Switch to free exploration", freeHelp: "Keep this work, production roles and affirmed claims; remove only the two-step pattern.",
    applying: "Verifying connections…", failed: "Could not apply. Your previous exploration is unchanged. Retry or cancel.",
    routes: "Complete paths", more: "Load more paths", empty: "No complete paths match these conditions.", evidence: "Evidence", close: "Hide path", open: "Show path",
    coverage: "One verified pair of claims per creator and work. This is not a list of every claim.", retry: "Revalidate saved paths", restart: "Restart with the same conditions", changed: "All saved paths were revalidated against the current public revision.",
  } : {
    adjacent: "一段の関係", pattern: "同じつくり手の別作品", mode: "追いたい関係性", affirmed: "肯定された記録のみ", all: "否定を含む記録",
    help: "作品 ← つくり手 → 別作品。両段で肯定・制作Roleの条件を満たす経路を表示します。各接続の方向と根拠は元の記録に従います。",
    incompatible: "公開KGの作品に適用できるパターンです。現在の対象は変更しません。", free: "自由探索に切り替える", freeHelp: "同じ作品・制作Role・肯定条件を保ち、2段の形だけを解除します。",
    applying: "つながりを検証中…", failed: "適用できませんでした。元の探索は保持しています。再試行またはキャンセルしてください。",
    routes: "完全な経路", more: "経路を追加取得", empty: "この条件に一致する完全な経路はありません。", evidence: "根拠", close: "経路を閉じる", open: "経路を開く",
    coverage: "つくり手と別作品の組ごとに、検証した1組のClaimを表示します。全Claimの一覧ではありません。", retry: "保存経路を再検証", restart: "同じ条件で探索を再開", changed: "保存した全経路を現在の公開版で再検証しました。",
  };
}
export function relationSummary(relation: RelationCondition, locale: string) {
  const text = relationText(locale);
  if (relation.type === "adjacent") return conditionSummary(relation.predicates, relation.contributionRoles, locale, relation.organizationPositions, relation.eventRoles)
    + (relation.polarity === "affirmed" ? ` · ${text.affirmed}` : "");
  const roles = relation.contributionRoles === null ? "" : relation.contributionRoles.map(r => contributionLabels(locale).roles[r]).join(" / ") || (locale === "en" ? "No roles selected" : "制作Roleなし");
  return [text.pattern, text.affirmed, roles].filter(Boolean).join(" · ");
}
