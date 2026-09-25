import { describe, expect, test } from "bun:test";
import { computeSchedule } from "../scheduler.js";
import { topologicalSort } from "../topological-sort.js";
import type { GraphEdge, GraphTask } from "../types.js";

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

describe("convergence", () => {
  test("diamond A→B, A→C, B→D, C→D; A shifts +3d; D shifts +3d exactly once", () => {
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 1, dependentTaskId: 3 },
      { prerequisiteTaskId: 2, dependentTaskId: 4 },
      { prerequisiteTaskId: 3, dependentTaskId: 4 },
    ];
    const make = (aStart: Date): GraphTask[] => [
      { id: 1, status: "BACKLOG", readiness: "READY", plannedStart: aStart, duration: 1 },
      { id: 2, status: "BACKLOG", readiness: "BLOCKED", duration: 1 },
      { id: 3, status: "BACKLOG", readiness: "BLOCKED", duration: 1 },
      { id: 4, status: "BACKLOG", readiness: "BLOCKED", duration: 1 },
    ];
    const order = topologicalSort([1, 2, 3, 4], edges);
    const before = computeSchedule(make(utc(2026, 6, 1)), edges, order);
    const after = computeSchedule(make(utc(2026, 6, 4)), edges, order);
    expect(daysBetween(before.get(4)!.computedStart!, after.get(4)!.computedStart!)).toBe(3);
  });
});
