import { prisma } from "@repo/db/client";
import { publishDomainEvent } from "@repo/queue";
import type { AssignTaskDto, CreateTaskDto, MoveTaskDto, TaskEventType, UpdateTaskDto } from "@repo/types";
import {
  computeDownstreamReadiness,
  computeSchedule,
  topologicalSort,
  type GraphEdge,
  type GraphTask,
} from "../engine/index.js";
import { BlockedTaskError, NotFoundError } from "../lib/errors.js";
import { projectService } from "./project.service.js";
import type { Task, TaskEvent, Prisma } from "@repo/db/generated/prisma/client";

type Tx = Pick<typeof prisma, "task" | "taskDependency" | "taskEvent">;

/**
 * A domain event derived while recomputing the graph inside a transaction.
 *
 * These are returned rather than published inline: `@repo/queue` must only see
 * events for data that has actually committed. Callers publish them once the
 * surrounding `prisma.$transaction` resolves.
 */
export type PendingGraphEvent = {
  type: TaskEventType;
  taskId: number;
  /** Whoever's mutation triggered the recompute, if it came from a request. */
  actorId: number | undefined;
  payload: Record<string, unknown>;
};

const STATUS_RANK: Record<Task["status"], number> = {
  BACKLOG: 0,
  IN_PROGRESS: 1,
  REVIEW: 2,
  DONE: 3,
};

/**
 * A BLOCKED task may not advance along the workflow while its prerequisites
 * are incomplete. Staying put or moving back stays open — a regressed task
 * keeps its column and the user decides what to do next — but every move
 * ahead of the task's current column is refused.
 */
function assertNotForwardMove(
  task: { status: Task["status"]; readiness: Task["readiness"] },
  next: Task["status"],
): void {
  if (task.readiness === "BLOCKED" && STATUS_RANK[next] > STATUS_RANK[task.status]) {
    throw new BlockedTaskError();
  }
}


function toGraphTask(task: {
  id: number;
  status: GraphTask["status"];
  readiness: GraphTask["readiness"];
  position: number | null;
  plannedStart: Date | null;
  duration: number | null;
  computedStart: Date | null;
  computedEnd: Date | null;
}): GraphTask {
  return {
    id: task.id,
    status: task.status,
    readiness: task.readiness,
    position: task.position ?? undefined,
    plannedStart: task.plannedStart ?? undefined,
    duration: task.duration ?? undefined,
    computedStart: task.computedStart ?? undefined,
    computedEnd: task.computedEnd ?? undefined,
  };
}

