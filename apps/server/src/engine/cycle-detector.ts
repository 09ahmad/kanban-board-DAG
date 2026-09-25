import { CycleDetectedError, SelfDependencyError } from "./errors.js";
import { buildAdjacency } from "./graph.js";
import type { GraphEdge } from "./types.js";

export function wouldCreateCycle(
  edges: GraphEdge[],
  prerequisiteId: number,
  dependentId: number,
): boolean {
  if (prerequisiteId === dependentId) return true;
  const { dependentsOf } = buildAdjacency(edges);
  const seen = new Set<number>();
  const stack = [dependentId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === prerequisiteId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const next = dependentsOf.get(current) ?? [];
    for (const id of next) {
      stack.push(id);
    }
  }
  return false;
}

export function assertNoCycle(
  edges: GraphEdge[],
  prerequisiteId: number,
  dependentId: number,
): void {
  if (prerequisiteId === dependentId) {
    throw new SelfDependencyError();
  }
  if (wouldCreateCycle(edges, prerequisiteId, dependentId)) {
    throw new CycleDetectedError();
  }
}
