import cytoscape, { type Core } from "cytoscape";
import { afterEach, describe, expect, it } from "vitest";
import { createGraphMotion } from "../lib/client/graph-motion";

class Preference extends EventTarget {
  matches = false;
  reduce(value: boolean) { this.matches = value; this.dispatchEvent(new Event("change")); }
}
let cy: Core;
let motion: ReturnType<typeof createGraphMotion>;
function setup(preference: Preference | null = new Preference()) {
  cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: "preset" },
    elements: [{ data: { id: "a" }, position: { x: 100, y: 200 } }, { data: { id: "b" }, position: { x: 300, y: 250 } }],
    style: [{ selector: "node", style: { opacity: 0.9 } }],
  });
  motion = createGraphMotion(cy, preference);
  return cy.nodes();
}
afterEach(() => { motion?.dispose(); cy?.destroy(); });

describe("Graphの短い表示効果", () => {
  it("追加Nodeだけを表示し、完了時にstyleの上書きを外す", async () => {
    const nodes = setup();
    const position = nodes.map(node => ({ ...node.position() }));
    cy.zoom(1.3); cy.pan({ x: 50, y: 70 }); nodes.first().addClass("chosen");
    motion.reveal(nodes.first());
    expect(nodes.first().numericStyle("opacity")).toBe(0.72);
    expect(nodes.last().numericStyle("opacity")).toBe(0.9);
    await expect.poll(() => nodes.first().numericStyle("opacity")).toBe(0.9);
    expect(nodes.map(node => ({ ...node.position() }))).toEqual(position);
    expect(cy.zoom()).toBe(1.3); expect(cy.pan()).toEqual({ x: 50, y: 70 });
    expect(nodes.first().hasClass("chosen")).toBe(true);
  });
  it("reduced-motionと設定を読めない環境は演出しない", () => {
    const preference = new Preference(); preference.matches = true;
    const nodes = setup(preference); motion.reveal(nodes);
    expect(nodes.map(node => node.numericStyle("opacity"))).toEqual([0.9, 0.9]);
    motion.dispose(); motion = createGraphMotion(cy, null); motion.reveal(nodes);
    expect(nodes.map(node => node.numericStyle("opacity"))).toEqual([0.9, 0.9]);
  });
  it("途中でreduced-motionへ変更したら即時確定し、解除後は再び使える", () => {
    const preference = new Preference(), nodes = setup(preference);
    motion.reveal(nodes); preference.reduce(true);
    expect(nodes.map(node => node.numericStyle("opacity"))).toEqual([0.9, 0.9]);
    expect(nodes.first().animated()).toBe(false);
    preference.reduce(false); motion.reveal(nodes);
    expect(nodes.first().numericStyle("opacity")).toBe(0.72);
  });
  it("閉鎖で消えたNodeに効果を残さず、再表示のstyleを汚さない", () => {
    const nodes = setup(); motion.reveal(nodes);
    const removed = nodes.first().remove();
    expect(removed.animated()).toBe(false);
    expect(removed.numericStyle("opacity")).toBe(0.9);
    removed.restore();
    expect(removed.numericStyle("opacity")).toBe(0.9);
    expect(cy.nodes()).toHaveLength(2);
  });
  it("世代変更・破棄で全効果を確定し、設定監視も外す", () => {
    const preference = new Preference(), nodes = setup(preference);
    motion.reveal(nodes); motion.settle();
    expect(nodes.map(node => node.numericStyle("opacity"))).toEqual([0.9, 0.9]);
    motion.reveal(nodes); motion.dispose();
    nodes.style("opacity", 0.8); preference.reduce(true);
    expect(nodes.first().numericStyle("opacity")).toBe(0.8);
  });
});
