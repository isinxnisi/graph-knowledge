import { adjacentWorkspace } from "./adjacent-workspace";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { int } from "neo4j-driver";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/read-db", () => ({ readTransaction: vi.fn() }));
vi.mock("../lib/server/public-revision", () => ({ readPublicRevision: vi.fn() }));
import { readTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { discoverEntities, discoverySearchInput, DISCOVERY_ENTITIES, DISCOVERY_COLLECTION, DISCOVERY_NEIGHBORHOOD, DISCOVERY_FACETS } from "../lib/server/discovery-search";

const entity = (n: number) => ({ id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`, kind: "person", name: `Person ${String(n).padStart(2, "0")}`, description: "Example", aliases: [], event: null });
const run = vi.fn();
const respond = (n = 0, theme = false) => {
  if (theme) run.mockResolvedValueOnce({ records: [{ get: () => ["2b7c6289-d050-4dc0-93e3-9307681253cc"] }] });
  run.mockResolvedValueOnce({ records: Array.from({ length: n }, (_, i) => ({ get: (key: string) => key === "entity" ? entity(i) : int(1) })) })
    .mockResolvedValueOnce({ records: [] })
    .mockResolvedValueOnce({ records: [{ get: () => int(n) }] })
    .mockResolvedValueOnce({ records: [{ get: (k: string) => k === "predicate" ? "CONTRIBUTED_TO" : int(7) }] });
};
beforeEach(() => {
  vi.stubEnv("GRAPH_DATASET", "public-kg"); run.mockReset();
  vi.mocked(readPublicRevision).mockResolvedValue("revision-a");
  vi.mocked(readTransaction).mockImplementation(action => action({ run } as never));
});
describe("Discovery searchの入力・ページ境界", () => {
  it("空欄を許可し、正規化・種別を適用して未知／重複／過大な条件を拒否する", () => {
    expect(discoverySearchInput(new Request("http://localhost/"))).toEqual({ q: "" });
    expect(discoverySearchInput(new Request("http://localhost/?q=%20ＡＢＣ%20&kind=work"))).toEqual({ q: "abc", kind: "work" });
    for (const query of ["q=x&q=y", "kind=unknown", "tag=manga", "theme=fiction", "predicates=WRITTEN_BY", "predicates=", "after=", "around=invalid", `q=${"x".repeat(101)}`, `after=${"a".repeat(2049)}`]) expect(() => discoverySearchInput(new Request(`http://localhost/?${query}`))).toThrow();
  });
  it("21件目で続きを判定し、次のページには条件・revision・最後の並び順を束縛する", async () => {
    respond(21);
    const first = await discoverEntities({ q: "", kind: "person" });
    expect(first.items).toHaveLength(20); expect(first.hasMore).toBe(true);
    respond();
    const next = await discoverEntities({ q: "", kind: "person", after: first.nextCursor! });
    expect(next.nextCursor).toBeNull();
    expect(run.mock.calls[4]).toEqual([DISCOVERY_ENTITIES, expect.objectContaining({ afterId: entity(19).id, afterName: entity(19).name, q: "", kinds: ["person"] })]);
    await expect(discoverEntities({ q: "other", kind: "person", after: first.nextCursor! })).rejects.toMatchObject({ status: 400 });
    vi.mocked(readPublicRevision).mockResolvedValue("revision-b");
    await expect(discoverEntities({ q: "", kind: "person", after: first.nextCursor! })).rejects.toMatchObject({ status: 409 });
  });
  it("テーマと複数の関係をANDで組み合わせ、OR切り口・条件別cursor・件数を返す", async () => {
    const input = discoverySearchInput(new Request("http://localhost/?theme=manga&predicates=CONTRIBUTED_TO,INFLUENCED_BY,CONTRIBUTED_TO"));
    expect(input.predicates).toEqual(["CONTRIBUTED_TO", "INFLUENCED_BY"]);
    respond(21, true);
    const first = await discoverEntities(input);
    expect(first.total).toBe(21); expect(first.facets).toEqual([{ predicate: "CONTRIBUTED_TO", count: 7 }]);
    expect(run.mock.calls[0][1]).toMatchObject({ seeds: expect.arrayContaining(["2b7c6289-d050-4dc0-93e3-9307681253cc"]) });
    expect(run.mock.calls[1][1]).toMatchObject({ scopeIds: ["2b7c6289-d050-4dc0-93e3-9307681253cc"], predicates: input.predicates });
    expect(DISCOVERY_COLLECTION).toContain("a.visibility = 'published' AND b.visibility = 'published'");
    expect(DISCOVERY_FACETS).not.toContain("$q"); expect(DISCOVERY_FACETS).not.toContain("$predicates");
    for (const change of [{ theme: "science" as const }, { predicates: ["AFFILIATED_WITH"] as const }])
      await expect(discoverEntities({ ...input, ...change, predicates: change.predicates ? [...change.predicates] : input.predicates, after: first.nextCursor! })).rejects.toMatchObject({ status: 400 });
    respond(0, true); await discoverEntities({ ...input, after: first.nextCursor! });
    vi.stubEnv("GRAPH_DATASET", "demo"); respond();
    const demo = await discoverEntities({ q: "", theme: "manga" }); expect(demo.themes).toEqual([]);
    expect(run.mock.calls.at(-4)?.[1]).toMatchObject({ scopeIds: [] });
  });
  it("テーマと直接の周辺は交差で絞り、範囲取得を種別／件数queryから分離する", async () => {
    run.mockResolvedValueOnce({ records: [{ get: () => [entity(1).id, entity(2).id] }] });
    run.mockResolvedValueOnce({ records: [{ get: () => [entity(2).id, entity(3).id] }] });
    respond();
    await discoverEntities({ q: "", kind: "work", theme: "manga", around: entity(3).id });
    expect(run.mock.calls[1]).toEqual([DISCOVERY_NEIGHBORHOOD, { around: entity(3).id }]);
    expect(run.mock.calls[2][1]).toMatchObject({ scopeIds: [entity(2).id], kinds: ["work"] });
    expect(DISCOVERY_NEIGHBORHOOD).toContain("c.visibility = 'published'");
  });
  it("旧cursorは従来の検索条件だけで利用でき、テーマへの流用は拒否する", async () => {
    const after = Buffer.from(JSON.stringify({ v: 1, dataset: "public-kg", revision: "revision-a", q: "", kind: null, around: null, rank: 1, name: "a", id: entity(1).id })).toString("base64url");
    respond(); await expect(discoverEntities({ q: "", after })).resolves.toMatchObject({ hasMore: false });
    await expect(discoverEntities({ q: "", theme: "manga", after })).rejects.toMatchObject({ status: 400 });
  });
  it("値はqueryへ埋め込まず、公開Claimに接続した対象だけを返す", async () => {
    respond();
    const q = "' MATCH (n) DELETE n //";
    await discoverEntities({ q });
    expect(run.mock.calls[0][0]).not.toContain(q);
    expect(run.mock.calls[0][1]).toMatchObject({ q });
    expect(DISCOVERY_ENTITIES).toContain("c.visibility = 'published'");
    expect(DISCOVERY_ENTITIES).toContain("LIMIT 21");
  });
});

