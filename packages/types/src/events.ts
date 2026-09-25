import type { TaskEventType } from "./enums.js";

export interface WsSubscribeMessage {
  type: "PROJECT_SUBSCRIBE";
  projectId: number;
}

export interface WsEventBroadcast {
  type: TaskEventType;
  projectId: number;
  taskId?: number;
  payload: Record<string, unknown>;
}

export interface RedisDomainEvent extends WsEventBroadcast {
  timestamp: string;
}
