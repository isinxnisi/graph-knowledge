import { describe, expect, it } from "vitest";
import { capsuleLayoutSchema, capsuleTextSchema, type CapsuleDocument } from "../lib/domain/capsule-document";
import { capsuleGraphView } from "../lib/client/capsule-editor";
import { capsuleInsertionPoint } from "../lib/client/capsule-insertion";
import { capsuleNodeShapeLayout } from "../lib/client/capsule-node-layout";
import { capsuleTextFormat, capsuleTextLayout } from "../lib/client/capsule-text-layout";
import { restorationPan, viewportCenter } from "../lib/client/graph-view";

describe("Capsule viewport identity", () => {
  it("preserves authored center and zoom across wide creation and narrow re-entry without fitting", () => {
    const original = { width: 1200, height: 700 }, next = { width: 480, height: 560 };
    const view = { positions: {}, pan: { x: -150, y: 240 }, zoom: 0.8, viewport: original, center: viewportCenter({ x: -150, y: 240 }, 0.8, original) };
    const pan = restorationPan(view, next);
    expect(pan).not.toEqual(view.pan);
    expect(viewportCenter(pan, view.zoom, next)).toEqual(view.center);
    expect(restorationPan({ ...view, pan, viewport: next }, original)).toEqual(view.pan);
  });
  it("uses saved center even when it deliberately targets empty space and retains legacy scale", () => {
    const id = crypto.randomUUID(), positions = { [id]: { x: 150, y: 250 } };
    const current = capsuleGraphView({ positions, pan: { x: 900, y: 700 }, zoom: 1.3, center: { x: -500, y: -700 } });
    expect(current.center).toEqual({ x: -500, y: -700 });
    const legacy = capsuleGraphView({ positions, pan: { x: 900, y: 700 }, zoom: 1.3 });
    expect(legacy.center).toEqual(positions[id]); expect(legacy.zoom).toBe(1.3); expect(legacy.positions).toEqual(positions);
  });
  it("accepts optional viewport metadata without rewriting existing layout payloads", () => {
    const layout = { positions: {}, pan: { x: 1, y: 2 }, zoom: 0.75 };
    expect(capsuleLayoutSchema.parse(layout)).toEqual(layout);
    expect(capsuleLayoutSchema.safeParse({ ...layout, viewport: { width: 0, height: 500 } }).success).toBe(false);
  });
});

describe("Text layout and its selectable rectangle", () => {
  const measure = (text: string) => [...text].length * 12;
  it("wraps CJK, long unbroken text, newlines and blank lines without truncating content", () => {
    const text = "あいうえおかきくけこ\n\nlongunbrokentext";
    const layout = capsuleTextLayout(text, "note", { width: 96, fontSize: 20 }, measure);
    expect(layout.lines).toContain("");
    expect(layout.lines.every(line => measure(line) <= 76)).toBe(true);
    expect(layout.label.replaceAll("\n", "")).toBe(text.replaceAll("\n", ""));
    expect(layout.height).toBe(layout.lines.length * 20 * 1.35 + 20);
  });
  it("uses the same width and font in wrapping, bounds, and left/center/right alignment", () => {
    const left = capsuleTextLayout("短文", "heading", { width: 360, fontSize: 32, fontWeight: "normal", align: "left" }, measure);
    const right = capsuleTextLayout("短文", "heading", { width: 360, fontSize: 32, align: "right" }, measure);
    expect(left.fontSize).toBe(32); expect(left.fontWeight).toBe("normal"); expect(left.width).toBe(360);
    expect(left.textMarginX + left.width / 2 - left.labelWidth / 2).toBe(left.padding);
    expect(right.textMarginX + right.labelWidth / 2).toBe(right.width / 2 - right.padding);
    expect(capsuleTextLayout("短文", "note", { align: "center" }, measure).textMarginX).toBe(0);
  });
  it("round trips new typography while preserving old optional-field absence", () => {
    const old = { key: crypto.randomUUID(), text: "見出し", style: "heading" as const };
    expect(capsuleTextSchema.parse(old)).toEqual(old); expect(capsuleTextFormat(old.style)).toMatchObject({ fontSize: 24, fontWeight: "bold" });
    const formatted = { ...old, width: 420, fontSize: 28, fontWeight: "normal", align: "right" };
    expect(capsuleTextSchema.parse(JSON.parse(JSON.stringify(formatted)))).toEqual(formatted);
    expect(capsuleTextSchema.safeParse({ ...old, width: 8 }).success).toBe(false);
  });
});

