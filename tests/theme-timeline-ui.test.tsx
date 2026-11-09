// @vitest-environment jsdom
import React from "react";
import {UiLocaleProvider} from "../lib/client/ui-locale";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import ThemeTimeline from "../components/ThemeTimeline";
import type {
  ThemeRecord,
  ThemeTimelineConfig,
} from "../lib/domain/theme-workbench";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function record(
  id: string,
  assertion: string,
  time: ThemeRecord["time"],
): ThemeRecord {
  return {
    id,
    kind: "episode",
    subject: "traveler",
    object: null,
    assertion,
    relation: "",
    scope: "記録された範囲",
    polarity: "affirmed",
    time,
    evidence: [
      {
        url: "https://example.org/source",
        title: "確認資料",
        locator: "該当箇所",
        excerpt: "試験用の根拠。実際の出来事ではない。",
        retrievedAt: "2026-11-01T00:00:00Z",
      },
    ],
    revision: 1,
    updatedAt: "2026-11-01T00:00:00Z",
    reason: "初回入力",
    mapping: null,
  };
}
const parent = record("trip", "旅の一日", {
  kind: "calendar",
  from: "2026-11-01",
  label: "日付",
});
const child = record("dawn", "日の出に出発する", {
  kind: "qualitative",
  axis: "一日の段階",
  from: "日の出",
  label: "出発",
  coordinateMeaning: "光の状態による段階",
});
const config: ThemeTimelineConfig = {
  version: 1,
  axes: [
    { id: "calendar", kind: "calendar", label: "日程" },
    {
      id: "day",
      kind: "qualitative",
      label: "一日の段階",
      order: ["日の出", "日中", "日没"],
    },
  ],
  placements: [
    { recordId: parent.id, axisId: "calendar" },
    { recordId: child.id, axisId: "day" },
  ],
  insets: [{ parentRecordId: parent.id, axisId: "day", label: "一日の流れ" }],
};
const common = {
  entities: [{ id: "traveler", name: "旅人", kind: "人物", description: "" }],
  selectedRecordIds: [],
  focusedRecordId: null,
  onFocusRecord: vi.fn(),
};

it("keeps the existing standalone display controls visible by default", () => {
  render(<ThemeTimeline {...common} records={[parent]} />);
  expect(screen.getByRole("combobox", { name: "暦の表示単位" })).toBeTruthy();
  expect(screen.queryByText("表示設定")).toBeNull();
});

it("opens the explicitly nested axis only when its parent row is opened", () => {
  const focus = vi.fn();
  render(
    <ThemeTimeline
      {...common}
      records={[parent, child]}
      timeline={config}
      onFocusRecord={focus}
    />,
  );
  expect(screen.queryByRole("region", { name: "一日の流れ" })).toBeNull();
  const row = screen.getByRole("button", { name: /^旅の一日/ });
  expect(row.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(row);
  expect(focus).toHaveBeenCalledWith(parent.id);
  expect(screen.getByRole("region", { name: "一日の流れ" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /^日の出に出発する/ }),
  ).toBeTruthy();
});

it("keeps the parent expanded when another view focuses the child", () => {
  const view = render(
    <ThemeTimeline {...common} records={[parent, child]} timeline={config} />,
  );
  view.rerender(
    <ThemeTimeline
      {...common}
      records={[parent, child]}
      timeline={config}
      focusedRecordId={child.id}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: /^旅の一日/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /^日の出に出発する/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(screen.getByRole("region", { name: "一日の流れ" })).toBeTruthy();
});

it("changes Capsule membership independently of the reading focus", () => {
  const focus = vi.fn(),
    membership = vi.fn();
  render(
    <ThemeTimeline
      {...common}
      records={[parent]}
      onFocusRecord={focus}
      onToggleSelected={membership}
    />,
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Capsuleに含める：旅の一日" }),
  );
  expect(membership).toHaveBeenCalledWith(parent.id);
  expect(focus).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: /^旅の一日/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it("does not reveal or fetch child records outside the provided snapshot", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(
    <ThemeTimeline
      {...common}
      records={[parent]}
      timeline={config}
      focusedRecordId={parent.id}
    />,
  );
  expect(screen.queryByRole("region", { name: "一日の流れ" })).toBeNull();
  expect(screen.queryByText(child.assertion)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).toBeNull();
});

it("shows explicit interval endpoints, cycle wrapping and undated context without invented dates", () => {
  const interval = record("years", "複数年の活動", {
    kind: "calendar",
    meaning: "duration",
    from: "2020",
    to: "2022",
    label: "年までの期間",
  });
  const cyclic = record("season", "年境界をまたぐ周期", {
    kind: "cycle",
    axis: "季節",
    period: 12,
    from: 10,
    to: 2,
    wrap: true,
    unit: "月",
    label: "周期内の位置",
  });
  const undated = record("context", "時期を定めない背景", null);
  render(<ThemeTimeline {...common} records={[interval, cyclic, undated]} />);
  const period = screen.getByLabelText(/^期間：2020 → 2022/);
  expect(within(period).getByText("2020")).toBeTruthy();
  expect(within(period).getByText("2022")).toBeTruthy();
  expect(screen.getByLabelText("期間 10 → 2 月（折り返し）")).toBeTruthy();
  expect(screen.getByText("↻ 周期の境界をまたぐ")).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "時期を定めない情報" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /^時期を定めない背景/ }),
  ).toBeTruthy();
  expect(document.body.textContent).not.toContain("2020-01-01");
  expect(document.body.textContent).not.toContain("2022-12-31");
});

