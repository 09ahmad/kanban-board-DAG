import { describe, expect, test } from "bun:test";
import { assertNoCycle, wouldCreateCycle } from "../cycle-detector.js";
import { CycleDetectedError, SelfDependencyError } from "../errors.js";
import type { GraphEdge } from "../types.js";

describe("cycle detection", () => {
  test("self-cycle A→A", () => {
    expect(wouldCreateCycle([], 1, 1)).toBe(true);
    expect(() => assertNoCycle([], 1, 1)).toThrow(SelfDependencyError);
  });

  test("direct A→B, B→A", () => {
    const edges: GraphEdge[] = [{ prerequisiteTaskId: 1, dependentTaskId: 2 }];
    expect(wouldCreateCycle(edges, 2, 1)).toBe(true);
    expect(() => assertNoCycle(edges, 2, 1)).toThrow(CycleDetectedError);
  });

  test("indirect A→B→C→A", () => {
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 2, dependentTaskId: 3 },
    ];
    expect(wouldCreateCycle(edges, 3, 1)).toBe(true);
    expect(() => assertNoCycle(edges, 3, 1)).toThrow(CycleDetectedError);
  });

  test("valid chain passes", () => {
    const edges: GraphEdge[] = [{ prerequisiteTaskId: 1, dependentTaskId: 2 }];
    expect(wouldCreateCycle(edges, 2, 3)).toBe(false);
    expect(() => assertNoCycle(edges, 2, 3)).not.toThrow();
  });
});
