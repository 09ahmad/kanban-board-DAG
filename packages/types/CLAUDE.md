# TaskFlow Pro — Types Package (`packages/types`) Agent Prompt & Context

This file contains the complete technical specification, DTO definitions, and Zod schema guidelines for working on the **`packages/types`** workspace package (`@repo/types`).

---

## 1. Overview & Package Boundaries

`packages/types` is the single source of truth for TypeScript types, DTOs, Zod validation schemas, and API response structures across all applications (`apps/server`, `apps/ws-server`, `apps/web`) and workspace packages.

---

## 2. Technology Stack Mandates

1. **Validation Engine**: MUST use **Zod** (`zod`).
2. **Type Generation**: Export TypeScript interfaces derived from Zod schemas (`z.infer<typeof schema>`).

---

## 3. Directory & File Structure

```text
packages/types/
├── src/
│   ├── schemas/         # Zod validation schemas (auth, project, task, dependency, ai)
│   ├── dtos/            # Inferred DTO types & API request/response contracts
│   ├── events.ts        # Domain event interfaces & WebSocket message shapes
│   ├── api.ts           # Standard API Envelope interfaces (ApiSuccessResponse, ApiErrorResponse)
│   └── index.ts         # Public package exports
├── package.json
└── tsconfig.json
```

---

## 4. Key Schemas & Type Contracts

### A. Uniform API Envelope Types
```typescript
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

### B. Core Zod Validation Schemas
- **Auth**: `RegisterSchema`, `LoginSchema`
- **Project**: `CreateProjectSchema`, `UpdateProjectSchema`, `AddMemberSchema`
- **Task**: `CreateTaskSchema`, `UpdateTaskSchema`, `MoveTaskSchema`
  - *Constraint*: `readiness` field MUST NOT exist in `CreateTaskSchema`, `UpdateTaskSchema`, or `MoveTaskSchema`.
- **Dependency**: `CreateDependencySchema` (`prerequisiteTaskId`, `dependentTaskId`)
- **AI Suggestions**: `AiSuggestionResponseSchema` (confirms LLM response structure: `suggestions: Array<{ prerequisiteTaskId: string, confidence: number, reason: string }>`)

### C. Domain & WebSocket Event Shapes
```typescript
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

export interface WsSubscribeMessage {
  type: "PROJECT_SUBSCRIBE";
  projectId: string;
}

export interface WsEventBroadcast {
  type: TaskEventType;
  projectId: string;
  taskId?: string;
  payload: Record<string, unknown>;
}
```

---

## 5. Execution Commands

- **Type Check**: `bun run check-types`
- **Tests**: `bun test`
