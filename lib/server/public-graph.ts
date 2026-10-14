import { randomUUID } from "node:crypto";
import type { Driver, ManagedTransaction } from "neo4j-driver";
import { type Fixture } from "../domain/fixture";
import { dateProperties } from "../domain/dates";
import { contributionProperties } from "../domain/contribution";
import { organizationParticipationProperties } from "../domain/organization-participation";
import { eventProperties, eventParticipationProperties } from "../domain/event-participation";
import { normalizeSearch } from "../domain/search";
import { graphIdentities, mergeIdentities, readRetainedIdentities } from "./public-identities";
import { applyConstraints } from "./seed";
import { PUBLIC_DATASET, sha256, stableJson, validatePublicRelease, type PublicRelease } from "./public-dataset";

type Label = "Entity" | "Claim" | "Source" | "Citation" | "ExternalIdentifier";
type Properties = Record<string, string | boolean | string[]>;
type GraphNode = { label: Label; properties: Properties };
type GraphEdge = { from: string; type: string; to: string };
export type PublicGraph = { nodes: Record<string, GraphNode>; edges: GraphEdge[] };
export type PublicPlan = { added: string[]; updated: string[]; relationshipsAdded: number };
const labels: Label[] = ["Entity", "Claim", "Source", "Citation", "ExternalIdentifier"];
const key = (label: Label, properties: Properties) => `${label}:${label === "ExternalIdentifier" ? stableJson([properties.namespace, properties.value]) : properties.id}`;
const clean = (properties: Record<string, unknown>) => Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== null && value !== undefined)) as Properties;
const sortedGraph = (graph: PublicGraph): PublicGraph => {
  // Keep the exact canonical ordering without serializing each edge on every comparison.
  const edgeKeys = new Map(graph.edges.map(edge => [edge, stableJson(edge)]));
  return { nodes: Object.fromEntries(Object.entries(graph.nodes).sort(([a], [b]) => a.localeCompare(b))),
    edges: graph.edges.sort((a, b) => edgeKeys.get(a)!.localeCompare(edgeKeys.get(b)!)) };
};
export const publicGraphDigest = (graph: PublicGraph) => sha256(stableJson(sortedGraph(graph)));

export function publicGraph(fixture: Fixture, withdrawals: NonNullable<PublicRelease["manifest"]["withdrawals"]> = []): PublicGraph {
  const graph: PublicGraph = { nodes: {}, edges: [] };
  const add = (label: Label, properties: Record<string, unknown>) => {
    const props = clean(properties), id = key(label, props);
    if (graph.nodes[id] && stableJson(graph.nodes[id].properties) !== stableJson(props)) throw new Error("Conflicting graph node");
    graph.nodes[id] = { label, properties: props }; return id;
  };
  const edge = (from: string, type: string, to: string) => graph.edges.push({ from, type, to });
  for (const entity of fixture.entities) {
    const { externalIds, event, ...props } = entity;
    const id = add("Entity", { ...props, ...eventProperties(event ?? null), searchNames: [...new Set([entity.name, ...entity.aliases].map(normalizeSearch))] });
    for (const external of externalIds) edge(id, "HAS_EXTERNAL_ID", add("ExternalIdentifier", external));
  }
  for (const source of fixture.sources) {
    const { publishedAt, ...props } = source;
    add("Source", { ...props, ...dateProperties("publishedAt", publishedAt) });
  }
  for (const claim of fixture.claims) {
    const { subjectId, objectId, period, contribution, organizationParticipation, eventParticipation, ...props } = claim;
    const id = add("Claim", { ...props, ...dateProperties("validFrom", period.from), ...dateProperties("validTo", period.to), ...contributionProperties(contribution ?? null), ...organizationParticipationProperties(organizationParticipation ?? null), ...eventParticipationProperties(eventParticipation ?? null) });
    edge(id, "SUBJECT", `Entity:${subjectId}`); edge(id, "OBJECT", `Entity:${objectId}`);
  }
  for (const citation of fixture.citations) {
    const { claimId, sourceId, roleEvidence, positionEvidence, eventParticipationEvidence, ...props } = citation;
    const id = add("Citation", { ...props, roleOriginalText: roleEvidence?.originalText, roleOriginalLanguage: roleEvidence?.language,
      positionOriginalText: positionEvidence?.originalText, positionOriginalLanguage: positionEvidence?.language,
      eventOriginalText: eventParticipationEvidence?.originalText, eventOriginalLanguage: eventParticipationEvidence?.language });
    edge(`Claim:${claimId}`, "HAS_CITATION", id); edge(id, "CITES", `Source:${sourceId}`);
  }
  for (const row of withdrawals) Object.assign(graph.nodes[`Claim:${row.claimId}`].properties, clean({ withdrawalReason: row.reason, withdrawnInRelease: row.release, replacementClaimId: row.replacementClaimId }));
  return sortedGraph(graph);
}

