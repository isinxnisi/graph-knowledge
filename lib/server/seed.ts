import { eventProperties, eventParticipationProperties } from "../domain/event-participation";
import { organizationParticipationProperties } from "../domain/organization-participation";
import { contributionProperties } from "../domain/contribution";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Driver, ManagedTransaction } from "neo4j-driver";
import { dateProperties } from "../domain/dates";
import { validateFixture, type Fixture } from "../domain/fixture";
import { QUERY_TIMEOUT_MS } from "./neo4j";
import { normalizeSearch } from "../domain/search";

// Offline whole-fixture writes need a separate budget from interactive reads.
export const SEED_TIMEOUT_MS = 60000;

export async function loadFixture(path = "fixtures/demo.json") {
  return validateFixture(JSON.parse(await readFile(path, "utf8")));
}

export async function applyConstraints(driver: Driver, database: string) {
  const statements = (await readFile("neo4j/constraints.cypher", "utf8"))
    .split(";").map((statement) => statement.trim()).filter(Boolean);
  const session = driver.session({ database });
  try {
    // Schema transactions must be separate from the data transaction.
    for (const statement of statements) await session.run(statement, {}, { timeout: QUERY_TIMEOUT_MS });
  } finally {
    await session.close();
  }
}

type Properties = Record<string, string | boolean | string[] | null>;
const canonical = (value: unknown): string => JSON.stringify(value, (_, item) => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  }
  return item;
});

async function mergeNode(tx: ManagedTransaction, label: "Entity" | "Claim" | "Source" | "Citation", properties: Properties) {
  const result = await tx.run(
    `MERGE (n:${label} {id: $id}) ON CREATE SET n += $properties RETURN properties(n) AS properties`,
    { id: properties.id, properties },
  );
  const expected = Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== null));
  if (canonical(result.records[0].get("properties")) !== canonical(expected)) {
    throw new Error(`Existing ${label} ${properties.id} differs from fixture; recreate the development DB explicitly`);
  }
  return result.summary.counters.updates();
}

async function ensureConnections(tx: ManagedTransaction, id: string, type: "SUBJECT" | "OBJECT" | "HAS_CITATION" | "CITES" | "HAS_EXTERNAL_ID", expectedIds: string[]) {
  const result = await tx.run(
    `MATCH (n {id: $id}) OPTIONAL MATCH (n)-[r:${type}]->(target)
     RETURN collect(target.id) AS ids, count(r) AS count`, { id },
  );
  const ids = result.records[0].get("ids") as string[];
  if (result.records[0].get("count").toNumber() !== expectedIds.length ||
      canonical(ids.sort()) !== canonical([...expectedIds].sort())) {
    throw new Error(`Invalid ${type} connections for ${id}`);
  }
}

