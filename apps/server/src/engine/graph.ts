import type { GraphEdge } from "./types.js";

export function buildAdjacency(edges: GraphEdge[]): {
  prereqsOf: Map<number, number[]>;
  dependentsOf: Map<number, number[]>;
} {
  const prereqsOf = new Map<number, number[]>();
  const dependentsOf = new Map<number, number[]>();

  for (const edge of edges) {
    const prereqs = prereqsOf.get(edge.dependentTaskId) ?? [];
    prereqs.push(edge.prerequisiteTaskId);
    prereqsOf.set(edge.dependentTaskId, prereqs);

    const dependents = dependentsOf.get(edge.prerequisiteTaskId) ?? [];
    dependents.push(edge.dependentTaskId);
    dependentsOf.set(edge.prerequisiteTaskId, dependents);
  }

  return { prereqsOf, dependentsOf };
}
