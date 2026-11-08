// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import KnowledgeTimeline from "../components/KnowledgeTimeline";
import { knowledgeRecordContentSchema, type KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const stamp = { revision: 4, createdAt: "2026-11-02T00:00:00Z", reason: "表示試験" };
const s: KnowledgeSnapshot = {
  schemaVersion: 1, initialView: "split", mappings: [],
  entities: ["a", "b"].map(id => ({ id, ...stamp, content: { name: `対象${id}`, aliases: [], kind: "人物", description: "", language: "ja" } })),
  sources: [{ id: "source", ...stamp, revision: 2, content: { title: "資料の第2版", bibliography: "資料集 第2版", url: null, language: "ja" } }],
  records: [{ id: "shared-record", ...stamp, content: knowledgeRecordContentSchema.parse({ kind: "relation", assertion: "装画と挿絵を手掛けた", subjectId: "a", objectId: "b", relation: "装画と挿絵", times: [{ id: "created", time: { kind: "calendar", from: "1991", label: "制作" } }, { id: "printed", time: { kind: "calendar", from: "1992", label: "刊行" } }], evidence: [{ id: "e", source: { id: "source", revision: 2 }, locator: "図版一覧", excerpt: "", stance: "support" }] }) }],
};
it('marks the selected subject in both time rows without filtering away other subjects or expanding the records',()=>{
 const {container}=render(<KnowledgeTimeline snapshot={s} focusedRecordId={null} focusedEntityId="a" onFocusRecord={vi.fn()}/>);
 expect([...container.querySelectorAll('[data-subject-focus]')].map(e=>e.getAttribute('data-entity-id'))).toEqual(['a','a']);
 expect(container.querySelectorAll('[data-entity-id="b"]')).toHaveLength(2);
 expect(screen.getAllByRole('button',{name:/^装画と挿絵を手掛けた/}).every(button=>button.getAttribute('aria-expanded')==='false')).toBe(true);
});
it("selects the same factual Record from either time, and exposes fixed citation context without fake links", () => {
  const onFocus = vi.fn(), onShow = vi.fn(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  function Host() {
    const [focus, setFocus] = useState<string | null>(null);
    return <KnowledgeTimeline snapshot={s} focusedRecordId={focus} onFocusRecord={id => { onFocus(id); setFocus(id); }} onShowGraph={onShow} />;
  }
  render(<Host />);
  const buttons = screen.getAllByRole("button", { name: /^装画と挿絵を手掛けた/ });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[1]);
  expect(onFocus).toHaveBeenLastCalledWith("shared-record");
  expect(buttons[1].getAttribute("aria-expanded")).toBe("true");
  expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelectorAll('[data-record-id="shared-record"][data-focused]')).toHaveLength(2);
  expect(screen.getAllByText("資料版 2 · 支持")).toHaveLength(2);
  expect(screen.queryByRole("link", { name: /資料の第2版/ })).toBeNull();
  expect(document.querySelectorAll('[data-source-id="source"][data-source-revision="2"]')).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: /^関係図で見る：/ })[1]);
  expect(onShow).toHaveBeenLastCalledWith("shared-record");
  expect(fetch).not.toHaveBeenCalled();
});
it("does not manufacture graph entities or graph jumps for a subjectless period", () => {
  const period: KnowledgeSnapshot = { ...s, entities: [], records: [{ ...s.records[0], id: "period", content: { ...s.records[0].content, kind: "note", subjectId: null, objectId: null, relation: "", assertion: "作風の期間についての説明", times: [{ id: "period", time: { kind: "calendar", meaning: "duration", from: "1901", to: "1904", label: "青の時代" } }] } }] };
  render(<KnowledgeTimeline snapshot={period} focusedRecordId={null} onFocusRecord={vi.fn()} onShowGraph={vi.fn()} />);
  expect(screen.getByRole("button", { name: /^作風の期間についての説明/ })).toBeTruthy();
  expect(document.querySelector('[data-relation-mark]')).toBeNull();
  expect(document.querySelector('[data-entity-id]')).toBeNull();
  expect(screen.queryByRole("button", { name: /^関係図で見る：/ })).toBeNull();
});

