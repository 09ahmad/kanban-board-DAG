import { prisma } from "@repo/db/client";
import type { CreateDependencyDto, TaskEventType } from "@repo/types";
import {
  CycleDetectedError as EngineCycle,
  SelfDependencyError as EngineSelf,
  assertNoCycle,
  computeCriticalPath,
  type CriticalPathResult,
} from "../engine/index.js";
import {
  ConflictError,
  CycleError,
  NotFoundError,
  SelfDependencyError,
} from "../lib/errors.js";
import { projectService } from "./project.service.js";
import { taskService, type PendingGraphEvent } from "./task.service.js";
import type { Task, TaskDependency, TaskEvent, Prisma } from "@repo/db/generated/prisma/client";

type GraphSnapshot = { tasks: Task[]; dependencies: TaskDependency[] };

export class DependencyService {
  async createDependency(projectId: number, dto: CreateDependencyDto, userId: number): Promise<GraphSnapshot> {
    await projectService.requireMember(projectId, userId);
    if (dto.prerequisiteTaskId === dto.dependentTaskId) {
      throw new SelfDependencyError();
    }
    const [prereq, dependent] = await Promise.all([
      prisma.task.findUnique({ where: { id: dto.prerequisiteTaskId } }),
      prisma.task.findUnique({ where: { id: dto.dependentTaskId } }),
    ]);
    if (!prereq || !dependent) throw new NotFoundError("Task");
    if (prereq.projectId !== projectId || dependent.projectId !== projectId) {
      throw new ConflictError("Tasks must belong to the same project.");
    }
    const existing = await prisma.taskDependency.findUnique({
      where: {
        prerequisiteTaskId_dependentTaskId: {
          prerequisiteTaskId: dto.prerequisiteTaskId,
          dependentTaskId: dto.dependentTaskId,
        },
      },
    });
    if (existing) throw new ConflictError("Dependency already exists.");

    const { edges } = await taskService._loadGraph(projectId);
    try {
      assertNoCycle(edges, dto.prerequisiteTaskId, dto.dependentTaskId);
    } catch (err) {
      if (err instanceof EngineSelf) throw new SelfDependencyError();
      if (err instanceof EngineCycle) throw new CycleError();
      throw err;
    }

    let pending: PendingGraphEvent[] = [];
    const graph = await prisma.$transaction(async (tx) => {
      await tx.taskDependency.create({
        data: {
          prerequisiteTaskId: dto.prerequisiteTaskId,
          dependentTaskId: dto.dependentTaskId,
        },
      });
      await tx.taskEvent.create({
        data: {
          projectId,
          taskId: dto.dependentTaskId,
          actorId: userId,
          type: "DEPENDENCY_ADDED",
          payload: dto as Prisma.InputJsonValue,
        },
      });
      pending = await taskService._recomputeProject(tx, projectId, userId);
      return this._snapshot(tx, projectId);
    });

    await this._emit("DEPENDENCY_ADDED", projectId, dto.dependentTaskId, dto);
    await taskService._emitPending(projectId, pending);
    await this._emit("GRAPH_UPDATED", projectId, undefined, {});
    return graph;
  }

  async deleteDependency(dependencyId: number, userId: number): Promise<void> {
    const dep = await prisma.taskDependency.findUnique({
      where: { id: dependencyId },
      include: { dependent: true },
    });
    if (!dep) throw new NotFoundError("Dependency");
    const projectId = dep.dependent.projectId;
    await projectService.requireMember(projectId, userId);

    let pending: PendingGraphEvent[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.taskDependency.delete({ where: { id: dependencyId } });
      await tx.taskEvent.create({
        data: {
          projectId,
          taskId: dep.dependentTaskId,
          actorId: userId,
          type: "DEPENDENCY_REMOVED",
          payload: {
            prerequisiteTaskId: dep.prerequisiteTaskId,
            dependentTaskId: dep.dependentTaskId,
          } as Prisma.InputJsonValue,
        },
      });
      pending = await taskService._recomputeProject(tx, projectId, userId);
    });
    await this._emit("DEPENDENCY_REMOVED", projectId, dep.dependentTaskId, {
      dependencyId,
    });
    await taskService._emitPending(projectId, pending);
    await this._emit("GRAPH_UPDATED", projectId, undefined, {});
  }

  async getProjectGraph(projectId: number, userId: number): Promise<GraphSnapshot> {
    await projectService.requireMember(projectId, userId);
    return this._snapshot(prisma, projectId);
  }

  async getCriticalPath(projectId: number, userId: number): Promise<CriticalPathResult> {
    await projectService.requireMember(projectId, userId);
    const { tasks, edges } = await taskService._loadGraph(projectId);
    return computeCriticalPath([...tasks.values()], edges);
  }

  async getEvents(projectId: number, userId: number, limit: number, before?: number): Promise<TaskEvent[]> {
    await projectService.requireMember(projectId, userId);
    return prisma.taskEvent.findMany({
      where: {
        projectId,
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  private async _snapshot(client: Prisma.TransactionClient | typeof prisma, projectId: number): Promise<GraphSnapshot> {
    const [tasks, dependencies] = await Promise.all([
      client.task.findMany({
        where: { projectId },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      }),
      client.taskDependency.findMany({
        where: {
          prerequisite: { projectId },
          dependent: { projectId },
        },
      }),
    ]);
    return { tasks, dependencies };
  }

  private async _emit(
    type: TaskEventType,
    projectId: number,
    taskId?: number,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await taskService._emit(type, projectId, taskId, payload);
  }
}

export const dependencyService = new DependencyService();
