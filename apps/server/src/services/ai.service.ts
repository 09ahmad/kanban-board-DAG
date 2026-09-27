import { prisma } from "@repo/db/client";
import { enqueueSuggestionJob, getSuggestionRunState, type SuggestionRunState } from "@repo/queue";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import { createAiProvider, type AiProvider } from "../lib/ai-provider.js";
import { computeCriticalPath } from "../engine/index.js";
import { dependencyService } from "./dependency.service.js";
import { projectService } from "./project.service.js";
import { taskService } from "./task.service.js";
import type { AiSuggestion, Task, Prisma } from "@repo/db/generated/prisma/client";

let aiProvider: AiProvider = createAiProvider();

/** Lets a test drive the queue without an LLM behind it. */
export function setAiProvider(provider: AiProvider): void {
  aiProvider = provider;
}

/**
 * Day-impact of adding one edge, expressed as the difference between the
 * critical path with it and without it. Reuses the engine's own math —
 * no critical-path logic lives here.
 */
function edgeImpactDays(
  taskList: Parameters<typeof computeCriticalPath>[0],
  edges: Parameters<typeof computeCriticalPath>[1],
  prerequisiteTaskId: number,
  dependentTaskId: number,
): number {
  const baseline = computeCriticalPath(taskList, edges).totalDurationDays;
  const withEdge = computeCriticalPath(taskList, [
    ...edges,
    { prerequisiteTaskId, dependentTaskId },
  ]).totalDurationDays;
  return withEdge - baseline;
}

export class AiService {
  /**
   * Access is settled here, before the work is handed off: by the time the
   * worker runs, the requester's membership is irrelevant to the LLM call.
   */
  async enqueueSuggestions(projectId: number, taskId: number, requesterId: number): Promise<{ queued: true; jobId: string }> {
    await projectService.requireMember(projectId, requesterId);
    const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) throw new NotFoundError("Task");

    const jobId = await enqueueSuggestionJob({ projectId, taskId, requesterId });
    return { queued: true, jobId };
  }

  async getSuggestions(projectId: number, taskId: number, requesterId: number): Promise<{ suggestions: Array<AiSuggestion & { criticalPathImpactDays: number }>; status: SuggestionRunState }> {
    await projectService.requireMember(projectId, requesterId);
    const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) throw new NotFoundError("Task");

    const [suggestions, status] = await Promise.all([
      prisma.aiSuggestion.findMany({ where: { taskId, status: "PENDING" } }),
      getSuggestionRunState(taskId),
    ]);

    // Impact is computed at read time (never persisted) so the UI can show it
    // on each suggestion before the user confirms an accept.
    const { tasks, edges } = await taskService._loadGraph(projectId);
    const list = [...tasks.values()];
    const withImpact = suggestions.map((s) => ({
      ...s,
      criticalPathImpactDays: edgeImpactDays(list, edges, s.prerequisiteTaskId, s.taskId),
    }));
    return { suggestions: withImpact, status };
  }

  /** Runs inside the BullMQ worker, never in an HTTP request. */
  async processSuggestionJob({ projectId, taskId }: { projectId: number; taskId: number; requesterId: number }): Promise<{ suggestions: AiSuggestion[] }> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError("Project");
    const tasks = await prisma.task.findMany({ where: { projectId } });
    const current = tasks.find((t) => t.id === taskId);
    if (!current) throw new NotFoundError("Task");

    let raw: { prerequisiteTaskId: number; confidence: number; reason?: string }[] = [];
    try {
      raw = await aiProvider.generateDependencySuggestions({
        projectName: project.name,
        taskId,
        tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
      });
    } catch (err) {
      console.warn("AI provider failed; degrading to empty suggestions", err);
      raw = [];
    }

    const existing = await prisma.aiSuggestion.findMany({
      where: { taskId },
    });
    const existingPairs = new Set(existing.map((s) => s.prerequisiteTaskId));
    const taskIds = new Set(tasks.map((t) => t.id));

    const valid = raw.filter((item) => {
      if (!taskIds.has(item.prerequisiteTaskId)) return false;
      if (item.prerequisiteTaskId === taskId) return false;
      if (existingPairs.has(item.prerequisiteTaskId)) return false;
      return true;
    });

    if (valid.length > 0) {
      await prisma.aiSuggestion.createMany({
        data: valid.map((item) => ({
          projectId,
          taskId,
          prerequisiteTaskId: item.prerequisiteTaskId,
          confidence: item.confidence,
          reason: item.reason,
          status: "PENDING" as const,
        })),
      });
    }

    const suggestions = await prisma.aiSuggestion.findMany({
      where: { taskId, status: "PENDING" },
    });
    for (const suggestion of suggestions) {
      await taskService._emit("AI_SUGGESTION_CREATED", projectId, taskId, {
        suggestionId: suggestion.id,
      });
    }
    return { suggestions };
  }

  async acceptSuggestion(suggestionId: number, userId: number): Promise<{ suggestion: AiSuggestion; graph: { tasks: Task[]; dependencies: { prerequisiteTaskId: number; dependentTaskId: number }[] }; criticalPathImpactDays: number }> {
    const suggestion = await prisma.aiSuggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundError("Suggestion");
    if (suggestion.status !== "PENDING") {
      throw new ConflictError("Suggestion is not pending.");
    }
    await projectService.requireMember(suggestion.projectId, userId);
    const graph = await dependencyService.createDependency(
      suggestion.projectId,
      {
        prerequisiteTaskId: suggestion.prerequisiteTaskId,
        dependentTaskId: suggestion.taskId,
      },
      userId,
    );
    const updated = await prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "ACCEPTED",
        decidedById: userId,
        decidedAt: new Date(),
      },
    });
    await taskService._emit("AI_SUGGESTION_ACCEPTED", suggestion.projectId, suggestion.taskId, {
      suggestionId,
    });
    // The edge is committed now; the impact is what the critical path gained
    // from it, reusing the engine's math.
    const { tasks, edges } = await taskService._loadGraph(suggestion.projectId);
    const list = [...tasks.values()];
    const withoutEdge = edges.filter(
      (e) => !(e.prerequisiteTaskId === suggestion.prerequisiteTaskId && e.dependentTaskId === suggestion.taskId),
    );
    const criticalPathImpactDays = computeCriticalPath(list, edges).totalDurationDays - computeCriticalPath(list, withoutEdge).totalDurationDays;
    return { suggestion: updated, graph, criticalPathImpactDays };
  }

  async rejectSuggestion(suggestionId: number, userId: number): Promise<AiSuggestion> {
    const suggestion = await prisma.aiSuggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundError("Suggestion");
    if (suggestion.status !== "PENDING") {
      throw new ConflictError("Suggestion is not pending.");
    }
    await projectService.requireMember(suggestion.projectId, userId);
    const updated = await prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "REJECTED",
        decidedById: userId,
        decidedAt: new Date(),
      },
    });
    await taskService._emit("AI_SUGGESTION_REJECTED", suggestion.projectId, suggestion.taskId, {
      suggestionId,
    });
    return updated;
  }
}

export const aiService = new AiService();
