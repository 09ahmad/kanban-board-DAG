import { CycleDetectedError } from "./errors.js";
import { buildAdjacency } from "./graph.js";
import type { GraphEdge } from "./types.js";

export function topologicalSort(taskIds: number[], edges: GraphEdge[]): number[] {
  const ids = [...new Set(taskIds)].sort((a, b) => a - b);
  const { prereqsOf, dependentsOf } = buildAdjacency(edges);
  const indegree = new Map<number, number>();
  for (const id of ids) {
    const prereqs = (prereqsOf.get(id) ?? []).filter((p) => ids.includes(p));
    indegree.set(id, prereqs.length);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: number[] = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a - b);
    const node = queue.shift()!;
    order.push(node);
    for (const dep of dependentsOf.get(node) ?? []) {
      if (!indegree.has(dep)) continue;
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  if (order.length !== ids.length) {
    throw new CycleDetectedError();
  }
  return order;
}
