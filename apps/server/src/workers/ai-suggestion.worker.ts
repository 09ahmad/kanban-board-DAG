import { Worker } from "bullmq";
import { AI_SUGGESTIONS_QUEUE, redis, type AiSuggestionJob } from "@repo/queue";
import { aiService } from "../services/ai.service.js";

/**
 * Consumes `ai-suggestions`. The processor needs Prisma and the LLM provider,
 * which live in the API service, so the worker is hosted here rather than in
 * `@repo/queue` — only the queue mechanics are shared.
 */
export function startAiSuggestionWorker(): Worker<AiSuggestionJob> {
  const worker = new Worker<AiSuggestionJob>(
    AI_SUGGESTIONS_QUEUE,
    async (job) => {
      await aiService.processSuggestionJob(job.data);
    },
    { connection: redis, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error(`AI suggestion job ${job?.id ?? "unknown"} failed:`, err);
  });
  worker.on("error", (err) => {
    console.error("AI suggestion worker error:", err);
  });

  return worker;
}
