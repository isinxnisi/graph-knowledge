import { afterEach, describe, expect, it, vi } from "vitest";
import { initialContext, resolveDiscovery, readPrototypeContext, WORLD_IDS, questionsForWorld, unsupportedReasons } from "../lib/domain/discovery-prototype";
import { executeDiscoveryPlan } from "../lib/client/use-discovery-prototype";
const anchor = { id: "2b7c6289-d050-4dc0-93e3-9307681253cc", kind: "work" as const, name: "PLUTO", description: null };
const person = { id: "d900543a-9c11-48c1-be76-1822b756fcc4", kind: "person" as const, name: "Person", description: null };
const claim = { id: "839b0bb8-1781-4a3e-8446-9a22d08d1658", subjectId: person.id, objectId: anchor.id, predicate: "CONTRIBUTED_TO", polarity: "denied", period: { from: { value: "2000", precision: "year" }, to: null }, contribution: { roleId: "AUTHORSHIP", scope: null }, organizationParticipation: null, eventParticipation: null, sourceCount: 2 };
afterEach(() => vi.unstubAllGlobals());
describe("Discovery prototype capability boundary", () => {
  it("11世界は検索条件へ暗黙変換しない", () => {
    expect(WORLD_IDS).toHaveLength(11);
    for (const world of WORLD_IDS) {
      expect(questionsForWorld[world].length).toBeGreaterThan(0);
      expect(resolveDiscovery({ ...initialContext, world, anchor, question: "credits" })).toEqual(resolveDiscovery({ ...initialContext, anchor, question: "credits" }));
    }
  });
  it("未対応の問いは起点や名前があっても実行せず要求を保持する", () => {
    for (const question of Object.keys(unsupportedReasons) as (keyof typeof unsupportedReasons)[]) {
      const context = { ...initialContext, anchor, question, q: "PLUTO" };
      expect(resolveDiscovery(context).state).toBe("unsupported");
      expect(context.question).toBe(question);
    }
  });
  it("役割を別の関係へ黙って落とさず、入力待ちと未対応を分ける", () => {
    expect(resolveDiscovery(initialContext).state).toBe("needs-anchor");
    expect(resolveDiscovery({ ...initialContext, names: true }).state).toBe("needs-name");
    expect(resolveDiscovery({ ...initialContext, anchor, question: "influences", role: "AUTHORSHIP" }).state).toBe("unsupported");
    expect(resolveDiscovery({ ...initialContext, anchor, question: "credits", role: "AUTHORSHIP" })).toMatchObject({ state: "ready", operation: "neighbors", role: "AUTHORSHIP" });
  });
  it("履歴の不正・旧schemaを初期値へ戻す", () => {
    expect(readPrototypeContext({ ...initialContext, version: 2 })).toEqual(initialContext);
    expect(readPrototypeContext({ ...initialContext, anchor: { ...anchor, id: "invalid" } })).toEqual(initialContext);
    expect(readPrototypeContext({ ...initialContext, world: "music", question: "music-influences" }).question).toBe("music-influences");
    expect(readPrototypeContext({ ...initialContext, anchor: { ...anchor, aliases: ["Pluto"], event: null }, question: "credits" })).toMatchObject({ anchor, question: "credits" });
  });
});
function stubApi(options: { changed?: boolean; wrongRevision?: boolean; dataset?: string } = {}) {
  let revisionReads = 0;
  const fetcher = vi.fn(async (path: string | URL | Request) => {
    const url = String(path);
    if (url === "/api/dataset") { revisionReads++; return Response.json({ dataset: options.dataset ?? "public-kg", revision: options.changed && revisionReads > 1 ? "revision-b" : "revision-a" }); }
    if (url.includes("/neighbors")) return Response.json({ revision: options.wrongRevision ? "revision-b" : "revision-a", centerId: anchor.id, nodes: [anchor, person], claims: [claim], page: { nextCursor: "cursor-next", hasMore: true } });
    if (url.startsWith("/api/entities?")) return Response.json({ items: [{ ...anchor, aliases: [], event: null }], hasMore: false });
    return Response.json({ entity: { ...anchor, aliases: [], event: null } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("Public read adapter", () => {
  it("関係・役割・cursor・revisionを既存neighborsへ渡し、否定と期間を独立Claimのまま返す", async () => {
    const fetcher = stubApi();
    const result = await executeDiscoveryPlan({ state: "ready", operation: "neighbors", anchorId: anchor.id, predicate: "CONTRIBUTED_TO", role: "AUTHORSHIP" }, "cursor-before", new AbortController().signal);
    expect(fetcher.mock.calls.map(call => String(call[0])).find(path => path.includes("/neighbors"))).toContain("contributionRoles=AUTHORSHIP");
    expect(fetcher.mock.calls.map(call => String(call[0])).find(path => path.includes("/neighbors"))).toContain("revision=revision-a");
    expect(fetcher.mock.calls.map(call => String(call[0])).find(path => path.includes("/neighbors"))).toContain("after=cursor-before");
    expect(result.claims).toEqual([claim]);
    expect(result.nextCursor).toBe("cursor-next");
  });
  it.each([{ changed: true }, { wrongRevision: true }, { dataset: "demo" }])("公開版を確認できない応答は成功にしない: %j", async options => {
    stubApi(options);
    await expect(executeDiscoveryPlan({ state: "ready", operation: "neighbors", anchorId: anchor.id, predicate: null, role: null }, null, new AbortController().signal)).rejects.toMatchObject({ status: 409 });
  });
  it("名前検索は世界・架空の分類をAPIに渡さず、取得前後の版を検証する", async () => {
    const fetcher = stubApi();
    const result = await executeDiscoveryPlan({ state: "ready", operation: "names", q: "PLUTO" }, null, new AbortController().signal);
    expect(result.items[0].name).toBe("PLUTO");
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/dataset", "/api/entities?q=PLUTO", "/api/dataset"]);
  });
  it("中止済みの取得を開始しない", async () => {
    const fetcher = stubApi(), controller = new AbortController(); controller.abort();
    await expect(executeDiscoveryPlan({ state: "ready", operation: "names", q: "PLUTO" }, null, controller.signal)).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
