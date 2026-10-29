import type { CapsuleDocument } from "../domain/capsule-document";
import { displayRelations, type CanvasRelation } from "./graph-presentation";
export function capsulePresentation(document: CapsuleDocument, locale: string) {
  const global = document.relations.filter(r => r.origin.kind === "kg");
  const claims = Object.fromEntries(global.flatMap(r => r.origin.kind === "kg" ? [[r.origin.id, r.origin.snapshot]] : []));
  const relations: Record<string, CanvasRelation> = displayRelations(claims, locale);
  const members: Record<string, string[]> = {};
  for (const relation of Object.values(relations)) {
    const items = global.filter(r => r.origin.kind === "kg" && relation.claimIds.includes(r.origin.id));
    members[relation.id] = items.map(r => r.key);
    relation.subjectId = items[0].source; relation.objectId = items[0].target;
    const overrides = [...new Set(items.map(r => r.label).filter(Boolean))];
    if (overrides.length) relation.canvasLabel = relation.label = overrides.join(" / ");
  }
  for (const r of document.relations.filter(r => r.origin.kind === "local")) {
    relations[r.key] = { id: r.key, subjectId: r.source, objectId: r.target, claimIds: [], polarity: "affirmed", label: r.label || (locale === "en" ? "Related" : "関係する"), canvasLabel: r.label || (locale === "en" ? "Related" : "関係する"), badge: locale === "en" ? "Capsule" : "独自" };
    members[r.key] = [r.key];
  }
  return { members, relations, nodes: [
    ...document.nodes.map(n => ({ id: n.key, label: n.title + (n.badge ? `\n${n.badge}` : ""), kind: n.origin.kind === "kg" ? n.origin.snapshot.kind : "local" })),
    ...document.texts.map(t => ({ id: t.key, label: t.text, kind: "text", textStyle: t.style })),
  ] };
}
