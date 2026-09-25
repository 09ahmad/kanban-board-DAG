# TaskFlow Pro — Complete Backend Implementation

You are the senior/principal backend engineer responsible for implementing the complete backend of **TaskFlow Pro**, a DAG-powered Kanban project management application, inside an already-initialized monorepo.

Read this entire document before writing any code. Then inspect the repository. Then implement. Do not stop after presenting a plan — execute it.

---

## 0. WHAT THIS PROJECT IS (for context you won't otherwise have)

TaskFlow Pro separates two kinds of task state that plain Kanban tools conflate:

- **Workflow state** (`status`): `BACKLOG → IN_PROGRESS → REVIEW → DONE`, set by the user via drag-and-drop.
- **Dependency state** (`readiness`): `READY` or `BLOCKED`, derived exclusively by a DAG engine from the dependency graph. It is never set directly by any client.

Dependency direction: `A → B` means **B depends on A** — A must be `DONE` before B can become `READY`.

Target users: small engineering/product teams (5–15 people, 20–50 concurrent tasks) who plan work as prerequisite chains (e.g. integration tests can't start until the backend API and DB schema are done) and need one trusted view of what's actually unblocked, instead of manually maintained status fields that silently go stale.

This is a 48-hour hackathon build. Production-quality within actual scope — not artificially complicated.

---

## 1. KNOWN REPOSITORY STATE — VERIFY, DON'T ASSUME

As of the last inspection, this is a Turborepo monorepo using **Bun** as the package manager (`devEngines.packageManager` = bun 1.2.19, Node >=24), with workspaces `apps/*` and `packages/*`:

- `apps/server` — Express + TypeScript REST API service on Port 4000. Contains the in-process **DAG Engine** in `apps/server/src/engine/`. Uses Express.js (`express`, `@types/express`).
- `apps/web` — Next.js frontend. **Do not touch this app; frontend is out of scope for backend tasks.**
- `apps/ws-server` — Standalone WebSocket server using explicit **`ws`** npm package (`import WebSocket, { WebSocketServer } from "ws"`). Subscribes to Redis Pub/Sub events from `@repo/queue`.
- `packages/db` — Prisma schema already exists at `packages/db/prisma/schema.prisma`. Uses **Prisma 7** with `provider = "prisma-client"` and `@prisma/adapter-pg`. Singleton `PrismaClient` exported from `@repo/db/client`.
- `packages/queue` — Redis & Queue service layer using **BullMQ** (`bullmq`) for async job queues and **`ioredis`** (`ioredis`) for Pub/Sub event distribution. DO NOT use Bun-native `Bun.redis`.
- `packages/types` — Shared TypeScript types (DTOs, domain types) and Zod validation schemas across workspaces.
- `.env`, `.env.example`, and Docker config (`docker-compose.yml` for PostgreSQL + Redis).

**Re-verify all of this yourself first** — this snapshot may be stale by the time you run. If anything has changed, follow what you actually find over what's written here, and note the discrepancy in your final report.

---

## 2. ARCHITECTURE — BINDING DECISION, DO NOT DEVIATE

```text
Next.js Frontend (out of scope)
       |
       | REST (Port 4000) + WebSocket (Port 4001)
       v
apps/server — Express + TypeScript API
       |
       ├──> src/engine (pure TS DAG engine, no I/O)
       |
       +-----------------------------+-----------------------------+
       |                             |                             |
       v                             v                             v
 packages/db (Prisma)            AI Service                    packages/queue
 → PostgreSQL                    (LLM calls only)              (BullMQ + ioredis Pub/Sub)
                                                                   |
                                                                   v
                                                            apps/ws-server (ws npm package)
                                                                   |
                                                                   v
                                                            Subscribed WS Clients
```

**Domain Event Broadcasting & Async Queuing Flow:**
1. Mutating HTTP requests are handled synchronously in `apps/server`.
2. The service layer in `apps/server` invokes the DAG Engine (`apps/server/src/engine`) in-process as plain function calls, and executes business logic within a Prisma PostgreSQL transaction (`Task` + `TaskDependency` + `TaskEvent`).
3. Upon committed transaction success, `apps/server` publishes a domain event to Redis Pub/Sub via `@repo/queue` (backed by `ioredis`).
4. Standalone `apps/ws-server` (built using the standard Node.js `ws` npm package) receives the Redis Pub/Sub event via `@repo/queue` and broadcasts the update to clients subscribed to that `projectId`.
5. Background asynchronous jobs (e.g. AI candidate generation, heavy batch updates) are dispatched to **BullMQ** queues managed in `@repo/queue`.

**The DAG Engine (`apps/server/src/engine`) must be a pure TypeScript domain module.** It is NOT a standalone server or separate workspace package; it lives directly inside `apps/server`. It must NOT depend on or import: Express, Prisma, PostgreSQL, Redis, WebSocket, HTTP, `process.env`, or any I/O. It operates only on plain TypeScript domain objects (tasks, edges) passed in as arguments, and returns plain data. This isolation is what makes the no-compounding and regression logic independently testable and is non-negotiable.

Do not introduce: Kafka, RabbitMQ, Bun-native Redis/WS built-ins, event sourcing, CQRS, microservices, Kubernetes-specific code, or complex distributed lock engines. PostgreSQL is the single source of truth; Redis + BullMQ handles real-time messaging and background task queuing.

---

## 3. FIRST ACTION — INSPECT THE REPOSITORY

Before writing code:

1. Read the root `package.json`, `turbo.json`, and workspace config.
2. Inspect every `apps/*` and `packages/*` directory fully.
3. Read `packages/db/prisma/schema.prisma` in full — this is the actual source of truth for the domain model.
4. Check for any existing ESLint/Prettier/TS config conventions and follow them.
5. Confirm there is no existing auth, validation, or logging infrastructure to avoid duplicating.

Do not duplicate existing infrastructure. Use existing repository conventions (naming, import style, workspace package linking via `@repo/*`) wherever reasonable.

---

## 4. DATABASE

`packages/db/prisma/schema.prisma` is the source of truth. Do not replace it — only modify it if a real implementation issue requires a change, and explain the change in your final report. Its entities: `User`, `Project`, `ProjectMember`, `Task`, `TaskDependency`, `AiSuggestion`, `TaskEvent`. Enums: `TaskStatus`, `ReadinessState`, `ProjectRole`, `SuggestionStatus`, `TaskEventType`. Key facts you must respect:

- `TaskDependency.prerequisiteTaskId → dependentTaskId` means the dependent task depends on the prerequisite task.
- `Task.readiness` is engine-derived and read-only from the API's perspective — no endpoint may accept a client-supplied `readiness` value.
- `Task.version` exists for optimistic concurrency — increment it on every update that changes scheduling/status-relevant fields.
- Both tasks in a `TaskDependency` **must** belong to the same project.
- `AiSuggestion.taskId` and `.prerequisiteTaskId` must both reference tasks in the same project as `AiSuggestion.projectId`.

---

## 5. DAG ENGINE — `apps/server/src/engine`

Pure TypeScript, zero infrastructure dependencies. Lives inside `apps/server/src/engine/`. Structure:

```text
apps/server/src/engine/
├── types.ts            # domain types: GraphTask, GraphEdge, etc.
├── graph.ts            # graph construction / adjacency helpers
├── cycle-detector.ts   # DFS cycle detection
├── topological-sort.ts
├── readiness.ts        # READY vs BLOCKED logic
├── scheduler.ts        # Finish-to-start date calculation
├── critical-path.ts
├── errors.ts           # typed domain errors (CycleDetectedError)
└── index.ts
```

Tests location: `apps/server/src/engine/__tests__/` or `apps/server/tests/engine/`:
```text
apps/server/src/engine/__tests__/
├── cycle-detection.test.ts
├── topological-sort.test.ts
├── readiness.test.ts
├── scheduler.test.ts
├── regression.test.ts
├── convergence.test.ts # diamond no-compounding tests
└── critical-path.test.ts
```

### Cycle detection
Before persisting `A → B`, check whether B can already reach A (DFS reachability, O(V+E)). Reject and return a typed error for self cycles (`A→A`), direct cycles (`A→B, B→A`), and indirect cycles (`A→B→C→A`).

### Topological sort
Deterministic. The graph must be acyclic before scheduling runs.

### Readiness (Ready/Blocked)
- No prerequisites → `READY`.
- One or more prerequisites → `READY` only when **every** prerequisite's `status === DONE`; otherwise `BLOCKED`.
- Derived exclusively by DAG engine.

### Regression handling
If `A` moves back from `DONE` to `IN_PROGRESS`, recompute downstream tasks. `B` and `C` revert `readiness` to `BLOCKED` without altering workflow `status`.

### Scheduling (finish-to-start) & No-compounding
- No prerequisites: `computedStart = plannedStart`.
- With prerequisites: `computedStart = max(plannedStart, max(computedEnd of prerequisites))`.
- `computedEnd = computedStart + duration`.
- **Diamond graphs (`A→B`, `A→C`, `B→D`, `C→D`)**: If `A` moves +3 days, `D` moves +3 days ONCE (never +6).

---

## 6. TASK SERVICE (`apps/server`)

Create, retrieve, update, delete, move, reorder tasks, validate status transitions, invoke `apps/server/src/engine`, persist state in `@repo/db`, and publish events via `@repo/queue`.
- **Blocked task guard**: A task with `readiness === BLOCKED` MUST NOT be moved to `IN_PROGRESS`.

---

## 7. DEPENDENCY SERVICE (`apps/server`)

`createDependency()`, `deleteDependency()`, `getProjectGraph()`. Creation workflow: validate IDs → verify same project → reject self-dependency → reject duplicate → run cycle detection → transactional DB update → recompute readiness and schedule → emit domain event via `@repo/queue`.

---

## 8. PROJECT SERVICE (`apps/server`)

Project CRUD, member management, and membership authorization checks.

---

## 9. AUTHENTICATION (`apps/server`)

JWT tokens (`jsonwebtoken`), password hashing (`bcrypt`/`bcryptjs`).
Endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
Never leak `passwordHash` in responses.

---

## 10. VALIDATION (`packages/types`)

Zod validation for all request bodies, route params, query strings, and AI payloads.

---

## 11. ERROR HANDLING

Centralized Express error middleware. Uniform JSON error response:
```json
{ "success": false, "error": { "code": "CYCLE_DETECTED", "message": "Adding this dependency would create a cycle." } }
```

---

## 12. REST API (`apps/server`)

Base path: `/api/v1` for Auth, Projects, Tasks, Dependencies, Graph, Critical Path, and AI Suggestions.
Response shape:
- Success: `{ "success": true, "data": {} }`
- Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

---

## 13. WEBSOCKET (`apps/ws-server`)

Standalone WebSocket server using the standard Node.js **`ws`** npm package (`import WebSocket, { WebSocketServer } from "ws"`).
- Listens on WebSocket port (e.g. 4001).
- Subscribes to Redis Pub/Sub channels via `@repo/queue` (`ioredis`).
- Handles `{ "type": "PROJECT_SUBSCRIBE", "projectId": "..." }`.
- Broadcasts real-time events (`TASK_CREATED`, `TASK_MOVED`, `TASK_READY`, `TASK_BLOCKED`, `DEPENDENCY_ADDED`, etc.) to subscribed clients.

---

## 14. AI DEPENDENCY SUGGESTIONS

Uses BullMQ background jobs / server service with LLM integration. Structured JSON output validated via Zod. On acceptance, edge creation runs through `DependencyService.createDependency()`.

---

## 15. TASK EVENTS

Persistent audit log (`TaskEvent` table) using `TaskEventType` enum with structured JSON payloads.

---

## 16. SECURITY & LOGGING

Password hashing, auth middleware, project membership checks, request validation, structured logging without sensitive data leakage.

---

## 17. HEALTH CHECKS

`GET /health` (liveness), `GET /ready` (verifies PostgreSQL and Redis connectivity).

---

## 18. TESTING

- Full unit test coverage for the DAG engine in `apps/server/src/engine` (cycles, topological sort, readiness, scheduler, diamond no-compounding, regression).
- Integration tests for Task, Dependency, and Event flow.

---

## 19. DOCUMENTATION & CONFIGURATION

- Service-level `AGENT.md` files in `apps/server`, `apps/ws-server`, `apps/web`, `packages/db`, `packages/queue`, `packages/types`.
- `.env.example` containing `DATABASE_URL`, `REDIS_URL`, `PORT`, `WS_PORT`, `JWT_SECRET`, `LLM_API_KEY`.
- `docker-compose.yml` for local PostgreSQL and Redis services.

---

## 20. DEFINITION OF DONE

- [ ] PostgreSQL and Redis run locally via `docker-compose.yml`
- [ ] Prisma 7 migrations and seed script run successfully
- [ ] Express REST API (`apps/server`) starts on Port 4000
- [ ] Standalone WebSocket server (`apps/ws-server`) uses `ws` npm package and listens on WebSocket port
- [ ] Redis Pub/Sub & BullMQ queues (`packages/queue`) process events and background jobs via `ioredis` and `bullmq`
- [ ] In-process pure TS DAG engine (`apps/server/src/engine`) passes all cycle, readiness, scheduler, diamond no-compounding, and regression tests
- [ ] Register/login/logout/me work with JWT and bcrypt; no `passwordHash` leaked
- [ ] Task CRUD, move guard (BLOCKED tasks cannot move to IN_PROGRESS), and position persistence work
- [ ] Dependency creation/deletion work transactionally and emit Redis domain events
- [ ] AI suggestions are validated via Zod and routed through standard dependency validation on accept
- [ ] All workspace service `AGENT.md` context files exist and are up to date