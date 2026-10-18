import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { searchDiscoveryTargets, parseTargetSearch } from "../lib/server/discovery-targets";
import { readRelationTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { verifyRelationWitness } from "../lib/server/relation-pattern-execution";
const enabled = process.env.TARGETS_PUBLIC_READ === "1";
beforeAll(() => {
  if (!enabled) return;
  process.loadEnvFile(".env.public");
  if (process.env.GRAPH_DATASET !== "public-kg" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7694") throw Error("Read-only probe requires local public KG");
});
afterAll(async () => {
  const shared = globalThis as typeof globalThis & { graphReadDatabase?: { driver: { close: () => Promise<void> } } };
  if (enabled && shared.graphReadDatabase) { await shared.graphReadDatabase.driver.close(); delete shared.graphReadDatabase; }
});
it.skipIf(!enabled)("公開KGから名前なしで成立対象を検索し、全証拠の公開性・肯否・方向・Role・版を再検証する", async () => {
  const signal = new AbortController().signal;
  const revision = await readRelationTransaction(tx => readPublicRevision(tx), signal);
  const receipts: unknown[] = [];
  for (const role of [null, ["AUTHORSHIP"]]) {
    const request = parseTargetSearch({ version: 1, dataset: "public-kg", criteria: { q: "", kind: "work", relation: { version: 1, type: "pattern", pattern: { id: "other-works", revision: 1 }, polarity: "affirmed", contributionRoles: role } }, revision, after: null });
    const times: number[] = []; let result;
    for (let n = 0; n < 4; n++) { const start = performance.now(); result = await searchDiscoveryTargets(request, signal); times.push(Math.round(performance.now() - start)); }
    expect(result!.items.length).toBeGreaterThan(0); expect(result!.revision).toBe(revision);
    const proofs = [];
    for (const item of result!.items) {
      expect(item.match.status).toBe("matched"); if (item.match.status !== "matched") throw Error("Missing witness");
      const data = await readRelationTransaction(tx => verifyRelationWitness(tx, request.criteria.relation!, item.match.status === "matched" ? item.match.witness : null), signal);
      expect(data.claims.size).toBe(2);
      for (const c of data.claims.values()) { expect(c.polarity).toBe("affirmed"); expect(c.sourceCount).toBeGreaterThan(0); if (role) expect(c.contribution?.roleId).toBe("AUTHORSHIP"); }
      proofs.push({ entity: item.entity, witness: item.match.witness, nodes: [...data.nodes.values()], claims: [...data.claims.values()] });
    }
    receipts.push({ role, milliseconds: times, revision, page: result!.page, proofs });
    console.log(JSON.stringify({ role, count: result!.items.length, milliseconds: times, revision }));
  }
  expect(await readRelationTransaction(tx => readPublicRevision(tx), signal)).toBe(revision);
  mkdirSync("test-results", { recursive: true }); writeFileSync("test-results/discovery-targets-public-read.json", JSON.stringify(receipts, null, 2));
}, 60000);
