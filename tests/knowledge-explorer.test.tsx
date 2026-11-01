// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KnowledgeExplorer from "../components/KnowledgeExplorer";
import type { CanvasContent } from "../components/GraphCanvas";
import type { Selection } from "../lib/client/graph-state";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import type { KnowledgeEntityVersion } from "../lib/domain/knowledge-foundation";

vi.mock("../components/GraphCanvas", () => ({
  default: ({ content, selection, interactionBlocked, onEntity }: {
    content: CanvasContent; selection: Selection; interactionBlocked?: boolean;
    onEntity: (id: string) => void;
  }) => <section aria-label="描画内容">
    <output data-testid="canvas-selection">{selection?.id ?? "なし"}</output>
    {content.nodes.map(node => <button key={node.id} disabled={interactionBlocked} onClick={() => onEntity(node.id)}>対象 {node.label}</button>)}
    {Object.values(content.relations).map(relation => <span key={relation.id} data-testid={relation.id}>{relation.canvasLabel}</span>)}
  </section>,
}));

const firstGeneration = "k75-" + "1".repeat(32);
const secondGeneration = "k75-" + "2".repeat(32);
const entity = (id: string): KnowledgeEntityVersion => ({ id, revision: 1, createdAt: "2026-11-02", reason: "登録", content: { name: id.toUpperCase(), kind: "person", aliases: [], description: "", language: "ja" } });
const a = entity("a"), b = entity("b"), c = entity("c"), d = entity("d");
const record = (id: string, object: KnowledgeEntityVersion, assertion: string, revision = 1): KnowledgePublishedRecord => ({
  record: { id, revision, createdAt: "2026-11-02", reason: "登録", content: {
    kind: "relation", subjectId: a.id, objectId: object.id, assertion, relation: id + "の関係", polarity: "affirmed", scope: "", times: [],
    evidence: [{ id: "evidence", source: { id: "source", revision: 1 }, locator: "1頁", excerpt: "出典の記述", stance: "support" }],
  } },
  label: id + "の関係", entities: [a, object],
  sources: [{ id: "source", revision: 1, createdAt: "2026-11-02", reason: "登録", content: { title: "確認した資料", url: "https://example.org/source", bibliography: "", language: "ja" } }],
  semantics: { status: "unmapped", mappingRevision: null, recordRevision: null, concept: null }, legacyTyped: null,
});
const original = record("first", b, "最初の記録を読む");
const alternative = record("second", c, "別の記録を読む");
const neighbor = record("neighbor", d, "周囲から追加した記録");
const kept = record("kept", c, "継続して読める記録");
const revised = record("first", b, "更新された記録を読む", 2);
const entities = (records: KnowledgePublishedRecord[]) => [...new Map(records.flatMap(r => r.entities).map(e => [e.id, e])).values()];
const response = (body: unknown) => ({ ok: true, json: async () => body });

function server() {
  let active = firstGeneration, changeToken = "1:1";
  const hidden = new Set<string>();
  const held = new Map<string, { resolve: (body: ReturnType<typeof response>) => void; promise: Promise<ReturnType<typeof response>>; body?: unknown; params?: URLSearchParams }>();
  const requests: URLSearchParams[] = [];
  const all = (generation: string) => generation === secondGeneration ? [revised, alternative, neighbor, kept] : [original, alternative, neighbor, kept];
  const page = (generation: string, records: KnowledgePublishedRecord[]) => ({ generation, records, entities: entities(records), hasMore: false, nextCursor: null });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const params = new URL(url, "http://localhost:3276").searchParams;
    requests.push(params);
    const mode = params.get("mode")!, generation = params.get("generation") ?? active;
    const available = all(generation).filter(r => !hidden.has(r.record.id));
    let body: unknown;
    if (mode === "status") body = { active: { id: active, publishedAt: "2026-11-02", recordCount: 3 }, changeToken, pending: false, lastFailure: null };
    else if (mode === "facets") body = { generation, concepts: [] };
    else if (mode === "search") body = page(generation, available.filter(r => r.record.id !== "neighbor" && (params.get("q") ? r.record.content.assertion.includes(params.get("q")!) : r.record.id !== "second")));
    else if (mode === "graph") body = page(generation, available.filter(r => (params.get("recordIds") ?? "").split(",").includes(r.record.id)));
    else if (mode === "record") body = { generation, record: available.find(r => r.record.id === params.get("recordId")) };
    else if (mode === "neighbors") body = { ...page(generation, available.filter(r => r.record.id === "neighbor")), center: a };
    else throw new Error("Unexpected request: " + url);
    const delay = held.get(mode);
    if (delay && !delay.params) { delay.params = params; delay.body = body; return delay.promise; }
    return Promise.resolve(response(body));
  }));
  return {
    requests,
    change: (token: string, generation = active) => { changeToken = token; active = generation; },
    hide: (id: string) => hidden.add(id),
    holdNext: (mode: string) => {
      let resolve!: (body: ReturnType<typeof response>) => void;
      const promise = new Promise<ReturnType<typeof response>>(finish => { resolve = finish; });
      const delay = { resolve, promise, body: undefined as unknown, params: undefined as URLSearchParams | undefined };
      held.set(mode, delay);
      return { get started() { return Boolean(delay.params); }, finish: async () => { expect(delay.params).toBeDefined(); held.delete(mode); await act(async () => { resolve(response(delay.body)); }); } };
    },
  };
}
async function flush() { await act(async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); }); }
async function tick() { await act(() => vi.advanceTimersByTimeAsync(4000)); await flush(); }
async function start() {
  const api = server(); render(<KnowledgeExplorer />); await flush();
  expect(within(screen.getByRole("region", { name: "検索結果" })).getByRole("button", { name: /最初の記録を読む/ })).toBeTruthy();
  return api;
}
async function chooseOriginal() { fireEvent.click(screen.getByRole("button", { name: /最初の記録を読む/ })); await flush(); }
function submitQuery(q: string) { fireEvent.change(screen.getByRole("textbox", { name: "名前・関係・根拠を検索" }), { target: { value: q } }); fireEvent.click(screen.getByRole("button", { name: "検索" })); }

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("遅い初期取得より後の手動検索を保持する", async () => {
  const api = server(), initial = api.holdNext("search"); render(<KnowledgeExplorer />); await flush();
  expect(initial.started).toBe(true);
  submitQuery("別の"); await flush();
  expect(screen.getByRole("button", { name: /別の記録を読む/ })).toBeTruthy();
  await initial.finish(); await flush();
  expect(screen.queryByRole("button", { name: /最初の記録を読む/ })).toBeNull();
  expect(screen.getByRole("button", { name: /別の記録を読む/ })).toBeTruthy();
});

