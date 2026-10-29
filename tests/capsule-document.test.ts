import { beforeEach, describe, expect, it, vi } from "vitest";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { ClaimDetail, ClaimSummary, NeighborsResponse } from "../lib/domain/api";
import { capsuleDocumentSchema, capsuleReferences } from "../lib/domain/capsule-document";
import { memberCapsuleContentSchema, memberCapsuleSchema } from "../lib/domain/member-capsule";
import { emptyExpansion, emptyGraph } from "../lib/client/graph-state";
import { captureCapsule, capsuleClone, capsuleHistory, recordCapsule, undoCapsule, redoCapsule, removeCapsuleElements, withDocument, withCapsuleView, materializeLegacy, compareCapsuleNeighborhood, snapshotClaim } from "../lib/client/capsule-editor";
import { capsulePresentation } from "../lib/client/capsule-presentation";
import { fetchAdjacentNeighbors, fetchNeighbors } from "../lib/client/api";

vi.mock("../lib/client/api", () => ({ fetchAdjacentNeighbors: vi.fn(), fetchNeighbors: vi.fn() }));
const page = examples.neighbors as NeighborsResponse;
const claim = examples.claim.claim as ClaimDetail;
const base = () => ({ ...emptyGraph(), nodes: Object.fromEntries(page.nodes.map(n => [n.id, n])), claims: Object.fromEntries(page.claims.map(c => [c.id, c])), centerId: page.centerId });
const capture = () => captureCapsule(base(), { positions: { [page.centerId]: { x: 125, y: 240 } }, pan: { x: 10, y: 20 }, zoom: 0.75, initialLayoutDone: true }, "demo", "Capsule");
beforeEach(() => vi.resetAllMocks());

describe("Capsule document identity and snapshots", () => {
  it("captures the displayed graph atomically, keeping its positions and excluding cached/in-flight records", () => {
    const graph = base(), unrelated = { ...page.nodes[0], id: crypto.randomUUID(), name: "cache only" };
    graph.cacheNodes[unrelated.id] = unrelated;
    const result = captureCapsule(graph, { positions: { [page.centerId]: { x: 5, y: 9 }, [unrelated.id]: { x: 1, y: 2 } }, pan: { x: 3, y: 7 }, zoom: 1.2, initialLayoutDone: true }, "demo", "captured");
    expect(result.entityIds).toEqual(Object.keys(graph.nodes)); expect(result.claimIds).toEqual(Object.keys(graph.claims));
    expect(result.document!.layout.positions).toEqual({ [page.centerId]: { x: 5, y: 9 } });
    graph.nodes[page.centerId] = { ...graph.nodes[page.centerId], name: "later data" };
    expect(result.document!.nodes.find(n => n.key === page.centerId)!.title).not.toBe("later data");
  });
  it("accepts the complete ordinary Graph limit of 100 entities and 200 individual claims", () => {
    const graph = emptyGraph();
    for (let i = 0; i < 100; i++) { const id = crypto.randomUUID(); graph.nodes[id] = { id, kind: "person", name: `person ${i}`, description: null }; }
    const ids = Object.keys(graph.nodes);
    for (let i = 0; i < 200; i++) { const id = crypto.randomUUID(); graph.claims[id] = { ...page.claims[0], id, subjectId: ids[i % 100], objectId: ids[(i + 1) % 100] }; }
    const result = captureCapsule(graph, null, "demo", "Full graph");
    const { dataset, title, note, language, entityIds, claimIds, document } = result;
    expect(memberCapsuleContentSchema.parse({ dataset, title, note, language, entityIds, claimIds, document }).document!.relations).toHaveLength(200);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(2_000_000);
  });
  it("distinguishes unknown neighborhood from a complete empty query and a partial query", () => {
    const graph = base();
    const ids = Object.keys(graph.nodes);
    graph.expansions[ids[0]] = { ...emptyExpansion(), pages: [{ after: null, claimIds: [], nextCursor: null }] };
    graph.expansions[ids[1]] = { ...emptyExpansion(), pages: [{ after: null, claimIds: [page.claims[0].id], nextCursor: "next" }], hasMore: true };
    const doc = captureCapsule(graph, null, "demo", "Scopes").document!;
    expect(doc.nodes.map(n => n.origin.kind === "kg" ? n.origin.neighbors.state : null)).toEqual(["complete", "partial", ...ids.slice(2).map(() => "unknown")]);
    expect(doc.nodes[0].origin.kind === "kg" && doc.nodes[0].origin.neighbors.claimIds).toEqual([]);
  });
  it("keeps KG identity and individual claim semantics under local labels and grouped display edges", () => {
    const value = capture(), doc = capsuleClone(value.document!);
    doc.nodes[0].title = "My label"; doc.relations.forEach(r => { r.label = "My display label"; });
    const parsed = capsuleDocumentSchema.parse(doc), presentation = capsulePresentation(parsed, "ja");
    expect(capsuleReferences(parsed)).toEqual({ entityIds: value.entityIds, claimIds: value.claimIds });
    expect(Object.values(presentation.members).flat().sort()).toEqual(doc.relations.map(r => r.key).sort());
    const relation = parsed.relations[0];
    expect(relation.origin.kind === "kg" && relation.origin.snapshot.polarity).toBe(page.claims[0].polarity);
  });
  it("rejects counterfeit reference identity and mismatched evidence targets", () => {
    const doc = capture().document!;
    const mismatch = capsuleClone(doc); if (mismatch.nodes[0].origin.kind === "kg") mismatch.nodes[0].origin.id = crypto.randomUUID();
    expect(capsuleDocumentSchema.safeParse(mismatch).success).toBe(false);
    const evidence = { key: crypto.randomUUID(), targetKey: doc.nodes[0].key, supports: "relation", title: "Source", url: null, locator: "p.1", note: "", stance: "background" };
    expect(capsuleDocumentSchema.safeParse({ ...doc, evidence: [evidence] }).success).toBe(false);
    const value = capture();
    expect(memberCapsuleContentSchema.safeParse({ dataset: value.dataset, title: value.title, note: value.note, language: value.language, entityIds: [], claimIds: value.claimIds, document: value.document }).success).toBe(false);
  });
  it("supports local-only entities, evidence without URL, and independent text without inventing KG IDs", () => {
    const key = crypto.randomUUID(), textKey = crypto.randomUUID();
    const doc = capsuleDocumentSchema.parse({ schemaVersion: 1, nodes: [{ key, title: "Hypothesis", description: "", badge: "idea", origin: { kind: "local" } }], relations: [], texts: [{ key: textKey, text: "Compare these", style: "heading" }], evidence: [{ key: crypto.randomUUID(), targetKey: key, supports: "identity", title: "Private notes", url: null, locator: "", note: "Identifies this object", stance: "background" }], unresolvedClaimIds: [], layout: { positions: {}, pan: { x: 0, y: 0 }, zoom: 1 } });
    expect(capsuleReferences(doc)).toEqual({ entityIds: [], claimIds: [] });
    const content = memberCapsuleContentSchema.parse({ dataset: "demo", title: "Local only", note: "", language: "ja", ...capsuleReferences(doc), document: doc });
    expect(memberCapsuleSchema.safeParse({ id: crypto.randomUUID(), schemaVersion: 2, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content }).success).toBe(true);
    expect(capsulePresentation(doc, "ja").nodes.map(n => n.kind)).toEqual(["local", "text"]);
  });
  it("retains unresolved legacy references without fabricating a capture at the original creation time", () => {
    const original = capture(); delete original.document;
    const migrated = materializeLegacy(original, { entities: {}, claims: {}, issues: [] });
    expect(migrated.document!.nodes.every(n => n.origin.kind === "unresolved")).toBe(true);
    expect(migrated.document!.unresolvedClaimIds).toEqual(original.claimIds);
    expect(capsuleReferences(migrated.document!)).toEqual({ entityIds: original.entityIds, claimIds: original.claimIds });
  });
});