export class TaskService {
  async createTask(projectId: number, dto: CreateTaskDto, userId: number): Promise<Task> {
    await projectService.requireMember(projectId, userId);
    const created = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId,
          title: dto.title,
          description: dto.description,
          status: dto.status ?? "BACKLOG",
          readiness: "READY",
          position: dto.position ?? 0,
          plannedStart: dto.plannedStart,
          duration: dto.duration,
        },
      });
      if (dto.plannedStart && dto.duration !== undefined) {
        const schedule = computeSchedule([toGraphTask(task)], [], [task.id]);
        const dates = schedule.get(task.id);
        if (dates) {
          await tx.task.update({
            where: { id: task.id },
            data: {
              computedStart: dates.computedStart,
              computedEnd: dates.computedEnd,
            },
          });
        }
      }
      await tx.taskEvent.create({
        data: {
          projectId,
          taskId: task.id,
          actorId: userId,
          type: "TASK_CREATED",
          payload: { title: task.title } as Prisma.InputJsonValue,
        },
      });
      return tx.task.findUniqueOrThrow({ where: { id: task.id } });
    });
    await this._emit("TASK_CREATED", projectId, created.id, { title: created.title }, userId);
    return created;
  }

  async getTasks(projectId: number, userId: number): Promise<Task[]> {
    await projectService.requireMember(projectId, userId);
    return prisma.task.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { position: "asc" }],
    });
  }

  async getTask(taskId: number, userId: number): Promise<Task> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError("Task");
    await projectService.requireMember(task.projectId, userId);
    return task;
  }

  async updateTask(taskId: number, dto: UpdateTaskDto, userId: number): Promise<Task> {
    const existing = await this.getTask(taskId, userId);
    if (dto.status !== undefined) {
      assertNotForwardMove(existing, dto.status);
    }
    let pending: PendingGraphEvent[] = [];
    const updated = await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          title: dto.title,
          description: dto.description,
          status: dto.status,
          position: dto.position,
          plannedStart: dto.plannedStart,
          duration: dto.duration,
          version: { increment: 1 },
        },
      });
      if (
        dto.plannedStart !== undefined ||
        dto.duration !== undefined ||
        dto.status !== undefined
      ) {
        pending = await this._recomputeProject(tx, existing.projectId, userId, [taskId]);
      }
      await tx.taskEvent.create({
        data: {
          projectId: existing.projectId,
          taskId,
          actorId: userId,
          type: "TASK_UPDATED",
          payload: dto as Prisma.InputJsonValue,
        },
      });
      return tx.task.findUniqueOrThrow({ where: { id: taskId } });
    });
    await this._emit("TASK_UPDATED", existing.projectId, taskId, dto as Record<string, unknown>, userId);
    await this._emitPending(existing.projectId, pending);
    return updated;
  }

  async moveTask(taskId: number, dto: MoveTaskDto, userId: number): Promise<Task> {
    const task = await this.getTask(taskId, userId);
    assertNotForwardMove(task, dto.status);
    let pending: PendingGraphEvent[] = [];
    const moved = await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: dto.status,
          position: dto.position ?? task.position,
          version: { increment: 1 },
        },
      });
      pending = await this._recomputeProject(tx, task.projectId, userId, [taskId]);
      await tx.taskEvent.create({
        data: {
          projectId: task.projectId,
          taskId,
          actorId: userId,
          type: "TASK_MOVED",
          payload: { oldStatus: task.status, newStatus: dto.status } as Prisma.InputJsonValue,
        },
      });
      return tx.task.findUniqueOrThrow({ where: { id: taskId } });
    });
    await this._emit(
      "TASK_MOVED",
      task.projectId,
      taskId,
      { oldStatus: task.status, newStatus: dto.status },
      userId,
    );
    await this._emitPending(task.projectId, pending);
    return moved;
  }

  async assignTask(taskId: number, dto: AssignTaskDto, userId: number): Promise<Task> {
    const task = await this.getTask(taskId, userId);
    if (dto.assigneeId !== null) {
      await projectService.requireMember(task.projectId, dto.assigneeId);
    }
    const assigned = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { assigneeId: dto.assigneeId, version: { increment: 1 } },
      });
      await tx.taskEvent.create({
        data: {
          projectId: task.projectId,
          taskId,
          actorId: userId,
          type: "TASK_UPDATED",
          payload: { assigneeId: dto.assigneeId } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
    await this._emit("TASK_UPDATED", task.projectId, taskId, { assigneeId: dto.assigneeId }, userId);
    return assigned;
  }

  async deleteTask(taskId: number, userId: number): Promise<void> {
    const task = await this.getTask(taskId, userId);
    let pending: PendingGraphEvent[] = [];
    await prisma.$transaction(async (tx) => {
      // The edges go with the task, so its dependents are read first: they are
      // the only tasks whose derived state can have changed.
      const dependents = await tx.taskDependency.findMany({
        where: { prerequisiteTaskId: taskId },
        select: { dependentTaskId: true },
      });
      await tx.task.delete({ where: { id: taskId } });
      pending = await this._recomputeProject(
        tx,
        task.projectId,
        userId,
        dependents.map((d) => d.dependentTaskId),
      );
      await tx.taskEvent.create({
        data: {
          projectId: task.projectId,
          actorId: userId,
          type: "TASK_DELETED",
          payload: { taskId } as Prisma.InputJsonValue,
        },
      });
    });
    await this._emit("TASK_DELETED", task.projectId, taskId, { taskId }, userId);
    await this._emitPending(task.projectId, pending);
  }

  async _loadGraph(
    projectId: number,
    tx: Tx | typeof prisma = prisma,
  ): Promise<{ tasks: Map<number, GraphTask>; edges: GraphEdge[] }> {
    const [rows, deps] = await Promise.all([
      tx.task.findMany({ where: { projectId } }),
      tx.taskDependency.findMany({
        where: {
          OR: [
            { prerequisite: { projectId } },
            { dependent: { projectId } },
          ],
        },
      }),
    ]);
    const tasks = new Map(rows.map((t) => [t.id, toGraphTask(t)]));
    const edges = deps
      .filter((d) => tasks.has(d.prerequisiteTaskId) && tasks.has(d.dependentTaskId))
      .map((d) => ({
        prerequisiteTaskId: d.prerequisiteTaskId,
        dependentTaskId: d.dependentTaskId,
      }));
    return { tasks, edges };
  }

  async _persistGraphUpdates(
    tx: Tx,
    updates: Map<number, { readiness?: GraphTask["readiness"]; computedStart?: Date; computedEnd?: Date; position?: number }>,
  ): Promise<void> {
    for (const [id, data] of updates) {
      await tx.task.update({
        where: { id },
        data: {
          readiness: data.readiness,
          computedStart: data.computedStart,
          computedEnd: data.computedEnd,
          position: data.position,
          version: { increment: 1 },
        },
      });
    }
  }

  /**
   * Recomputes the changed tasks and everything downstream of them.
   *
   * Readiness and dates only propagate along the dependency direction, so no
   * task outside that closure can have changed. Rewriting the rest of the
   * project would bump `version` and emit schedule events for tasks nobody
   * touched.
   */
  async _recomputeProject(
    tx: Tx,
    projectId: number,
    actorId: number | undefined,
    changedTaskIds: number[],
  ): Promise<PendingGraphEvent[]> {
    const { tasks, edges } = await this._loadGraph(projectId, tx);
    const list = [...tasks.values()];
    const readiness = computeDownstreamReadiness(list, edges, changedTaskIds);
    if (readiness.size === 0) return [];

    const order = topologicalSort(
      list.map((t) => t.id),
      edges,
    );
    const schedule = computeSchedule(list, edges, order);
    const updates = new Map<
      number,
      { readiness?: GraphTask["readiness"]; computedStart?: Date; computedEnd?: Date; position?: number }
    >();
    const pending: PendingGraphEvent[] = [];
    for (const [id, nextReady] of readiness) {
      const task = tasks.get(id);
      if (!task) continue;
      const nextSched = schedule.get(id);
      const readyChanged = nextReady !== task.readiness;
      const startChanged =
        nextSched?.computedStart?.getTime() !== task.computedStart?.getTime();
      const endChanged = nextSched?.computedEnd?.getTime() !== task.computedEnd?.getTime();
      if (readyChanged || startChanged || endChanged) {
        updates.set(id, {
          readiness: nextReady,
          computedStart: nextSched?.computedStart,
          computedEnd: nextSched?.computedEnd,
        });
      }
      if (readyChanged && nextReady === "BLOCKED") {
        await tx.taskEvent.create({
          data: {
            projectId,
            taskId: task.id,
            actorId,
            type: "TASK_BLOCKED",
            payload: {},
          },
        });
        pending.push({ type: "TASK_BLOCKED", taskId: task.id, actorId, payload: {} });
      }
      if (readyChanged && nextReady === "READY") {
        // Everything upstream is DONE, so the task has become actionable —
        // surface it at the top of its column. It takes one slot above the
        // current minimum instead of shifting its column, so no other card's
        // stored position is rewritten.
        const columnPeers = list.filter((t) => t.status === task.status && t.id !== task.id);
        const top = columnPeers.length > 0
          ? Math.min(...columnPeers.map((t) => t.position ?? 0)) - 1
          : 0;
        const update = updates.get(id);
        if (update) update.position = top;
        await tx.taskEvent.create({
          data: {
            projectId,
            taskId: task.id,
            actorId,
            type: "TASK_READY",
            payload: {},
          },
        });
        pending.push({ type: "TASK_READY", taskId: task.id, actorId, payload: {} });
      }
      if (startChanged || endChanged) {
        const payload = {
          computedStart: nextSched?.computedStart?.toISOString() ?? null,
          computedEnd: nextSched?.computedEnd?.toISOString() ?? null,
        };
        await tx.taskEvent.create({
          data: {
            projectId,
            taskId: task.id,
            actorId,
            type: "SCHEDULE_CHANGED",
            payload,
          },
        });
        pending.push({ type: "SCHEDULE_CHANGED", taskId: task.id, actorId, payload });
      }
    }
    await this._persistGraphUpdates(tx, updates);
    return pending;
  }

  /** Publish graph-derived events. Must only be called after the transaction commits. */
  async _emitPending(projectId: number, pending: PendingGraphEvent[]): Promise<void> {
    for (const event of pending) {
      await this._emit(event.type, projectId, event.taskId, event.payload, event.actorId);
    }
  }

  async _emit(
    type: TaskEventType,
    projectId: number,
    taskId?: number,
    payload: Record<string, unknown> = {},
    actorId?: number,
  ): Promise<void> {
    try {
      await publishDomainEvent({
        type,
        projectId,
        taskId,
        actorId,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Failed to publish domain event", err);
    }
  }
}

export const taskService = new TaskService();
