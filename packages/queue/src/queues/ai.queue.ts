import { Queue } from "bullmq";
import { redis } from "../redis.js";

export interface AiSuggestionJob {
  projectId: number;
  taskId: number;
  requesterId: number;
}

export const aiQueue = new Queue<AiSuggestionJob>("ai-suggestions", {
  connection: redis,
});