describe("Explicit editing and operation history", () => {
  it("inherits the current viewing layout and retains it as the discard point without modifying the saved version", () => {
    const saved = capture(), before = JSON.stringify(saved);
    const viewing = withCapsuleView(saved, { positions: { [page.centerId]: { x: 555, y: 777 } }, pan: { x: 5, y: 5 }, zoom: 0.9, initialLayoutDone: true });
    let history = capsuleHistory(viewing);
    history = recordCapsule(history, { ...viewing, note: "edited" });
    expect(undoCapsule(history).present).toEqual(viewing);
    expect(JSON.stringify(saved)).toBe(before);
    expect(viewing.document!.layout.positions[page.centerId]).toEqual({ x: 555, y: 777 });
  });
  it("undoes addition with automatic connection as one operation and clears redo after a new edit", () => {
    const value = capture(), doc = capsuleClone(value.document!), id = crypto.randomUUID();
    doc.nodes.push({ key: id, title: "New", description: "", badge: "", origin: { kind: "local" } });
    doc.relations.push({ key: crypto.randomUUID(), source: doc.nodes[0].key, target: id, label: "Related", note: "", origin: { kind: "local" } });
    const added = recordCapsule(capsuleHistory(value), withDocument(value, doc));
    expect(added.past).toHaveLength(1); expect(undoCapsule(added).present).toEqual(value); expect(redoCapsule(undoCapsule(added)).present).toEqual(added.present);
    expect(recordCapsule(undoCapsule(added), { ...value, note: "Different edit" }).future).toEqual([]);
  });
  it("removes incident relations and their evidence, while retaining disconnected nodes and text", () => {
    const doc = capture().document!, removed = doc.nodes[0].key;
    const isolated = { key: crypto.randomUUID(), title: "Isolated", description: "", badge: "", origin: { kind: "local" as const } };
    doc.nodes.push(isolated); doc.texts.push({ key: crypto.randomUUID(), text: "Independent note", style: "note" });
    const next = removeCapsuleElements(doc, [removed]);
    expect(next.nodes.some(n => n.key === isolated.key)).toBe(true); expect(next.texts).toHaveLength(1);
    expect(next.relations.some(r => r.source === removed || r.target === removed)).toBe(false);
  });
  it("can remove every element, save an empty named document, and rebuild it without weakening legacy references", () => {
    const value = capture(), empty = withDocument(value, removeCapsuleElements(value.document!, value.document!.nodes.map(n => n.key)));
    const { dataset, title, note, language, entityIds, claimIds, document } = empty;
    const content = memberCapsuleContentSchema.parse({ dataset, title, note, language, entityIds, claimIds, document });
    expect(content.document!.nodes).toEqual([]); expect(content.document!.relations).toEqual([]); expect(content.document!.layout.positions).toEqual({});
    expect(memberCapsuleContentSchema.safeParse({ ...content, document: undefined }).success).toBe(false);
    const rebuilt = capsuleClone(document!); rebuilt.nodes.push({ key: crypto.randomUUID(), title: "New direction", description: "", badge: "", origin: { kind: "local" } });
    const history = recordCapsule(capsuleHistory(empty), withDocument(empty, rebuilt));
    expect(history.present.document!.nodes).toHaveLength(1); expect(undoCapsule(history).present).toEqual(empty);
  });
  it("captures detailed citations only when explicitly supplied and preserves individual source meaning", () => {
    const value = capture(), doc = capsuleClone(value.document!), relation = doc.relations.find(r => r.key === claim.id)!;
    expect(relation.origin.kind === "kg" && relation.origin.detail).toBeNull();
    if (relation.origin.kind === "kg") relation.origin = { ...relation.origin, snapshot: snapshotClaim(claim), detail: claim };
    expect(capsuleDocumentSchema.parse(doc).relations.find(r => r.key === claim.id)!.origin).toMatchObject({ detail: { citations: claim.citations } });
  });
});

