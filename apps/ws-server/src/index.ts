import "dotenv/config";
import { WebSocketServer } from "ws";
import { Redis } from "ioredis";
import { connectionManager } from "./manager.js";
import { handleClientMessage } from "./handlers.js";

const WS_PORT = Number(process.env.WS_PORT) || 4001;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisSub = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

const wss = new WebSocketServer({ port: WS_PORT });

async function start() {
  await redisSub.connect();
  await redisSub.psubscribe("taskflow:project:*:events");

  redisSub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const match = channel.match(/taskflow:project:(\d+):events/);
    if (match) {
      const projectId = Number(match[1]);
      connectionManager.broadcast(projectId, message);
    }
  });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      handleClientMessage(ws, data.toString());
    });

    ws.on("close", () => {
      connectionManager.remove(ws);
    });

    ws.on("error", (err) => {
      console.error("WS error:", err);
      connectionManager.remove(ws);
    });
  });

  console.log(`WebSocket server listening on :${WS_PORT}`);
}

async function shutdown() {
  console.log("Shutting down WebSocket server...");
  wss.close();
  await redisSub.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

start().catch((err) => {
  console.error("Failed to start WS server:", err);
  process.exit(1);
});