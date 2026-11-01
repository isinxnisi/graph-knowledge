// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import ThemeWorkbench from "../components/ThemeWorkbench";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../components/CapsuleStudio", () => ({
  default: ({ capsule }: { capsule: { revision: number } }) => (
    <div data-testid="graph-version">図の版 {capsule.revision}</div>
  ),
}));
vi.mock("../components/CapsuleSurface", () => ({
  CapsuleModal: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}));
const projected = (revision: number) => ({
  revision,
  document: {
    nodes: [{ key: "00000000-0000-4000-a000-000000000001" }],
    relations: [],
    texts: [],
    layout: {
      positions: { "00000000-0000-4000-a000-000000000001": { x: 0, y: 0 } },
      pan: { x: 0, y: 0 },
      zoom: 1,
    },
  },
});
const base = {
  id: "t",
  title: "テーマ",
  description: "説明",
  revision: 1,
  entities: [],
  records: [],
  createdAt: "2026-11-01",
  updatedAt: "2026-11-01",
  sourceHash: "hash",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not mount a stale graph while a newly loaded theme revision is being projected", async () => {
  let version = 1;
  let finish: ((value: unknown) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/themes/graph")) {
        if (version === 2)
          return new Promise((resolve) => {
            finish = resolve;
          });
        return Promise.resolve({
          ok: true,
          json: async () => projected(1),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...base, revision: version }),
      });
    }),
  );
  render(<ThemeWorkbench themeId="t" />);
  await screen.findByText("図の版 1");
  version = 2;
  fireEvent.click(screen.getByRole("button", { name: "↻ 最新を読む" }));
  await screen.findByText("この内容版の図を準備しています…");
  expect(screen.queryByTestId("graph-version")).toBeNull();
  await waitFor(() => expect(finish).toBeDefined());
  finish!({ ok: true, json: async () => projected(2) });
  await screen.findByText("図の版 2");
});

const record = {
  id: "r",
  kind: "relation" as const,
  subject: "a",
  object: "b",
  assertion: "AがBを翻訳した",
  relation: "翻訳した",
  scope: "旧範囲",
  polarity: "affirmed" as const,
  time: { kind: "calendar" as const, from: "1843", label: "英訳の刊行年" },
  evidence: [
    {
      url: "https://old.example.org/evidence",
      title: "資料",
      locator: "1頁",
      excerpt: "原資料での記載",
      retrievedAt: "2026-11-01T00:00:00Z",
    },
  ],
  revision: 1,
  updatedAt: "2026-11-01T00:00:00Z",
  reason: "初回登録",
  mapping: null,
};
const entities = [
  { id: "a", name: "A", kind: "人物", description: "" },
  { id: "b", name: "B", kind: "文書", description: "" },
];

it("preserves the existing calendar label when correcting an unrelated field", async () => {
  let submitted: { record: typeof record } | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        submitted = JSON.parse(String(options.body));
      return Promise.resolve({
        ok: true,
        json: async () =>
          url.startsWith("/api/themes/graph")
            ? projected(1)
            : { ...base, entities, records: [record] },
      });
    }),
  );
  render(<ThemeWorkbench themeId="t" />);
  await screen.findByText("図の版 1");
  fireEvent.click(screen.getByRole("button", { name: "記録と根拠" }));
  fireEvent.click(screen.getByRole("button", { name: "訂正" }));
  fireEvent.change(screen.getByLabelText("対象版・条件など"), {
    target: { value: "訂正した範囲" },
  });
  fireEvent.change(screen.getByLabelText("訂正の理由"), {
    target: { value: "範囲を明記" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "訂正を保存" }).closest("form")!,
  );
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted?.record.scope).toBe("訂正した範囲");
  expect(submitted?.record.time).toEqual(record.time);
});

it("shows the actual old and new evidence for an evidence-only Capsule correction", async () => {
  const after = {
    ...record,
    revision: 2,
    evidence: [
      {
        ...record.evidence[0],
        url: "https://new.example.org/evidence",
        excerpt: "訂正した資料の記載",
      },
    ],
  };
  const capsule = {
    id: "cap",
    title: "保存した図",
    description: "",
    revision: 1,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    shareToken: null,
    sharedRevision: null,
    snapshot: { themeId: "t", themeRevision: 1, entities, records: [record] },
    document: {
      nodes: [],
      relations: [],
      texts: [],
      layout: { positions: {}, pan: { x: 0, y: 0 }, zoom: 1 },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          capsule,
          themeRevision: 2,
          diff: [{ recordId: "r", before: record, after, kind: "content" }],
        }),
      }),
    ),
  );
  render(<ThemeWorkbench capId="cap" />);
  const summary = await screen.findByText("変更箇所を確認 · 根拠");
  const details = summary.closest("details")!;
  expect(details.open).toBe(false);
  fireEvent.click(summary);
  expect(details.open).toBe(true);
  expect(details.textContent).toContain("https://old.example.org/evidence");
  expect(details.textContent).toContain("https://new.example.org/evidence");
  expect(details.textContent).toContain("原資料での記載");
  expect(details.textContent).toContain("訂正した資料の記載");
});

