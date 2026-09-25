import { describe, expect, test } from "bun:test";
import { CycleDetectedError } from "../errors.js";
import { topologicalSort } from "../topological-sort.js";
import type { GraphEdge } from "../types.js";

describe("topological sort", () => {
  test("linear chain", () => {
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 2, dependentTaskId: 3 },
    ];
    expect(topologicalSort([1, 2, 3], edges)).toEqual([1, 2, 3]);
  });

  test("diamond", () => {
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 1, dependentTaskId: 3 },
      { prerequisiteTaskId: 2, dependentTaskId: 4 },
      { prerequisiteTaskId: 3, dependentTaskId: 4 },
    ];
    const order = topologicalSort([1, 2, 3, 4], edges);
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(3));
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(4));
    expect(order.indexOf(3)).toBeLessThan(order.indexOf(4));
  });

  test("disconnected nodes", () => {
    const order = topologicalSort([3, 1, 2], []);
    expect(order).toEqual([1, 2, 3]);
  });

  test("cyclic throws", () => {
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 2, dependentTaskId: 1 },
    ];
    expect(() => topologicalSort([1, 2], edges)).toThrow(CycleDetectedError);
  });
});
