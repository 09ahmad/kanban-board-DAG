// ─────────────────────────────────────────────
// Domain type interfaces
// ─────────────────────────────────────────────

import { TaskStatus, ReadinessState, ProjectRole } from "./enums.ts";

export interface ProjectMember {
  id: number;
  projectId: number;
  userId: number;
  role: ProjectRole;
  joinedAt?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string | null;
  ownerId: number;
  createdAt?: string;
  members?: ProjectMember[];
  tasks?: Task[];
}

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  readiness: ReadinessState;
  plannedStart?: Date | null;
  duration?: number | null;
  computedStart?: Date | null;
  computedEnd?: Date | null;
  position: number;
  createdAt?: string;
  updatedAt?: string;
  project?: Project;
}

export interface TaskDependency {
  id: number;
  prerequisiteTaskId: number;
  dependentTaskId: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  plannedStart?: string | null;
  duration?: number;
}

export interface CriticalPathResult {
  criticalTaskIds: number[];
  criticalEdges: Array<{ prerequisiteTaskId: number; dependentTaskId: number }>;
  totalDurationDays: number;
}

export interface TaskEvent {
  id: number;
  projectId: number;
  taskId?: number | null;
  actorId?: number | null;
  type: TaskEventType;
  payload?: Record<string, unknown> | null;
  createdAt: string | Date;
}

export type TaskEventType = 
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_MOVED"
  | "TASK_DELETED"
  | "TASK_READY"
  | "TASK_BLOCKED"
  | "DEPENDENCY_ADDED"
  | "DEPENDENCY_REMOVED"
  | "SCHEDULE_CHANGED"
  | "GRAPH_UPDATED"
  | "AI_SUGGESTION_CREATED"
  | "AI_SUGGESTION_ACCEPTED"
  | "AI_SUGGESTION_REJECTED";

// ─────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────

export * from "./enums.ts";
export * from "./api.ts";
export * from "./events.ts";
export * from "./schemas/auth.ts";
export * from "./schemas/project.ts";
export * from "./schemas/task.ts";
export * from "./schemas/dependency.ts";
export * from "./schemas/ai.ts";
export * from "./schemas/events.ts";
