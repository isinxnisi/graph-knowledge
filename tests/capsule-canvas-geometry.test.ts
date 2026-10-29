import { describe, expect, it } from "vitest";
import { capsuleLayoutSchema, capsuleTextSchema } from "../lib/domain/capsule-document";
import { capsuleGraphView } from "../lib/client/capsule-editor";
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
