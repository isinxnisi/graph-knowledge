// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import { UiLocaleProvider, useUiLocale } from "../lib/client/ui-locale";
import { fetchClaim, fetchEntity } from "../lib/client/api";
import type { ClaimResponse, EntitySummary } from "../lib/domain/api";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import type { LocalCapsule, ResolvedCapsule } from "../lib/client/local-capsules";
import { contentMessage } from "../lib/i18n/content";
import { capsuleLabels } from "../lib/i18n/capsules";
import { capsuleSharingLabels } from "../lib/i18n/capsule-sharing";
import { capsuleDiscussionLabels } from "../lib/i18n/capsule-discussion";
import { memberLabels } from "../lib/i18n/member";
import { readingLabels } from "../lib/i18n/reading-reference";
import { savedViewLabels } from "../lib/i18n/saved-views";
import { workspaceLabels } from "../lib/i18n/workspace";
import ReferenceReader from "../components/ReferenceReader";
import MemberCapsules from "../components/MemberCapsules";
import SharedCapsule from "../components/SharedCapsule";
import CapsuleShareControls from "../components/CapsuleShareControls";
import CapsuleDiscussion from "../components/CapsuleDiscussion";

vi.mock("../lib/client/api", async original => ({ ...await original<typeof import("../lib/client/api")>(), fetchEntity: vi.fn(), fetchClaim: vi.fn() }));
vi.mock("../components/CapsuleDialog", () => ({
  CapsuleReader: ({ capsule, onEdit }: { capsule: LocalCapsule; onEdit?: (value: ResolvedCapsule) => void }) => <section><h3>{capsule.title}</h3><p>{capsule.note}</p>{onEdit && <button onClick={() => onEdit({ entities: {}, claims: {}, issues: [] })}>test-edit</button>}</section>,
  ClaimCaption: () => null,
}));
const userId = "10000000-0000-4000-8000-000000000001";
const capsule: MemberCapsule = { id: "20000000-0000-4000-8000-000000000001", schemaVersion: 1, revision: 1,
  createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
  content: { dataset: "demo", title: "翻訳しない題名", note: "翻訳しない説明", language: "ja", entityIds: [examples.claim.claim.subjectId], claimIds: [] } };
