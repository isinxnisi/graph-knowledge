import "server-only";
import { z } from "zod";
import { DISCOVERY_SEEDS, DISCOVERY_THEMES } from "../domain/discovery";
import { readTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { KnowledgeError } from "./knowledge-foundation";
import type { createKnowledgePublicationService } from "./knowledge-publication";

/** Two actual relationship hops across both public stores; a collection is not a taxonomy. */
export async function knowledgeDiscoveryScope(service: ReturnType<typeof createKnowledgePublicationService>, collection: string, generation?: string) {
  const kind = z.enum(DISCOVERY_THEMES).parse(collection);
  return readTransaction(async tx => {
    const revision = await readPublicRevision(tx);
    let ids: string[] = [...DISCOVERY_SEEDS[kind]], fixed = generation;
    for (let step = 0; step < 2; step++) {
      const [legacy, common] = await Promise.all([
        tx.run(`MATCH (e:Entity)<-[:SUBJECT|OBJECT]-(c:Claim)-[:SUBJECT|OBJECT]->(other:Entity)
          WHERE e.id IN $ids AND c.visibility='published' RETURN DISTINCT other.id AS id ORDER BY id LIMIT 20001`, { ids }),
        service.entityScope({ generation: fixed, ids }),
      ]);
      fixed = common.generation;
      ids = [...new Set([...ids, ...common.ids, ...legacy.records.map(row => String(row.get('id')))])].sort();
      if (ids.length > 20000) throw new KnowledgeError('検索範囲が大きすぎます。条件を絞ってください', 400, 'SCOPE_TOO_LARGE');
    }
    await readPublicRevision(tx, revision);
    return { generation: fixed!, ids };
  });
}
