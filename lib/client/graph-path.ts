import type { EntitySummary } from "../domain/api";
import type { DisplayRelation } from "./graph-presentation";

export type GraphPathStep = { fromId: string; toId: string; relationId: string };

// 表示中の線を両方向に辿る。知識上の関係・因果・肯否は推論しない。
// 同じ長さの経路はRelation ID順で一つ選び、応答順や表示言語に依存させない。
export function shortestVisiblePath(
  nodes: Record<string, EntitySummary>,
  relations: Record<string, DisplayRelation>,
  fromId: string,
  toId: string,
): GraphPathStep[] | null {
  if (!nodes[fromId] || !nodes[toId]) return null;
  const adjacent = new Map<string, GraphPathStep[]>();
  for (const relation of Object.values(relations).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (!nodes[relation.subjectId] || !nodes[relation.objectId]) continue;
    for (const [from, to] of [[relation.subjectId, relation.objectId], [relation.objectId, relation.subjectId]]) {
      const steps = adjacent.get(from) ?? [];
      steps.push({ fromId: from, toId: to, relationId: relation.id });
      adjacent.set(from, steps);
    }
  }
  const previous = new Map<string, GraphPathStep | null>([[fromId, null]]);
  const queue = [fromId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === toId) {
      const path: GraphPathStep[] = [];
      let step = previous.get(id);
      while (step) { path.push(step); step = previous.get(step.fromId); }
      return path.reverse();
    }
    for (const step of adjacent.get(id) ?? []) {
      if (previous.has(step.toId)) continue;
      previous.set(step.toId, step); queue.push(step.toId);
    }
  }
  return null;
}
