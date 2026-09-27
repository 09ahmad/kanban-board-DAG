import type { TaskEventType, TaskStatus, ReadinessState } from "./enums.ts";

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

export interface TaskEvent {
  id: number;
  type: TaskEventType;
  projectId: number;
  taskId: number | null;
  actorId: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CriticalPathResult {
  criticalTaskIds: number[];
  criticalEdges: Array<{ prerequisiteTaskId: number; dependentTaskId: number }>;
  totalDurationDays: number;
}

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  readiness: ReadinessState;
  plannedStart?: string | null;
  duration?: number | null;
  computedStart?: string | null;
  computedEnd?: string | null;
  position: number;
  createdAt?: string;
  updatedAt?: string;
}
