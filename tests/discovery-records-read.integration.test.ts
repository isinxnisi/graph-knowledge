import { afterAll, beforeAll, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
vi.mock("server-only", () => ({}));
import { RECORD_WHERE, DISCOVERY_RECORDS } from "../lib/server/discovery-records";
const live = process.env.RECORDS_READ_TEST === "1";
let driver: ReturnType<typeof neo4j.driver>;
beforeAll(() => {
  if (!live) return;
  process.loadEnvFile(".env.public");
  const uri = process.env.NEO4J_URI!;
  expect(new URL(uri).hostname).toBe("127.0.0.1"); expect(["7694", "7695"]).toContain(new URL(uri).port);
  driver = neo4j.driver(uri, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
});
afterAll(async () => { if (driver) await driver.close(); });
it.skipIf(!live)("実Cypherをread-onlyで評価：25件の不一致より後の同一Claim／端点をLIMIT前に選ぶ", async () => {
  const row = (id: number, role = "AUTHORSHIP", q = "needle", kind = "work", visibility = "published") => ({
    c: { id: String(id).padStart(3, "0"), predicate: "CONTRIBUTED_TO", contributionRoleId: role, visibility, polarity: "denied" },
    subject: { id: "person", kind: "person", searchNames: ["needle"] }, object: { id: "work", kind, searchNames: [q] },
  });
  const fixtures = [...Array.from({ length: 25 }, (_, n) => row(n)), row(25, "DRAWING", "other"), row(26, "DRAWING", "needle", "work", "hidden"), row(27, "DRAWING")];
  const session = driver.session({ database: process.env.NEO4J_DATABASE, defaultAccessMode: "READ" });
  try {
    const result = await session.executeRead(tx => tx.run(`UNWIND $fixtures AS row WITH row.c AS c, row.subject AS subject, row.object AS object ${RECORD_WHERE} RETURN c.id AS id ORDER BY id LIMIT $take`, { fixtures, predicates: ["CONTRIBUTED_TO"], role: "DRAWING", kind: "work", q: "needle", scopeIds: null, around: null, after: null, take: neo4j.int(1) }), { timeout: 10000 });
    expect(result.records.map(r => r.get("id"))).toEqual(["027"]);
    const actual = await session.executeRead(tx => tx.run(DISCOVERY_RECORDS, { predicates: ["CONTRIBUTED_TO"], role: "DRAWING", kind: null, q: "", scopeIds: null, around: null, after: null, take: neo4j.int(21) }), { timeout: 10000 });
    expect(actual.records).toHaveLength(2);
    expect(actual.records.every(r => r.get("claim").contributionRoleId === "DRAWING")).toBe(true);
  } finally { await session.close(); }
}, 30000);