export function planPublicGraph(before: PublicGraph, after: PublicGraph): PublicPlan {
  const plan: PublicPlan = { added: [], updated: [], relationshipsAdded: 0 };
  for (const id of Object.keys(before.nodes)) if (!after.nodes[id]) throw new Error("Implicit deletion is not allowed; withdrawal requires an explicit release contract");
  const beforeEdges = new Set(before.edges.map(edge => stableJson(edge)));
  const afterEdges = new Set(after.edges.map(edge => stableJson(edge)));
  for (const edge of beforeEdges) if (!afterEdges.has(edge)) throw new Error("Changing or deleting an existing connection is not allowed");
  for (const [id, node] of Object.entries(after.nodes)) {
    const old = before.nodes[id];
    if (!old) { plan.added.push(id); continue; }
    if (stableJson(old) === stableJson(node)) continue;
    if (old.properties.createdAt !== node.properties.createdAt || old.properties.kind !== node.properties.kind) throw new Error("Existing identity/createdAt cannot change");
    if (node.label === "Claim") {
      const withdrawing = old.properties.visibility === "published" && node.properties.visibility === "hidden" && typeof node.properties.withdrawalReason === "string" && typeof node.properties.withdrawnInRelease === "string";
      const semantics = (props: Properties) => Object.fromEntries(Object.entries(props).filter(([field]) => field !== "updatedAt" && !(withdrawing && ["visibility", "withdrawalReason", "withdrawnInRelease", "replacementClaimId"].includes(field))));
      if (stableJson(semantics(old.properties)) !== stableJson(semantics(node.properties))) throw new Error("Claim meaning/visibility cannot change in place; use a reviewed replacement or withdrawal");
    }
    plan.updated.push(id);
  }
  plan.relationshipsAdded = [...afterEdges].filter(edge => !beforeEdges.has(edge)).length;
  return plan;
}

export async function readPublicGraph(tx: ManagedTransaction): Promise<PublicGraph> {
  const nodes = await tx.run("MATCH (n) WHERE NOT n:DatasetState AND NOT n:DatasetRelease AND NOT n:DatasetIdentity RETURN elementId(n) AS internal, labels(n) AS labels, properties(n) AS props");
  const graph: PublicGraph = { nodes: {}, edges: [] }, internals = new Map<string, string>();
  for (const record of nodes.records) {
    const found = record.get("labels") as Label[];
    if (found.length !== 1 || !labels.includes(found[0])) throw new Error("Unmanaged node in public database");
    const props = { ...record.get("props") } as Properties;
    if (found[0] === "ExternalIdentifier") delete props.id;
    const id = key(found[0], props);
    if (graph.nodes[id]) throw new Error("Duplicate graph identity");
    graph.nodes[id] = { label: found[0], properties: props }; internals.set(record.get("internal"), id);
  }
  const edges = await tx.run("MATCH (s)-[r]->(t) RETURN elementId(s) AS source, type(r) AS type, elementId(t) AS target, properties(r) AS props");
  const seen = new Set<string>();
  for (const record of edges.records) {
    const from = internals.get(record.get("source")), to = internals.get(record.get("target"));
    if (!from || !to || Object.keys(record.get("props")).length) throw new Error("Unmanaged relationship in public database");
    const edge = { from, type: record.get("type") as string, to };
    if (seen.has(stableJson(edge))) throw new Error("Duplicate relationship");
    seen.add(stableJson(edge)); graph.edges.push(edge);
  }
  return sortedGraph(graph);
}

async function checkRelease(tx: ManagedTransaction, release: PublicRelease) {
  const state = (await tx.run("MATCH (s:DatasetState) RETURN properties(s) AS state")).records;
  if (state.length > 1 || state.length === 1 && state[0].get("state").id !== PUBLIC_DATASET) throw new Error("Wrong database dataset marker");
  const before = await readPublicGraph(tx), after = publicGraph(release.fixture, release.manifest.withdrawals);
  mergeIdentities(await readRetainedIdentities(tx), graphIdentities(after));
  const current = state[0]?.get("state") as { release?: string; graphDigest?: string } | undefined;
  if (!current?.release && Object.keys(before.nodes).length) throw new Error("Refusing to adopt a nonempty unmarked database");
  if (current?.release && current.graphDigest !== publicGraphDigest(before)) throw new Error("Database drift detected; inspect before applying a release");
  const digest = sha256(stableJson(release.manifest));
  const previous = (await tx.run("MATCH (r:DatasetRelease {id:$id}) RETURN r.digest AS digest", { id: release.manifest.release })).records[0];
  if (previous && previous.get("digest") !== digest) throw new Error("Release ID was already used with different content");
  if (current?.release === release.manifest.release) {
    if (!previous || publicGraphDigest(after) !== current.graphDigest) throw new Error("Release content differs from applied graph");
    return { before, after, plan: { added: [], updated: [], relationshipsAdded: 0 } as PublicPlan, unchanged: true, digest };
  }
  if (previous || (current?.release ?? null) !== release.manifest.baseRelease) throw new Error("Base release mismatch");
  for (const row of release.manifest.withdrawals ?? []) {
    const old = before.nodes[`Claim:${row.claimId}`];
    if (!old) throw new Error("Only an existing Claim can be withdrawn");
    if (old.properties.visibility === "published" && row.release !== release.manifest.release) throw new Error("New withdrawal must name this release");
    if (old.properties.visibility === "published" && row.replacementClaimId && (before.nodes[`Claim:${row.replacementClaimId}`] || after.nodes[`Claim:${row.replacementClaimId}`]?.properties.visibility !== "published")) throw new Error("Replacement must use a new Claim UUID");
  }
  return { before, after, plan: planPublicGraph(before, after), unchanged: false, digest };
}

