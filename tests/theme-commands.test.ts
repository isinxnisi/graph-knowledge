import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

// Exercise complete command transitions with an isolated transaction store. Real
// PostgreSQL and HTTP behavior is covered separately by test-issue75-http.py.
type TestState = {
  themes: ThemeDetail[];
  capsules: ThemeCapsule[];
  shares: Record<string, ThemeCapsule>;
  meanings: unknown[];
};
const memory = vi.hoisted(() => ({
  state: {} as TestState,
  updates: 0,
  events: [] as unknown[],
}));
vi.mock("pg", () => {
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith("SELECT body"))
        return { rows: [{ body: structuredClone(memory.state) }] };
      if (sql.startsWith("UPDATE theme75.state")) {
        memory.state = JSON.parse(String(values[0]));
        memory.updates++;
      }
      if (sql.startsWith("INSERT INTO theme75.events"))
        memory.events.push(JSON.parse(String(values[1])));
      return { rows: [] };
    },
    release() {},
  };
  return {
    Pool: class {
      async connect() {
        return client;
      }
    },
  };
});
import {
  executeThemeCommand,
  themeGraphCleanup,
} from "../lib/server/theme-workbench";
import type { ThemeCapsule, ThemeDetail } from "../lib/domain/theme-workbench";

const id = "11111111-1111-4111-a111-111111111111";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL("./fixtures/theme-legacy-supporting-graph.json", import.meta.url),
      "utf8",
    ),
  );
function setup() {
  const old = fixture();
  const theme: ThemeDetail = {
    id: old.snapshot.themeId,
    title: "review",
    description: "review",
    revision: 1,
    entities: old.snapshot.entities,
    records: old.snapshot.records,
    sourceHash: "fixture",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
  const cap: ThemeCapsule = {
    id,
    title: "saved",
    description: "",
    revision: 1,
    document: old.document,
    snapshot: structuredClone(old.snapshot),
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt,
    shareToken: null,
    sharedRevision: null,
  };
  memory.state = { themes: [theme], capsules: [cap], shares: {}, meanings: [] };
  memory.updates = 0;
  memory.events = [];
  return { theme, cap };
}
const command = (body: Record<string, unknown>) =>
  executeThemeCommand({ requestId: crypto.randomUUID(), ...body });
beforeEach(() => {
  vi.stubEnv("THEME_WORKBENCH_ENABLED", "1");
  vi.stubEnv("THEME_ORIGIN", "http://localhost:3276");
  vi.stubEnv(
    "THEME_DATABASE_URL",
    "postgresql://fixture:fixture@127.0.0.1:55475/plunode_theme75",
  );
});

it("rejects creating a Capsule from a stale observation without saving a different snapshot", async () => {
  const { theme } = setup();
  theme.revision = 2;
  theme.records[0].assertion = "later correction";
  theme.records[0].revision++;
  const before = structuredClone(memory.state);
  await expect(
    command({
      action: "capsule-create",
      themeId: theme.id,
      themeRevision: 1,
      recordIds: [theme.records[0].id],
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(memory.state).toEqual(before);
  expect(memory.updates).toBe(0);
  expect(memory.events).toEqual([]);
  const cap = (await command({
    action: "capsule-create",
    themeId: theme.id,
    themeRevision: 2,
    recordIds: [theme.records[0].id],
  })) as ThemeCapsule;
  expect(cap.snapshot.themeRevision).toBe(2);
  expect(cap.snapshot.records[0].assertion).toBe("later correction");
});

it("refreshes an old Capsule without sourceDocument using its historical baseline, then can clean its generated notes", async () => {
  const { theme, cap } = setup();
  const note = theme.records.find((r) => r.kind === "note")!;
  const beforeSnapshot = structuredClone(cap.snapshot);
  note.assertion = "corrected source note";
  note.revision++;
  theme.revision++;
  const saved = (await command({
    action: "capsule-refresh",
    id,
    expected: 1,
    themeRevision: 2,
    recordIds: [note.id],
  })) as ThemeCapsule;
  expect(
    saved.document.texts.some((t) => t.text === "corrected source note"),
  ).toBe(true);
  expect(saved.sourceDocument!.texts).toHaveLength(2);
  expect(
    beforeSnapshot.records.find((r) => r.id === note.id)!.assertion,
  ).not.toBe("corrected source note");
  const cleanup = themeGraphCleanup(saved);
  expect(cleanup.removedTexts).toBe(2);
  expect(cleanup.document.texts.map((t) => t.text)).toEqual([
    "作者が図に残す注記・分離検証用",
  ]);
});

it("imports corrected polarity explicitly while preserving authored labels and the previously shared copy", async () => {
  const { theme, cap } = setup();
  const relation = theme.records.find((r) => r.kind === "relation")!;
  cap.document.relations[0].label = "作者のラベル";
  memory.state.shares.before = structuredClone(cap);
  relation.polarity = "denied";
  relation.revision++;
  theme.revision++;
  const saved = (await command({
    action: "capsule-refresh",
    id,
    expected: 1,
    themeRevision: 2,
    recordIds: [relation.id],
  })) as ThemeCapsule;
  expect(saved.document.relations[0].label).toBe("作者のラベル");
  expect(saved.document.relations[0].origin).toEqual({
    kind: "local",
    polarity: "denied",
  });
  expect(saved.document.evidence.every((e) => e.stance === "support")).toBe(
    true,
  );
  expect(memory.state.shares.before.document.relations[0].origin).toEqual({
    kind: "local",
  });
});

it("keeps an explicitly overridden local polarity when importing a source correction", async () => {
  const { theme, cap } = setup();
  cap.document.relations[0].origin = { kind: "local", polarity: "uncertain" };
  const relation = theme.records.find((r) => r.kind === "relation")!;
  relation.polarity = "denied";
  relation.revision++;
  theme.revision++;
  const saved = (await command({
    action: "capsule-refresh",
    id,
    expected: 1,
    themeRevision: 2,
    recordIds: [relation.id],
  })) as ThemeCapsule;
  expect(saved.document.relations[0].origin).toEqual({
    kind: "local",
    polarity: "uncertain",
  });
});

it("can import polarity after cleaning an old diagram without mistaking absent historical polarity for an authored override", async () => {
  const { theme } = setup();
  await command({ action: "capsule-clean-graph", id, expected: 1 });
  const current = memory.state.themes[0];
  const record = current.records.find((r) => r.kind === "relation")!;
  record.polarity = "denied";
  record.revision++;
  current.revision++;
  const saved = (await command({
    action: "capsule-refresh",
    id,
    expected: 2,
    themeRevision: 2,
    recordIds: [record.id],
  })) as ThemeCapsule;
  expect(saved.document.relations[0].origin).toEqual({
    kind: "local",
    polarity: "denied",
  });
  expect(saved.sourceDocument!.relations[0].origin).toEqual({
    kind: "local",
    polarity: "denied",
  });
  expect(theme.id).toBe(saved.snapshot.themeId);
});