it("遅い公開状態の再取得が新しい検索結果を消さない", async () => {
  const api = await start();
  const poll = api.holdNext("graph"); api.change("2:2"); await tick(); expect(poll.started).toBe(true);
  submitQuery("別の"); await flush();
  await poll.finish(); await flush();
  expect(screen.queryByRole("button", { name: /最初の記録を読む/ })).toBeNull();
  expect(screen.getByRole("button", { name: /別の記録を読む/ })).toBeTruthy();
});

it("遅い再取得で追加した周囲の関係や対象の選択を巻き戻さない", async () => {
  const api = await start(); await chooseOriginal();
  const poll = api.holdNext("graph"); api.change("2:2"); await tick(); expect(poll.started).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "対象 A" }));
  fireEvent.click(screen.getByRole("button", { name: "周囲の関係を広げる" })); await flush();
  expect(screen.getByTestId("record:neighbor")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "対象 D" }));
  await poll.finish(); await flush();
  expect(screen.getByTestId("record:neighbor")).toBeTruthy();
  expect(screen.getByTestId("canvas-selection").textContent).toBe("d");
  expect(screen.getByRole("heading", { name: "D" })).toBeTruthy();
});

it("新しい公開版は通知に留め、明示操作まで読んでいる図と記録を保持する", async () => {
  const api = await start(); await chooseOriginal();
  api.change("2:2", secondGeneration); await tick();
  expect(screen.getByText("新しい公開版があります。")).toBeTruthy();
  expect(screen.getByText("最初の記録を読む", { selector: "article p" })).toBeTruthy();
  expect(screen.queryByText("更新された記録を読む")).toBeNull();
  const automatic = api.requests.filter(p => ["graph", "facets"].includes(p.get("mode")!) && p.has("generation"));
  expect(automatic.every(p => p.get("generation") === firstGeneration)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "最新版を読む" })); await flush();
  expect(screen.getByRole("button", { name: /更新された記録を読む/ })).toBeTruthy();
  expect(screen.queryByTestId("record:first")).toBeNull();
});

it("旧世代を読み続けても非表示になった記録を結果・図・根拠から除く", async () => {
  const api = await start(); await chooseOriginal();
  expect(screen.getByRole("link", { name: /確認した資料/ })).toBeTruthy();
  api.hide("first"); api.change("2:2"); await tick();
  expect(screen.queryByRole("button", { name: /最初の記録を読む/ })).toBeNull();
  expect(screen.queryByTestId("record:first")).toBeNull();
  expect(screen.queryByRole("link", { name: /確認した資料/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "対象 B" })).toBeNull();
  expect(screen.getByRole("button", { name: /継続して読める記録/ })).toBeTruthy();
});

it("遅い再取得中にpollを重ねず、解除後の次回で停止を反映する", async () => {
  const api = await start(); await chooseOriginal();
  const poll = api.holdNext("graph"); api.change("2:2"); await tick(); expect(poll.started).toBe(true);
  const started = api.requests.filter(p => p.get("mode") === "status").length;
  api.hide("first"); api.change("3:3"); await tick(); await tick();
  expect(api.requests.filter(p => p.get("mode") === "status")).toHaveLength(started);
  await poll.finish(); await tick();
  expect(screen.queryByRole("button", { name: /最初の記録を読む/ })).toBeNull();
  expect(screen.queryByTestId("record:first")).toBeNull();
});
