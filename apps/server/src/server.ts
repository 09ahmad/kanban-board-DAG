import { prisma } from "@repo/db/client";
import { redis, redisPublisher, redisSubscriber } from "@repo/queue";
import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { startAiSuggestionWorker } from "./workers/ai-suggestion.worker.js";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
});
const aiWorker = startAiSuggestionWorker();

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down`);
  server.close(async () => {
    await aiWorker.close();
    await prisma.$disconnect();
    redis.disconnect();
    redisPublisher.disconnect();
    redisSubscriber.disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
