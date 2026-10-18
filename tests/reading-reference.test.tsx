// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ClientApiError, fetchClaim, fetchEntity } from "../lib/client/api";
import { parseReadingLocation, readClaimReference, readEntityReference, readingHref, withoutReadingReference, type ReadingReference } from "../lib/client/reading-reference";
import { DATASET_MODES } from "../lib/domain/dataset";
import type { ClaimResponse, EntityResponse, EntitySummary } from "../lib/domain/api";
import ReferenceReader from "../components/ReferenceReader";
import ReadingLink from "../components/ReadingLink";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";

vi.mock("../lib/client/api", async original => ({ ...await original<typeof import("../lib/client/api")>(), fetchEntity: vi.fn(), fetchClaim: vi.fn() }));
const claim = examples.claim.claim as ClaimResponse["claim"];
const nodes = examples.neighbors.nodes as EntitySummary[];
const entity = (id: string): EntityResponse => ({ entity: { ...nodes.find(node => node.id === id)!, aliases: [], event: null } });
const reference: ReadingReference = { kind: "claim", dataset: "demo", id: claim.id };
const location = { status: "ready" as const, reference };
const params = (query: string) => new URLSearchParams(query);
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(fetchEntity).mockImplementation(async id => entity(id));
  vi.mocked(fetchClaim).mockResolvedValue(examples.claim as ClaimResponse);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("閲覧URLはdataset・種別・IDだけを参照する", () => {
  it("探索内の証拠リンクは言語・起点・保存状態を保ち、通常リンクは従来の単独URLを使う", () => {
    const original = `/en/explore/${claim.subjectId}?s=saved-state`;
    window.history.replaceState(null, "", original);
    const { rerender } = render(<ReadingLink reference={reference} preserveExploration>証拠</ReadingLink>);
    fireEvent.click(screen.getByRole("link", { name: "証拠" }));
    expect(window.location.pathname).toBe(`/en/explore/${claim.subjectId}`);
    expect(new URLSearchParams(window.location.search).get("s")).toBe("saved-state");
    expect(withoutReadingReference(new URL(window.location.href))).toBe(original);
    rerender(<ReadingLink reference={reference}>単独</ReadingLink>);fireEvent.click(screen.getByRole("link", { name: "単独" }));
    expect(window.location.pathname + window.location.search).toBe(readingHref(reference));
    window.history.replaceState(null, "", "/");
  });
  it.each(DATASET_MODES)("%sのEntity／独立Claimを同じdatasetで解決する", dataset => {
    for (const kind of ["entity", "claim"] as const) {
      const ref = { kind, dataset, id: kind === "entity" ? claim.subjectId : claim.id };
      const url = new URL(readingHref(ref), "https://example.invalid");
      expect(parseReadingLocation(url.searchParams, dataset)).toEqual({ status: "ready", reference: ref });
      expect([...url.searchParams.keys()]).toEqual(["read", "dataset", "id"]);
    }
  });
  it("参照なしを区別し、別datasetへ読み替えない", () => {
    expect(parseReadingLocation(params(""), "demo")).toBeNull();
    expect(parseReadingLocation(params("other=foo"), "demo")).toBeNull();
    expect(parseReadingLocation(new URL(readingHref(reference), "https://example.invalid").searchParams, "pilot-event-v1")).toEqual({ status: "dataset", dataset: "demo" });
    expect(parseReadingLocation(params(`read=entity&dataset=demo&id=${claim.subjectId.toUpperCase()}`), "demo")).toEqual({ status: "ready", reference: { kind: "entity", dataset: "demo", id: claim.subjectId } });
  });
  it.each([
    "read=entity", "dataset=demo", `read=entity&id=${claim.subjectId}`, `read=relation&dataset=demo&id=${claim.id}`,
    `read=claim&dataset=unknown&id=${claim.id}`, "read=claim&dataset=demo&id=../../bad", "read=claim&dataset=demo&id=",
    `read=claim&read=claim&dataset=demo&id=${claim.id}`, `read=claim&dataset=demo&dataset=demo&id=${claim.id}`,
    `read=claim&dataset=demo&id=${claim.id}&id=${claim.id}`,
  ])("不完全・未知・重複のURLを拒否 (%#)", query => {
    expect(parseReadingLocation(params(query), "demo")).toEqual({ status: "invalid" });
  });
  it("閲覧を閉じるときは閲覧用queryだけを除去する", () => {
    expect(withoutReadingReference(new URL(`https://example.invalid/?read=claim&dataset=demo&id=${claim.id}&other=a#top`))).toBe("/?other=a#top");
  });
});

describe("現在の知識参照と取消", () => {
  it("応答schemaと要求IDを検査する", async () => {
    const signal = new AbortController().signal;
    await expect(readEntityReference(claim.subjectId, signal)).resolves.toEqual(entity(claim.subjectId).entity);
    await expect(readClaimReference(claim.id, signal)).resolves.toEqual(claim);
    vi.mocked(fetchEntity).mockResolvedValue(entity(claim.objectId));
    await expect(readEntityReference(claim.subjectId, signal)).rejects.toThrow("対象の応答");
    vi.mocked(fetchClaim).mockResolvedValue({ ...examples.claim, claim: { ...claim, id: claim.subjectId } } as ClaimResponse);
    await expect(readClaimReference(claim.id, signal)).rejects.toThrow("主張の応答");
    vi.mocked(fetchClaim).mockResolvedValue({ claim: { ...claim, polarity: "unknown" } } as unknown as ClaimResponse);
    await expect(readClaimReference(claim.id, signal)).rejects.toThrow("主張の応答");
  });
  it("取消後に返った応答を受理しない", async () => {
    const controller = new AbortController();
    vi.mocked(fetchEntity).mockImplementation(async id => { controller.abort(); return entity(id); });
    await expect(readEntityReference(claim.subjectId, controller.signal)).rejects.toThrow();
  });
});