it("can move undated context outside the timeline without losing explicit inset parent access", () => {
  const note = { ...s.records[0], id: "context", content: { ...s.records[0].content, kind: "note" as const, subjectId: null, objectId: null, relation: "", assertion: "日付を持たない背景", times: [] } };
  const data = { ...s, records: [note, ...s.records] };
  const props = { snapshot: data, focusedRecordId: null, onFocusRecord: vi.fn() };
  const view = render(<KnowledgeTimeline {...props} />);
  expect(screen.getByRole("button", { name: /^日付を持たない背景/ })).toBeTruthy();
  view.rerender(<KnowledgeTimeline {...props} untimedInContext />);
  expect(screen.queryByRole("button", { name: /^日付を持たない背景/ })).toBeNull();
  const nested: KnowledgeSnapshot = { ...data, timeline: { version: 1, axes: [{ id: "child", kind: "calendar", label: "背景から読む年表" }], placements: s.records[0].content.times.map(t => ({ recordId: s.records[0].id, timeId: t.id, axisId: "child" })), insets: [{ parentRecordId: "context", axisId: "child", label: "詳しい時期" }] } };
  view.rerender(<KnowledgeTimeline {...props} snapshot={nested} untimedInContext />);
  fireEvent.click(screen.getByRole("button", { name: /^日付を持たない背景/ }));
  expect(screen.getByRole("region", { name: "詳しい時期" })).toBeTruthy();
});

it("opens settings below the heading and retains their values after closing", () => {
  const data = { ...s, records: [...s.records, { ...s.records[0], id: "second", content: { ...s.records[0].content, subjectId: "b", objectId: "a", assertion: "別の対象に関する記録" } }] };
  const onFocus = vi.fn();
  render(<KnowledgeTimeline snapshot={data} focusedRecordId={null} onFocusRecord={onFocus} />);
  const summary = screen.getByRole("button", { name: "年表の表示設定" });
  expect(summary.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("combobox", { name: "暦の表示単位" })).toBeNull();
  expect(screen.getByText("線の見方").closest("details")?.open).toBe(false);
  fireEvent.click(summary);
  expect(summary.getAttribute("aria-expanded")).toBe("true");
  fireEvent.change(screen.getByRole("combobox", { name: "暦の表示単位" }), { target: { value: "month" } });
  fireEvent.change(screen.getByRole("combobox", { name: "たどる対象" }), { target: { value: "b" } });
  expect(summary.getAttribute("aria-label")).toBe("年表の表示設定：月 · 対象b");
  fireEvent.click(summary);
  expect(summary.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("combobox", { name: "たどる対象" })).toBeNull();
  expect(screen.getAllByRole("button", { name: /^装画と挿絵を手掛けた/ })).toHaveLength(2);
  expect(onFocus).not.toHaveBeenCalled();
  fireEvent.click(summary);
  expect((screen.getByRole("combobox", { name: "暦の表示単位" }) as HTMLSelectElement).value).toBe("month");
  expect((screen.getByRole("combobox", { name: "たどる対象" }) as HTMLSelectElement).value).toBe("b");
});

it("does not add phantom range endings for coarse dated events in the normal knowledge timeline", () => {
  const rows = [
    { id: "workshop", assertion: "1989年9月の検討会", time: { kind: "calendar", meaning: "point", from: "1989-09", label: "検討会" } },
    { id: "proposal", assertion: "1996年の提言", time: { kind: "calendar", meaning: "point", from: "1996", label: "提言" } },
    { id: "day", assertion: "日付のある出来事", time: { kind: "calendar", meaning: "point", from: "2021-12-25", label: "" } },
    { id: "period", assertion: "実際の期間", time: { kind: "calendar", meaning: "duration", from: "2021-12-28", to: "2022-01-04", label: "展開期間" } },
  ];
  const data: KnowledgeSnapshot = { ...s, records: rows.map(row => ({ ...s.records[0], id: row.id, content: knowledgeRecordContentSchema.parse({ ...s.records[0].content, assertion: row.assertion, times: [{ id: "when", time: row.time }] }) })) };
  const original = JSON.stringify(data);
  render(<KnowledgeTimeline snapshot={data} focusedRecordId={null} onFocusRecord={vi.fn()} />);
  for (const name of ["1989年9月の検討会", "1996年の提言", "日付のある出来事"]) {
    expect(screen.getByRole("button", { name: new RegExp("^時期の線を選ぶ：" + name) }).hasAttribute("data-point")).toBe(true);
  }
  expect(screen.queryByText("候補の後端")).toBeNull();
  expect(screen.getByRole("button", { name: /^時期の線を選ぶ：実際の期間/ }).hasAttribute("data-point")).toBe(false);
  expect(screen.getByText("終了側").closest("button")).toBeTruthy();
  expect(JSON.stringify(data)).toBe(original);
});

