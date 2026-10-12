import type { DisplayRelation } from "./graph-presentation";

export type Point = { x: number; y: number };
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 縦に長い十字配置を避け、横書きラベルの余白を確保する。
export function initialPositions(centerId: string, ids: string[], canvasHeight = 600, portrait = false): Record<string, Point> {
  const result: Record<string, Point> = { [centerId]: { x: 0, y: 0 } };
  const verticalRadius = Math.min(220, Math.max(155, (canvasHeight - 80) / 2));
  const rx = Math.max(verticalRadius < 180 ? 360 : 300, ids.length * 42);
  const ry = Math.max(verticalRadius, ids.length * 28);
  ids.forEach((id, index) => {
    const angle = -Math.PI / 4 + index * 2 * Math.PI / ids.length;
    const point = { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry };
    result[id] = portrait ? { x: point.y, y: point.x } : point;
  });
  return result;
}

// 既存Nodeを固定し、新規Nodeだけを近傍の候補へ配置する。
// 有限の候補評価に留め、全体の反復レイアウトやデータ固有の配置を行わない。
export function additionalPositions(existing: Record<string, Point>, ids: string[], relations: Record<string, DisplayRelation>, anchorId: string | null): Record<string, Point> {
  const positions = { ...existing };
  const edges = Object.values(relations);
  for (const id of ids) {
    const neighborIds = [...new Set(edges.flatMap((edge) => edge.subjectId === id ? [edge.objectId] : edge.objectId === id ? [edge.subjectId] : []))].filter((other) => positions[other]);
    const neighbors = neighborIds.map((other) => positions[other]);
    const origin = neighbors.length ? neighbors.reduce((sum, point) => ({ x: sum.x + point.x / neighbors.length, y: sum.y + point.y / neighbors.length }), { x: 0, y: 0 }) : positions[anchorId ?? ""] ?? { x: 0, y: 0 };
    const occupied = Object.values(positions);
    const labels = edges.filter((edge) => positions[edge.subjectId] && positions[edge.objectId]).map((edge) => midpoint(positions[edge.subjectId], positions[edge.objectId]));
    let best = origin;
    let bestScore = Infinity;
    // 接続先とその重心の近くを比較し、混雑時用の外側候補も含める。
    for (const base of [origin, ...neighbors]) for (const radius of [250, 310, 390, 480]) for (let slot = 0; slot < 24; slot++) {
      const angle = slot * Math.PI / 12;
      const point = { x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius * 0.8 };
      let score = 0;
      for (const other of occupied) {
        const clearance = ((point.x - other.x) / 180) ** 2 + ((point.y - other.y) / 120) ** 2;
        if (clearance < 1 || length(point, other) < 200) score += 1_000_000 + 1_000_000 * Math.max(0, 1 - clearance);
      }
      for (const neighbor of neighbors) {
        const span = length(point, neighbor);
        const preferred = 225 + 70 * Math.abs(point.x - neighbor.x) / Math.max(span, 1);
        score += (span - preferred) ** 2;
        // 横書きラベルが端点Nodeへ食い込む短い辺を避ける。
        if (Math.abs(point.x - neighbor.x) < 270 && Math.abs(point.y - neighbor.y) < 150) score += 40_000;
        const label = midpoint(point, neighbor);
        for (const other of occupied) if (other !== neighbor && Math.abs(label.x - other.x) < 125 && Math.abs(label.y - other.y) < 65) score += 35_000;
        for (const other of labels) if (Math.abs(label.x - other.x) < 130 && Math.abs(label.y - other.y) < 45) score += 18_000;
      }
      // 横長の画面に合わせて縦の拡がりを強めに抑えるが、距離を一律にはしない。
      score += point.x ** 2 * 0.035 + point.y ** 2 * 0.08;
      for (const label of labels) if (Math.abs(point.x - label.x) < 130 && Math.abs(point.y - label.y) < 70) score += 35_000;
      if (score < bestScore) { bestScore = score; best = point; }
    }
    positions[id] = best;
  }
  return positions;
}

// Explicit content may have unrelated entities. Place connected nodes first and
// isolated members last, so an unrelated center does not sit on a relation label.
export function contentPositions(ids: string[], relations: Record<string, DisplayRelation>, portrait = false): Record<string, Point> {
  if (!ids.length) return {};
  const degree = new Map(ids.map(id => [id, 0]));
  for (const relation of Object.values(relations)) {
    degree.set(relation.subjectId, (degree.get(relation.subjectId) ?? 0) + 1);
    degree.set(relation.objectId, (degree.get(relation.objectId) ?? 0) + 1);
  }
  const ordered = [...ids].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
  const positions = additionalPositions({ [ordered[0]]: { x: 0, y: 0 } }, ordered.slice(1), relations, ordered[0]);
  return portrait ? Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.y, y: point.x }])) : positions;
}
