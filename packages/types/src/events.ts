import type { TaskEventType, TaskStatus, ReadinessState } from "./enums.ts";

export interface WsSubscribeMessage {
  type: "PROJECT_SUBSCRIBE";
  projectId: number;
}

export interface WsEventBroadcast {
  type: TaskEventType;
  projectId: number;
  taskId?: number;
  /**
   * Who caused it. Absent for work with no human behind it — the AI worker, and
   * anything published outside a request. Clients use this to tell their own
   * echo apart from a teammate's, which is the difference between a useful
   * notification and noise about what you just did yourself.
   */
  actorId?: number;
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
