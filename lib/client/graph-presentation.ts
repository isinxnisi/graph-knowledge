import { PREDICATES } from "../domain/predicates";
import { relationLabel, polarityLabel } from "./format";
import type { EntitySummary, ClaimSummary } from "../domain/api";

// 同名がGraph内に存在するときだけ、登録済みの説明を補助ラベルに使う。
export function entityLabel(entity: EntitySummary, nodes: Record<string, EntitySummary>): string {
  const peers = Object.values(nodes).filter((node) => node.name === entity.name);
  if (peers.length < 2) return entity.name;
  const description = entity.description?.split(/[、。]/)[0] || "説明なし";
  const duplicateDescription = peers.some((node) => node.id !== entity.id && (node.description?.split(/[、。]/)[0] || "説明なし") === description);
  return `${entity.name}\n${description}${duplicateDescription ? ` (${entity.id.slice(0, 8)})` : ""}`;
}

// 双方向も同じ端点の組として扱い、ID順の別々の曲線を割り当てる。
export function edgeRoutes(claims: Record<string, ClaimSummary>) {
  const groups = new Map<string, ClaimSummary[]>();
  Object.values(claims).forEach((claim) => {
    const key = [claim.subjectId, claim.objectId].sort().join(":");
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  });
  const result: Record<string, { distance: number; weight: number; label: string }> = {};
  groups.forEach((group) => {
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((claim, index) => {
      const step = group.length === 2 ? 260 : 320;
      const offset = (index - (group.length - 1) / 2) * step;
      const period = !claim.period.from && !claim.period.to ? "期間不明" : `${claim.period.from?.value ?? "開始不明"}〜${claim.period.to?.value ?? "終了不明"}`;
      const sameRelationCount = group.filter((other) => other.subjectId === claim.subjectId && other.objectId === claim.objectId && other.predicate === claim.predicate).length;
      const label = sameRelationCount > 1 ? `${PREDICATES[claim.predicate].label}\n${polarityLabel(claim)} · ${period}` : relationLabel(claim).replace("（否定）", "\n（否定）");
      result[claim.id] = { distance: offset === 0 ? 0 : claim.subjectId < claim.objectId ? offset : -offset, weight: group.length === 2 ? 0.3 + index * 0.4 : 0.5, label };
    });
  });
  return result;
}
