import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  themeDocument,
  themeGraphCleanup,
} from "../lib/server/theme-workbench";
import {
  themeRecordSearchText,
  type ThemeCapsule,
} from "../lib/domain/theme-workbench";

type Saved = Pick<ThemeCapsule, "snapshot" | "document" | "sourceDocument">;
const legacy = (): Saved =>
  JSON.parse(
    readFileSync(
      new URL("./fixtures/theme-legacy-supporting-graph.json", import.meta.url),
      "utf8",
    ),
  );

it("projects only explicit relationships and their entities/evidence while retaining all source records", () => {
  const cap = legacy(),
    before = JSON.stringify(cap.snapshot);
  const doc = themeDocument(cap.snapshot);
  expect(doc.nodes).toHaveLength(2);
  expect(doc.relations).toHaveLength(1);
  expect(doc.texts).toEqual([]);
  expect(doc.evidence).toHaveLength(1);
  expect(doc.nodes.every((n) => !n.description.includes("時期区分"))).toBe(
    true,
  );
  expect(doc.relations[0].label).toBe("制作した");
  expect(cap.snapshot.records).toHaveLength(3);
  expect(JSON.stringify(cap.snapshot)).toBe(before);
  const note = cap.snapshot.records.find((r) => r.kind === "note")!;
  expect(themeRecordSearchText(note, cap.snapshot.entities)).toContain(
    "青の時代",
  );
});

it("keeps a period-only snapshot usable without inventing graph nodes, edges or text", () => {
  const snapshot = legacy().snapshot;
  snapshot.records = snapshot.records.filter((r) => r.kind !== "relation");
  const before = JSON.stringify(snapshot);
  const doc = themeDocument(snapshot);
  expect(
    [doc.nodes, doc.relations, doc.texts, doc.evidence].every(
      (a) => a.length === 0,
    ),
  ).toBe(true);
  expect(snapshot.records.find((r) => r.kind === "note")?.time?.kind).toBe(
    "calendar",
  );
  expect(JSON.stringify(snapshot)).toBe(before);
});

it("explicitly removes unchanged generated notes and descriptions while preserving the author's note and layout", () => {
  const cap = legacy(),
    before = JSON.stringify(cap);
  const result = themeGraphCleanup(cap);
  expect(result.changed).toBe(true);
  expect(result.removedTexts).toBe(2);
  expect(result.cleanedDescriptions).toBe(1);
  expect(result.removedEvidence).toBe(2);
  expect(result.document.texts.map((t) => t.text)).toEqual([
    "作者が図に残す注記・分離検証用",
  ]);
  expect(result.document.relations).toEqual(cap.document.relations);
  expect(result.document.nodes.map((n) => n.key)).toEqual(
    cap.document.nodes.map((n) => n.key),
  );
  for (const item of [...result.document.nodes, ...result.document.texts])
    expect(result.document.layout.positions[item.key]).toEqual(
      cap.document.layout.positions[item.key],
    );
  expect(result.sourceDocument.texts).toEqual([]);
  expect(JSON.stringify(cap)).toBe(before);
  expect(
    themeGraphCleanup({
      ...cap,
      document: result.document,
      sourceDocument: result.sourceDocument,
    }).changed,
  ).toBe(false);
});

it("preserves generated notes whose text, format or position was authored instead of guessing them disposable", () => {
  for (const edit of ["text", "font", "position"] as const) {
    const cap = legacy(),
      target = cap.document.texts[0];
    if (edit === "text") target.text += " 作者が補足";
    if (edit === "font") target.fontWeight = "bold";
    if (edit === "position") cap.document.layout.positions[target.key].x += 70;
    const result = themeGraphCleanup(cap);
    expect(result.removedTexts).toBe(1);
    expect(result.document.texts.find((t) => t.key === target.key)).toEqual(
      target,
    );
    expect(result.document.layout.positions[target.key]).toEqual(
      cap.document.layout.positions[target.key],
    );
  }
});

it("keeps authored descriptions, relationships, evidence edits and node framing", () => {
  const cap = legacy();
  const node = cap.document.nodes.find((n) => n.description)!;
  node.description = "作者が書いた対象の説明";
  node.title = "図の中の独自名";
  node.shape = "diamond";
  cap.document.layout.positions[node.key] = { x: 90, y: 120 };
  cap.document.relations[0].label = "作者の関係名";
  cap.document.evidence[0].note = "作者が追記した根拠";
  const result = themeGraphCleanup(cap);
  expect(result.document.nodes.find((n) => n.key === node.key)).toEqual(node);
  expect(result.document.relations).toEqual(cap.document.relations);
  expect(
    result.document.evidence.find(
      (e) => e.key === cap.document.evidence[0].key,
    ),
  ).toEqual(cap.document.evidence[0]);
  expect(result.document.layout.positions[node.key]).toEqual({ x: 90, y: 120 });
});

it("can identify the historical generated representation when sourceDocument was not yet saved", () => {
  const cap = legacy();
  delete cap.sourceDocument;
  const cleaned = themeGraphCleanup(cap);
  expect(cleaned.removedTexts).toBe(2);
  expect(cleaned.document.texts.map((t) => t.text)).toEqual([
    "作者が図に残す注記・分離検証用",
  ]);
});