describe("New items occupy visible free space without rearranging the graph", () => {
  function document(points: { x: number; y: number }[]): CapsuleDocument {
    const nodes = points.map((_, index) => ({ key: crypto.randomUUID(), title: `Entity ${index}`, description: "", badge: "", origin: { kind: "local" as const } }));
    return { schemaVersion: 1, nodes, relations: [], texts: [], evidence: [], unresolvedClaimIds: [], layout: {
      positions: Object.fromEntries(nodes.map((node, index) => [node.key, points[index]])), pan: { x: 500, y: 300 }, zoom: 1, center: { x: 0, y: 0 }, viewport: { width: 1000, height: 600 },
    } };
  }
  function withinView(point: { x: number; y: number }, doc: CapsuleDocument, width: number, height: number) {
    const { center, viewport, zoom } = doc.layout;
    expect(Math.abs(point.x - center!.x) + width / 2).toBeLessThan(viewport!.width / zoom / 2);
    expect(Math.abs(point.y - center!.y) + height / 2).toBeLessThan(viewport!.height / zoom / 2);
  }
  it("avoids an existing relation and its central label even when no node is near the viewport center", () => {
    const doc = document([{ x: 0, y: -180 }, { x: 0, y: 180 }]);
    doc.relations.push({ key: crypto.randomUUID(), source: doc.nodes[0].key, target: doc.nodes[1].key, label: "制作に関わる", note: "", origin: { kind: "local" } });
    const before = structuredClone(doc), point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "node");
    // A vertical line occupies x=0. Its short centered label and left badge
    // occupy roughly x=-98..54; either side or above/below that box is valid.
    expect(Math.abs(point.x)).toBeGreaterThan(70);
    expect(Math.abs(point.x + 22) >= 146 || Math.abs(point.y) >= 84).toBe(true);
    withinView(point, doc, 140, 112); expect(doc).toEqual(before);
  });
  it("avoids a diagonal relation away from its label, not just the midpoint", () => {
    const doc = document([{ x: -420, y: -210 }, { x: 420, y: 210 }]);
    doc.layout.center = { x: 210, y: 105 }; doc.layout.pan = { x: 290, y: 195 };
    doc.relations.push({ key: crypto.randomUUID(), source: doc.nodes[0].key, target: doc.nodes[1].key, label: "Related", note: "", origin: { kind: "local" } });
    const point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "node");
    // The full new rectangle must be clear of y=x/2, including its corners.
    expect(Math.abs(point.y - point.x / 2)).toBeGreaterThan(56 + 70 / 2);
    withinView(point, doc, 140, 112);
  });
  it("uses the existing annotation's width and wrapped height when placing another text", () => {
    const doc = document([]), key = crypto.randomUUID(), text = "A wide annotation\nwith several lines\nthat should remain readable";
    doc.texts.push({ key, text, style: "note", width: 520, fontSize: 24 }); doc.layout.positions[key] = { x: 0, y: 0 };
    const existing = capsuleTextLayout(text, "note", doc.texts[0]), point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "text");
    expect(Math.abs(point.x) >= (existing.width + 24 + 280) / 2 || Math.abs(point.y) >= (existing.height + 24 + 132) / 2).toBe(true);
    withinView(point, doc, 280, 132);
  });
  it("prefers visible space to the right-of-anchor default when the selected entity is near the right edge", () => {
    const doc = document([{ x: 380, y: 0 }]), before = structuredClone(doc.layout);
    const point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "node", { anchorKey: doc.nodes[0].key });
    expect(Math.abs(point.x - 380) >= 140 || Math.abs(point.y) >= 100).toBe(true);
    withinView(point, doc, 140, 112); expect(doc.layout).toEqual(before);
  });
  it("honors graph-space center and zoom rather than placing a toolbar annotation near the bottom or origin", () => {
    const doc = document([]); doc.layout.center = { x: 900, y: -300 }; doc.layout.zoom = .5;
    doc.layout.pan = { x: 50, y: 450 }; doc.layout.viewport = { width: 1000, height: 600 };
    expect(capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "text")).toEqual({ x: 900, y: -300 });
  });
  it("honors an explicit background placement even when it overlaps something or is outside the viewport", () => {
    const doc = document([{ x: 10, y: 20 }]), view = capsuleGraphView(doc.layout);
    expect(capsuleInsertionPoint(doc, view, "node", { explicit: { x: 10, y: 20 } })).toEqual({ x: 10, y: 20 });
    expect(capsuleInsertionPoint(doc, view, "text", { explicit: { x: 1200, y: -500 } })).toEqual({ x: 1200, y: -500 });
  });
  it.each(["circle", "diamond"] as const)("avoids the actual %s footprint of a long existing Entity, including its badge", shape => {
    const doc = document([{ x: 0, y: 0 }]);
    Object.assign(doc.nodes[0], { title: "あいうえおかき".repeat(4), shape, badge: "考察" });
    doc.layout.center = { x: 145, y: 0 }; doc.layout.pan = { x: 355, y: 300 };
    const before = structuredClone(doc), label = capsuleTextLayout(doc.nodes[0].title, "note", { width: 128, fontSize: 15 });
    const drawn = capsuleNodeShapeLayout(shape, label.labelWidth, Math.min(4, label.lines.length));
    const point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "node");
    expect(Math.abs(point.x) >= (drawn.shapeWidth + 24 + 140) / 2 || Math.abs(point.y - 12) >= (drawn.shapeHeight + 48 + 112) / 2).toBe(true);
    withinView(point, doc, 140, 112); expect(doc).toEqual(before);
  });
  it.each(["circle", "diamond"] as const)("uses the final new %s dimensions instead of a provisional short-rectangle position", shape => {
    const doc = document([{ x: 0, y: 0 }]); doc.nodes[0].title = "Base";
    doc.layout.center = { x: 145, y: 0 }; doc.layout.pan = { x: 355, y: 300 };
    const view = capsuleGraphView(doc.layout), before = structuredClone(view), incoming = { title: "あいうえおかき".repeat(4), shape, badge: "追加" };
    const provisional = capsuleInsertionPoint(doc, view, "node"); expect(provisional).toEqual(doc.layout.center);
    const point = capsuleInsertionPoint(doc, view, "node", { node: incoming });
    const label = capsuleTextLayout(incoming.title, "note", { width: 128, fontSize: 15 }), drawn = capsuleNodeShapeLayout(shape, label.labelWidth, 4);
    expect(point).not.toEqual(provisional);
    expect(Math.abs(point.x) >= (140 + drawn.shapeWidth + 24) / 2 || Math.abs(point.y + 12) >= (88 + drawn.shapeHeight + 48) / 2).toBe(true);
    withinView({ x: point.x, y: point.y + 12 }, doc, drawn.shapeWidth + 24, drawn.shapeHeight + 48);
    expect(view).toEqual(before);
  });
  it("reconsiders the final annotation's width, font size and multiline height before inserting", () => {
    const doc = document([{ x: 0, y: 0 }]); doc.nodes[0].title = "Base";
    doc.layout.center = { x: 240, y: 0 }; doc.layout.pan = { x: 260, y: 300 };
    const text = { text: "A wide title\nA second line\nA third line", style: "heading" as const, width: 520, fontSize: 28, fontWeight: "bold" as const, align: "left" as const };
    const view = capsuleGraphView(doc.layout), before = structuredClone(doc), layout = capsuleTextLayout(text.text, text.style, text);
    expect(capsuleInsertionPoint(doc, view, "text")).toEqual(doc.layout.center);
    const point = capsuleInsertionPoint(doc, view, "text", { text });
    expect(Math.abs(point.x) >= (140 + layout.width + 24) / 2 || Math.abs(point.y) >= (88 + layout.height + 24) / 2).toBe(true);
    withinView(point, doc, layout.width + 24, layout.height + 24); expect(doc).toEqual(before);
  });
  it("preserves explicit background placement after choosing a large shape or long annotation", () => {
    const doc = document([{ x: 0, y: 0 }]), view = capsuleGraphView(doc.layout), explicit = { x: 10, y: 20 };
    expect(capsuleInsertionPoint(doc, view, "node", { explicit, node: { title: "長い名前".repeat(20), badge: "分類", shape: "diamond" } })).toEqual(explicit);
    expect(capsuleInsertionPoint(doc, view, "text", { explicit, text: { text: "長い注釈\n".repeat(20), style: "heading", width: 700, fontSize: 48 } })).toEqual(explicit);
  });
  it("leaves room for the new local connector label and chip between PLUTO and an added circle", () => {
    const doc = document([{ x: 0, y: 0 }]); doc.nodes[0].title = "PLUTO";
    const before = structuredClone(doc), incoming = { title: "作者の視点", shape: "circle" as const, badge: "" };
    const point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "node", { anchorKey: doc.nodes[0].key, node: incoming });
    // The Japanese label + left-side local chip occupy midpoint −84..+40.
    // A 200px center distance covers PLUTO; leave its padded right edge clear.
    expect(point.y).toBe(0); expect(point.x / 2 - 84).toBeGreaterThanOrEqual(70);
    expect(point.x / 2 + 40).toBeLessThanOrEqual(point.x - 66);
    withinView(point, doc, 132, 132); expect(doc).toEqual(before);
  });
  it.each(["ja", "en"])("keeps both endpoints and the connector readable when a large anchored Entity is near the viewport edge (%s)", locale => {
    const doc = document([{ x: 340, y: 0 }]); Object.assign(doc.nodes[0], { title: "あいうえおかき".repeat(4), shape: "diamond", badge: "分類" });
    const incoming = { title: "作者の視点", shape: "circle" as const, badge: "" }, before = structuredClone(doc), anchor = doc.layout.positions[doc.nodes[0].key];
    const point = capsuleInsertionPoint(doc, capsuleGraphView(doc.layout), "node", { anchorKey: doc.nodes[0].key, node: incoming, locale });
    const label = capsuleTextLayout(locale === "en" ? "Related" : "関係する", "note", { width: 185, fontSize: 14 });
    const chipWidth = locale === "en" ? 100 : 44, width = label.labelWidth + chipWidth + 24, height = label.height + 16;
    const center = { x: (anchor.x + point.x) / 2 - chipWidth / 2, y: (anchor.y + point.y) / 2 };
    // The source is a 234×184 diamond with a badge below; the destination is
    // a 108px circle. Assert each whole padded body is separate from the label.
    expect(Math.abs(center.x - anchor.x) >= (width + 258) / 2 || Math.abs(center.y - 12) >= (height + 232) / 2).toBe(true);
    expect(Math.abs(center.x - point.x) >= (width + 132) / 2 || Math.abs(center.y - point.y) >= (height + 132) / 2).toBe(true);
    withinView(point, doc, 132, 132); expect(doc).toEqual(before);
  });
  it("does not invent a connector gap for annotations, and never moves an explicit anchored insertion", () => {
    const doc = document([{ x: 0, y: 0 }]), view = capsuleGraphView(doc.layout), key = doc.nodes[0].key;
    const annotation = { text: "注釈", style: "note" as const, width: 96, fontSize: 16 };
    expect(capsuleInsertionPoint(doc, view, "text", { anchorKey: key, text: annotation })).toEqual({ x: 200, y: 0 });
    const explicit = { x: 150, y: 0 };
    expect(capsuleInsertionPoint(doc, view, "node", { anchorKey: key, explicit, node: { title: "作者の視点", shape: "circle", badge: "" } })).toEqual(explicit);
  });
});
