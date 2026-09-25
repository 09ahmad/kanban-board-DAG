export interface GraphTask {
  id: number;
  status: "BACKLOG" | "IN_PROGRESS" | "REVIEW" | "DONE";
  readiness: "READY" | "BLOCKED";
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
