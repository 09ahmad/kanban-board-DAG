export interface GraphTask {
  id: number;
  status: "BACKLOG" | "IN_PROGRESS" | "REVIEW" | "DONE";
  readiness: "READY" | "BLOCKED";
  /** Board order within the task's column. Carried for persistence only; the engine never reads it. */
  position?: number;
  plannedStart?: Date;
  duration?: number;
  computedStart?: Date;
  computedEnd?: Date;
}

export interface GraphEdge {
  prerequisiteTaskId: number;
  dependentTaskId: number;
}

export type Readiness = "READY" | "BLOCKED";