it("lets a correction explicitly detach a date from its configured timeline", async () => {
  let submitted:
    | { record: typeof record; detachTimelinePlacement: boolean }
    | undefined;
  const timeline = {
    version: 1,
    axes: [{ id: "dates", kind: "calendar", label: "年表" }],
    placements: [{ recordId: "r", axisId: "dates" }],
    insets: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        submitted = JSON.parse(String(options.body));
      return Promise.resolve({
        ok: true,
        json: async () =>
          url.startsWith("/api/themes/graph")
            ? projected(1)
            : { ...base, entities, records: [record], timeline },
      });
    }),
  );
  render(<ThemeWorkbench themeId="t" />);
  await screen.findByText("図の版 1");
  fireEvent.click(screen.getByRole("button", { name: "記録と根拠" }));
  fireEvent.click(screen.getByRole("button", { name: "訂正" }));
  fireEvent.change(screen.getByLabelText("時期の表し方"), {
    target: { value: "none" },
  });
  fireEvent.click(screen.getByLabelText("この記録の年表配置を外して訂正する"));
  fireEvent.change(screen.getByLabelText("訂正の理由"), {
    target: { value: "年代が未確定と判明" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "訂正を保存" }).closest("form")!,
  );
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted?.record.time).toBeNull();
  expect(submitted?.detachTimelinePlacement).toBe(true);
});

it("saves uncertain duration boundaries without turning them into an occurrence window", async () => {
  let submitted: { record: { time: unknown } } | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        submitted = JSON.parse(String(options.body));
      return Promise.resolve({
        ok: true,
        json: async () =>
          url.startsWith("/api/themes/graph")
            ? projected(1)
            : { ...base, entities, records: [record] },
      });
    }),
  );
  render(<ThemeWorkbench themeId="t" />);
  await screen.findByText("図の版 1");
  fireEvent.click(screen.getByRole("button", { name: "記録と根拠" }));
  fireEvent.click(screen.getByRole("button", { name: "訂正" }));
  fireEvent.change(screen.getByLabelText("時期の表し方"), {
    target: { value: "duration" },
  });
  fireEvent.change(screen.getByLabelText("開始", { exact: true }), {
    target: { value: "1840" },
  });
  fireEvent.change(screen.getByLabelText("終了", { exact: true }), {
    target: { value: "1850" },
  });
  fireEvent.click(screen.getByLabelText("開始時期に幅がある"));
  fireEvent.click(screen.getByLabelText("終了時期に幅がある"));
  fireEvent.change(screen.getByLabelText("開始の最も遅い時期"), {
    target: { value: "1846" },
  });
  fireEvent.change(screen.getByLabelText("終了の最も早い時期"), {
    target: { value: "1844" },
  });
  fireEvent.change(screen.getByLabelText("訂正の理由"), {
    target: { value: "境界の幅を原資料に合わせた" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "訂正を保存" }).closest("form")!,
  );
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted?.record.time).toEqual({
    kind: "calendar",
    meaning: "duration",
    from: "1840",
    to: "1850",
    startLatest: "1846",
    endEarliest: "1844",
    label: record.time.label,
  });
});

it("opens a supporting-only theme in the timeline and offers no invented graph target", async () => {
  const note = {
    ...record,
    kind: "note",
    object: null,
    relation: "",
    assertion: "年表だけの説明",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.startsWith("/api/themes/graph")
            ? { revision: 1, document: { nodes: [], relations: [], texts: [] } }
            : { ...base, entities, records: [note] },
      }),
    ),
  );
  render(<ThemeWorkbench themeId="t" />);
  await screen.findByRole("heading", { name: "年月日・期間" });
  expect(
    screen.getByRole("button", { name: "年表" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByRole("button", { name: /^関係図で見る：/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "関係図" }));
  expect(
    screen.getByRole("region", { name: "関係図に表示する内容なし" }),
  ).toBeTruthy();
  expect(screen.queryByTestId("graph-version")).toBeNull();
});
