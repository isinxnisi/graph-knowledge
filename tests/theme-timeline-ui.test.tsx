// @vitest-environment jsdom
import React from "react";
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
  const row = screen.getByRole("button", { name: /旅の一日/ });
  expect(row.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(row);
  expect(focus).toHaveBeenCalledWith(parent.id);
  expect(screen.getByRole("region", { name: "一日の流れ" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /日の出に出発する/ })).toBeTruthy();
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
      .getByRole("button", { name: /旅の一日/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /日の出に出発する/ })
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
      .getByRole("button", { name: /旅の一日/ })
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
    screen.getByRole("button", { name: /時期を定めない背景/ }),
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
  const summary = screen
    .getByText("時期を並べて見る", { exact: false })
    .closest("summary")!;
  expect(summary.closest("details")!.open).toBe(false);
  fireEvent.click(summary);
  expect(screen.getByText(/重なりから所属や因果は決まりません/)).toBeTruthy();
  const durationTrack = screen.getByRole("img", {
    name: /ある活動が続いた · 期間：/,
  });
  const occurrenceTrack = screen.getByRole("img", {
    name: /ある発見が起きた · 発生時期の幅：/,
  });
  const pointTrack = screen.getByRole("img", {
    name: /別の出来事が起きた · 1987/,
  });
  expect(durationTrack.parentElement!.parentElement).toBe(
    occurrenceTrack.parentElement!.parentElement,
  );
  expect(pointTrack.parentElement!.parentElement).toBe(
    durationTrack.parentElement!.parentElement,
  );
  expect(
    screen
      .getByRole("button", { name: /^ある活動が続いた/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  fireEvent.click(
    screen.getByRole("button", { name: "記録を読む：ある発見が起きた" }),
  );
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

it("uses possible date domains for mixed precision without reversing ranges or fixing a coarse point to January", () => {
  const mixed = record("mixed", "月から年の終端へ", {
    kind: "calendar",
    meaning: "duration",
    from: "1903-12",
    to: "1903",
    label: "原表記",
  });
  const uncertain = record("mixed-uncertain", "年精度の最遅開始", {
    kind: "calendar",
    meaning: "duration",
    from: "1903-12",
    startLatest: "1903",
    endEarliest: "1903-12",
    to: "1904",
    label: "架空例",
  });
  const year = record("year-point", "年まで分かる一点", {
    kind: "calendar",
    meaning: "point",
    from: "1903",
    label: "年まで",
  });
  const month = record("month-point", "月まで分かる一点", {
    kind: "calendar",
    meaning: "point",
    from: "1903-12",
    label: "月まで",
  });
  const day = record("day-point", "日が分かる一点", {
    kind: "calendar",
    meaning: "point",
    from: "1903-12-15",
    label: "日まで",
  });
  render(
    <ThemeTimeline
      {...common}
      records={[mixed, uncertain, year, month, day]}
    />,
  );
  fireEvent.click(
    screen.getByText("時期を並べて見る", { exact: false }).closest("summary")!,
  );
  const track = (assertion: string) =>
    screen.getByRole("img", { name: new RegExp(`^${assertion} ·`) });
  const extent = (element: HTMLElement) => {
    const start = parseFloat(element.style.getPropertyValue("--range-start"));
    return {
      start,
      end: start + parseFloat(element.style.getPropertyValue("--range-width")),
    };
  };
  const mixedRange = extent(track(mixed.assertion));
  expect(mixedRange.end).toBeGreaterThan(mixedRange.start);
  const yearRange = extent(track(year.assertion)),
    monthRange = extent(track(month.assertion)),
    dayPosition = extent(track(day.assertion));
  expect(yearRange.start).toBeLessThan(monthRange.start);
  expect(yearRange.end).toBeGreaterThanOrEqual(monthRange.end);
  expect(monthRange.start).toBeLessThan(dayPosition.start);
  expect(monthRange.end).toBeGreaterThan(dayPosition.start);
  expect(
    track(year.assertion).querySelector('[data-precision="年精度"]'),
  ).not.toBeNull();
  expect(
    track(month.assertion).querySelector('[data-precision="月精度"]'),
  ).not.toBeNull();
  expect(track(day.assertion).querySelector("[data-precision]")).toBeNull();
  for (const band of document.querySelectorAll<HTMLElement>('[role="img"] i')) {
    if (band.style.width)
      expect(parseFloat(band.style.width)).toBeGreaterThanOrEqual(0);
  }
  expect(
    screen
      .getByLabelText(/^期間：開始 1903-12〜1903 · 終了 1903-12〜1904/)
      .querySelector("[data-overlapping-boundaries]"),
  ).not.toBeNull();
  expect(document.body.textContent).not.toContain("1903-01-01");
  expect(document.body.textContent).not.toContain("1903-12-31");
});

it("keeps early-year and leap-month precision in layout without Date.UTC year coercion", () => {
  const duration = record("early", "古い年の期間", {
    kind: "calendar",
    meaning: "duration",
    from: "0004-02",
    to: "0004",
    label: "架空例",
  });
  const window = record("early-window", "古い年の発生幅", {
    kind: "calendar",
    meaning: "occurrence-window",
    from: "0004-02",
    to: "0004-03",
    label: "架空例",
  });
  const leap = record("leap", "閏日の一点", {
    kind: "calendar",
    meaning: "point",
    from: "0004-02-29",
    label: "架空例",
  });
  render(<ThemeTimeline {...common} records={[duration, window, leap]} />);
  fireEvent.click(
    screen.getByText("時期を並べて見る", { exact: false }).closest("summary")!,
  );
  const durationTrack = screen.getByRole("img", { name: /^古い年の期間/ }),
    leapTrack = screen.getByRole("img", { name: /^閏日の一点/ });
  const from = parseFloat(
      durationTrack.style.getPropertyValue("--range-start"),
    ),
    width = parseFloat(durationTrack.style.getPropertyValue("--range-width")),
    leapPosition = parseFloat(
      leapTrack.style.getPropertyValue("--range-start"),
    );
  expect(width).toBeGreaterThan(0);
  expect(leapPosition).toBeGreaterThan(from);
  expect(leapPosition).toBeLessThan(from + width);
  expect(document.body.textContent).not.toContain("1904");
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
  const button = screen.getByRole("button", { name: /朝の段階/ });
  const controlled = button.getAttribute("aria-controls")!;
  expect(controlled).not.toMatch(/\s/);
  expect(document.getElementById(controlled)).not.toBeNull();
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
  expect(screen.queryByRole("button", { name: "関係図で見る" })).toBeNull();
  expect(screen.getByRole("button", { name: /旅の一日/ })).toBeTruthy();
  view.rerender(<ThemeTimeline {...props} graphRecordIds={[parent.id]} />);
  fireEvent.click(screen.getByRole("button", { name: "関係図で見る" }));
  expect(showGraph).toHaveBeenCalledWith(parent);
  view.rerender(<ThemeTimeline {...props} />);
  expect(screen.getByRole("button", { name: "関係図で見る" })).toBeTruthy();
});
