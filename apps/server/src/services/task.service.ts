import { prisma } from "@repo/db/client";
import { publishDomainEvent } from "@repo/queue";
import type { CreateTaskDto, MoveTaskDto, TaskEventType, UpdateTaskDto } from "@repo/types";
import {
  computeReadiness,
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
  payload: Record<string, unknown>;
};


function toGraphTask(task: {
  id: number;
  status: GraphTask["status"];
  readiness: GraphTask["readiness"];
  plannedStart: Date | null;
  duration: number | null;
  computedStart: Date | null;
  computedEnd: Date | null;
}): GraphTask {
  return {
    id: task.id,
    status: task.status,
    readiness: task.readiness,
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
    await this._emit("TASK_CREATED", projectId, created.id, { title: created.title });
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
        pending = await this._recomputeProject(tx, existing.projectId, userId);
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
    await this._emit("TASK_UPDATED", existing.projectId, taskId, dto as Record<string, unknown>);
    await this._emitPending(existing.projectId, pending);
    return updated;
  }

  async moveTask(taskId: number, dto: MoveTaskDto, userId: number): Promise<Task> {
    const task = await this.getTask(taskId, userId);
    if (task.readiness === "BLOCKED" && dto.status === "IN_PROGRESS") {
      throw new BlockedTaskError();
    }
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
      pending = await this._recomputeProject(tx, task.projectId, userId);
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
    await this._emit("TASK_MOVED", task.projectId, taskId, {
      oldStatus: task.status,
      newStatus: dto.status,
    });
    await this._emitPending(task.projectId, pending);
    return moved;
  }

  async deleteTask(taskId: number, userId: number): Promise<void> {
    const task = await this.getTask(taskId, userId);
    let pending: PendingGraphEvent[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      pending = await this._recomputeProject(tx, task.projectId, userId);
      await tx.taskEvent.create({
        data: {
          projectId: task.projectId,
          actorId: userId,
          type: "TASK_DELETED",
          payload: { taskId } as Prisma.InputJsonValue,
        },
      });
    });
    await this._emit("TASK_DELETED", task.projectId, taskId, { taskId });
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
    updates: Map<number, { readiness?: GraphTask["readiness"]; computedStart?: Date; computedEnd?: Date }>,
  ): Promise<void> {
    for (const [id, data] of updates) {
      await tx.task.update({
        where: { id },
        data: {
          readiness: data.readiness,
          computedStart: data.computedStart,
          computedEnd: data.computedEnd,
          version: { increment: 1 },
        },
      });
    }
  }

  async _recomputeProject(
    tx: Tx,
    projectId: number,
    actorId?: number,
  ): Promise<PendingGraphEvent[]> {
    const { tasks, edges } = await this._loadGraph(projectId, tx);
    const list = [...tasks.values()];
    const ids = list.map((t) => t.id);
    const readiness = computeReadiness(list, edges);
    const order = topologicalSort(ids, edges);
    const schedule = computeSchedule(list, edges, order);
    const updates = new Map<
      number,
      { readiness?: GraphTask["readiness"]; computedStart?: Date; computedEnd?: Date }
    >();
    const pending: PendingGraphEvent[] = [];
    for (const task of list) {
      const nextReady = readiness.get(task.id);
      const nextSched = schedule.get(task.id);
      const readyChanged = nextReady && nextReady !== task.readiness;
      const startChanged =
        nextSched?.computedStart?.getTime() !== task.computedStart?.getTime();
      const endChanged = nextSched?.computedEnd?.getTime() !== task.computedEnd?.getTime();
      if (readyChanged || startChanged || endChanged) {
        updates.set(task.id, {
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
        pending.push({ type: "TASK_BLOCKED", taskId: task.id, payload: {} });
      }
      if (readyChanged && nextReady === "READY") {
        await tx.taskEvent.create({
          data: {
            projectId,
            taskId: task.id,
            actorId,
            type: "TASK_READY",
            payload: {},
          },
        });
        pending.push({ type: "TASK_READY", taskId: task.id, payload: {} });
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
        pending.push({ type: "SCHEDULE_CHANGED", taskId: task.id, payload });
      }
    }
    await this._persistGraphUpdates(tx, updates);
    return pending;
  }

  /** Publish graph-derived events. Must only be called after the transaction commits. */
  async _emitPending(projectId: number, pending: PendingGraphEvent[]): Promise<void> {
    for (const event of pending) {
      await this._emit(event.type, projectId, event.taskId, event.payload);
    }
  }

  async _emit(
    type: TaskEventType,
    projectId: number,
    taskId?: number,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await publishDomainEvent({
        type,
        projectId,
        taskId,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Failed to publish domain event", err);
    }
  }
}

export const taskService = new TaskService();
