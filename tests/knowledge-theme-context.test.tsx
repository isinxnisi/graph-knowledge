// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import KnowledgeThemeContext from "../components/KnowledgeThemeContext";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";

vi.mock("../lib/client/ui-locale", () => ({ useUiLocale: () => ({ locale: "ja" }) }));
const version = { revision: 1, createdAt: "2030-01-01", reason: "登録" };
const entities = ["person", "work"].map((id) => ({ ...version, id, content: { name: id === "person" ? "対象の人物" : "対象の作品", aliases: [], kind: id, description: "", language: "ja" } }));
function record(id: string, kind: "note" | "episode" | "relation", assertion: string, dated = false): KnowledgePublishedRecord {
  return {
    record: { ...version, id, revision: 7, content: {
      kind, assertion, subjectId: kind === "relation" ? "person" : null, objectId: kind === "relation" ? "work" : null,
      relation: kind === "relation" ? "制作に関わった" : "", polarity: "affirmed", scope: "",
      times: dated ? [{ id: "date", time: { kind: "calendar", from: "1991", label: "1991年" } }] : [],
      evidence: [{ id: "citation", source: { id: "source", revision: 1 }, locator: "2頁", excerpt: "確認した抜粋", stance: "support" }],
    } },
    label: assertion, entities: kind === "relation" ? entities : [],
    sources: [{ ...version, id: "source", content: { title: "確認した資料", url: "https://example.org/source", bibliography: "", language: "ja" } }],
    semantics: { status: "unmapped", mappingRevision: null, recordRevision: null, concept: null }, legacyTyped: null,
  };
}
const note = record("background", "note", "このテーマを読むための背景");
const episode = record("episode", "episode", "時期の分からない出来事");
const relation = record("credit", "relation", "日付の記録がない制作関係");
const dated = record("dated", "episode", "年表側で読む出来事", true);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("時期のない説明・出来事・関係を同じTheme情報へ載せ、日付付きの記録は除く", () => {
  render(<KnowledgeThemeContext records={[note, dated, episode, relation]} selectedRecordId={null} onRead={vi.fn()} />);
  const context = screen.getByRole("region", { name: "テーマの情報" });
  expect(within(context).getByText("3件")).toBeTruthy();
  for (const dto of [note, episode, relation]) expect(within(context).getByRole("button", { name: "内容と根拠を読む：" + dto.record.content.assertion })).toBeTruthy();
  expect(within(context).queryByText(dated.record.content.assertion)).toBeNull();
  expect(within(context).getAllByRole("listitem")).toHaveLength(3);
});

it("対象なし背景に架空の対象や時期を補わず、原記録も変更しない", () => {
  const before = JSON.stringify(note);
  const { container } = render(<KnowledgeThemeContext records={[note]} selectedRecordId={null} onRead={vi.fn()} />);
  const read = screen.getByRole("button", { name: "内容と根拠を読む：" + note.record.content.assertion });
  expect(read.textContent).toContain(note.record.content.assertion);
  expect(read.textContent).not.toMatch(/2030|1991|undefined|対象なし|不明な対象/);
  expect(container.querySelector("time")).toBeNull();
  expect(screen.queryByRole("button", { name: "テーマの情報をすべて見る" })).toBeNull();
  expect(JSON.stringify(note)).toBe(before);
});

it("固定版の表示と選択を保ち、根拠への操作はそのRecord IDを渡す", () => {
  const onRead = vi.fn();
  const { rerender } = render(<KnowledgeThemeContext records={[note, relation]} selectedRecordId="credit" onRead={onRead} />);
  const read = screen.getByRole("button", { name: "内容と根拠を読む：" + relation.record.content.assertion });
  expect(read.getAttribute("aria-pressed")).toBe("true");
  expect(read.textContent).not.toContain("内容版");
  fireEvent.click(read);
  expect(onRead).toHaveBeenLastCalledWith("credit");
  fireEvent.click(screen.getByRole("button", { name: "テーマの情報をすべて見る" }));
  expect(read.textContent).toContain("内容版 7");
  expect(read.textContent).toContain("対象の人物"); expect(read.textContent).toContain("対象の作品");
  fireEvent.click(read);
  expect(onRead).toHaveBeenLastCalledWith("credit");
  const revised = { ...relation, record: { ...relation.record, revision: 8 } };
  rerender(<KnowledgeThemeContext records={[note, revised]} selectedRecordId="credit" onRead={onRead} />);
  const revisedRead = screen.getByRole("button", { name: "内容と根拠を読む：" + relation.record.content.assertion });
  expect(revisedRead.textContent).toContain("内容版 8");
  fireEvent.click(revisedRead); expect(onRead).toHaveBeenLastCalledWith("credit");
});

it.each([{ polarity: "denied", label: "否定" }, { polarity: "uncertain", label: "不確実" }] as const)("関係の $label を肯定として見せない", ({ polarity, label }) => {
  const qualified = { ...relation, record: { ...relation.record, content: { ...relation.record.content, polarity } } };
  render(<KnowledgeThemeContext records={[qualified]} selectedRecordId={null} onRead={vi.fn()} />);
  const read = screen.getByRole("button", { name: "内容と根拠を読む：" + relation.record.content.assertion });
  expect(within(read).getByText(label)).toBeTruthy();
  expect(read.textContent).toContain(relation.record.content.assertion);
});

it("件数を保ったまますべて表示と折畳みを切り替え、展開した記録も同じ根拠へ進む", () => {
  const onRead = vi.fn();
  render(<KnowledgeThemeContext records={[note, episode, relation]} selectedRecordId={null} onRead={onRead} />);
  const list = screen.getByRole("list");
  expect(list.hasAttribute("data-expanded")).toBe(false);
  const more = screen.getByRole("button", { name: "テーマの情報をすべて見る" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  expect(more.closest("header")).not.toBeNull();
  expect(screen.queryByText(/内容版 7/)).toBeNull();
  fireEvent.click(more);
  expect(list.getAttribute("data-expanded")).toBe("true");
  expect(screen.getAllByText(/内容版 7/)).toHaveLength(3);
  expect(screen.getByRole("button", { name: "折りたたむ" }).getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "内容と根拠を読む：" + relation.record.content.assertion }));
  expect(onRead).toHaveBeenCalledWith("credit");
  fireEvent.click(screen.getByRole("button", { name: "折りたたむ" }));
  expect(list.hasAttribute("data-expanded")).toBe(false);
  expect(screen.queryByText(/内容版 7/)).toBeNull();
  expect(screen.getByText("3件")).toBeTruthy();
});

it.each([{ records: [] }, { records: [dated] }])("時期なし記録がなければ空の枠や見出しを表示しない: %j", ({ records }) => {
  const { container } = render(<KnowledgeThemeContext records={records} selectedRecordId={null} onRead={vi.fn()} />);
  expect(container.innerHTML).toBe("");
});
