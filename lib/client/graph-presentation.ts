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
  const result: Record<string, { distance: number; weight: number }> = {};
  groups.forEach((group) => {
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((claim, index) => {
      const offset = (index - (group.length - 1) / 2) * 130;
      result[claim.id] = { distance: (claim.subjectId < claim.objectId ? offset : -offset) * (group.length === 2 ? 2 : 1), weight: group.length > 1 ? 0.3 + index * 0.4 / (group.length - 1) : 0.5 };
    });
  });
  return result;
}
