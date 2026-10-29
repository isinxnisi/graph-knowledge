import type { CapsuleDocument } from "../domain/capsule-document";
import { capsulePresentation } from "./capsule-presentation";
import { capsuleTextLayout } from "./capsule-text-layout";
import { edgeRoutes } from "./graph-presentation";
import { viewportCenter, type GraphView } from "./graph-view";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
const overlap = (a: Box, b: Box) => Math.max(0, (a.width + b.width) / 2 - Math.abs(a.x - b.x))
  * Math.max(0, (a.height + b.height) / 2 - Math.abs(a.y - b.y));
function crosses(from: Point, to: Point, box: Box) {
  let start = 0, end = 1;
  for (const axis of ["x", "y"] as const) {
    const half = (axis === "x" ? box.width : box.height) / 2, delta = to[axis] - from[axis];
    if (Math.abs(delta) < .0001) { if (Math.abs(from[axis] - box[axis]) > half) return false; continue; }
    const first = (box[axis] - half - from[axis]) / delta, last = (box[axis] + half - from[axis]) / delta;
    start = Math.max(start, Math.min(first, last)); end = Math.min(end, Math.max(first, last));
    if (start > end) return false;
  }
  return true;
}

// Only choose the new item's center. Existing positions and the viewport remain
// untouched. An explicit background click always wins over automatic placement.
export function capsuleInsertionPoint(document: CapsuleDocument, view: GraphView, kind: "node" | "text", options: { anchorKey?: string; explicit?: Point; locale?: string } = {}): Point {
  if (options.explicit) return { ...options.explicit };
  const center = view.center ?? (view.viewport ? viewportCenter(view.pan, view.zoom, view.viewport) : { x: 0, y: 0 });
  const anchor = options.anchorKey ? view.positions[options.anchorKey] : undefined;
  const preferred = anchor ? { x: anchor.x + 200, y: anchor.y } : center;
  // Reserve room for a short title or several lines of annotation, not only its
  // anchor point. The editor can subsequently make a text item arbitrarily tall.
  const size = kind === "text" ? { width: 280, height: 132 } : { width: 140, height: 112 };
  const viewport = view.viewport ?? { width: 900, height: 600 };
  const frame = { ...center, width: viewport.width / view.zoom, height: viewport.height / view.zoom };
  const marginX = Math.min(24, viewport.width * .04) / view.zoom, marginY = Math.min(56, viewport.height * .12) / view.zoom;
  const extent = { x: Math.max(0, (frame.width - size.width) / 2 - marginX), y: Math.max(0, (frame.height - size.height) / 2 - marginY) };
  const boxes: Box[] = [], labels: Box[] = [];
  for (const node of document.nodes) {
    const point = view.positions[node.key]; if (!point) continue;
    const lines = capsuleTextLayout(node.title, "note", { width: 128, fontSize: 15 }).lines.length;
    const badge = node.badge ? 24 : 0;
    boxes.push({ x: point.x, y: point.y + badge / 2, width: 140, height: Math.max(64, Math.min(4, lines) * 20 + 20) + badge + 24 });
  }
  for (const text of document.texts) {
    const point = view.positions[text.key]; if (!point) continue;
    const layout = capsuleTextLayout(text.text, text.style, text);
    boxes.push({ ...point, width: layout.width + 24, height: layout.height + 24 });
  }
  const relations = capsulePresentation(document, options.locale ?? "ja").relations, routes = edgeRoutes(relations, view.positions);
  const paths: Point[][] = [];
  for (const relation of Object.values(relations)) {
    const from = view.positions[relation.subjectId], to = view.positions[relation.objectId]; if (!from || !to) continue;
    const route = routes[relation.id], dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
    const control = { x: (from.x + to.x) / 2 - dy / length * route.distance, y: (from.y + to.y) / 2 + dx / length * route.distance };
    const path = Array.from({ length: 17 }, (_, index) => {
      const t = index / 16, s = 1 - t;
      return { x: s * s * from.x + 2 * s * t * control.x + t * t * to.x, y: s * s * from.y + 2 * s * t * control.y + t * t * to.y };
    });
    paths.push(path);
    const text = capsuleTextLayout(relation.canvasLabel, "note", { width: 185, fontSize: 14 });
    const badgeWidth = relation.badge ? Math.min(100, [...relation.badge].length * 14 + 16) : 0;
    labels.push({ x: path[8].x - badgeWidth / 2, y: path[8].y + route.labelOffset, width: Math.min(165, text.labelWidth) + badgeWidth + 24, height: text.height + 16 });
  }
  const candidates: Point[] = [preferred, center];
  // Search all directions and the visible area, rather than repeatedly moving
  // downward. The grid is bounded even at low zoom or with a large document.
  for (const radius of [180, 270, 380]) for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6, origin = anchor ?? center;
    candidates.push({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
  }
  for (let row = 0; row <= 10; row++) for (let column = 0; column <= 12; column++) candidates.push({
    x: center.x - extent.x + extent.x * column / 6, y: center.y - extent.y + extent.y * row / 5,
  });
  const ranked = candidates.map(point => {
    const bounds = { ...point, ...size };
    const body = boxes.reduce((sum, box) => sum + overlap(bounds, box), 0), label = labels.reduce((sum, box) => sum + overlap(bounds, box), 0);
    const lines = paths.filter(path => path.some((to, index) => index > 0 && crosses(path[index - 1], to, bounds))).length;
    const outside = Math.max(0, Math.abs(point.x - center.x) - extent.x) + Math.max(0, Math.abs(point.y - center.y) - extent.y);
    const clear = body === 0 && label === 0 && lines === 0;
    return { point, rank: clear ? outside === 0 ? 0 : 1 : outside === 0 ? 2 : 3,
      score: body * 10 + label * 5 + lines * 5000 + outside * 20 + Math.hypot(point.x - preferred.x, point.y - preferred.y) + Math.hypot(point.x - center.x, point.y - center.y) * .12 };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.score - b.score);
  return { ...ranked[0].point };
}
