import WebSocket from "ws";
import { connectionManager } from "./manager.js";
import { WsSubscribeMessage } from "@repo/types";

export function handleClientMessage(ws: WebSocket, rawMessage: string): void {
  try {
    const message = JSON.parse(rawMessage) as WsSubscribeMessage;
    if (message.type === "PROJECT_SUBSCRIBE" && typeof message.projectId === "number") {
      connectionManager.subscribe(ws, message.projectId);
    }
  } catch {
    // Ignore invalid messages
  }
}