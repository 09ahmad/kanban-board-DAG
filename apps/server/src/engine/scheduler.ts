import { buildAdjacency } from "./graph.js";
import type { GraphEdge, GraphTask } from "./types.js";

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function maxDate(dates: Array<Date | undefined>): Date | undefined {
  const present = dates.filter((d): d is Date => d instanceof Date);
  if (present.length === 0) return undefined;
  return present.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

export function computeSchedule(
  tasks: GraphTask[],
  edges: GraphEdge[],
  topoOrder: number[],
): Map<number, { computedStart?: Date; computedEnd?: Date }> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { prereqsOf } = buildAdjacency(edges);
  const result = new Map<number, { computedStart?: Date; computedEnd?: Date }>();

  for (const id of topoOrder) {
    const task = byId.get(id);
    if (!task) continue;
    const prereqEnds = (prereqsOf.get(id) ?? [])
      .map((prereqId) => result.get(prereqId)?.computedEnd)
      .filter((d): d is Date => d instanceof Date);
    const computedStart = maxDate([task.plannedStart, ...prereqEnds]);
    const computedEnd =
      computedStart && task.duration !== undefined
        ? addDays(computedStart, task.duration)
        : undefined;
    result.set(id, { computedStart, computedEnd });
  }

  return result;
}
