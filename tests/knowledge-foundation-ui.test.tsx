// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KnowledgeFoundation from "../components/KnowledgeFoundation";
import { knowledgeInputDraftKey, readKnowledgeInputDraft, type KnowledgeInputDraft } from "../lib/client/knowledge-input-draft";
import { knowledgeRecordContentSchema, type KnowledgeList } from "../lib/domain/knowledge-foundation";

const entity = (id: string) => ({ id, revision: 1, createdAt: "2026-11-02", reason: "登録", content: { name: id + "の名前", kind: "person", aliases: [], description: "", language: "ja" } });
const source = { id: "source", revision: 1, createdAt: "2026-11-02", reason: "登録", content: { title: "初版資料", url: null, bibliography: "初版", language: "ja" } };
const record = { id: "record", revision: 1, createdAt: "2026-11-02", reason: "登録", content: knowledgeRecordContentSchema.parse({ kind: "relation", subjectId: "a", objectId: "b", assertion: "元の記録", relation: "手伝った", scope: "元の範囲", evidence: [{ id: "e", source: { id: "source", revision: 1 }, locator: "1頁" }] }) };
function server() {
  let catalog: KnowledgeList = { entities: [entity("a"), entity("b")], sources: [source], records: [record], themes: [], statuses: [{ kind: "record", id: "record", revision: 1, visibility: "public", confirmation: "unreviewed" }] };
  let failure = "", failRead = false;
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const command = JSON.parse(String(init.body)); commands.push(command);
      if (failure) return { ok: false, json: async () => ({ error: failure }) };
      return { ok: true, json: async () => ({ saved: true }) };
    }
    if (failRead) throw new Error("再読込失敗");
    return { ok: true, json: async () => structuredClone(catalog) };
  }));
  return { commands, fail: (value: string) => { failure = value; }, failRead: () => { failRead = true; }, update: (change: Partial<KnowledgeList>) => { catalog = { ...catalog, ...change }; } };
}
async function flush() { await act(async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); }); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function field(name: string) { return document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement; }
function type(name: string, value: string) { fireEvent.change(field(name), { target: { value } }); }
async function start() { const api = server(), view = render(<KnowledgeFoundation />); await flush(); fireEvent.click(screen.getByRole("button", { name: "＋ 記録を加える" })); return { api, ...view }; }
function fillNew() { type("subjectName", "入力中の人物"); type("objectName", "入力中の作品"); type("relation", "構想を助けた"); type("assertion", "根拠を読みながら書いた内容"); type("sourceTitle", "手元の書籍"); type("bibliography", "2026年版"); type("locator", "12頁"); type("excerpt", "該当する記述"); }
async function submit(name = "記録を登録") { fireEvent.submit(screen.getByRole("button", { name }).closest("form")!); await flush(); }
beforeEach(() => { sessionStorage.clear(); window.history.replaceState({}, "", "/themes/records"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("入力して探索へ移動した後、名前・種類・時期と同じUUIDを明示再開できる", async () => {
  const { unmount } = await start(); fillNew(); type("from", "1991"); type("to", "1993"); change("肯否・不確実性", "uncertain"); change("記録の種類", "episode");
  const before = readKnowledgeInputDraft(sessionStorage)!;
  expect(screen.getByRole("link", { name: "探索へ戻る →" }).getAttribute("href")).toBe("/");
  expect(screen.getByRole("link", { name: "← テーマと年表" }).getAttribute("href")).toBe("/themes");
  unmount(); render(<KnowledgeFoundation />); await flush();
  expect(screen.queryByLabelText("具体的な内容")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "入力を再開" }));
  expect((screen.getByLabelText("記録の種類") as HTMLSelectElement).value).toBe("episode");
  expect(field("subjectName").value).toBe("入力中の人物"); expect(field("from").value).toBe("1991");
  change("記録の種類", "relation"); expect(field("objectName").value).toBe("入力中の作品");
  expect(readKnowledgeInputDraft(sessionStorage)).toMatchObject({ mode: "create", ids: before.mode === "create" ? before.ids : undefined });
});

it("通信失敗で草稿と再送IDを保ち、リロード後の同じ保存は同じrequestIdを再送する", async () => {
  const { api, unmount } = await start(); fillNew(); api.fail("通信に失敗しました"); await submit();
  const sent = api.commands[0]; expect(readKnowledgeInputDraft(sessionStorage)?.submission?.requestId).toBe(sent.requestId);
  unmount(); render(<KnowledgeFoundation />); await flush(); fireEvent.click(screen.getByRole("button", { name: "入力を再開" }));
  api.fail(""); await submit(); expect(api.commands[1]).toEqual(sent); expect(sessionStorage.getItem(knowledgeInputDraftKey)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("記録を登録しました");
});

it("再開後に資料・対象が改訂されても保存pinを新版へ差し替えず、選び直しは明示操作になる", async () => {
  const { api, unmount } = await start();
  const endpoints = screen.getAllByLabelText("登録済みから選ぶ"); fireEvent.change(endpoints[0], { target: { value: "a@1" } }); fireEvent.change(endpoints[1], { target: { value: "b@1" } }); change("資料を再利用", "source@1");
  type("relation", "原資料での関係"); type("assertion", "旧版資料で確認した内容"); type("locator", "2頁"); type("excerpt", "旧版に書いてある");
  unmount(); api.update({ entities: [{ ...entity("a"), revision: 2 }, entity("b")], sources: [{ ...source, revision: 2, content: { ...source.content, title: "新版資料" } }] }); render(<KnowledgeFoundation />); await flush(); fireEvent.click(screen.getByRole("button", { name: "入力を再開" }));
  expect((screen.getByLabelText("資料を再利用") as HTMLSelectElement).selectedOptions[0].textContent).toContain("初版資料 · 版 1（入力時）");
  api.fail("対象版が更新されています"); await submit();
  expect(api.commands[0].entityPins).toEqual([{ id: "a", revision: 1 }, { id: "b", revision: 1 }]);
  expect(api.commands[0].records).toMatchObject([{ content: { evidence: [{ source: { id: "source", revision: 1 } }] } }]);
  fireEvent.change(screen.getAllByLabelText("登録済みから選ぶ")[0], { target: { value: "a@2" } }); change("資料を再利用", "source@2"); await submit();
  expect(api.commands[1].entityPins).toEqual([{ id: "a", revision: 2 }, { id: "b", revision: 1 }]);
  expect(api.commands[1].requestId).not.toBe(api.commands[0].requestId);
  expect(api.commands[1].records).toMatchObject([{ content: { evidence: [{ source: { id: "source", revision: 2 } }] } }]);
});

it("訂正草稿は期待版と元内容を保ち、別の新版を上書きせず409後も再開できる", async () => {
  const api = server(), view = render(<KnowledgeFoundation />); await flush();
  fireEvent.click(screen.getByRole("button", { name: /元の記録/ })); fireEvent.click(screen.getByRole("button", { name: "内容を訂正" }));
  type("assertion", "入力途中の訂正"); type("reason", "根拠を確認したため"); view.unmount();
  api.update({ records: [{ ...record, revision: 2, content: { ...record.content, scope: "別の編集者の新版範囲", assertion: "他者の訂正" } }] }); api.fail("期待版が一致しません");
  render(<KnowledgeFoundation />); await flush(); fireEvent.click(screen.getByRole("button", { name: "入力を再開" }));
  expect(field("assertion").value).toBe("入力途中の訂正"); expect(screen.getByText("内容版 1 からの訂正")).toBeTruthy();
  await submit("新しい版として保存");
  expect(api.commands[0]).toMatchObject({ action: "correct", expectedRevision: 1, content: { assertion: "入力途中の訂正", scope: "元の範囲" } });
  expect(readKnowledgeInputDraft(sessionStorage)).toMatchObject({ mode: "correct", base: { revision: 1 } });
});

it("保存成功後の一覧再読込失敗で保存済み草稿を復活させない", async () => {
  const { api } = await start(); fillNew(); api.failRead(); await submit();
  expect(sessionStorage.getItem(knowledgeInputDraftKey)).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("保存は完了しました");
  expect(screen.queryByRole("button", { name: "入力を再開" })).toBeNull();
});

it("明示破棄で草稿を消し、非対応schemaや保存された権限は採用しない", async () => {
  const { unmount } = await start(); fillNew(); fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
  const preserved = sessionStorage.getItem(knowledgeInputDraftKey)!; fireEvent.click(screen.getByRole("button", { name: "＋ 記録を加える" })); expect(sessionStorage.getItem(knowledgeInputDraftKey)).toBe(preserved);
  fireEvent.click(screen.getByRole("button", { name: "入力を破棄" })); expect(sessionStorage.getItem(knowledgeInputDraftKey)).toBeNull();
  const malformed = JSON.parse(preserved) as KnowledgeInputDraft & { actor?: unknown }; malformed.actor = { kind: "operator" }; sessionStorage.setItem(knowledgeInputDraftKey, JSON.stringify(malformed));
  unmount(); render(<KnowledgeFoundation />); await flush(); expect(screen.queryByRole("button", { name: "入力を再開" })).toBeNull();
});

it("探索から指定した記録の最新内容を示してから訂正し、保管草稿は明示再開を優先する", async () => {
  const api = server(); api.update({ records: [{ ...record, revision: 2, content: { ...record.content, assertion: "今の公開内容" } }] });
  window.history.replaceState({}, "", "/themes/records?record=record&fromRevision=1");
  const view = render(<KnowledgeFoundation />); await flush();
  expect(screen.getByText(/読んでいた内容版 1 ／ 編集対象 2/)).toBeTruthy();
  expect(screen.queryByLabelText("具体的な内容")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "内容を訂正" }));
  expect(field("assertion").value).toBe("今の公開内容"); type("assertion", "入力中の訂正"); type("reason", "確認済み");
  view.unmount();
  window.history.replaceState({}, "", "/themes/records?record=another&fromRevision=7");
  api.update({ records: [{ ...record, revision: 3 }, { ...record, id: "another", revision: 8, content: { ...record.content, assertion: "別の記録" } }] });
  render(<KnowledgeFoundation />); await flush();
  expect(screen.getByText(/読んでいた内容版 7 ／ 編集対象 8/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "入力を再開" }));
  expect(field("assertion").value).toBe("入力中の訂正"); expect(screen.getByText("内容版 2 からの訂正")).toBeTruthy();
  api.fail("期待版が一致しません"); await submit("新しい版として保存");
  expect(api.commands[0]).toMatchObject({ id: "record", expectedRevision: 2 });
});
