import { describe, it, expect, vi, beforeEach } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import { assertUrlReplayable, decodeExploration, encodeExploration, explorationHref, rebuildExplorationUrl, ExplorationUrlError } from "../lib/client/exploration-url";
import { captureWorkspace, rebuildWorkspace } from "../lib/client/saved-workspace";
import { emptyGraph, emptyExpansion } from "../lib/client/graph-state";
import type { RebuiltWorkspace } from "../lib/client/saved-workspace";
vi.mock("../lib/client/saved-workspace", async original => ({ ...await original<typeof import("../lib/client/saved-workspace")>(), rebuildWorkspace: vi.fn() }));
const root = "11111111-1111-4111-8111-111111111111";
const child = "22222222-2222-4222-8222-222222222222";
function saved(count = 2) {
  const graph = emptyGraph(); graph.centerId = root;
  for (let i = 0; i < count; i++) {
    const id = i === 0 ? root : i === 1 ? child : crypto.randomUUID();
    graph.cacheNodes[id] = { id, kind: "person", name: "対象", description: null };
    graph.expansions[id] = { ...emptyExpansion(), open: i !== 1 };
  }
  graph.predicates = ["CONTRIBUTED_TO", "AFFILIATED_WITH"];
  graph.contributionRoles = []; graph.organizationPositions = ["VISITOR"];
  return captureWorkspace("demo", "private title", graph, { positions: Object.fromEntries(Object.keys(graph.cacheNodes).map((id, i) => [id, { x: i + 0.123456789123, y: -i * 123.456789123 || 0 }])), pan: { x: 15, y: 20 }, zoom: 0.78912345, initialLayoutDone: true });
}
beforeEach(() => vi.resetAllMocks());
describe("portable compressed exploration URL", () => {
  it("round trips exact positions, zoom, confirmed null/empty conditions and closed/dormant intent", () => {
    const workspace = saved(); const encoded = encodeExploration(workspace);
    const decoded = decodeExploration(encoded, root, "demo");
    expect(decoded.conditions).toEqual(workspace.conditions);
    expect(decoded.branches).toEqual(workspace.branches);
    expect(decoded.view?.positions).toEqual(workspace.view?.positions);
    expect(decoded.view?.zoom).toEqual(workspace.view?.zoom);
    expect(decoded.view?.pan).toEqual({ x: 0, y: 0 });
    expect(decoded.title).toBe("URL");
    expect(explorationHref(workspace).length).toBeLessThan(4000);
  });
  it("rejects invalid input, root mismatch, another dataset and oversized decompression", () => {
    const encoded = encodeExploration(saved());
    for (const bad of ["", "!", "abc", encoded.slice(0, 10), "a".repeat(8001)]) expect(() => decodeExploration(bad, root, "demo")).toThrow(ExplorationUrlError);
    expect(() => decodeExploration(encoded, child, "demo")).toThrow("invalid");
    expect(() => decodeExploration(encoded, root, "public-kg")).toThrow("dataset");
    const bomb = btoa(String.fromCharCode(...deflateSync(strToU8(" ".repeat(1_000_000))))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    expect(() => decodeExploration(bomb, root, "demo")).toThrow("invalid");
  });
  it("does not silently omit state when a large graph exceeds the URL budget", () => {
    expect(() => explorationHref(saved(400))).toThrow("limit");
  });
  it("refuses to publish detached cached branches as a replayable URL", () => {
    const graph = emptyGraph(); graph.centerId = root;
    graph.expansions[root] = emptyExpansion(); graph.expansions[child] = emptyExpansion();
    expect(() => assertUrlReplayable(graph, { positions: {}, pan: { x: 0, y: 0 }, zoom: 1, initialLayoutDone: true })).toThrow("changed");
    delete graph.expansions[child];
    expect(() => assertUrlReplayable(graph, { positions: {}, pan: { x: 0, y: 0 }, zoom: 1, initialLayoutDone: true })).not.toThrow();
  });
  it("refuses missing branches, shortened pages and lost saved coordinates after KG updates", async () => {
    const workspace = saved();
    const graph = emptyGraph();
    const result: RebuiltWorkspace = { graph, view: workspace.view, skippedBranches: 1 };
    vi.mocked(rebuildWorkspace).mockResolvedValue(result);
    await expect(rebuildExplorationUrl(workspace, new AbortController().signal)).rejects.toThrow("changed");
    result.skippedBranches = 0;
    for (const b of workspace.branches) { graph.expansions[b.id] = emptyExpansion(); graph.cacheNodes[b.id] = { id: b.id, kind: "person", name: "対象", description: null }; }
    workspace.branches[0].pages = 2;
    await expect(rebuildExplorationUrl(workspace, new AbortController().signal)).rejects.toThrow("changed");
    workspace.branches[0].pages = 0; delete graph.cacheNodes[child];
    await expect(rebuildExplorationUrl(workspace, new AbortController().signal)).rejects.toThrow("changed");
    graph.cacheNodes[child] = graph.cacheNodes[root];
    const rebuilt = await rebuildExplorationUrl(workspace, new AbortController().signal);
    expect(rebuilt.view?.recenter).toBe(true);
  });
});
