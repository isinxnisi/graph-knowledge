import { beforeEach, describe, expect, it, vi } from "vitest";
import { int } from "neo4j-driver";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/read-db", () => ({ readTransaction: vi.fn() }));
vi.mock("../lib/server/public-revision", () => ({ readPublicRevision: vi.fn() }));
import { readTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { discoverRecords, discoveryRecordsInput, DISCOVERY_RECORDS } from "../lib/server/discovery-records";
import { recordPresets, recordSearchProblem } from "../lib/domain/discovery-records";
import { executeDiscoveryPlan } from "../lib/client/use-discovery-prototype";
const input = (query = "") => discoveryRecordsInput(new Request("http://localhost/?" + query));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const subject = { id: id(50), name: "Creator", kind: "person", searchNames: ["creator"] };
const object = { id: id(51), name: "Work", kind: "work", searchNames: ["work"] };
const rawClaim = (n: number) => ({ id: id(n), predicate: "CONTRIBUTED_TO", polarity: "denied", contributionRoleId: "DRAWING", validFromValue: "2000", validFromPrecision: "year" });
const run = vi.fn();
function respond(n: number) { run.mockResolvedValueOnce({ records: Array.from({ length: n }, (_, n) => ({ get: (key: string) => ({ claim: rawClaim(n), subject, object, sourceCount: int(2) })[key as "claim"] })) }); }
beforeEach(() => {
  vi.stubEnv("GRAPH_DATASET", "public-kg"); run.mockReset(); vi.mocked(readPublicRevision).mockReset().mockResolvedValue("revision-a");
  vi.mocked(readTransaction).mockImplementation(action => action({ run } as never));
  vi.unstubAllGlobals();
});
it("空欄・関係OR・Roleの入力を解決し、未知条件や非制作とのRole合成は拒否する", () => {
  expect(input().criteria).toEqual({ q: "", kind: null, predicates: null, contributionRole: null });
  expect(input("q=ＡＢＣ&predicates=CONTRIBUTED_TO&contributionRole=DRAWING").criteria).toMatchObject({ q: "abc", predicates: ["CONTRIBUTED_TO"], contributionRole: "DRAWING" });
  for (const query of ["world=manga", "kind=x", "q=a&q=b", "contributionRole=DRAWING", "predicates=AFFILIATED_WITH&contributionRole=DRAWING", "predicates=", "predicates=CONTRIBUTED_TO,INFLUENCED_BY&contributionRole=DRAWING", "after=bad!", "revision=x&revision=y", "after=", `q=${"x".repeat(101)}`]) expect(() => input(query)).toThrow();
});
it("別Claimの条件を合成せずLIMIT前に評価し、否定・期間・独立Claimを保全する", async () => {
  respond(1); const result = await discoverRecords(input("q=creator&kind=person&predicates=CONTRIBUTED_TO&contributionRole=DRAWING"));
  expect(run).toHaveBeenCalledWith(DISCOVERY_RECORDS, expect.objectContaining({ q: "creator", kind: "person", predicates: ["CONTRIBUTED_TO"], role: "DRAWING" }));
  const beforeLimit = DISCOVERY_RECORDS.split("LIMIT $take")[0];
  expect(beforeLimit).toContain("c.contributionRoleId = $role"); expect(beforeLimit).toContain("c.visibility = 'published'"); expect(beforeLimit).toContain("any(e IN [subject, object]");
  expect(result.claims[0]).toMatchObject({ polarity: "denied", contribution: { roleId: "DRAWING" }, period: { from: { value: "2000", precision: "year" } }, sourceCount: 2 });
  expect(result.nodes.map(n => n.id)).toEqual([subject.id, object.id]);
  expect(readPublicRevision).toHaveBeenLastCalledWith(expect.anything(), "revision-a");
});
it("20件でページ化し、全条件・dataset・revisionにcursorを束縛する", async () => {
  const conditions = "predicates=CONTRIBUTED_TO&contributionRole=DRAWING";
  respond(21); const first = await discoverRecords(input(conditions));
  expect(first.claims).toHaveLength(20); expect(first.page.hasMore).toBe(true);
  const cursor = first.page.nextCursor!;
  respond(0); await discoverRecords(input(conditions + "&after=" + cursor));
  expect(run.mock.calls.at(-1)?.[1].after).toBe(id(19));
  for (const suffix of ["&q=x", "&kind=person", "&theme=manga", "&around=" + id(60)]) await expect(discoverRecords(input(conditions + suffix + "&after=" + cursor))).rejects.toMatchObject({ status: 400 });
  await expect(discoverRecords(input("predicates=CONTRIBUTED_TO&contributionRole=AUTHORSHIP&after=" + cursor))).rejects.toMatchObject({ status: 400 });
  vi.mocked(readPublicRevision).mockResolvedValue("revision-b"); await expect(discoverRecords(input(conditions + "&after=" + cursor))).rejects.toMatchObject({ status: 409 });
  vi.stubEnv("GRAPH_DATASET", "demo"); await expect(discoverRecords(input())).rejects.toMatchObject({ status: 400 });
});
it("紹介範囲と周辺を交差し、同じ端点の名前・種別と合わせる", async () => {
  run.mockResolvedValueOnce({ records: [{ get: () => [subject.id, object.id] }] }).mockResolvedValueOnce({ records: [{ get: () => [object.id] }] }); respond(0);
  await discoverRecords(input("theme=manga&around=" + subject.id));
  expect(run.mock.calls.at(-1)?.[1].scopeIds).toEqual([object.id]);
});
it("query例はEntity固定リンクではなく、実行できる関係・役割の条件を持つ", () => {
  for (const preset of recordPresets) expect(recordSearchProblem({ q: "", kind: null, predicates: [...preset.predicates], contributionRole: preset.contributionRole })).toBeNull();
  expect(recordSearchProblem({ q: "", kind: null, predicates: null, contributionRole: "DRAWING" })).not.toBeNull();
});
describe("公開adapter", () => {
  it.each([false, true])("全条件とcursor／revisionを渡し、版変化を成功にしない: changed=%s", async changed => {
    let reads = 0;
    const fetcher = vi.fn(async (path: string | URL | Request) => {
      if (String(path) === "/api/dataset") return Response.json({ dataset: "public-kg", revision: changed && reads++ > 0 ? "revision-b" : "revision-a" });
      return Response.json({ revision: "revision-a", nodes: [], claims: [], page: { nextCursor: null, hasMore: false } });
    }); vi.stubGlobal("fetch", fetcher);
    const promise = executeDiscoveryPlan({ state: "ready", operation: "claims", criteria: input("q=work&kind=work&predicates=CONTRIBUTED_TO&contributionRole=DRAWING&theme=manga").criteria }, "cursor-a", new AbortController().signal);
    if (changed) await expect(promise).rejects.toMatchObject({ status: 409 }); else await expect(promise).resolves.toMatchObject({ claims: [], anchor: null });
    const path = String(fetcher.mock.calls.find(c => String(c[0]).includes("/api/discovery/claims"))![0]);
    for (const part of ["contributionRole=DRAWING", "q=work", "kind=work", "theme=manga", "after=cursor-a", "revision=revision-a"]) expect(path).toContain(part);
  });
});