describe("直接閲覧の表示と探索境界", () => {
  it.each([{ status: "invalid" as const }, { status: "dataset" as const, dataset: "pilot-event-v1" as const }])("無効URLでは取得しない (%#)", location => {
    render(<ReferenceReader location={location} dataset="demo" onClose={vi.fn()} onExplore={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(fetchEntity).not.toHaveBeenCalled(); expect(fetchClaim).not.toHaveBeenCalled();
  });
  it("端点の一部が失効してもClaim／根拠を読み、失敗端点だけ再試行できる", async () => {
    const explore = vi.fn();
    vi.mocked(fetchEntity).mockImplementation(async id => { if (id === claim.objectId) throw new ClientApiError("missing", 404); return entity(id); });
    render(<ReferenceReader location={location} dataset="demo" onClose={vi.fn()} onExplore={explore} />);
    await screen.findByText("青葉ハルへのインタビュー");
    await screen.findByText(/削除・非公開・未登録/);
    expect(fetchClaim).toHaveBeenCalledTimes(1); // Related claims are not followed automatically.
    expect(explore).not.toHaveBeenCalled();
    vi.mocked(fetchEntity).mockImplementation(async id => entity(id));
    fireEvent.click(screen.getByRole("button", { name: "取得を再試行" }));
    await screen.findByRole("button", { name: "黒川レンから関係を探索する" });
    expect(vi.mocked(fetchEntity).mock.calls.map(call => call[0])).toEqual([claim.subjectId, claim.objectId, claim.objectId]);
    expect(fetchClaim).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "黒川レンから関係を探索する" }));
    expect(explore).toHaveBeenCalledWith(entity(claim.objectId).entity);
  });
  it("404と通信失敗を区別し、明示再試行で現在の主張へ戻る", async () => {
    vi.mocked(fetchClaim).mockRejectedValueOnce(new ClientApiError("missing", 404)).mockRejectedValueOnce(new ClientApiError("通信に失敗しました。", 0)).mockResolvedValue(examples.claim as ClaimResponse);
    render(<ReferenceReader location={location} dataset="demo" onClose={vi.fn()} onExplore={vi.fn()} />);
    await screen.findByText(/削除・非公開・未登録/);
    fireEvent.click(screen.getByRole("button", { name: "取得を再試行" }));
    await screen.findByText("通信に失敗しました。");
    fireEvent.click(screen.getByRole("button", { name: "取得を再試行" }));
    await screen.findByText("青葉ハルへのインタビュー");
  });
  it("切替で古い取得を取消し、遅着しても次の対象に混ぜない", async () => {
    let resolve!: (response: ClaimResponse) => void;
    vi.mocked(fetchClaim).mockImplementation(() => new Promise(value => { resolve = value; }));
    const props = { dataset: "demo" as const, onClose: vi.fn(), onExplore: vi.fn() };
    const { rerender } = render(<ReferenceReader key="claim" location={location} {...props} />);
    const signal = vi.mocked(fetchClaim).mock.calls[0][1];
    rerender(<ReferenceReader key="entity" location={{ status: "ready", reference: { kind: "entity", dataset: "demo", id: claim.objectId } }} {...props} />);
    expect(signal.aborted).toBe(true);
    await screen.findByRole("heading", { name: "黒川レン" });
    await act(async () => resolve(examples.claim as ClaimResponse));
    expect(screen.queryByText("青葉ハルへのインタビュー")).toBeNull();
  });
  it("通常のリンクとしてURLを持ち、通常クリックだけHistory APIへ渡す", () => {
    const push = vi.spyOn(window.history, "pushState");
    render(<ReadingLink reference={reference} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(readingHref(reference));
    fireEvent.click(link); expect(push).toHaveBeenCalledWith(null, "", readingHref(reference));
  });
  it("コピー失敗時にはURLを選択できる", async () => {
    render(<ReferenceReader location={location} dataset="demo" onClose={vi.fn()} onExplore={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "この表示のURLをコピー" }));
    await screen.findByText(/コピーできませんでした/);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.closest("details")?.open).toBe(true);
    expect(input.value).toContain(readingHref(reference));
    expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(input.value.length);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByText("青葉ハルへのインタビュー")).toBeTruthy());
  });
});

it("撤回された直接参照は元の根拠と同datasetの差替え先を明示し、自動転送しない", async () => {
  const replacement = claim.objectId;
  vi.mocked(fetchClaim).mockResolvedValue({ claim: { ...claim, withdrawal: { reason: "資料再確認による撤回", release: "test-release", replacementClaimId: replacement } }, relatedClaimIds: [] });
  const onExplore = vi.fn();
  render(<ReferenceReader dataset="demo" location={location} onClose={vi.fn()} onExplore={onExplore} />);
  await screen.findByText("撤回された主張");
  expect(screen.getByText("資料再確認による撤回")).toBeDefined();
  expect(screen.getByRole("link", { name: "差替え先の主張を読む" }).getAttribute("href")).toBe(readingHref({ kind: "claim", dataset: "demo", id: replacement }));
  expect(screen.getByText(`参照箇所：${claim.citations[0].locator}`)).toBeDefined();
  expect(onExplore).not.toHaveBeenCalled();
});
