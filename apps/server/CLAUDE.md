# TaskFlow Pro — REST API Server & DAG Engine (`apps/server`) Agent Prompt & Context

This file contains the complete technical specification, architectural rules, DAG engine specification, and context for working on the **`apps/server`** workspace service.

---

## 1. Overview & Service Boundaries

`apps/server` is the main REST API service for TaskFlow Pro running on **Port 4000**, housing both the Express REST API endpoints and the **in-process DAG & Scheduling Engine** (`apps/server/src/engine/`).

It handles user authentication, project management, Kanban task movements, graph dependency calculations, AI suggestion management, and health checks.

### Workspaces Dependencies:
- `@repo/db`: Database client, Prisma schema, transactional persistence.
- `@repo/queue`: Redis Pub/Sub domain event publisher and BullMQ queues.
- `@repo/types`: Shared DTOs, Zod validation schemas, and TypeScript response interfaces.

---

## 2. Technology Stack Mandates

1. **REST Framework**: MUST use **Express.js** (`express`, `@types/express`, `cors`).
   - 🚫 DO NOT use `Bun.serve()` or native Bun HTTP routers.
2. **DAG Engine**: MUST live in `apps/server/src/engine/` as a pure TypeScript domain module (zero I/O dependencies). It is NOT a standalone server or separate workspace package.
3. **Authentication**: MUST use **JSON Web Tokens (`jsonwebtoken`)** and **bcrypt** (`bcrypt` or `bcryptjs`).
   - Endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
   - Never return `passwordHash` in API responses.
4. **Validation**: MUST use **Zod** (`zod`) schemas imported from `@repo/types`.
5. **Database Access**: MUST execute database operations through `@repo/db/client` singleton. Never write raw SQL.
6. **Event Publishing**: MUST publish domain events to Redis via `@repo/queue` after successful Prisma database transactions.

---

## 3. Directory & Code Structure

```text
apps/server/
├── src/
│   ├── engine/          # Pure TS DAG & Scheduling Engine (Zero I/O)
│   │   ├── types.ts            # GraphTask, GraphEdge, ReadinessResult, ScheduleResult
│   │   ├── graph.ts            # Adjacency list construction and graph helpers
│   │   ├── cycle-detector.ts   # DFS cycle detection (catch self, direct, indirect cycles)
│   │   ├── topological-sort.ts # Deterministic topological sort algorithm
│   │   ├── readiness.ts        # Task readiness (READY vs BLOCKED) calculation logic
│   │   ├── scheduler.ts        # Finish-to-Start date scheduling calculations
│   │   ├── critical-path.ts    # Longest path relaxation critical path algorithm
│   │   ├── errors.ts           # Typed domain errors (CycleDetectedError)
│   │   ├── index.ts            # Module exports
│   │   └── __tests__/          # DAG engine unit tests
│   │       ├── cycle-detection.test.ts
│   │       ├── topological-sort.test.ts
│   │       ├── readiness.test.ts
│   │       ├── scheduler.test.ts
│   │       ├── regression.test.ts
│   │       ├── convergence.test.ts # Diamond no-compounding test
│   │       └── critical-path.test.ts
│   ├── routes/          # Express router modules (/auth, /projects, /tasks, /dependencies, /ai)
│   ├── controllers/     # Thin controllers (no business logic; Zod validation & service invocation)
│   ├── services/        # Business logic (AuthService, ProjectService, TaskService, DependencyService, AiService)
│   ├── middleware/      # authMiddleware, errorHandler, validateRequest
│   ├── config/          # Environment variables and app configuration
│   └── index.ts         # Server startup & shutdown handling
├── package.json
└── tsconfig.json
```

---

## 4. In-Process DAG Engine Specification (`apps/server/src/engine`)

The DAG engine inside `apps/server/src/engine/` is a pure TypeScript domain module. It has ZERO network/database/filesystem I/O and operates strictly on plain TS data objects.

### Core Engine Algorithms:
1. **DFS Cycle Detector (`cycle-detector.ts`)**:
   - Checks reachability from dependent task back to prerequisite task ($O(V+E)$).
   - Rejects: Self cycle (`A→A`), Direct cycle (`A→B, B→A`), Indirect cycle (`A→B→C→A`).
   - Throws/returns `CycleDetectedError`.

