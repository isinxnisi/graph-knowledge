import { describe, expect, it } from "vitest";
import { capsuleLayoutSchema, capsuleTextSchema, type CapsuleDocument } from "../lib/domain/capsule-document";
import { capsuleGraphView } from "../lib/client/capsule-editor";
import { capsuleInsertionPoint } from "../lib/client/capsule-insertion";
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
});
