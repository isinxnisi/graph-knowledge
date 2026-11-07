import type { CapsuleDocument } from "../domain/capsule-document";
import { displayRelations, type CanvasRelation } from "./graph-presentation";
import {knowledgeDisplayText} from "../domain/knowledge-display";
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
  for (const r of document.relations.filter(r => r.origin.kind === "local" || r.origin.kind === "knowledge")) {
    const polarity = r.origin.kind === "local" ? r.origin.polarity ?? "affirmed" : document.knowledge?.snapshot.records.find(record=>r.origin.kind==="knowledge"&&record.id===r.origin.id)?.content.polarity ?? "affirmed";
    const text = (r.origin.kind==="knowledge"?knowledgeDisplayText(document.knowledge?.snapshot.translations,{kind:"record",id:r.origin.id,revision:r.origin.revision,field:"relation"},locale,r.label):r.label) || (locale === "en" ? "Related" : "関係する");
    const suffix = polarity === "denied" ? (locale === "en" ? " (denied)" : "（否定）") : polarity === "uncertain" ? (locale === "en" ? " (uncertain)" : "（不確実）") : "";
    const label = text + suffix;
    relations[r.key] = { id: r.key, subjectId: r.source, objectId: r.target, claimIds: [], polarity, label, canvasLabel: label, badge: r.origin.kind === "knowledge" ? "" : locale === "en" ? "Capsule" : "独自" };
    members[r.key] = [r.key];
  }
  return { members, relations, nodes: [
    ...document.nodes.map(n => ({ id: n.key, label: n.origin.kind==="knowledge"?knowledgeDisplayText(document.knowledge?.snapshot.translations,{kind:"entity",id:n.origin.id,revision:n.origin.revision,field:"name"},locale,n.title):n.title, badge: n.badge, shape: n.shape, kind: n.origin.kind === "kg" ? n.origin.snapshot.kind : "local" })),
    ...document.texts.map(t => ({ id: t.key, label: t.text, kind: "text", textStyle: t.style, textFormat: { width: t.width, fontSize: t.fontSize, fontWeight: t.fontWeight, align: t.align } })),
  ] };
}
