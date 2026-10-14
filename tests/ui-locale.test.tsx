// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { UiLocaleProvider, useUiLocale, uiLocaleKey, normalizeUiLocale } from "../lib/client/ui-locale";
import SiteHeader from "../components/SiteHeader";
import SearchPanel from "../components/SearchPanel";
import RelationFilter from "../components/RelationFilter";
import ClaimDetails from "../components/ClaimDetails";
import { formatDate, formatPeriod } from "../lib/client/format";
import { relationPresentation } from "../lib/client/relation-presentation";
import { displayRelations } from "../lib/client/graph-presentation";
import { overviewPresentation } from "../lib/client/overview-presentation";
import { explorerMessage } from "../lib/i18n/explorer";
import { overviewLabels } from "../lib/i18n/entity-overview";
import { conditionSummary } from "../lib/i18n/exploration-entry";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { ClaimResponse, EntitySearchResponse, EntitySummary, NeighborsResponse } from "../lib/domain/api";
import { fetchClaim, searchEntities } from "../lib/client/api";

vi.mock("../lib/client/api", async original => ({ ...(await original<typeof import("../lib/client/api")>()), searchEntities: vi.fn(), fetchClaim: vi.fn() }));
beforeEach(() => {
  localStorage.clear(); document.documentElement.lang = "ja";
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function Controls() { const { setLocale } = useUiLocale(); return <><button onClick={() => setLocale("en")}>English</button><button onClick={() => setLocale("ja")}>日本語</button></>; }
function sync(locale: string | null) { fireEvent(window, new StorageEvent("storage", { key: uiLocaleKey, newValue: locale })); }
const page = examples.neighbors as NeighborsResponse;

describe("表示localeと探索の分離", () => {
  it("初期日本語・保存値の復元・別タブの変更/削除・未対応値のfallback", async () => {
    expect(normalizeUiLocale("en-US")).toBe("en"); expect(normalizeUiLocale("fr")).toBe("ja");
    localStorage.setItem(uiLocaleKey, "en-GB");
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 })); vi.stubGlobal("fetch", fetch);
    render(<UiLocaleProvider><SiteHeader dataset="demo" /></UiLocaleProvider>);
    await waitFor(() => expect(document.documentElement.lang).toBe("en"), { timeout: 5000 });
    expect(screen.getByRole("heading", { name: "Explore connections" })).toBeTruthy();
    sync(null); expect(screen.getByRole("heading", { name: "関係性を探索する" })).toBeTruthy();
    sync("xx"); expect(document.documentElement.lang).toBe("ja");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toBe("/api/member/profile"); vi.unstubAllGlobals();
  });
  it("明示選択を保存し、保存不能でも画面には反映する", async () => {
    render(<UiLocaleProvider><SiteHeader dataset="demo" /></UiLocaleProvider>);
    await waitFor(() => expect(document.documentElement.lang).toBe("ja"));
    (screen.getByText("設定").parentElement as HTMLDetailsElement).open = true;
    fireEvent.change(screen.getByLabelText("表示言語"), { target: { value: "en" } });
    expect(localStorage.getItem(uiLocaleKey)).toBe("en");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ja" } });
    expect(document.documentElement.lang).toBe("ja");
    expect(screen.getByRole("status").textContent).toContain("表示言語を保存できません");
  });
  it("取得中に切り替えても検索語・kind・遅い応答を保ち、通信を増やさない", async () => {
    let resolve!: (value: EntitySearchResponse) => void;
    vi.mocked(searchEntities).mockReturnValue(new Promise(r => { resolve = r; }));
    render(<UiLocaleProvider><Controls /><SearchPanel onChoose={vi.fn()} /></UiLocaleProvider>);
    await waitFor(() => expect(document.documentElement.lang).toBe("ja"));
    fireEvent.change(screen.getByLabelText("名前・別名"), { target: { value: "青葉" } });
    fireEvent.change(screen.getByLabelText("検索対象"), { target: { value: "person" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("status").textContent).toContain("Loading search results");
    expect((screen.getByLabelText("Name or alias") as HTMLInputElement).value).toBe("青葉");
    expect((screen.getByLabelText("Search for") as HTMLSelectElement).value).toBe("person");
    resolve({ items: [{ ...page.nodes[0], aliases: ["おおば はる"], event: null }], hasMore: false });
    expect(await screen.findByRole("button", { name: /青葉ハル —/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /青葉ハル —/ }).textContent).toContain("おおば はる");
    expect(searchEntities).toHaveBeenCalledTimes(1);
  });
  it("条件draftの途中で別タブから言語を変えても適用・取得せず、取消で破棄する", async () => {
    const apply = vi.fn();
    render(<UiLocaleProvider><RelationFilter value={null} onApply={apply} /></UiLocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("radio", { name: "個別の関係を指定" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "影響を受けた" }));
    sync("en");
    expect((screen.getByRole("checkbox", { name: "Was influenced by" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("active-predicates").textContent).toContain("All relations (no additional conditions)");
    expect(screen.getByTestId("draft-conditions").textContent).toContain("Editing");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(apply).not.toHaveBeenCalled();
  });
  it("主張詳細の切替でも再取得せず、原資料・参照箇所・Source名を保つ", async () => {
    const response = examples.claim as unknown as ClaimResponse;
    vi.mocked(fetchClaim).mockResolvedValue({ ...response, relatedClaimIds: [] });
    const nodes = Object.fromEntries(page.nodes.map(node => [node.id, node])) as Record<string, EntitySummary>;
    render(<UiLocaleProvider><Controls /><ClaimDetails id={response.claim.id} nodes={nodes} /></UiLocaleProvider>);
    await screen.findByRole("heading", { name: "選択した主張" });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    const detail = screen.getByRole("region", { name: "Claim details" });
    expect(within(detail).getByRole("heading", { name: "Selected claim" })).toBeTruthy();
    for (const citation of response.claim.citations) {
      expect(detail.textContent).toContain(citation.source.title);
      expect(detail.textContent).toContain(citation.locator);
    }
    expect(detail.textContent).toContain(formatPeriod(response.claim.period, "en"));
    expect(fetchClaim).toHaveBeenCalledTimes(1);
  });
  it("GraphのID・肯否・独立Claimは同じまま、英語の中立ラベルへ投影する", () => {
    const claims = Object.fromEntries(page.claims.map(claim => [claim.id, claim]));
    const before = JSON.stringify(claims), ja = displayRelations(claims), en = displayRelations(claims, "en");
    expect(Object.keys(en)).toEqual(Object.keys(ja));
    for (const id in ja) {
      expect(en[id].claimIds).toEqual(ja[id].claimIds); expect(en[id].polarity).toBe(ja[id].polarity);
      expect(en[id].subjectId).toBe(ja[id].subjectId); expect(en[id].objectId).toBe(ja[id].objectId);
    }
    expect(Object.values(en).some(relation => relation.label.includes("Affirmed and denied"))).toBe(true);
    expect(JSON.stringify(claims)).toBe(before);
  });
  it("三限定の条件は翻訳だけ変え、nullと空集合を区別する", () => {
    const text = conditionSummary(null, ["PRODUCING"], "en", ["VISITOR"], ["CHAIR"]);
    expect(text).toContain("Producing"); expect(text).toContain("Visitor"); expect(text).toContain("Conference chair");
    expect(relationPresentation([{ ...page.claims[0], predicate: "CONTRIBUTED_TO", contribution: null }], "en").qualification?.entries[0].label).toBe("Role unspecified");
    expect(conditionSummary(null, null, "en")).toBe("All relations (no additional conditions)");
    expect(conditionSummary(null, [], "en")).toContain("No roles selected");
  });
  it("概要の逆視点・統計と、不明/部分日付の意味を維持する", () => {
    const relation = { predicate: "INFLUENCED_BY", perspective: "object", counts: { affirmed: 1, denied: 0 }, contributionRoles: [], organizationPositions: [], eventRoles: [] } as const;
    const view = overviewPresentation({ ...relation, contributionRoles: [], organizationPositions: [], eventRoles: [] }, "en");
    expect(view.title).toBe("Influenced"); expect(view.fromCenter).toBe(false);
    expect(view.verb).toBe("Was influenced by");
    expect(overviewLabels("en-US").countsHelp).toContain("not people");
    expect(overviewLabels("fr").title).toBe(overviewLabels().title);
    expect(formatDate({ value: "1927", precision: "year" }, "en")).toBe("1927");
    expect(formatDate({ value: "1927-10", precision: "month" }, "en")).toBe("1927-10");
    expect(formatPeriod({ from: null, to: null }, "en")).toBe("Period unknown");
    expect(explorerMessage("表示上限に達したため、他の展開を閉じて再試行してください。", "en")).toContain("Graph limit reached");
    expect(explorerMessage("データベースを利用できません。時間をおいて再試行してください。", "en")).toContain("database is unavailable");
  });
});
