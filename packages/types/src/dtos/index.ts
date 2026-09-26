import type {
  TaskStatus,
  ReadinessState,
  ProjectRole,
  SuggestionStatus,
  TaskEventType,
} from "../enums.js";

export interface ProjectDto {
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

export interface TaskDto {
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
  project?: ProjectDto;
}

export interface TaskDependencyDto {
  id: number;
  prerequisiteTaskId: number;
  dependentTaskId: number;
}

export interface AiSuggestionItemDto {
  prerequisiteTaskId: number;
  confidence: number;
  reason?: string | null;
}

export interface AiSuggestionResponseDto {
  suggestions: AiSuggestionItemDto[];
}