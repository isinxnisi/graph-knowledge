import { beforeEach, describe, expect, it, vi } from "vitest";
import { int } from "neo4j-driver";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/read-db", () => ({ readTransaction: vi.fn() }));
vi.mock("../lib/server/public-revision", () => ({ readPublicRevision: vi.fn() }));
import { readTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { discoverEntities, discoverySearchInput, DISCOVERY_ENTITIES } from "../lib/server/discovery-search";

const entity = (n: number) => ({ id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`, kind: "person", name: `Person ${String(n).padStart(2, "0")}`, description: "Example", aliases: [], event: null });
const run = vi.fn();
beforeEach(() => {
  vi.stubEnv("GRAPH_DATASET", "public-kg"); run.mockReset();
  vi.mocked(readPublicRevision).mockResolvedValue("revision-a");
  vi.mocked(readTransaction).mockImplementation(action => action({ run } as never));
});
describe("Discovery searchの入力・ページ境界", () => {
  it("空欄を許可し、正規化・種別を適用して未知／重複／過大な条件を拒否する", () => {
    expect(discoverySearchInput(new Request("http://localhost/"))).toEqual({ q: "" });
    expect(discoverySearchInput(new Request("http://localhost/?q=%20ＡＢＣ%20&kind=work"))).toEqual({ q: "abc", kind: "work" });
    for (const query of ["q=x&q=y", "kind=unknown", "tag=manga", "after=", "around=invalid", `q=${"x".repeat(101)}`, `after=${"a".repeat(2049)}`]) expect(() => discoverySearchInput(new Request(`http://localhost/?${query}`))).toThrow();
  });
  it("21件目で続きを判定し、次のページには条件・revision・最後の並び順を束縛する", async () => {
    run.mockResolvedValueOnce({ records: Array.from({ length: 21 }, (_, i) => ({ get: (key: string) => key === "entity" ? entity(i) : int(1) })) }).mockResolvedValueOnce({ records: [] });
    const first = await discoverEntities({ q: "", kind: "person" });
    expect(first.items).toHaveLength(20); expect(first.hasMore).toBe(true);
    run.mockResolvedValueOnce({ records: [] }).mockResolvedValueOnce({ records: [] });
    const next = await discoverEntities({ q: "", kind: "person", after: first.nextCursor! });
    expect(next.nextCursor).toBeNull();
    expect(run.mock.calls[2]).toEqual([DISCOVERY_ENTITIES, expect.objectContaining({ afterId: entity(19).id, afterName: entity(19).name, q: "", kinds: ["person"] })]);
    await expect(discoverEntities({ q: "other", kind: "person", after: first.nextCursor! })).rejects.toMatchObject({ status: 400 });
    vi.mocked(readPublicRevision).mockResolvedValue("revision-b");
    await expect(discoverEntities({ q: "", kind: "person", after: first.nextCursor! })).rejects.toMatchObject({ status: 409 });
  });
  it("値はqueryへ埋め込まず、公開Claimに接続した対象だけを返す", async () => {
    run.mockResolvedValue({ records: [] });
    const q = "' MATCH (n) DELETE n //";
    await discoverEntities({ q });
    expect(run.mock.calls[0][0]).not.toContain(q);
    expect(run.mock.calls[0][1]).toMatchObject({ q });
    expect(DISCOVERY_ENTITIES).toContain("c.visibility = 'published'");
    expect(DISCOVERY_ENTITIES).toContain("LIMIT 21");
  });
});
