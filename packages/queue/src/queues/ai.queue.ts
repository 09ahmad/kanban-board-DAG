import { Queue } from "bullmq";
import { redis } from "../redis.js";

export interface AiSuggestionJob {
  projectId: number;
  taskId: number;
  requesterId: number;
}

export const AI_SUGGESTIONS_QUEUE = process.env.AI_SUGGESTIONS_QUEUE ?? "ai-suggestions";

/** `queued`/`running` mean work is outstanding; `completed`/`failed` are final. */
export type SuggestionRunState = "queued" | "running" | "completed" | "failed";

export const aiQueue = new Queue<AiSuggestionJob>(AI_SUGGESTIONS_QUEUE, {
  connection: redis,
});

/** One run per task, so re-requesting while a run is live reuses that job. */
export function suggestionJobId(taskId: number): string {
  return `${AI_SUGGESTIONS_QUEUE}-${taskId}`;
}

export async function enqueueSuggestionJob(data: AiSuggestionJob): Promise<string> {
  const jobId = suggestionJobId(data.taskId);
  await aiQueue.add("generate", data, {
    jobId,
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { age: 3600 },
  });
  return jobId;
}

/**
 * A completed run is reaped, so a missing job means "nothing is in flight" —
 * which is the final state a poller needs to read.
 */
export async function getSuggestionRunState(taskId: number): Promise<SuggestionRunState> {
  const job = await aiQueue.getJob(suggestionJobId(taskId));
  if (!job) return "completed";
  const state = await job.getState();
  if (state === "active") return "running";
  if (state === "failed") return "failed";
  if (state === "completed") return "completed";
  return "queued";
}
