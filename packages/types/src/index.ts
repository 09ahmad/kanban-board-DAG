// ─────────────────────────────────────────────
// Domain type interfaces
// ─────────────────────────────────────────────

import { TaskStatus, ReadinessState } from "./enums.ts";

export interface Project {
  id: number;
  name: string;
  description?: string | null;
  ownerId: number;
  createdAt?: string;
  members?: { id: number; role: string }[];
  tasks?: Array<{
    id: number;
    title: string;
    description?: string | null;
    status: TaskStatus;
    readiness: ReadinessState;
    plannedStart?: string | null;
    duration?: number | null;
    computedStart?: string | null;
    computedEnd?: string | null;
    position: number;
  }>;
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