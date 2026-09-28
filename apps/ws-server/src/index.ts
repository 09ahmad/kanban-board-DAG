import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(here, "../../../.env");
dotenv.config({ path: envPath, override: true });
dotenv.config();

import { Redis } from "ioredis";
import { connectionManager } from "./manager.js";
import { createWsServer } from "./server.js";

const WS_PORT = Number(process.env.WS_PORT) || 4001;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisSub = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

// Handle Redis connection errors to prevent unhandled exception crashes
redisSub.on("error", (err) => {
  console.error("WebSocket Redis connection error:", err.message);
});

const server = createWsServer(WS_PORT);

let isShuttingDown = false;

async function start() {
  try {
    await redisSub.connect();
    await redisSub.psubscribe("taskflow:project:*:events");
  } catch (err) {
    console.warn("WebSocket Redis connection warning (will retry automatically):", err);
  }

  redisSub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const match = channel.match(/taskflow:project:(\d+):events/);
    if (match) {
      const projectId = Number(match[1]);
      connectionManager.broadcast(projectId, message);
    }
  });

  await new Promise<void>((resolve) => {
    server.httpServer.listen(WS_PORT, () => resolve());
  });

  console.log(`WebSocket server listening on :${WS_PORT}`);
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("Shutting down WebSocket server...");
  try {
    await server.close();
    redisSub.disconnect();
  } catch (err) {
    console.error("Error during WebSocket shutdown:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

start().catch((err) => {
  console.error("Failed to start WS server:", err);
  process.exit(1);
});
