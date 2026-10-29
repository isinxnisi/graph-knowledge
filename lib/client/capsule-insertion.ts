import type { CapsuleDocument, CapsuleNode, CapsuleText } from "../domain/capsule-document";
import { capsuleNodeShapeLayout } from "./capsule-node-layout";
import { capsulePresentation } from "./capsule-presentation";
import { CAPSULE_TEXT_FONT, capsuleTextFormat, capsuleTextLayout, type CanvasTextFormat } from "./capsule-text-layout";
import { edgeRoutes } from "./graph-presentation";
import { viewportCenter, type GraphView } from "./graph-view";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
type NodeContent = Pick<CapsuleNode, "title" | "badge" | "shape">;
type TextContent = Pick<CapsuleText, "text" | "style" | "width" | "fontSize" | "fontWeight" | "align">;
let measurement: CanvasRenderingContext2D | null = null;
function textLayout(text: string, style?: string, format: CanvasTextFormat = {}, node = false) {
  if (!measurement && typeof CanvasRenderingContext2D !== "undefined") measurement = globalThis.document.createElement("canvas").getContext("2d");
  const resolved = capsuleTextFormat(style, format), context = measurement;
  if (context) context.font = `${node ? 600 : resolved.fontWeight === "bold" ? 700 : 400} ${resolved.fontSize}px ${CAPSULE_TEXT_FONT}`;
  return capsuleTextLayout(text, style, format, context ? value => context.measureText(value).width : undefined);
}
function nodeSize(node: NodeContent) {
  const label = textLayout(node.title, "note", { width: 128, fontSize: 15 }, true);
  const shape = capsuleNodeShapeLayout(node.shape, label.labelWidth, Math.min(4, label.lines.length));
  const badge = node.badge ? 24 : 0;
  return { width: shape.shapeWidth + 24, height: shape.shapeHeight + badge + 24, offsetY: badge / 2 };
}
function textSize(text: TextContent) {
  const layout = textLayout(text.text, text.style, text);
  return { width: layout.width + 24, height: layout.height + 24, offsetY: 0 };
}
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
export function capsuleInsertionPoint(document: CapsuleDocument, view: GraphView, kind: "node" | "text", options: { anchorKey?: string; explicit?: Point; locale?: string; node?: NodeContent; text?: TextContent } = {}): Point {
  if (options.explicit) return { ...options.explicit };
  const center = view.center ?? (view.viewport ? viewportCenter(view.pan, view.zoom, view.viewport) : { x: 0, y: 0 });
  const anchor = options.anchorKey ? view.positions[options.anchorKey] : undefined;
  // Final form content determines the footprint. Defaults remain available for
  // callers without content, but creation evaluates the authored size on Apply.
  const size = kind === "text" ? options.text ? textSize(options.text) : { width: 280, height: 132, offsetY: 0 }
    : options.node ? nodeSize(options.node) : { width: 140, height: 112, offsetY: 0 };
  const anchorNode = kind === "node" && anchor ? document.nodes.find(node => node.key === options.anchorKey) : undefined;
  const anchorSize = anchorNode ? nodeSize(anchorNode) : null;
  // A new custom Entity also creates a local connector. Reserve the label and
  // its left-hand badge between both endpoint bodies, not merely empty space
  // for the new node. Text annotations and text anchors do not create edges.
  const relationText = textLayout(options.locale === "en" ? "Related" : "関係する", "note", { width: 185, fontSize: 14 });
  const relationBadgeWidth = Math.min(100, [...(options.locale === "en" ? "Capsule" : "独自")].length * 14 + 16);
  const connector = { width: relationText.labelWidth + relationBadgeWidth + 24, height: relationText.height + 16, offsetX: -relationBadgeWidth / 2 };
  const connectorDistance = (dx: number, dy: number) => {
    if (!anchorSize) return 0;
    const length = Math.hypot(dx, dy) || 1, x = Math.abs(dx / length), y = Math.abs(dy / length);
    const endpoint = Math.max(anchorSize.width * x / 2 + (anchorSize.height / 2 + anchorSize.offsetY) * y,
      size.width * x / 2 + (size.height / 2 + size.offsetY) * y);
    return Math.ceil(2 * (endpoint + connector.width * x / 2 + connector.height * y / 2 + Math.abs(connector.offsetX) * x + 12));
  };
  const preferred = anchor ? { x: anchor.x + Math.max(200, connectorDistance(1, 0)), y: anchor.y } : center;
  const viewport = view.viewport ?? { width: 900, height: 600 };
  const frame = { ...center, width: viewport.width / view.zoom, height: viewport.height / view.zoom };
  const marginX = Math.min(24, viewport.width * .04) / view.zoom, marginY = Math.min(56, viewport.height * .12) / view.zoom;
  const extent = { x: Math.max(0, (frame.width - size.width) / 2 - marginX), y: Math.max(0, (frame.height - size.height) / 2 - marginY) };
  const boxes: Box[] = [], labels: Box[] = [];
  for (const node of document.nodes) {
    const point = view.positions[node.key]; if (!point) continue;
    const size = nodeSize(node);
    boxes.push({ ...size, x: point.x, y: point.y + size.offsetY });
  }
  for (const text of document.texts) {
    const point = view.positions[text.key]; if (!point) continue;
    boxes.push({ ...point, ...textSize(text) });
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
    const text = textLayout(relation.canvasLabel, "note", { width: 185, fontSize: 14 });
    const badgeWidth = relation.badge ? Math.min(100, [...relation.badge].length * 14 + 16) : 0;
    labels.push({ x: path[8].x - badgeWidth / 2, y: path[8].y + route.labelOffset, width: Math.min(165, text.labelWidth) + badgeWidth + 24, height: text.height + 16 });
  }
  const candidates: Point[] = [preferred, center];
  // Search all directions and the visible area, rather than repeatedly moving
  // downward. The grid is bounded even at low zoom or with a large document.
  for (const radius of [180, 270, 380]) for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6, origin = anchor ?? center;
    const x = Math.cos(angle), y = Math.sin(angle), distance = Math.max(radius, connectorDistance(x, y));
    candidates.push({ x: origin.x + x * distance, y: origin.y + y * distance });
  }
  for (let row = 0; row <= 10; row++) for (let column = 0; column <= 12; column++) candidates.push({
    x: center.x - extent.x + extent.x * column / 6, y: center.y - size.offsetY - extent.y + extent.y * row / 5,
  });
  const ranked = candidates.map(point => {
    const bounds = { ...size, x: point.x, y: point.y + size.offsetY };
    const body = boxes.reduce((sum, box) => sum + overlap(bounds, box), 0), label = labels.reduce((sum, box) => sum + overlap(bounds, box), 0);
    const lines = paths.filter(path => path.some((to, index) => index > 0 && crosses(path[index - 1], to, bounds))).length;
    const connectorBox = anchorSize && anchor ? { ...connector, x: (anchor.x + point.x) / 2 + connector.offsetX, y: (anchor.y + point.y) / 2 } : null;
    const connectorOverlap = connectorBox ? [...boxes, ...labels, bounds].reduce((sum, box) => sum + overlap(connectorBox, box), 0) : 0;
    const tooClose = anchorSize && anchor ? Math.max(0, connectorDistance(point.x - anchor.x, point.y - anchor.y) - Math.hypot(point.x - anchor.x, point.y - anchor.y)) : 0;
    const outside = Math.max(0, Math.abs(bounds.x - center.x) - extent.x) + Math.max(0, Math.abs(bounds.y - center.y) - extent.y);
    const clear = body === 0 && label === 0 && lines === 0 && connectorOverlap === 0;
    return { point, rank: clear ? outside === 0 ? 0 : 1 : outside === 0 ? 2 : 3,
      score: body * 10 + (label + connectorOverlap) * 5 + tooClose * 200 + lines * 5000 + outside * 20 + Math.hypot(point.x - preferred.x, point.y - preferred.y) + Math.hypot(point.x - center.x, point.y - center.y) * .12 };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.score - b.score);
  return { ...ranked[0].point };
}
