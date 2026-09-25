export class CycleDetectedError extends Error {
  readonly code = "CYCLE_DETECTED" as const;
  constructor(message = "Adding this dependency would create a cycle.") {
    super(message);
    this.name = "CycleDetectedError";
  }
}

export class SelfDependencyError extends Error {
  readonly code = "SELF_DEPENDENCY" as const;
  constructor(message = "A task cannot depend on itself.") {
    super(message);
    this.name = "SelfDependencyError";
  }
}
