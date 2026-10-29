import type { Core } from "cytoscape";

// 小さいカテゴリpatchだけDOMで描画する。主ラベル・線・矢印はCytoscapeに任せる。
export function attachGraphBadges(cy: Core, layer: HTMLElement, className: string, select: (id: string, event: MouseEvent) => void, nodeClassName?: string, contextMenu?: (id: string, event: MouseEvent) => void) {
  const badges = new Map<string, HTMLButtonElement>();
  const nodeBadges = new Map<string, HTMLSpanElement>();
  const update = () => {
    if (cy.destroyed()) return;
    const visible = new Set<string>(), zoom = cy.zoom(), pan = cy.pan();
    cy.edges().forEach(edge => {
      const category = edge.data("badge") as string;
      if (!category || !edge.visible()) return;
      const box = edge.boundingBox({ includeNodes: false, includeEdges: false, includeLabels: true });
      if (!Number.isFinite(box.x1) || !Number.isFinite(box.y1)) return;
      visible.add(edge.id());
      let badge = badges.get(edge.id());
      if (!badge) {
        badge = document.createElement("button");
        badge.type = "button"; badge.tabIndex = -1; badge.className = className;
        badge.dataset.relationId = edge.id();
        badge.addEventListener("mousedown", event => event.stopPropagation());
        badge.addEventListener("touchstart", event => event.stopPropagation());
        badge.addEventListener("click", event => { event.stopPropagation(); select(edge.id(), event); });
        badge.addEventListener("contextmenu", event => { if (contextMenu) { event.preventDefault(); event.stopPropagation(); contextMenu(edge.id(), event); } });
        layer.appendChild(badge); badges.set(edge.id(), badge);
      }
      badge.textContent = category;
      badge.dataset.selected = String(edge.hasClass("chosen"));
      // 主ラベルの左、最初の行に揃える。拡大縮小・pan・Node移動にも追随する。
      badge.style.left = `${(box.x1 - 3) * zoom + pan.x}px`;
      // labelのboundsには背景paddingとCytoscapeの計測誤差用2pxが含まれる。
      const labelPadding = edge.numericStyle("text-background-padding") + 2;
      badge.style.top = `${(box.y1 + labelPadding + edge.numericStyle("font-size") / 2) * zoom + pan.y}px`;
      badge.style.transform = `translate(-100%, -50%) scale(${zoom})`;
    });
    badges.forEach((badge, id) => { if (!visible.has(id)) { badge.remove(); badges.delete(id); } });
    const visibleNodes = new Set<string>();
    if (nodeClassName) cy.nodes().forEach(node => {
      const category = node.data("badge") as string | undefined;
      if (!category || !node.visible()) return;
      visibleNodes.add(node.id());
      let badge = nodeBadges.get(node.id());
      if (!badge) { badge = document.createElement("span"); badge.className = nodeClassName; badge.dataset.nodeId = node.id(); layer.appendChild(badge); nodeBadges.set(node.id(), badge); }
      badge.textContent = category; badge.title = category; badge.dataset.selected = String(node.hasClass("chosen"));
      const position = node.renderedPosition();
      badge.style.left = `${position.x}px`;
      badge.style.top = `${position.y + node.outerHeight() * zoom / 2 + 4 * zoom}px`;
      badge.style.transform = `translate(-50%, 0) scale(${zoom})`;
    });
    nodeBadges.forEach((badge, id) => { if (!visibleNodes.has(id)) { badge.remove(); nodeBadges.delete(id); } });
  };
  cy.on("render", update);
  return () => { cy.off("render", update); badges.forEach(badge => badge.remove()); badges.clear(); nodeBadges.forEach(badge => badge.remove()); nodeBadges.clear(); };
}