export async function planPublicRelease(driver: Driver, database: string, release: PublicRelease) {
  release = validatePublicRelease(release);
  const session = driver.session({ database });
  try { return await session.executeRead(async tx => {
    const checked = await checkRelease(tx, release);
    return { release: release.manifest.release, unchanged: checked.unchanged, ...checked.plan };
  }, { timeout: 60000 }); } finally { await session.close(); }
}

export async function applyPublicRelease(driver: Driver, database: string, release: PublicRelease) {
  release = validatePublicRelease(release);
  // 非空の別datasetへschemaを書き込む前にも確認する。
  await planPublicRelease(driver, database, release);
  await applyConstraints(driver, database);
  const session = driver.session({ database });
  try {
    await session.run("CREATE CONSTRAINT dataset_state_id IF NOT EXISTS FOR (n:DatasetState) REQUIRE n.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT dataset_release_id IF NOT EXISTS FOR (n:DatasetRelease) REQUIRE n.id IS UNIQUE");
    return await session.executeWrite(async tx => {
      // 同じdatasetのrelease適用をDB側で直列化。失敗時はこの変更もrollback。
      await tx.run("MERGE (s:DatasetState {id:$id}) SET s.lockVersion = coalesce(s.lockVersion, 0)", { id: PUBLIC_DATASET });
      const checked = await checkRelease(tx, release);
      if (checked.unchanged) return { release: release.manifest.release, unchanged: true, ...checked.plan };
      for (const label of labels) {
        const rows = [...checked.plan.added, ...checked.plan.updated].map(id => checked.after.nodes[id]).filter(node => node.label === label).map(node => ({ ...node.properties, ...(label === "ExternalIdentifier" ? { id: randomUUID() } : {}) }));
        if (!rows.length) continue;
        // labelは固定allowlistのみ。データ由来の文字列は全てparameterへ渡す。
        await tx.run(`UNWIND $rows AS row MERGE (n:${label} {${label === "ExternalIdentifier" ? "namespace:row.namespace, value:row.value" : "id:row.id"}}) SET n = row`, { rows });
      }
      const existingEdges = new Set(checked.before.edges.map(edge => stableJson(edge)));
      const newEdges = checked.after.edges.filter(edge => !existingEdges.has(stableJson(edge)));
      for (const type of ["SUBJECT", "OBJECT", "HAS_CITATION", "CITES", "HAS_EXTERNAL_ID"]) {
        const rows = newEdges.filter(edge => edge.type === type).map(edge => ({ from: checked.after.nodes[edge.from].properties.id, target: checked.after.nodes[edge.to].properties }));
        if (!rows.length) continue;
        const fromLabel = type === "CITES" ? "Citation" : "Claim";
        const toLabel = type === "HAS_CITATION" ? "Citation" : type === "CITES" ? "Source" : "Entity";
        await tx.run(type === "HAS_EXTERNAL_ID"
          ? "UNWIND $rows AS row MATCH (s:Entity {id:row.from}), (t:ExternalIdentifier {namespace:row.target.namespace, value:row.target.value}) MERGE (s)-[:HAS_EXTERNAL_ID]->(t)"
          : `UNWIND $rows AS row MATCH (s:${fromLabel} {id:row.from}), (t:${toLabel} {id:row.target.id}) MERGE (s)-[:${type}]->(t)`, { rows });
      }
      if (publicGraphDigest(await readPublicGraph(tx)) !== publicGraphDigest(checked.after)) throw new Error("Applied graph differs from release; rolling back");
      await tx.run("MATCH (s:DatasetState {id:$id}) SET s.release=$release, s.revision=$revision, s.graphDigest=$graphDigest CREATE (:DatasetRelease {id:$release, digest:$digest, dataSha256:$dataSha256, reason:$reason, appliedAt:$appliedAt})",
        { id: PUBLIC_DATASET, release: release.manifest.release, revision: randomUUID(), digest: checked.digest, graphDigest: publicGraphDigest(checked.after), dataSha256: release.manifest.dataSha256, reason: release.manifest.reason, appliedAt: new Date().toISOString() });
      return { release: release.manifest.release, unchanged: false, ...checked.plan };
    }, { timeout: 60000 });
  } finally { await session.close(); }
}
