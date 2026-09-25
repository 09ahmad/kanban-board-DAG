import { buildAdjacency } from "./graph.js";
import type { GraphEdge, GraphTask, Readiness } from "./types.js";

export function computeReadiness(
  tasks: GraphTask[],
  edges: GraphEdge[],
): Map<number, Readiness> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { prereqsOf } = buildAdjacency(edges);
  const result = new Map<number, Readiness>();

  for (const task of tasks) {
    const prereqs = prereqsOf.get(task.id) ?? [];
    if (prereqs.length === 0) {
      result.set(task.id, "READY");
      continue;
    }
    const allDone = prereqs.every((id) => byId.get(id)?.status === "DONE");
    result.set(task.id, allDone ? "READY" : "BLOCKED");
  }

  return result;
}

export function computeDownstreamReadiness(
  tasks: GraphTask[],
  edges: GraphEdge[],
  changedTaskIds: number[],
): Map<number, Readiness> {
  const { dependentsOf } = buildAdjacency(edges);
  const affected = new Set<number>(changedTaskIds);
  const stack = [...changedTaskIds];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const dep of dependentsOf.get(current) ?? []) {
      if (affected.has(dep)) continue;
      affected.add(dep);
      stack.push(dep);
    }
  }
  const full = computeReadiness(tasks, edges);
  const filtered = new Map<number, Readiness>();
  for (const id of affected) {
    const value = full.get(id);
    if (value) filtered.set(id, value);
  }
  return filtered;
}