import { discoveryExplorationHref } from "../lib/client/discovery-navigation";
import { decodeExploration as decodeRawExploration } from "../lib/client/exploration-url";
it("選んだ関係を既存のGraph URLへ引き継ぎ、種別やテーマをGraph条件と混同しない", () => {
  const id = entity(1).id;
  for (const predicates of [null, ["INFLUENCED_BY", "CONTRIBUTED_TO"]] as const) {
    const url = new URL(discoveryExplorationHref("public-kg", id, predicates ? [...predicates] : null), "http://localhost");
    const decoded = decodeExploration(url.searchParams.get("s")!, id, "public-kg");
    expect(decoded.relation).toMatchObject({ predicates: predicates ? [...predicates].sort() : null, contributionRoles: null, organizationPositions: null, eventRoles: null });
    expect(decoded.execution.branches).toEqual([{ id, open: true, pages: 1 }]); expect(decoded.view).toMatchObject({ positions: {}, initialLayoutDone: false });
  }
});

it("Entity一覧でも同じClaimの制作役割を検索し、Role変更でcursorを流用しない", async () => {
  const input = discoverySearchInput(new Request("http://localhost/?predicates=CONTRIBUTED_TO&contributionRole=DRAWING"));
  expect(input.contributionRole).toBe("DRAWING");
  expect(() => discoverySearchInput(new Request("http://localhost/?predicates=AFFILIATED_WITH&contributionRole=DRAWING"))).toThrow();
  respond(21); const first = await discoverEntities(input);
  expect(run.mock.calls[0][1].role).toBe("DRAWING");
  await expect(discoverEntities({ ...input, contributionRole: "AUTHORSHIP", after: first.nextCursor! })).rejects.toMatchObject({ status: 400 });
});

it("制作Roleを既存Graph条件・URLへ渡す", () => {
  const url = new URL(discoveryExplorationHref("public-kg", entity(1).id, ["CONTRIBUTED_TO"], ["DRAWING"]), "http://localhost");
  expect(decodeExploration(url.searchParams.get("s")!, entity(1).id, "public-kg").relation.contributionRoles).toEqual(["DRAWING"]);
});

it("旧周辺＋関係cursorを、異なるClaimの照合へ流用させない", async () => {
  const after = Buffer.from(JSON.stringify({ v: 2, dataset: "public-kg", revision: "revision-a", q: "", kind: null, around: entity(3).id, theme: null, predicates: ["CONTRIBUTED_TO"], rank: 1, name: "a", id: entity(1).id })).toString("base64url");
  await expect(discoverEntities({ q: "", predicates: ["CONTRIBUTED_TO"], around: entity(3).id, after })).rejects.toMatchObject({ status: 400 });
});

function decodeExploration(...args: Parameters<typeof decodeRawExploration>) { return adjacentWorkspace(decodeRawExploration(...args)); }
