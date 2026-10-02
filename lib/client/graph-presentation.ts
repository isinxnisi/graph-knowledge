import { PREDICATES } from "../domain/predicates";
import type { EntitySummary, ClaimSummary } from "../domain/api";

// 同名がGraph内に存在するときだけ、登録済みの説明を補助ラベルに使う。
export function entityLabel(entity: EntitySummary, nodes: Record<string, EntitySummary>): string {
  const peers = Object.values(nodes).filter((node) => node.name === entity.name);
  if (peers.length < 2) return entity.name;
  const description = entity.description?.split(/[、。]/)[0] || "説明なし";
  const duplicateDescription = peers.some((node) => node.id !== entity.id && (node.description?.split(/[、。]/)[0] || "説明なし") === description);
  return `${entity.name}\n${description}${duplicateDescription ? ` (${entity.id.slice(0, 8)})` : ""}`;
}

// 永続IDではなく、向きとpredicateを含む表示専用の安定キー。
export const relationId = (claim: Pick<ClaimSummary, "subjectId" | "predicate" | "objectId">) =>
  `relation:${claim.subjectId}:${claim.predicate}:${claim.objectId}`;
export type DisplayRelation = {
  id: string; subjectId: string; objectId: string; predicate: ClaimSummary["predicate"];
  claimIds: string[]; polarity: "affirmed" | "denied" | "mixed"; label: string;
};
export function displayRelations(claims: Record<string, ClaimSummary>): Record<string, DisplayRelation> {
  const groups = new Map<string, ClaimSummary[]>();
  Object.values(claims).forEach((claim) => {
    const id = relationId(claim);
    groups.set(id, [...(groups.get(id) ?? []), claim]);
  });
  return Object.fromEntries([...groups].map(([id, group]) => {
    const first = group[0];
    const polarities = new Set(group.map((claim) => claim.polarity));
    const polarity = polarities.size > 1 ? "mixed" : first.polarity;
    return [id, { id, subjectId: first.subjectId, objectId: first.objectId, predicate: first.predicate,
      claimIds: group.map((claim) => claim.id).sort(), polarity,
      label: PREDICATES[first.predicate].label + (polarity === "mixed" ? "\n異説あり" : polarity === "denied" ? "\n（否定）" : ""),
    }];
  }));
}

// 同じ端点間の別Relationだけを弱い曲線に分ける。逆向きも別Relation。
export function edgeRoutes(relations: Record<string, DisplayRelation>) {
  const groups = new Map<string, DisplayRelation[]>();
  Object.values(relations).forEach((relation) => {
    const key = [relation.subjectId, relation.objectId].sort().join(":");
    groups.set(key, [...(groups.get(key) ?? []), relation]);
  });
  const result: Record<string, { distance: number; weight: number; label: string; labelOffset: number }> = {};
  groups.forEach((group) => {
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((relation, index) => {
      const offset = (index - (group.length - 1) / 2) * 48;
      result[relation.id] = { distance: offset === 0 ? 0 : relation.subjectId < relation.objectId ? offset : -offset,
        weight: 0.5, label: relation.label, labelOffset: (index - (group.length - 1) / 2) * 32 };
    });
  });
  return result;
}