const token = "a".repeat(43);
let requests: ReturnType<typeof vi.fn>;
function Switch() {
  const { setLocale } = useUiLocale();
  return <><button onClick={() => setLocale("en")}>test-en</button><button onClick={() => setLocale("ja")}>test-ja</button></>;
}
function show(children: ReactNode) { return render(<UiLocaleProvider><Switch />{children}</UiLocaleProvider>); }
function language(locale: "ja" | "en") { fireEvent.click(screen.getByRole("button", { name: `test-${locale}` })); }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  history.replaceState(null, "", `/member?capsule=${capsule.id}`);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(fetchEntity).mockImplementation(async id => ({ entity: { ...(examples.neighbors.nodes as EntitySummary[]).find(entity => entity.id === id)!, aliases: [], event: null } }));
  vi.mocked(fetchClaim).mockResolvedValue(examples.claim as ClaimResponse);
  requests = vi.fn(async (path: string) => {
    if (path === "/api/member/status") return Response.json({ provider: "fixture" });
    if (path === "/api/member/profile") return Response.json({ user: { id: userId, name: "本人の表示名", locale: "ja" } });
    if (path === "/api/member/capsules") return Response.json({ capsules: [capsule] });
    if (path.endsWith("/share")) return Response.json({ share: null });
    return Response.json({ capsule });
  });
  vi.stubGlobal("fetch", requests);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("閲覧・会員・共有の表示言語と保存内容を分ける", () => {
  it("英語辞書を解決し、未対応言語は日本語、UI通知だけを両方向へ解決する", () => {
    expect(memberLabels("en-US").deleteAccount).toBe("Delete account");
    expect(readingLabels("en").title).toBe("Individual view");
    expect(capsuleSharingLabels("en").readTitle).toBe("Shared Capsule");
    expect(capsuleDiscussionLabels("en").body).toBe("Comment text");
    expect(capsuleLabels("fr").title).toBe(capsuleLabels().title);
    expect(contentMessage(memberLabels().unavailable, "en")).toBe(memberLabels("en").unavailable);
    expect(contentMessage(memberLabels("en").profileFailed, "ja")).toBe(memberLabels().profileFailed);
    for (const locale of ["ja", "en"]) {
      expect(contentMessage(savedViewLabels("ja").imported(2, 3), locale)).toBe(savedViewLabels(locale).imported(2, 3));
      expect(contentMessage(savedViewLabels("en").imported(2, 3), locale)).toBe(savedViewLabels(locale).imported(2, 3));
      expect(contentMessage(workspaceLabels("ja").restored(2), locale)).toBe(workspaceLabels(locale).restored(2));
    }
    expect(contentMessage("未知のサーバー通知", "en")).toBe("未知のサーバー通知");
  });

  it("直接閲覧の取得中・取得後に切り替えても再取得・取消せず、原資料とIDを保持する", async () => {
    let finish!: (value: ClaimResponse) => void;
    vi.mocked(fetchClaim).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    show(<ReferenceReader dataset="demo" location={{ status: "ready", reference: { dataset: "demo", kind: "claim", id: examples.claim.claim.id } }} onClose={vi.fn()} onExplore={vi.fn()} />);
    const signal = vi.mocked(fetchClaim).mock.calls[0][1];
    language("en"); expect(screen.getByText("Loading linked content…")).toBeTruthy();
    expect(signal.aborted).toBe(false); expect(fetchClaim).toHaveBeenCalledTimes(1);
    await act(async () => finish(examples.claim as ClaimResponse));
    await screen.findByText("青葉ハルへのインタビュー");
    await screen.findByRole("button", { name: "Explore relations from 黒川レン" });
    const count = vi.mocked(fetchEntity).mock.calls.length;
    language("ja"); await screen.findByRole("heading", { name: "このURLの記録" });
    expect(screen.getByText("青葉ハルへのインタビュー")).toBeTruthy();
    expect(fetchEntity).toHaveBeenCalledTimes(count); expect(fetchClaim).toHaveBeenCalledTimes(1);
  });

  it("会員の編集中題名・説明・表示名・認証を保ち、言語変更だけでは読書込しない", async () => {
    show(<MemberCapsules dataset="demo" />);
    fireEvent.click(await screen.findByRole("button", { name: "test-edit" }));
    fireEvent.change(screen.getByLabelText("自分の説明", { exact: true }), { target: { value: "未保存の日本語メモ" } });
    fireEvent.change(screen.getByLabelText("表示名", { exact: true }), { target: { value: "未保存の表示名" } });
    const count = requests.mock.calls.length;
    language("en");
    expect((screen.getByLabelText("My description", { exact: true }) as HTMLTextAreaElement).value).toBe("未保存の日本語メモ");
    expect((screen.getByLabelText("Display name", { exact: true }) as HTMLInputElement).value).toBe("未保存の表示名");
    expect((screen.getByLabelText("Capsule title", { exact: true }) as HTMLInputElement).value).toBe(capsule.content.title);
    language("ja");
    expect((screen.getByLabelText("自分の説明", { exact: true }) as HTMLTextAreaElement).value).toBe("未保存の日本語メモ");
    expect(requests).toHaveBeenCalledTimes(count);
    expect(capsule.content.language).toBe("ja");
  });

  it("共有内容の言語変更ではリンクの認可・pollを再開せず、本文・tokenを保持する", async () => {
    history.replaceState(null, "", `/shared#${token}`);
    show(<SharedCapsule dataset="demo" />);
    await screen.findByRole("heading", { name: capsule.content.title });
    await screen.findByRole("link", { name: "本人の表示名のアカウントを開く（別タブ）" });
    expect(requests).toHaveBeenCalledTimes(2);
    language("en"); await screen.findByRole("heading", { name: "Shared Capsule" });
    language("ja"); await screen.findByRole("heading", { name: "共有されたCapsule" });
    expect(screen.getByText(capsule.content.note)).toBeTruthy();
    expect(requests).toHaveBeenCalledTimes(2); expect(location.hash).toBe(`#${token}`);
  });

  it("発行済みリンク・確認状態を維持し、英語の通知も日本語へ戻せる", async () => {
    show(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={vi.fn()} />);
    await screen.findByText(capsuleSharingLabels().stopped);
    language("en");
    fireEvent.click(screen.getByRole("button", { name: "Create a link to this version" }));
    language("ja"); expect(screen.getByRole("button", { name: "この版をリンクで閲覧可能にする" })).toBeTruthy();
    language("en");
    requests.mockResolvedValueOnce(Response.json({ share: { id: capsule.id, revision: 1, createdAt: capsule.createdAt }, token }));
    fireEvent.click(screen.getByRole("button", { name: "Make this version readable by link" }));
    const input = await screen.findByLabelText("Sharing link") as HTMLInputElement;
    const url = input.value, count = requests.mock.calls.length;
    language("ja"); expect((screen.getByLabelText("共有リンク") as HTMLInputElement).value).toBe(url);
    expect(screen.getByText(capsuleSharingLabels().issued)).toBeTruthy();
    expect(requests).toHaveBeenCalledTimes(count);
  });

  it("コメントの未送信本文・本人・版・再送keyを言語切替で変えない", async () => {
    const data = { capsuleId: capsule.id, revision: 1, closed: false, viewer: { id: userId, name: "本人" }, canManage: false, posts: [] };
    requests.mockResolvedValueOnce(Response.json(data));
    show(<CapsuleDiscussion capsuleId={capsule.id} revision={1} userId={userId} />);
    fireEvent.click(screen.getByRole("button", { name: "この版のコメントを見る" }));
    await screen.findByText("この版のコメントはまだありません。");
    fireEvent.change(screen.getByLabelText("コメント本文"), { target: { value: "未送信のコメント" } });
    requests.mockRejectedValueOnce(new TypeError("response lost"));
    fireEvent.click(screen.getByRole("button", { name: "この版へ投稿する" }));
    await screen.findByText(/投稿結果が不明/);
    const body = requests.mock.calls.at(-1)![1].body;
    language("en");
    expect((screen.getByLabelText("Comment text") as HTMLTextAreaElement).value).toBe("未送信のコメント");
    expect(screen.getByText(/The result is unknown/)).toBeTruthy();
    const count = requests.mock.calls.length;
    requests.mockResolvedValueOnce(Response.json({ postId: userId, replayed: true })).mockResolvedValueOnce(Response.json(data));
    fireEvent.click(screen.getByRole("button", { name: "Check or resend the same comment" }));
    await screen.findByText("Comment posted.");
    expect(requests.mock.calls[count][1].body).toBe(body);
    await waitFor(() => expect((screen.getByLabelText("Comment text") as HTMLTextAreaElement).value).toBe(""));
  });
});
