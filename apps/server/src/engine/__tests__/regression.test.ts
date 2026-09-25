import { describe, expect, test } from "bun:test";
import { computeReadiness } from "../readiness.js";
import type { GraphEdge, GraphTask } from "../types.js";

describe("regression", () => {
  test("A reverts to IN_PROGRESS; B and C become BLOCKED but status untouched", () => {
    const tasks: GraphTask[] = [
      { id: 1, status: "IN_PROGRESS", readiness: "READY" },
      { id: 2, status: "REVIEW", readiness: "READY" },
      { id: 3, status: "DONE", readiness: "READY" },
    ];
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 2, dependentTaskId: 3 },
    ];
    const readiness = computeReadiness(tasks, edges);
    expect(readiness.get(2)).toBe("BLOCKED");
    expect(readiness.get(3)).toBe("BLOCKED");
    expect(tasks[1]?.status).toBe("REVIEW");
    expect(tasks[2]?.status).toBe("DONE");
  });
});