it("distinguishes duration, uncertain occurrence and unclassified legacy ranges without inferring membership", () => {
  const duration = record("duration", "ある活動が続いた", {
    kind: "calendar",
    meaning: "duration",
    from: "1985",
    to: "1989",
    label: "確認された活動期間",
  });
  const occurrence = record("occurrence", "ある発見が起きた", {
    kind: "calendar",
    meaning: "occurrence-window",
    from: "1986",
    to: "1988",
    label: "発生時期の推定",
  });
  const point = record("point", "別の出来事が起きた", {
    kind: "calendar",
    meaning: "point",
    from: "1987",
    label: "記録された年",
  });
  const legacy = record("legacy", "意味未整理の旧記録", {
    kind: "calendar",
    from: "1984",
    to: "1990",
    label: "原本の記載",
  });
  const focus = vi.fn();
  render(
    <ThemeTimeline
      {...common}
      records={[duration, occurrence, point, legacy]}
      onFocusRecord={focus}
    />,
  );
  const period = screen.getByLabelText(/^期間：1985 → 1989/);
  expect(period.getAttribute("data-meaning")).toBe("duration");
  expect(within(period).getByText("開始")).toBeTruthy();
  const window = screen.getByLabelText(/^発生時期の幅：1986〜1988/);
  expect(window.getAttribute("data-meaning")).toBe("occurrence-window");
  expect(within(window).queryByText("開始")).toBeNull();
  expect(within(window).getByText(/この間のどこかで発生/)).toBeTruthy();
  expect(
    screen
      .getByLabelText(/^時期の範囲（未区別）：1984〜1990/)
      .getAttribute("data-meaning"),
  ).toBe("unclassified-range");
  const durationLine = screen.getByRole("button", {
    name: /時期の線を選ぶ：ある活動が続いた/,
  });
  const occurrenceLine = screen.getByRole("button", {
    name: /時期の線を選ぶ：ある発見が起きた/,
  });
  expect(durationLine.getAttribute("data-meaning")).toBe("duration");
  expect(occurrenceLine.getAttribute("data-meaning")).toBe("occurrence-window");
  expect(durationLine.parentElement).toBe(occurrenceLine.parentElement);
  expect(
    document.querySelector('[aria-label="期間と出来事の年表グラフ"]'),
  ).toBeTruthy();
  fireEvent.click(occurrenceLine);
  expect(focus).toHaveBeenCalledWith(occurrence.id);
  expect(
    screen
      .getByRole("button", { name: /^ある発見が起きた/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /^ある活動が続いた/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it("retains uncertainty at both duration boundaries, including overlapping boundary ranges", () => {
  const uncertain = record("uncertain", "境界が不確かな実期間", {
    kind: "calendar",
    meaning: "duration",
    from: "1985",
    startLatest: "1988",
    endEarliest: "1987",
    to: "1989",
    label: "架空の操作例",
  });
  render(
    <ThemeTimeline
      {...common}
      records={[uncertain]}
      focusedRecordId={uncertain.id}
    />,
  );
  const period = screen.getByLabelText(
    /^期間：開始 1985〜1988 · 終了 1987〜1989/,
  );
  expect(within(period).getByText("1985〜1988")).toBeTruthy();
  expect(within(period).getByText("1987〜1989")).toBeTruthy();
  expect(period.querySelector("[data-overlapping-boundaries]")).not.toBeNull();
  expect(
    screen.getByText(
      /開始は 1985〜1988 のどこか。終了は 1987〜1989 のどこか。/,
    ),
  ).toBeTruthy();
  expect(
    within(period).queryByText("発生時期の幅", { exact: true }),
  ).toBeNull();
  expect(document.body.textContent).not.toContain("1985-01-01");
});

it("offers graph navigation only for records still present in an edited Capsule graph", () => {
  const showGraph = vi.fn();
  const props = {
    ...common,
    records: [parent],
    focusedRecordId: parent.id,
    onShowGraph: showGraph,
  };
  const view = render(<ThemeTimeline {...props} graphRecordIds={[]} />);
  expect(screen.queryByRole("button", { name: /^関係図で見る：/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^旅の一日/ })).toBeTruthy();
  view.rerender(<ThemeTimeline {...props} graphRecordIds={[parent.id]} />);
  fireEvent.click(screen.getByRole("button", { name: /^関係図で見る：/ }));
  expect(showGraph).toHaveBeenCalledWith(parent);
  view.rerender(<ThemeTimeline {...props} />);
  expect(screen.getByRole("button", { name: /^関係図で見る：/ })).toBeTruthy();
});

it("keeps expansion controls linked for a free-text axis name containing spaces", () => {
  const phase = record("phase", "朝の段階", {
    kind: "qualitative",
    axis: "phase of day",
    from: "morning",
    label: "朝",
    coordinateMeaning: "daily qualitative phases",
  });
  render(<ThemeTimeline {...common} records={[phase]} />);
  const button = screen.getByRole("button", { name: /^朝の段階/ });
  const controlled = button.getAttribute("aria-controls")!;
  expect(controlled).not.toMatch(/\s/);
  expect(document.getElementById(controlled)).not.toBeNull();
});

it("switches display units without changing original dates, selected records or reading focus", () => {
  const window = record("window", "1991年のどこかの出来事", {
    kind: "calendar",
    meaning: "occurrence-window",
    from: "1991-02-01",
    to: "1991-11-30",
    label: "原資料の範囲",
  });
  const membership = vi.fn(),
    focus = vi.fn();
  const before = JSON.stringify(window);
  render(
    <ThemeTimeline
      {...common}
      records={[window]}
      selectedRecordIds={[window.id]}
      onToggleSelected={membership}
      onFocusRecord={focus}
    />,
  );
  const line = screen.getByRole("button", {
    name: /時期の線を選ぶ：1991年のどこかの出来事/,
  });
  expect(line.hasAttribute("data-point")).toBe(false);
  fireEvent.change(screen.getByRole("combobox", { name: "暦の表示単位" }), {
    target: { value: "year" },
  });
  expect(line.hasAttribute("data-point")).toBe(true);
  expect(line.getAttribute("data-meaning")).toBe("occurrence-window");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(document.body.textContent).toContain("1991-02-01〜1991-11-30");
  fireEvent.change(screen.getByRole("combobox", { name: "暦の表示単位" }), {
    target: { value: "day" },
  });
  expect(line.hasAttribute("data-point")).toBe(false);
  expect(membership).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
  expect(JSON.stringify(window)).toBe(before);
});

it("connects each same-date item to its own heading and keeps its endpoint links independent of expansion", () => {
  const duration = record("duration", "活動が続いた", {
    kind: "calendar",
    meaning: "duration",
    from: "2030-05-04",
    startLatest: "2030-05-07",
    to: "2030-05-15",
    label: "活動A",
  });
  const point = record("point", "同日の出来事", {
    kind: "calendar",
    meaning: "point",
    from: "2030-05-04",
    label: "出来事B",
  });
  render(<ThemeTimeline {...common} records={[duration, point]} />);
  const anchor = (id: string) =>
    document.querySelector<HTMLElement>(
      `[data-anchor-record="${id}"][data-anchor-kind="record"]`,
    )!;
  const connector = (id: string) =>
    document.querySelector<HTMLElement>(
      `[data-connector-id="${id}"][data-anchor-kind="record"]`,
    )!;
  expect(anchor(duration.id).style.gridRow).toBe(
    connector(duration.id).style.gridRow,
  );
  expect(anchor(point.id).style.gridRow).toBe(
    connector(point.id).style.gridRow,
  );
  expect(connector(duration.id).style.gridRow).not.toBe(
    connector(point.id).style.gridRow,
  );
  fireEvent.click(screen.getByRole("button", { name: /^同日の出来事/ }));
  expect(anchor(point.id).style.gridRow).toBe(
    connector(point.id).style.gridRow,
  );
  expect(
    screen
      .getByRole("button", { name: /^同日の出来事/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /活動A.*終了側/ }));
  expect(
    screen
      .getByRole("button", { name: /^活動が続いた/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});

it("shows an entirely uncertain duration as one continuous uncertain stroke with no certain core", () => {
  const duration = record("duration", "不確かな期間", {
    kind: "calendar",
    meaning: "duration",
    from: "2030-05-04",
    startLatest: "2030-05-12",
    endEarliest: "2030-05-07",
    to: "2030-05-15",
    label: "",
  });
  render(<ThemeTimeline {...common} records={[duration]} />);
  const segments = document.querySelectorAll(
    '[data-segment-record="duration"]',
  );
  expect(segments).toHaveLength(1);
  expect(segments[0].getAttribute("data-kind")).toBe("uncertain");
});

it("shows the concrete directed relation between the same entity IDs without opening the row", () => {
  const relation = {
    ...record("relation", "旅人が詩集を執筆した", {
      kind: "calendar",
      from: "2030",
      label: "",
    }),
    kind: "relation" as const,
    object: "book",
    relation: "執筆した",
    polarity: "denied" as const,
  };
  const show = vi.fn(),
    focus = vi.fn(),
    membership = vi.fn();
  render(
    <ThemeTimeline
      {...common}
      records={[relation]}
      entities={[
        ...common.entities,
        { id: "book", name: "ある詩集", kind: "作品", description: "" },
      ]}
      onShowGraph={show}
      onFocusRecord={focus}
      onToggleSelected={membership}
    />,
  );
  const context = document.querySelector('[data-record-kind="relation"]')!;
  expect(context.textContent).toContain("旅人執筆したある詩集否定");
  expect(
    [...context.querySelectorAll("[data-entity-id]")].map((e) =>
      e.getAttribute("data-entity-id"),
    ),
  ).toEqual(["traveler", "book"]);
  expect(
    context
      .querySelector('[data-entity-id="traveler"] i')
      ?.getAttribute("data-shape"),
  ).toBe("circle");
  expect(
    context
      .querySelector('[data-entity-id="book"] i')
      ?.getAttribute("data-shape"),
  ).toBe("round-rectangle");
  fireEvent.click(
    screen.getByRole("button", { name: "関係図で見る：旅人が詩集を執筆した" }),
  );
  expect(show).toHaveBeenCalledWith(relation);
  expect(focus).not.toHaveBeenCalled();
  expect(membership).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: /^旅人が詩集/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it("does not invent a relation arrow or a period entity for non-relational period information", () => {
  const period = {
    ...record("period", "ある作風の期間", {
      kind: "calendar",
      meaning: "duration",
      from: "2030",
      to: "2032",
      label: "架空の青の時代",
    }),
    kind: "note" as const,
  };
  render(<ThemeTimeline {...common} records={[period]} />);
  const context = document.querySelector('[data-record-kind="note"]')!;
  expect(context.textContent).toContain("旅人説明");
  expect(context.querySelector("[data-relation-mark]")).toBeNull();
  expect(
    [...context.querySelectorAll("[data-entity-id]")].map((e) =>
      e.getAttribute("data-entity-id"),
    ),
  ).toEqual(["traveler"]);
  expect(screen.getByRole("button", { name: /^ある作風の期間/ })).toBeTruthy();
});

it("English timeline translates fixed controls, same-date labels, guides and expanded time details",()=>{
 const rs=[record("period","The telescope was deployed",{kind:"calendar",meaning:"duration",from:"2021-12-28",to:"2022-01-04",label:"Deployment"}),record("event","Deployment completed",{kind:"calendar",meaning:"point",from:"2022-01-04",label:"Completion"})];
 rs.forEach(r=>{r.evidence=[];r.scope="Recorded scope";});
 const {container}=render(<UiLocaleProvider initialLocale="en"><ThemeTimeline records={rs} entities={[{id:"subject",name:"Telescope",kind:"work"}]} focusedRecordId={null} onFocusRecord={vi.fn()} selectedRecordIds={[]} embedded compactControls/></UiLocaleProvider>);
 expect(screen.getByText("Same day")).toBeTruthy();expect(screen.getByRole("heading",{name:"Dates and durations"})).toBeTruthy();expect(screen.getAllByText(/Duration: 2021-12-28/).length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole("button",{name:"Timeline display settings"}));expect(screen.getByRole("combobox",{name:"Calendar scale"})).toBeTruthy();
 fireEvent.click(screen.getByText("The telescope was deployed").closest("button")!);expect(screen.getByText("Start")).toBeTruthy();expect(screen.getAllByText("End").length).toBeGreaterThan(0);
 expect(container.textContent).toContain("Timeline guide");expect(container.textContent).not.toMatch(/[ぁ-んァ-ン一-龥]/);
});
