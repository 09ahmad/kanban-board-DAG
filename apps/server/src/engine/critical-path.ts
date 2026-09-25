import { buildAdjacency } from "./graph.js";
import { topologicalSort } from "./topological-sort.js";
import type { GraphEdge, GraphTask } from "./types.js";

export type CriticalPathResult = {
  criticalTaskIds: number[];
  criticalEdges: GraphEdge[];
  totalDurationDays: number;
};

export function computeCriticalPath(
  tasks: GraphTask[],
  edges: GraphEdge[],
): CriticalPathResult {
  const ids = tasks.map((t) => t.id);
  const order = topologicalSort(ids, edges);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { prereqsOf, dependentsOf } = buildAdjacency(edges);
  const dist = new Map<number, number>();
  const pred = new Map<number, number | null>();

  for (const id of order) {
    const duration = byId.get(id)?.duration ?? 0;
    const prereqs = prereqsOf.get(id) ?? [];
    if (prereqs.length === 0) {
      dist.set(id, duration);
      pred.set(id, null);
      continue;
    }
    let bestPred = prereqs[0]!;
    let best = (dist.get(bestPred) ?? 0) + duration;
    for (const p of prereqs) {
      const candidate = (dist.get(p) ?? 0) + duration;
      if (candidate > best) {
        best = candidate;
        bestPred = p;
      }
    }
    dist.set(id, best);
    pred.set(id, bestPred);
  }

  let end = order[0];
  let totalDurationDays = 0;
  for (const id of order) {
    const d = dist.get(id) ?? 0;
    if (d >= totalDurationDays) {
      totalDurationDays = d;
      end = id;
    }
  }

  const criticalTaskIds: number[] = [];
  let cursor: number | null | undefined = end;
  while (cursor != null) {
    criticalTaskIds.unshift(cursor);
    cursor = pred.get(cursor) ?? null;
  }

  const criticalSet = new Set(criticalTaskIds);
  const criticalEdges: GraphEdge[] = [];
  for (const id of criticalTaskIds) {
    for (const dep of dependentsOf.get(id) ?? []) {
      if (criticalSet.has(dep) && pred.get(dep) === id) {
        criticalEdges.push({ prerequisiteTaskId: id, dependentTaskId: dep });
      }
    }
  }

  return { criticalTaskIds, criticalEdges, totalDurationDays };
}
