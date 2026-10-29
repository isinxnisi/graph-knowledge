// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { addMemberReference, loadMemberReference, parseMemberReferenceLink } from "../lib/client/member-reference-addition";
import { memberDraftContent, memberDraftRequired, type MemberCapsuleDraft } from "../lib/client/member-capsule-edit";
import MemberReferencePicker from "../components/MemberReferencePicker";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import { claimDetailSchema, entityDetailSchema } from "../lib/domain/api";
import { MEMBER_CAPSULE_LIMITS } from "../lib/domain/member-capsule";

vi.mock("../components/ClaimDetails", () => ({ ClaimCard: () => <p>確認した主張と根拠</p> }));
const claim = claimDetailSchema.parse(examples.claim.claim);
const entities = [claim.subjectId, claim.objectId].map(id => entityDetailSchema.parse({ ...examples.neighbors.nodes.find(entity => entity.id === id), aliases: [], event: null }));
const origin = "http://localhost:3000";
const href = (kind = "claim", dataset = "demo", id = claim.id) => `${origin}/?read=${kind}&dataset=${dataset}&id=${id}`;
function draft(): MemberCapsuleDraft {
  const content = { dataset: "demo" as const, title: "説明付き関係図", note: "保存してある説明", language: "ja" as const, entityIds: [entities[0].id], claimIds: [] };
  const base = { id: crypto.randomUUID(), schemaVersion: 1 as const, revision: 1, createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z", content };
  return { ownerId: crypto.randomUUID(), base, expected: base, content, resolved: { entities: { [entities[0].id]: entities[0] }, claims: {}, issues: [] }, needsCheck: false };
}
const addition = { reference: { kind: "claim" as const, dataset: "demo" as const, id: claim.id }, entities, claim };
function mockKnowledge() {
  const fetcher = vi.fn(async (path: string) => Response.json(path.startsWith("/api/claims/") ? examples.claim : { entity: entities.find(entity => path.endsWith(entity.id)) }));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("会員Capsuleへの参照追加", () => {
  it("同じorigin・datasetの内部閲覧URLだけ受け取り、別originや権限リンクを拒否する", () => {
    expect(parseMemberReferenceLink(href(), origin, "demo")).toEqual(addition.reference);
    expect(parseMemberReferenceLink(href().replace(origin, ""), origin, "demo")).toEqual(addition.reference);
    for (const value of [href().replace(origin, "https://other.example"), href("claim", "pilot-science-v1"), href() + "&id=" + claim.id,
      href() + "&token=secret", href() + "#secret", origin + "/shared#secret", origin + "/member?capsule=" + claim.id,
      href("relation"), href("claim", "demo", "bad"), href().replace("localhost", "user:pass@localhost"), "javascript:alert(1)", "x".repeat(2049)]) {
      expect(parseMemberReferenceLink(value, origin, "demo")).toBeNull();
    }
  });
  it("内部APIの1主張と両端だけを再解決し、関連主張や近傍を取得しない", async () => {
    const fetcher = mockKnowledge();
    const result = await loadMemberReference(addition.reference, new AbortController().signal);
    expect(result).toEqual(addition);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([`/api/claims/${claim.id}`, ...entities.map(entity => `/api/entities/${entity.id}`)]);
  });
  it("異なるID・不正応答・端点失敗では部分的な追加を作らない", async () => {
    for (const response of [Response.json({ claim: { ...claim, id: crypto.randomUUID() } }), Response.json({ claim: {} }), Response.json(examples.claim)]) {
      const fetcher = vi.fn().mockResolvedValueOnce(response).mockResolvedValue(Response.json({ error: {} }, { status: 404 }));
      vi.stubGlobal("fetch", fetcher);
      await expect(loadMemberReference(addition.reference, new AbortController().signal)).rejects.toThrow();
    }
  });
  it("選んだ独立主張と端点を重複なく追加し、版・元内容・説明・所有者を保持する", () => {
    const base = draft(); const next = addMemberReference(base, addition);
    expect(memberDraftContent(next)).toMatchObject({ entityIds: entities.map(entity => entity.id), claimIds: [claim.id], note: base.content.note });
    expect([...memberDraftRequired(next)]).toEqual(entities.map(entity => entity.id));
    expect(next.base).toBe(base.base); expect(next.expected).toBe(base.expected); expect(next.ownerId).toBe(base.ownerId);
    expect(base.content.claimIds).toEqual([]);
    expect(memberDraftContent(addMemberReference(next, addition))).toEqual(memberDraftContent(next));
    const removed = { ...next, content: { ...next.content, claimIds: [] } };
    expect(memberDraftRequired(removed).size).toBe(0);
    expect(memberDraftContent(removed).entityIds).toEqual(entities.map(entity => entity.id));
  });
  it("孤立対象だけを追加でき、未入力の題名は追加を妨げず保存時に検証する", () => {
    const base = draft(); base.content = { ...base.content, title: "" };
    const next = addMemberReference(base, { reference: { ...addition.reference, kind: "entity", id: entities[1].id }, entities: [entities[1]], claim: null });
    expect(next.content.claimIds).toEqual([]); expect(next.content.entityIds).toHaveLength(2);
    expect(() => memberDraftContent(next)).toThrow();
  });
  it("構成上限・別dataset・端点不足を拒否し元draftを変えない", () => {
    const base = draft(); base.content = { ...base.content, entityIds: Array.from({ length: MEMBER_CAPSULE_LIMITS.entities }, () => crypto.randomUUID()) };
    base.base = { ...base.base, content: base.content };
    expect(() => addMemberReference(base, addition)).toThrow(); expect(base.content.entityIds).toHaveLength(MEMBER_CAPSULE_LIMITS.entities); expect(base.content.claimIds).toEqual([]);
    expect(() => addMemberReference(draft(), { ...addition, reference: { ...addition.reference, dataset: "pilot-science-v1" } })).toThrow();
    expect(() => addMemberReference(draft(), { ...addition, entities: [entities[0]] })).toThrow();
  });
  it("同じ関係の別主張はまとめず、主張数上限では追加全体を拒否する", () => {
    const next = addMemberReference(draft(), addition);
    const denied = { ...claim, id: crypto.randomUUID(), polarity: "denied" as const };
    const both = addMemberReference(next, { ...addition, reference: { ...addition.reference, id: denied.id }, claim: denied });
    expect(memberDraftContent(both).claimIds).toEqual([claim.id, denied.id]);
    const full = draft();
    full.content = { ...full.content, claimIds: Array.from({ length: MEMBER_CAPSULE_LIMITS.claims }, () => crypto.randomUUID()) };
    full.base = { ...full.base, content: full.content };
    expect(() => addMemberReference(full, addition)).toThrow();
    expect(full.content.claimIds).toHaveLength(MEMBER_CAPSULE_LIMITS.claims);
  });
  it("未解決の既存主張を残した追加では元の全対象を保持する", () => {
    const base = draft(); const missing = crypto.randomUUID(); const isolated = crypto.randomUUID();
    base.base = { ...base.base, content: { ...base.content, entityIds: [...base.content.entityIds, isolated], claimIds: [missing] } };
    base.content = { ...base.base.content, entityIds: [] };
    expect(memberDraftContent(addMemberReference(base, addition)).entityIds).toContain(isolated);
  });
});

describe("リンク確認から編集中の構成への明示追加", () => {
  function fill() {
    fireEvent.change(screen.getByLabelText("対象・主張の閲覧リンク"), { target: { value: href().replace(origin, location.origin) } });
    fireEvent.click(screen.getByRole("button", { name: "リンクの内容を確認" }));
  }
  it("確認だけでは追加せず、明示追加後もサーバーへ保存しない", async () => {
    const fetcher = mockKnowledge(); const changed = vi.fn();
    render(<MemberReferencePicker draft={draft()} onChange={changed} />); fill();
    const confirm = await screen.findByRole("button", { name: "確認した参照を編集中の構成へ追加" });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(memberDraftContent(changed.mock.calls[0][0]).claimIds).toEqual([claim.id]);
    expect(fetcher.mock.calls.every(call => call[0].startsWith("/api/claims/") || call[0].startsWith("/api/entities/"))).toBe(true);
    expect(screen.getByText(/アカウントへの保存はまだ/)).toBeTruthy();
  });
  it("確認中のリンク変更・取消・unmountで取得を中止し遅い応答を採用しない", async () => {
    for (const exit of ["change", "cancel", "unmount"]) {
      let finish!: (response: Response) => void;
      const fetcher = vi.fn<(path: string, options: RequestInit) => Promise<Response>>(() => new Promise<Response>(resolve => { finish = resolve; }));
      vi.stubGlobal("fetch", fetcher); const changed = vi.fn();
      const view = render(<MemberReferencePicker draft={draft()} onChange={changed} />); fill();
      if (exit === "change") fireEvent.change(screen.getByLabelText("対象・主張の閲覧リンク"), { target: { value: "別のリンク" } });
      else if (exit === "cancel") fireEvent.click(screen.getByRole("button", { name: "追加の確認を閉じる" }));
      else view.unmount();
      expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
      await act(async () => finish(Response.json(examples.claim)));
      expect(changed).not.toHaveBeenCalled(); expect(screen.queryByText("確認した主張と根拠")).toBeNull(); cleanup();
    }
  });
  it("待機中に説明を変えても追加時の最新入力を使う", async () => {
    const fetcher = mockKnowledge(); let finish!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    let latest!: MemberCapsuleDraft;
    function Harness() {
      const [value, setValue] = useState(draft()); latest = value;
      return <><button onClick={() => setValue({ ...value, content: { ...value.content, note: "待機中の追記" } })}>説明を変更</button><MemberReferencePicker draft={value} onChange={setValue} /></>;
    }
    render(<Harness />); fill(); fireEvent.click(screen.getByRole("button", { name: "説明を変更" }));
    await act(async () => finish(Response.json(examples.claim)));
    fireEvent.click(await screen.findByRole("button", { name: "確認した参照を編集中の構成へ追加" }));
    expect(latest.content.note).toBe("待機中の追記"); expect(latest.content.claimIds).toEqual([claim.id]);
  });
});
