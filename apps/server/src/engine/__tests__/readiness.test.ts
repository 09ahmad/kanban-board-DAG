import { describe, expect, test } from "bun:test";
import { computeReadiness } from "../readiness.js";
import type { GraphEdge, GraphTask } from "../types.js";

function task(id: number, status: GraphTask["status"]): GraphTask {
  return { id, status, readiness: "READY" };
}

describe("readiness", () => {
  test("no deps → READY", () => {
    const result = computeReadiness([task(1, "BACKLOG")], []);
    expect(result.get(1)).toBe("READY");
  });

  test("one dep not DONE → BLOCKED", () => {
    const tasks = [task(1, "IN_PROGRESS"), task(2, "BACKLOG")];
    const edges: GraphEdge[] = [{ prerequisiteTaskId: 1, dependentTaskId: 2 }];
    expect(computeReadiness(tasks, edges).get(2)).toBe("BLOCKED");
  });

  test("all DONE → READY", () => {
    const tasks = [task(1, "DONE"), task(2, "BACKLOG")];
    const edges: GraphEdge[] = [{ prerequisiteTaskId: 1, dependentTaskId: 2 }];
    expect(computeReadiness(tasks, edges).get(2)).toBe("READY");
  });

  test("multi-prereq: both must be DONE", () => {
    const tasks = [task(1, "DONE"), task(2, "IN_PROGRESS"), task(3, "BACKLOG")];
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 3 },
      { prerequisiteTaskId: 2, dependentTaskId: 3 },
    ];
    expect(computeReadiness(tasks, edges).get(3)).toBe("BLOCKED");
    tasks[1] = task(2, "DONE");
    expect(computeReadiness(tasks, edges).get(3)).toBe("READY");
  });
});