export async function seedFixture(driver: Driver, database: string, input: unknown) {
  const fixture = validateFixture(input); // Validate everything before writing schema or data.
  await applyConstraints(driver, database);
  const session = driver.session({ database });
  try {
    return await session.executeWrite(async (tx) => {
      // 凍結版のデータ書込み前に、別データセットのNode混在を拒否する。
      const ids = new Map([
        ...fixture.entities.map((node) => [node.id, "Entity"] as const),
        ...fixture.claims.map((node) => [node.id, "Claim"] as const),
        ...fixture.sources.map((node) => [node.id, "Source"] as const),
        ...fixture.citations.map((node) => [node.id, "Citation"] as const),
      ]);
      const externalKeys = new Set(fixture.entities.flatMap((entity) => entity.externalIds.map((id) => canonical(id))));
      const existing = await tx.run("MATCH (n) RETURN labels(n) AS labels, properties(n) AS properties");
      for (const record of existing.records) {
        const labels = record.get("labels") as string[];
        const props = record.get("properties");
        const allowed = labels.length === 1 && (labels[0] === "ExternalIdentifier"
          ? externalKeys.has(canonical({ namespace: props.namespace, value: props.value }))
          : ids.get(props.id) === labels[0]);
        if (!allowed) throw new Error("Existing database contains nodes outside this fixture/dataset; refusing mixed seed");
      }
      const expectedEdges = new Set<string>();
      for (const claim of fixture.claims) {
        expectedEdges.add(canonical([claim.id, "SUBJECT", claim.subjectId]));
        expectedEdges.add(canonical([claim.id, "OBJECT", claim.objectId]));
      }
      for (const citation of fixture.citations) {
        expectedEdges.add(canonical([citation.claimId, "HAS_CITATION", citation.id]));
        expectedEdges.add(canonical([citation.id, "CITES", citation.sourceId]));
      }
      for (const entity of fixture.entities) for (const external of entity.externalIds) {
        expectedEdges.add(canonical([entity.id, "HAS_EXTERNAL_ID", external.namespace, external.value]));
      }
      const edges = await tx.run("MATCH (s)-[r]->(t) RETURN s.id AS subjectId, type(r) AS type, t.id AS objectId, t.namespace AS namespace, t.value AS value");
      const seenEdges = new Set<string>();
      for (const record of edges.records) {
        const key = canonical(record.get("type") === "HAS_EXTERNAL_ID"
          ? [record.get("subjectId"), record.get("type"), record.get("namespace"), record.get("value")]
          : [record.get("subjectId"), record.get("type"), record.get("objectId")]);
        if (!expectedEdges.has(key) || seenEdges.has(key)) throw new Error("Existing database contains relationships outside this fixture/dataset");
        seenEdges.add(key);
      }
      let nodesCreated = 0;
      let relationshipsCreated = 0;
      const merge = async (label: "Entity" | "Claim" | "Source" | "Citation", props: Properties) => {
        nodesCreated += (await mergeNode(tx, label, props)).nodesCreated;
      };
      for (const entity of fixture.entities) {
        const { externalIds, event, ...properties } = entity;
        const searchNames = [...new Set([entity.name, ...entity.aliases].map(normalizeSearch))];
        await merge("Entity", { ...properties, ...eventProperties(event ?? null), searchNames });
        for (const external of externalIds) {
          const result = await tx.run(
            `MATCH (entity:Entity {id: $entityId})
             MERGE (external:ExternalIdentifier {namespace: $namespace, value: $value})
             ON CREATE SET external.id = $id
             MERGE (entity)-[:HAS_EXTERNAL_ID]->(external)
             RETURN external.id AS id`,
            { entityId: entity.id, ...external, id: randomUUID() },
          );
          nodesCreated += result.summary.counters.updates().nodesCreated;
          relationshipsCreated += result.summary.counters.updates().relationshipsCreated;
          const ownership = await tx.run(
            `MATCH (e:Entity)-[r:HAS_EXTERNAL_ID]->(x:ExternalIdentifier {id: $id})
             RETURN collect(e.id) AS ids, count(r) AS count`, { id: result.records[0].get("id") },
          );
          if (ownership.records[0].get("count").toNumber() !== 1 ||
              canonical(ownership.records[0].get("ids")) !== canonical([entity.id])) {
            throw new Error("External identifier belongs to a different entity");
          }
        }
        const actual = await tx.run(
          `MATCH (e:Entity {id: $id}) OPTIONAL MATCH (e)-[r:HAS_EXTERNAL_ID]->(x)
           RETURN collect([x.namespace, x.value]) AS keys, count(r) AS count`, { id: entity.id },
        );
        // OPTIONAL MATCH emits [null,null] for an entity without identifiers.
        const keys = (actual.records[0].get("keys") as (string | null)[][]).filter(([namespace]) => namespace !== null);
        const expected = externalIds.map(({ namespace, value }) => [namespace, value]);
        if (actual.records[0].get("count").toNumber() !== expected.length ||
            canonical(keys.sort()) !== canonical(expected.sort())) throw new Error("External identifiers differ from fixture");
      }
      for (const source of fixture.sources) {
        const { publishedAt, ...properties } = source;
        await merge("Source", { ...properties, ...dateProperties("publishedAt", publishedAt) });
      }
      for (const claim of fixture.claims) {
        const { subjectId, objectId, period, contribution, organizationParticipation, eventParticipation, ...properties } = claim;
        await merge("Claim", { ...properties, ...contributionProperties(contribution ?? null), ...organizationParticipationProperties(organizationParticipation ?? null), ...eventParticipationProperties(eventParticipation ?? null), ...dateProperties("validFrom", period.from), ...dateProperties("validTo", period.to) });
        const result = await tx.run(
          `MATCH (c:Claim {id: $id}), (s:Entity {id: $subjectId}), (o:Entity {id: $objectId})
           MERGE (c)-[:SUBJECT]->(s) MERGE (c)-[:OBJECT]->(o)`,
          { id: claim.id, subjectId, objectId },
        );
        relationshipsCreated += result.summary.counters.updates().relationshipsCreated;
        await ensureConnections(tx, claim.id, "SUBJECT", [subjectId]);
        await ensureConnections(tx, claim.id, "OBJECT", [objectId]);
      }
      for (const citation of fixture.citations) {
        const { claimId, sourceId, roleEvidence, positionEvidence, eventParticipationEvidence, ...properties } = citation;
        await merge("Citation", { ...properties, eventOriginalText: eventParticipationEvidence?.originalText ?? null, eventOriginalLanguage: eventParticipationEvidence?.language ?? null, positionOriginalText: positionEvidence?.originalText ?? null, positionOriginalLanguage: positionEvidence?.language ?? null, roleOriginalText: roleEvidence?.originalText ?? null, roleOriginalLanguage: roleEvidence?.language ?? null });
        const result = await tx.run(
          `MATCH (r:Citation {id: $id}), (c:Claim {id: $claimId}), (s:Source {id: $sourceId})
           MERGE (c)-[:HAS_CITATION]->(r) MERGE (r)-[:CITES]->(s)`,
          { id: citation.id, claimId, sourceId },
        );
        relationshipsCreated += result.summary.counters.updates().relationshipsCreated;
        await ensureConnections(tx, citation.id, "CITES", [sourceId]);
        const owners = await tx.run(
          `MATCH (c)-[r:HAS_CITATION]->(citation:Citation {id: $id})
           RETURN collect(c.id) AS ids, count(r) AS count`, { id: citation.id },
        );
        if (owners.records[0].get("count").toNumber() !== 1 ||
            canonical(owners.records[0].get("ids")) !== canonical([claimId])) throw new Error("Citation has invalid ownership");
      }
      for (const claim of fixture.claims) {
        await ensureConnections(tx, claim.id, "HAS_CITATION", fixture.citations.filter((r) => r.claimId === claim.id).map((r) => r.id));
      }
      return { nodesCreated, relationshipsCreated };
    }, { timeout: SEED_TIMEOUT_MS });
  } finally {
    await session.close();
  }
}

