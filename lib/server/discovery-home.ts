import "server-only";
import { cache } from "react";
import { z } from "zod";
import { readTransaction } from "./read-db";
import { entitySummary, claimSummary } from "./mappers";
import { publicExamples } from "./public-discovery";
import type { DiscoveryHomeData } from "../domain/discovery-home";

// Registration times belong to the KG, not the date of the historical event or source.
// Only entities with published relations and published claims enter this public feed.
export const RECENT_ENTITIES = `
MATCH (e:Entity)
WHERE EXISTS { MATCH (e)<-[:SUBJECT|OBJECT]-(c:Claim) WHERE c.visibility = 'published' }
RETURN properties(e) AS entity, e.createdAt AS addedAt
ORDER BY addedAt DESC, e.id LIMIT 4`;
export const RECENT_CLAIMS = `
MATCH (c:Claim)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
WHERE c.visibility = 'published'
WITH c, subject, object ORDER BY c.createdAt DESC, c.id LIMIT 4
OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(s:Source)
RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object,
       c.createdAt AS addedAt, count(DISTINCT s) AS sourceCount
ORDER BY addedAt DESC, claim.id`;
const PUBLIC_COUNTS = `
MATCH (c:Claim) WHERE c.visibility = 'published'
MATCH (c)-[:SUBJECT|OBJECT]->(e:Entity)
RETURN count(DISTINCT c) AS claims, count(DISTINCT e) AS entities`;
const timestamp = (value: unknown) => z.iso.datetime().parse(value);

export const discoveryHomeData = cache(async (): Promise<DiscoveryHomeData> => {
  const [examples, recent] = await Promise.all([publicExamples(), readTransaction(async tx => {
    const entities = await tx.run(RECENT_ENTITIES);
    const claims = await tx.run(RECENT_CLAIMS);
    const counts = (await tx.run(PUBLIC_COUNTS)).records[0];
    return {
      recentEntities: entities.records.map(r => ({ entity: entitySummary(r.get("entity")), addedAt: timestamp(r.get("addedAt")) })),
      recentClaims: claims.records.map(r => {
        const subject = entitySummary(r.get("subject")), object = entitySummary(r.get("object"));
        return { subject, object, claim: claimSummary(r.get("claim"), subject, object, r.get("sourceCount").toNumber()), addedAt: timestamp(r.get("addedAt")) };
      }),
      counts: { entities: counts.get("entities").toNumber(), claims: counts.get("claims").toNumber() },
    };
  })]);
  return { features: examples.map(({ entity, neighbors }) => ({ entity, nodes: neighbors.nodes, claims: neighbors.claims })), ...recent };
});
