import { prisma } from "@repo/db/client";
import { enqueueSuggestionJob, getSuggestionRunState, type SuggestionRunState } from "@repo/queue";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import { createAiProvider, type AiProvider } from "../lib/ai-provider.js";
import { dependencyService } from "./dependency.service.js";
import { projectService } from "./project.service.js";
import { taskService } from "./task.service.js";
import type { AiSuggestion, Task, Prisma } from "@repo/db/generated/prisma/client";

let aiProvider: AiProvider = createAiProvider();

/** Lets a test drive the queue without an LLM behind it. */
export function setAiProvider(provider: AiProvider): void {
  aiProvider = provider;
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

  async getSuggestions(projectId: number, taskId: number, requesterId: number): Promise<{ suggestions: AiSuggestion[]; status: SuggestionRunState }> {
    await projectService.requireMember(projectId, requesterId);
    const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) throw new NotFoundError("Task");

    const [suggestions, status] = await Promise.all([
      prisma.aiSuggestion.findMany({ where: { taskId, status: "PENDING" } }),
      getSuggestionRunState(taskId),
    ]);
    return { suggestions, status };
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

  async acceptSuggestion(suggestionId: number, userId: number): Promise<{ suggestion: AiSuggestion; graph: { tasks: Task[]; dependencies: { prerequisiteTaskId: number; dependentTaskId: number }[] } }> {
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
    return { suggestion: updated, graph };
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
