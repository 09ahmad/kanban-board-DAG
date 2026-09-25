import { describe, expect, test } from "bun:test";
import { computeCriticalPath } from "../critical-path.js";
import type { GraphEdge, GraphTask } from "../types.js";

describe("critical path", () => {
  test("linear path", () => {
    const tasks: GraphTask[] = [
      { id: 1, status: "BACKLOG", readiness: "READY", duration: 2 },
      { id: 2, status: "BACKLOG", readiness: "BLOCKED", duration: 3 },
      { id: 3, status: "BACKLOG", readiness: "BLOCKED", duration: 4 },
    ];
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 2, dependentTaskId: 3 },
    ];
    const result = computeCriticalPath(tasks, edges);
    expect(result.criticalTaskIds).toEqual([1, 2, 3]);
    expect(result.totalDurationDays).toBe(9);
    expect(result.criticalEdges).toHaveLength(2);
  });

  test("diamond picks longest branch", () => {
    const tasks: GraphTask[] = [
      { id: 1, status: "BACKLOG", readiness: "READY", duration: 1 },
      { id: 2, status: "BACKLOG", readiness: "BLOCKED", duration: 2 },
      { id: 3, status: "BACKLOG", readiness: "BLOCKED", duration: 8 },
      { id: 4, status: "BACKLOG", readiness: "BLOCKED", duration: 1 },
    ];
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 1, dependentTaskId: 3 },
      { prerequisiteTaskId: 2, dependentTaskId: 4 },
      { prerequisiteTaskId: 3, dependentTaskId: 4 },
    ];
    const result = computeCriticalPath(tasks, edges);
    expect(result.criticalTaskIds).toEqual([1, 3, 4]);
    expect(result.totalDurationDays).toBe(10);
  });
});