describe("KG relationship presence comparisons", () => {
  function completeNode() {
    const graph = base(); graph.expansions[page.centerId] = { ...emptyExpansion(), pages: [{ after: null, claimIds: page.claims.map(c => c.id), nextCursor: null }] };
    return captureCapsule(graph, null, "demo", "Query").document!.nodes.find(n => n.key === page.centerId)!;
  }
  it("detects added/removed neighbors even when the entity text has not changed", async () => {
    const node = completeNode(), added: ClaimSummary = { ...page.claims[0], id: crypto.randomUUID() };
    vi.mocked(fetchNeighbors).mockResolvedValue({ ...page, claims: [added], page: { hasMore: false, nextCursor: null } });
    const result = await compareCapsuleNeighborhood(node, null, new AbortController().signal);
    expect(result.state).toBe("changed"); expect(result.added).toEqual([added.id]); expect(result.removed.sort()).toEqual(page.claims.map(c => c.id).sort());
  });
  it("does not interpret unknown/partial/failed or unreplayable scopes as unchanged or absent", async () => {
    const node = completeNode(); if (node.origin.kind === "kg") node.origin.neighbors.state = "partial";
    expect((await compareCapsuleNeighborhood(node, null, new AbortController().signal)).state).toBe("unknown");
    expect(fetchNeighbors).not.toHaveBeenCalled();
    vi.mocked(fetchNeighbors).mockRejectedValue(Error("offline"));
    expect((await compareCapsuleNeighborhood(completeNode(), null, new AbortController().signal)).state).toBe("failed");
    const unsupported = completeNode(); if (unsupported.origin.kind === "kg") unsupported.origin.neighbors.scope = "legacy unknown scope";
    expect((await compareCapsuleNeighborhood(unsupported, null, new AbortController().signal)).state).toBe("unknown");
  });
  it("replays typed conditions and waits for all pages before declaring a comparison", async () => {
    const node = completeNode(); if (node.origin.kind === "kg") node.origin.neighbors.scope = JSON.stringify({ visibility: "published", execution: "adjacent", condition: { version: 1, type: "adjacent", traversal: "either", polarity: "all-records", predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null } });
    const half = Math.ceil(page.claims.length / 2);
    vi.mocked(fetchAdjacentNeighbors).mockResolvedValueOnce({ ...page, claims: page.claims.slice(0, half), page: { hasMore: true, nextCursor: "next" } }).mockResolvedValueOnce({ ...page, claims: page.claims.slice(half), page: { hasMore: false, nextCursor: null } });
    expect((await compareCapsuleNeighborhood(node, null, new AbortController().signal)).state).toBe("same");
    expect(fetchAdjacentNeighbors).toHaveBeenCalledTimes(2); expect(vi.mocked(fetchAdjacentNeighbors).mock.calls[1][1]).toBe("next");
  });
});
