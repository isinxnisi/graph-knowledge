import type { Core, EventObject, NodeCollection, NodeSingular } from "cytoscape";

export const GRAPH_REVEAL_MS = 180;
type Preference = Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;

// 表示だけの一時効果。座標・探索state・クリック判定・snapshotには触れない。
export function createGraphMotion(cy: Core, preference: Preference | null) {
  const active = new Set<NodeSingular>();
  const finish = (node: NodeSingular) => {
    node.stop(true, false).removeStyle("opacity");
    active.delete(node);
  };
  const settle = () => { [...active].forEach(finish); };
  const onPreference = () => { if (preference?.matches) settle(); };
  const onRemove = (event: EventObject) => {
    if (active.has(event.target)) finish(event.target);
  };
  preference?.addEventListener("change", onPreference);
  cy.on("remove", "node", onRemove);
  return {
    reveal(nodes: NodeCollection) {
      // 設定を取得できない環境も静的表示へ。復帰・閉鎖の正確さを演出より優先する。
      if (!preference || preference.matches) return;
      nodes.forEach(node => {
        if (active.has(node)) finish(node);
        active.add(node);
        node.style("opacity", 0.72).animate({ style: { opacity: 1 } }, {
          duration: GRAPH_REVEAL_MS, queue: false,
          complete: () => { node.removeStyle("opacity"); active.delete(node); },
        });
      });
    },
    settle,
    dispose() {
      preference?.removeEventListener("change", onPreference);
      cy.off("remove", "node", onRemove);
      settle();
    },
  };
}