export async function graphSnapshot(driver: Driver, database: string) {
  const session = driver.session({ database });
  try {
    return await session.executeRead(async (tx) => {
      const nodes = await tx.run("MATCH (n) RETURN labels(n) AS labels, properties(n) AS properties ORDER BY n.id");
      const edges = await tx.run("MATCH (s)-[r]->(t) RETURN s.id AS subjectId, type(r) AS type, t.id AS objectId ORDER BY subjectId, type, objectId");
      return { nodes: nodes.records.map((r) => r.toObject()), relationships: edges.records.map((r) => r.toObject()) };
    }, { timeout: QUERY_TIMEOUT_MS });
  } finally { await session.close(); }
}

export async function graphCounts(driver: Driver, database: string) {
  const snapshot = await graphSnapshot(driver, database);
  const nodes: Record<string, number> = { Entity: 0, Claim: 0, Source: 0, Citation: 0, ExternalIdentifier: 0 };
  const relationships: Record<string, number> = { SUBJECT: 0, OBJECT: 0, HAS_CITATION: 0, CITES: 0, HAS_EXTERNAL_ID: 0 };
  for (const node of snapshot.nodes) for (const label of node.labels as string[]) nodes[label] = (nodes[label] ?? 0) + 1;
  for (const edge of snapshot.relationships) relationships[edge.type] = (relationships[edge.type] ?? 0) + 1;
  return { nodes, relationships };
}

export type { Fixture };
