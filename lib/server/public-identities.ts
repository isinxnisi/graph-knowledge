import { z } from "zod";
import type { ManagedTransaction } from "neo4j-driver";
import type { PublicGraph } from "./public-graph";
import { sha256, stableJson } from "./public-dataset";

export const retainedIdentitySchema = z.strictObject({ id: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) });
export type RetainedIdentity = z.infer<typeof retainedIdentitySchema>;

// 復旧でKGから消えるIDの再利用を防ぐ指紋。知識本文やSourceの二重管理ではない。
export function graphIdentities(graph: PublicGraph): RetainedIdentity[] {
  return Object.entries(graph.nodes).map(([id, node]) => {
    const props = node.label === "Claim" ? Object.fromEntries(Object.entries(node.properties).filter(([key]) => !["updatedAt", "visibility", "withdrawalReason", "withdrawnInRelease", "replacementClaimId"].includes(key)))
      : { kind: node.properties.kind, createdAt: node.properties.createdAt };
    const connections = graph.edges.filter(edge => node.label === "Claim" ? edge.from === id && ["SUBJECT", "OBJECT"].includes(edge.type)
      : node.label === "Citation" ? edge.to === id && edge.type === "HAS_CITATION" || edge.from === id && edge.type === "CITES"
      : node.label === "ExternalIdentifier" ? edge.to === id && edge.type === "HAS_EXTERNAL_ID" : false);
    return { id, digest: sha256(stableJson({ props, connections: connections.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) })) };
  });
}

export function mergeIdentities(...groups: RetainedIdentity[][]): RetainedIdentity[] {
  const ids = new Map<string, RetainedIdentity>();
  const uuids = new Map<string, string>();
  for (const row of groups.flat()) {
    if (ids.has(row.id) && ids.get(row.id)!.digest !== row.digest) throw new Error("Previously used identity has different meaning");
    const [label, ...parts] = row.id.split(":");
    if (label !== "ExternalIdentifier") {
      const uuid = parts.join(":");
      if (uuids.has(uuid) && uuids.get(uuid) !== row.id) throw new Error("Previously used UUID has a different node type");
      uuids.set(uuid, row.id);
    }
    ids.set(row.id, row);
  }
  return [...ids.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function readRetainedIdentities(tx: ManagedTransaction): Promise<RetainedIdentity[]> {
  return (await tx.run("MATCH (n:DatasetIdentity) RETURN properties(n) AS props")).records.map(row => retainedIdentitySchema.parse(row.get("props")));
}