it("shows a coarse month as a window when a day-precise event inside it is also visible", () => {
  const rows = [
    { id: "coarse", assertion: "月まで分かる出来事", time: { kind: "calendar", meaning: "point", from: "1989-09", label: "月の候補" } },
    { id: "fine", assertion: "その月の別の出来事", time: { kind: "calendar", meaning: "point", from: "1989-09-15", label: "" } },
  ];
  const data: KnowledgeSnapshot = { ...s, records: rows.map(row => ({ ...s.records[0], id: row.id, content: knowledgeRecordContentSchema.parse({ ...s.records[0].content, assertion: row.assertion, times: [{ id: "when", time: row.time }] }) })) };
  const view = render(<KnowledgeTimeline snapshot={data} focusedRecordId={null} onFocusRecord={vi.fn()} />);
  expect(screen.getByRole("button", { name: /^時期の線を選ぶ：月まで分かる出来事/ }).hasAttribute("data-point")).toBe(false);
  expect(screen.getByText("候補の後端")).toBeTruthy();
  view.rerender(<KnowledgeTimeline snapshot={{ ...data, records: data.records.slice(0,1) }} focusedRecordId={null} onFocusRecord={vi.fn()} />);
  expect(screen.getByRole("button", { name: /^時期の線を選ぶ：月まで分かる出来事/ }).hasAttribute("data-point")).toBe(true);
  expect(screen.queryByText("候補の後端")).toBeNull();
});


it("draws a short same-date window beside a point, and a day window around clock entries", () => {
  const make = (clock: boolean): KnowledgeSnapshot => ({ ...s, records: [
    { ...s.records[0], id: "window", content: { ...s.records[0].content, assertion: "同じ日の候補幅", times: [{ id: "window", time: { kind: "calendar", meaning: "occurrence-window", from: "1989-09-04", to: "1989-09-04", label: "" } }] } },
    { ...s.records[0], id: "other", content: { ...s.records[0].content, assertion: "同日の別の記録", times: [{ id: "other", time: clock
      ? { kind: "calendar", meaning: "duration", from: "1989-09-04T09:00", to: "1989-09-04T10:00", label: "" }
      : { kind: "calendar", meaning: "point", from: "1989-09-04", label: "" } }] } },
  ] });
  const { rerender } = render(<KnowledgeTimeline snapshot={make(false)} focusedRecordId={null} onFocusRecord={vi.fn()} />);
  const line = () => screen.getByRole("button", { name: /^時期の線を選ぶ：同じ日の候補幅/ });
  expect(line().hasAttribute("data-point")).toBe(false);
  expect(line().hasAttribute("data-compact-range")).toBe(true);
  expect(screen.getByRole("button", { name: /^時期の線を選ぶ：同日の別の記録/ }).hasAttribute("data-point")).toBe(true);
  rerender(<KnowledgeTimeline snapshot={make(true)} focusedRecordId={null} onFocusRecord={vi.fn()} />);
  expect(line().hasAttribute("data-point")).toBe(false);
  expect(line().hasAttribute("data-compact-range")).toBe(false);
  expect(screen.getByRole("button", { name: /^時期の線を選ぶ：同日の別の記録/ }).hasAttribute("data-point")).toBe(false);
});