2. **Topological Sort (`topological-sort.ts`)**:
   - Produces deterministic, acyclic execution order for graph nodes.

3. **Readiness Calculation (`readiness.ts`)**:
   - Tasks with no prerequisites $\to$ `READY`.
   - Tasks with prerequisites $\to$ `READY` if and only if **ALL** prerequisite tasks have `status === "DONE"`. Otherwise $\to$ `BLOCKED`.

4. **Finish-to-Start Scheduling & Diamond No-Compounding (`scheduler.ts`)**:
   - `computedStart = max(plannedStart, max(prerequisite.computedEnd))`
   - `computedEnd = computedStart + duration`
   - **Diamond Graph Rule (`A → B`, `A → C`, `B → D`, `C → D`)**: If `A` shifts forward by +3 days, `D` recalculates absolute `computedStart` from `max(B.computedEnd, C.computedEnd)` and shifts forward by +3 days **ONCE** (never compounding to +6).

5. **Downstream Regression Handling (`readiness.ts`)**:
   - If upstream `A` reverts from `DONE` to `IN_PROGRESS`, downstream tasks `B` and `C` revert `readiness` to `BLOCKED` while leaving their workflow `status` column untouched.

6. **Critical Path Analysis (`critical-path.ts`)**:
   - Longest path relaxation over topological sort order. Returns critical task IDs, edges, and total project duration.

---

## 5. Binding Domain Rules & Guards

1. **Blocked Task Movement Guard**:
   - A task with `readiness === "BLOCKED"` MUST NOT be moved to `status === "IN_PROGRESS"`. Return HTTP 400 with error code `TASK_IS_BLOCKED`.
2. **Derived Readiness Only**:
   - `Task.readiness` is engine-derived. NEVER accept `readiness` in any POST/PATCH request body.
3. **Atomic Transactions**:
   - Operations that mutate graph structure or task status must run inside a Prisma transaction covering `Task`, `TaskDependency`, and `TaskEvent`.
4. **Cycle Detection**:
   - Direct/indirect cycles (`A→A`, `A→B→A`, `A→B→C→A`) must be caught using `apps/server/src/engine` before executing database writes. Return HTTP 400 with code `CYCLE_DETECTED`.
5. **Downstream Event Emission**:
   - After a transaction commits, call `@repo/queue` to publish domain events (`TASK_CREATED`, `TASK_MOVED`, `TASK_READY`, `TASK_BLOCKED`, `DEPENDENCY_ADDED`, `DEPENDENCY_REMOVED`, `SCHEDULE_CHANGED`).

---

## 6. API Endpoints Contract & Response Format

### Uniform Response Format:
- **Success**: `{ "success": true, "data": <payload> }`
- **Error**: `{ "success": false, "error": { "code": "<ERROR_CODE>", "message": "<Human readable text>" } }`

### Endpoint Matrix:
- **Auth**: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- **Projects**: `POST /api/v1/projects`, `GET /api/v1/projects`, `GET /api/v1/projects/:projectId`, `PATCH /api/v1/projects/:projectId`, `DELETE /api/v1/projects/:projectId`
- **Members**: `POST /api/v1/projects/:projectId/members`, `DELETE /api/v1/projects/:projectId/members/:userId`
- **Tasks**: `POST /api/v1/projects/:projectId/tasks`, `GET /api/v1/projects/:projectId/tasks`, `GET /api/v1/tasks/:taskId`, `PATCH /api/v1/tasks/:taskId`, `PATCH /api/v1/tasks/:taskId/move`, `DELETE /api/v1/tasks/:taskId`
- **Dependencies**: `POST /api/v1/projects/:projectId/dependencies`, `DELETE /api/v1/dependencies/:dependencyId`
- **Graph & Critical Path**: `GET /api/v1/projects/:projectId/graph`, `GET /api/v1/projects/:projectId/critical-path`
- **AI Suggestions**: `POST /api/v1/projects/:projectId/ai/dependency-suggestions`, `POST /api/v1/ai/suggestions/:suggestionId/accept`, `POST /api/v1/ai/suggestions/:suggestionId/reject`
- **Health**: `GET /health`, `GET /ready`

---

## 7. Execution & Testing Commands

- **Development Server**: `bun run dev` (from workspace root)
- **Type Check**: `bun run check-types`
- **Engine Unit Tests**: `bun test apps/server/src/engine` (or `bun test`)
