import type { RelationCondition } from "../domain/relation-conditions";
import { conditionSummary } from "./exploration-entry";
import { contributionLabels } from "./contribution";

export function relationText(locale: string) {
  return locale === "en" ? {
    shown: "Shown in graph", verified: "Verified evidence",
    adjacent: "Single relations", pattern: "Same creator, other works", mode: "Explore relations", affirmed: "Affirmed claims only", all: "Include negative claims",
    help: "Work ← contributor → another work. Both claims must be affirmed and match the selected roles. Start from a work or the contributor; each connection retains its original direction and evidence.",
    incompatible: "This pattern supports works and contributors in the public KG. The current subject will not change.", free: "Switch to free exploration", freeHelp: "Keep this subject and affirmed claims. Shared roles are retained; per-step roles are removed when leaving the two-step pattern.",
    applying: "Verifying connections…", failed: "Could not apply. Your previous exploration is unchanged. Retry or cancel.",
    routes: "Complete paths", more: "Load more paths", empty: "No complete paths match these conditions.", evidence: "Evidence", close: "Hide path", open: "Show path",
    coverage: "Evidence behind the available connections, within fetched pages. Expand entities in the graph or adjacent list to continue. Each line is an original claim from a verified complete path.", retry: "Revalidate saved paths", restart: "Restart with the same conditions", changed: "All saved paths were revalidated against the current public revision.",
  } : {
    shown: "Graphに表示中", verified: "検証済みの証拠",
    adjacent: "一段の関係", pattern: "同じつくり手の別作品", mode: "追いたい関係性", affirmed: "肯定された記録のみ", all: "否定を含む記録",
    help: "作品 ← 制作担当者 → 別作品。両段で肯定・制作Roleの条件を満たす経路を表示します。作品・中央人物から始められ、各接続の方向と根拠は元の記録に従います。",
    incompatible: "公開KGの作品・制作担当者に適用できるパターンです。現在の対象は変更しません。", free: "自由探索に切り替える", freeHelp: "同じ対象・肯定条件を保ちます。共通Roleは引き継ぎ、段別Roleは2段の形とともに解除します。",
    applying: "つながりを検証中…", failed: "適用できませんでした。元の探索は保持しています。再試行またはキャンセルしてください。",
    routes: "完全な経路", more: "経路を追加取得", empty: "この条件に一致する完全な経路はありません。", evidence: "根拠", close: "経路を閉じる", open: "経路を開く",
    coverage: "取得済み範囲の接続を支える証拠です。探索はGraph・隣接一覧の対象から続けられます。各線は完全経路で検証した元のClaimです。", retry: "保存経路を再検証", restart: "同じ条件で探索を再開", changed: "保存した全経路を現在の公開版で再検証しました。",
  };
}
export function relationSummary(relation: RelationCondition, locale: string) {
  const text = relationText(locale);
  if (relation.type === "adjacent") return conditionSummary(relation.predicates, relation.contributionRoles, locale, relation.organizationPositions, relation.eventRoles)
    + (relation.polarity === "affirmed" ? ` · ${text.affirmed}` : "");
  if (relation.pattern.revision === 3) {
    const labels = relation.stepRoles!.map(roles => roles === null ? (locale === "en" ? "Any role" : "Role限定なし")
      : roles.map(r => contributionLabels(locale).roles[r]).join(" / ") || (locale === "en" ? "No roles" : "空集合"));
    return [text.pattern, text.affirmed, (locale === "en" ? "From work: " : "起点作品側: ") + labels[0], (locale === "en" ? "Other work: " : "別作品側: ") + labels[1]].join(" · ");
  }
  const roles = relation.contributionRoles === null ? "" : relation.contributionRoles.map(r => contributionLabels(locale).roles[r]).join(" / ") || (locale === "en" ? "No roles selected" : "制作Roleなし");
  return [text.pattern, text.affirmed, roles].filter(Boolean).join(" · ");
}
