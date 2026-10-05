import { organizationParticipationOf } from "../domain/organization-participation";
import { organizationParticipationLabels } from "../i18n/organization-participation";
import { contributionOf } from "../domain/contribution";
import { contributionLabels } from "../i18n/contribution";
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
      label: relationSummaryLabel(first.predicate, group) + (polarity === "mixed" ? ["CONTRIBUTED_TO", "AFFILIATED_WITH"].includes(first.predicate) ? `\n${contributionLabels().mixed}` : "\n異説あり" : polarity === "denied" ? "\n（否定）" : ""),
    }];
  }));
}

// 単独Relationは直線。別Relationは線の長さに応じた中程度の曲線へ分ける。
export function edgeRoutes(relations: Record<string, DisplayRelation>, positions: Record<string, { x: number; y: number }> = {}) {
  const groups = new Map<string, DisplayRelation[]>();
  Object.values(relations).forEach((relation) => {
    const key = [relation.subjectId, relation.objectId].sort().join(":");
    groups.set(key, [...(groups.get(key) ?? []), relation]);
  });
  const result: Record<string, { distance: number; weight: number; label: string; labelOffset: number }> = {};
  groups.forEach((group) => {
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((relation, index) => {
      const source = positions[relation.subjectId];
      const target = positions[relation.objectId];
      const span = source && target ? Math.hypot(target.x - source.x, target.y - source.y) : 280;
      const bow = Math.max(70, Math.min(115, span * 0.32));
      const lane = group.length === 1 ? 0 : (index / (group.length - 1) - 0.5) * 2;
      const offset = lane * bow;
      const vertical = source && target ? Math.abs(target.y - source.y) > Math.abs(target.x - source.x) : false;
      result[relation.id] = { distance: offset === 0 ? 0 : relation.subjectId < relation.objectId ? offset : -offset,
        weight: 0.5, label: relation.label, labelOffset: vertical ? lane * 18 : 0 };
    });
  });
  return result;
}

function relationSummaryLabel(predicate: ClaimSummary["predicate"], claims: ClaimSummary[]): string {
  const positions = [...new Set(claims.flatMap(claim => organizationParticipationOf(claim)?.positionId ? [organizationParticipationOf(claim)!.positionId] : []))].sort();
  if (positions.length) {
    const text = organizationParticipationLabels();
    const names = positions.map(position => text.positions[position]).join("・");
    return `${PREDICATES[predicate].label}\n${[...names].length > 24 ? text.count(positions.length) : names}`;
  }
  const roleIds = [...new Set(claims.flatMap((claim) => contributionOf(claim)?.roleId ? [contributionOf(claim)!.roleId!] : []))].sort();
  if (!roleIds.length) return PREDICATES[predicate].label;
  const names = roleIds.slice(0, 2).map((role) => contributionLabels().roles[role]).join("・") + (roleIds.length > 2 ? contributionLabels().moreRoles(roleIds.length - 2) : "");
  return `${PREDICATES[predicate].label}\n${[...names].length > 12 ? contributionLabels().roleCount(roleIds.length) : names}`;
}
