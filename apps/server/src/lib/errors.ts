export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found.`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class CycleError extends AppError {
  constructor(message = "Adding this dependency would create a cycle.") {
    super("CYCLE_DETECTED", message, 400);
  }
}

export class SelfDependencyError extends AppError {
  constructor(message = "A task cannot depend on itself.") {
    super("SELF_DEPENDENCY", message, 400);
  }
}

export class BlockedTaskError extends AppError {
  constructor(message = "A blocked task cannot be moved to IN_PROGRESS.") {
    super("TASK_IS_BLOCKED", message, 400);
  }
}
