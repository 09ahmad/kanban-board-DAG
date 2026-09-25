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

describe("scheduler", () => {
  test("no prereq uses plannedStart", () => {
    const start = utc(2026, 1, 1);
    const tasks: GraphTask[] = [
      { id: 1, status: "BACKLOG", readiness: "READY", plannedStart: start, duration: 5 },
    ];
    const schedule = computeSchedule(tasks, [], [1]);
    expect(schedule.get(1)?.computedStart).toEqual(start);
    expect(daysBetween(start, schedule.get(1)!.computedEnd!)).toBe(5);
  });

  test("chain propagation", () => {
    const start = utc(2026, 1, 1);
    const tasks: GraphTask[] = [
      { id: 1, status: "BACKLOG", readiness: "READY", plannedStart: start, duration: 2 },
      { id: 2, status: "BACKLOG", readiness: "BLOCKED", duration: 3 },
    ];
    const edges: GraphEdge[] = [{ prerequisiteTaskId: 1, dependentTaskId: 2 }];
    const order = topologicalSort([1, 2], edges);
    const schedule = computeSchedule(tasks, edges, order);
    expect(schedule.get(2)?.computedStart).toEqual(schedule.get(1)?.computedEnd);
    expect(daysBetween(schedule.get(2)!.computedStart!, schedule.get(2)!.computedEnd!)).toBe(3);
  });

  test("diamond no-compounding (+3d A → D shifts +3 not +6)", () => {
    const start = utc(2026, 1, 1);
    const make = (plannedStart: Date): GraphTask[] => [
      { id: 1, status: "BACKLOG", readiness: "READY", plannedStart, duration: 2 },
      { id: 2, status: "BACKLOG", readiness: "BLOCKED", duration: 2 },
      { id: 3, status: "BACKLOG", readiness: "BLOCKED", duration: 2 },
      { id: 4, status: "BACKLOG", readiness: "BLOCKED", duration: 2 },
    ];
    const edges: GraphEdge[] = [
      { prerequisiteTaskId: 1, dependentTaskId: 2 },
      { prerequisiteTaskId: 1, dependentTaskId: 3 },
      { prerequisiteTaskId: 2, dependentTaskId: 4 },
      { prerequisiteTaskId: 3, dependentTaskId: 4 },
    ];
    const ids = [1, 2, 3, 4];
    const order = topologicalSort(ids, edges);
    const base = computeSchedule(make(start), edges, order);
    const shifted = computeSchedule(make(utc(2026, 1, 4)), edges, order);
    const delta = daysBetween(base.get(4)!.computedStart!, shifted.get(4)!.computedStart!);
    expect(delta).toBe(3);
  });
});
