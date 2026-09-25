# TaskFlow Pro — Backend Implementation Plan

> **For Claude Code / AI Agent Execution**
> Read this plan top-to-bottom before writing a single line of code. Work through phases in order. Do not skip ahead. Each phase has a precise set of files to create and a verification step before moving to the next phase.

---

## Current Repo State (As of Plan Creation)

### ✅ Already Done
- `packages/db/prisma/schema.prisma` — complete schema with all models, enums, indexes, and relations
- `packages/db/prisma.config.ts` — Prisma 7 config with `DATABASE_URL` from env
- `packages/db/src/client.ts` — singleton `PrismaClient` with `@prisma/adapter-pg`
- `packages/db/src/index.ts` — re-exports `prisma` and `PrismaClient`
- `packages/db/package.json` — exports `@repo/db` and `@repo/db/client`

### ⬜ Scaffolding Exists (Empty/Stub Files Only)
- `apps/server/src/app.ts` — empty
- `apps/server/src/server.ts` — empty
- `apps/server/src/services/index.ts` — empty
- `apps/server/src/routes/index.ts` — empty
- `apps/server/src/dag-engine/index.ts` — stub (rename to `engine/`)
- `apps/server/src/controllers/` — empty directory
- `apps/server/src/middleware/` — empty directory
- `apps/server/package.json` — needs `scripts`, `dependencies` updated
- `apps/ws-server/` — scaffolded but unimplemented
- `packages/queue/` — no `src/` directory, no deps installed
- `packages/types/` — only a placeholder `index.ts`

### ⬜ Not Created Yet
- `.env`, `.env.example` at repo root
- `docker-compose.yml`
- AI service
- All unit and integration tests

---

## Phase 0 — Environment & Docker Setup

**Goal**: Local PostgreSQL and Redis running; `.env` ready, Note a postgres docker container already running on port 5432 .

### Files to Create

**`docker-compose.yml`** (root):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: taskflow
      POSTGRES_PASSWORD: taskflow
      POSTGRES_DB: taskflow
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

**`.env.example`** (root):
```env
DATABASE_URL=postgresql://taskflow:taskflow@localhost:5432/taskflow
REDIS_URL=redis://localhost:6379
PORT=4000
WS_PORT=4001
NODE_ENV=development
JWT_SECRET=change-me-in-production-min-32-chars
CORS_ORIGIN=http://localhost:3000
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

**`.env`** (root, gitignored): Same as above with a real `JWT_SECRET` (run `openssl rand -hex 32`).

> **Verify**: `docker compose up -d` — both containers healthy.

---

## Phase 1 — Shared Types (`packages/types`)

**Goal**: All DTOs, Zod schemas, and shared interfaces used across every service.

### Install
```bash
cd packages/types && bun add zod
```

### Files to Create

**`packages/types/src/enums.ts`**
Mirror Prisma enums as plain TypeScript constants (importable without `@repo/db`):
- `TaskStatus`, `ReadinessState`, `ProjectRole`, `SuggestionStatus`, `TaskEventType` (all 13 values)

**`packages/types/src/api.ts`**
```ts
export interface ApiSuccess<T> { success: true; data: T; meta?: Record<string, unknown> }
export interface ApiError { success: false; error: { code: string; message: string } }
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

**`packages/types/src/schemas/auth.ts`**
- `RegisterSchema`: `{ name: string min(1), email: email, password: string min(8) }`
- `LoginSchema`: `{ email: email, password: string min(1) }`

**`packages/types/src/schemas/project.ts`**
- `CreateProjectSchema`, `UpdateProjectSchema` (partial), `AddMemberSchema`

**`packages/types/src/schemas/task.ts`**
- `CreateTaskSchema`: title, description?, status?, position?, plannedStart?, duration?
- **IMPORTANT**: `readiness` MUST NOT appear in any task schema — it is derived only
- `UpdateTaskSchema`: partial of Create
- `MoveTaskSchema`: `{ status: TaskStatus, position?: number }`

**`packages/types/src/schemas/dependency.ts`**
- `CreateDependencySchema`: `{ prerequisiteTaskId: number, dependentTaskId: number }`

**`packages/types/src/schemas/ai.ts`**
- `AiSuggestionItemSchema`: `{ prerequisiteTaskId: number, confidence: number(0–1), reason?: string }`
- `AiSuggestionResponseSchema`: `{ suggestions: AiSuggestionItemSchema[] max(10) }`

**`packages/types/src/events.ts`**
```ts
export interface WsSubscribeMessage { type: 'PROJECT_SUBSCRIBE'; projectId: number }
export interface WsEventBroadcast { type: TaskEventType; projectId: number; taskId?: number; payload: Record<string, unknown> }
export interface RedisDomainEvent extends WsEventBroadcast { timestamp: string }
```

**`packages/types/src/index.ts`** — re-export everything.

**Update `packages/types/package.json`**: add `exports`, `dependencies: { zod }`.

> **Verify**: `cd packages/types && bunx tsc --noEmit`

---

## Phase 2 — Queue Package (`packages/queue`)

**Goal**: `ioredis` Pub/Sub publisher + subscriber + BullMQ queue definitions.

### Install
```bash
cd packages/queue && bun add ioredis bullmq
bun add -d @types/node
```

### Files to Create

**`packages/queue/src/redis.ts`**
Three separate `ioredis` connections:
- `redisPublisher` — for publishing (`publish()`)
- `redisSubscriber` — for subscribing (cannot publish while subscribed)
- `redis` — general connection for BullMQ workers and ops

All use `REDIS_URL` env var, `lazyConnect: true`, `maxRetriesPerRequest: null`.

**`packages/queue/src/channels.ts`**
```ts
export const projectChannel = (projectId: number) => `taskflow:project:${projectId}:events`;
```

**`packages/queue/src/publisher.ts`**
```ts
export async function publishDomainEvent(event: RedisDomainEvent): Promise<void>
// Serializes to JSON → redisPublisher.publish(projectChannel(event.projectId), json)
```

**`packages/queue/src/subscriber.ts`**
- Manages `listeners: Map<channel, Set<callback>>`
- `subscribeToProject(projectId, cb)` — subscribes channel if not already; adds cb
- `unsubscribeFromProject(projectId, cb)` — removes cb; unsubscribes channel if empty

**`packages/queue/src/queues/ai.queue.ts`**
```ts
export const aiQueue = new Queue<AiSuggestionJob>('ai-suggestions', { connection: redis })
```

**`packages/queue/src/index.ts`** — re-export everything.

**Update `packages/queue/package.json`**: add `exports`, `dependencies: { ioredis, bullmq }`.

> **Verify**: `cd packages/queue && bunx tsc --noEmit`

---

## Phase 3 — DAG Engine (`apps/server/src/engine`)

**Goal**: Pure TS graph computation. Zero I/O. This is the correctness core.

> Note: Existing stub `apps/server/src/dag-engine/` should be renamed/replaced by `apps/server/src/engine/`.

### Files to Create

**`apps/server/src/engine/types.ts`**
```ts
export interface GraphTask {
  id: number;
  status: 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  readiness: 'READY' | 'BLOCKED';
  plannedStart?: Date;
  duration?: number;       // calendar days
  computedStart?: Date;
  computedEnd?: Date;
}
export interface GraphEdge { prerequisiteTaskId: number; dependentTaskId: number; }
```

**`apps/server/src/engine/errors.ts`**
- `CycleDetectedError` (code: `CYCLE_DETECTED`)
- `SelfDependencyError` (code: `SELF_DEPENDENCY`)

**`apps/server/src/engine/graph.ts`**
- `buildAdjacency(edges)` → `{ prereqsOf: Map, dependentsOf: Map }`

**`apps/server/src/engine/cycle-detector.ts`**
- `wouldCreateCycle(edges, prerequisiteId, dependentId): boolean` — DFS from dependent, check if prereq is reachable ($O(V+E)$)
- `assertNoCycle(edges, prerequisiteId, dependentId): void` — throws `SelfDependencyError` or `CycleDetectedError`

**`apps/server/src/engine/topological-sort.ts`**
- `topologicalSort(taskIds, edges): number[]` — Kahn's BFS algorithm; deterministic by sorting IDs; throws if cyclic

**`apps/server/src/engine/readiness.ts`**
- `computeReadiness(tasks, edges): Map<number, 'READY'|'BLOCKED'>` — no prereqs → READY; all prereqs DONE → READY; else BLOCKED
- `computeDownstreamReadiness(tasks, edges, changedTaskIds): Map<number, ...>` — only affected descendants

**`apps/server/src/engine/scheduler.ts`**
Critical no-compounding rule: process tasks in topological order, each task recomputes absolute dates from current prereq computedEnd values (never accumulates deltas):
- `computedStart = max(plannedStart, max(prereqs.computedEnd))`
- `computedEnd = computedStart + duration days`
- `computeSchedule(tasks, edges, topoOrder): Map<number, { computedStart, computedEnd }>`

**`apps/server/src/engine/critical-path.ts`**
- `computeCriticalPath(tasks, edges): { criticalTaskIds, criticalEdges, totalDurationDays }` — longest-path relaxation over topo order

**`apps/server/src/engine/index.ts`** — re-export all.

### Unit Tests (`apps/server/src/engine/__tests__/`)

| File | Required test cases |
|------|---|
| `cycle-detection.test.ts` | Self-cycle A→A; Direct A→B, B→A; Indirect A→B→C→A; Valid chain passes |
| `topological-sort.test.ts` | Linear chain; Diamond; Disconnected nodes; Cyclic throws |
| `readiness.test.ts` | No deps → READY; One dep not DONE → BLOCKED; All DONE → READY; Multi-prereq: both must be DONE |
| `scheduler.test.ts` | No prereq uses plannedStart; Chain propagation; Diamond no-compounding (+3d A → D shifts +3 not +6) |
| `regression.test.ts` | A→B→C all DONE; A reverts to IN_PROGRESS; B and C become BLOCKED but `status` untouched |
| `convergence.test.ts` | Diamond A→B, A→C, B→D, C→D; A shifts +3d; D shifts +3d exactly once |
| `critical-path.test.ts` | Linear path; Diamond picks longest branch |

> **Verify**: `bun test apps/server/src/engine` — all green before next phase.

---

## Phase 4 — Server Foundation (`apps/server`)

**Goal**: Express app + middleware + health endpoints + graceful shutdown.

### Install
```bash
cd apps/server
bun add express cors helmet morgan jsonwebtoken bcryptjs dotenv zod
bun add -d @types/express @types/cors @types/morgan @types/jsonwebtoken @types/bcryptjs @types/node
```

### Update `apps/server/package.json`
```json
{
  "name": "api",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun run --watch src/server.ts",
    "start": "bun run src/server.ts",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "@repo/queue": "workspace:*",
    "@repo/types": "workspace:*",
    "express": "^4",
    "cors": "^2",
    "helmet": "^8",
    "morgan": "^1",
    "jsonwebtoken": "^9",
    "bcryptjs": "^3",
    "dotenv": "^18",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/express": "^4",
    "@types/cors": "^2",
    "@types/morgan": "^1",
    "@types/jsonwebtoken": "^9",
    "@types/bcryptjs": "^2",
    "@types/node": "^26",
    "@types/bun": "latest",
    "@repo/typescript-config": "workspace:*"
  }
}
```

### Files to Create

**`apps/server/src/config/env.ts`**
```ts
// Loads all env vars, validates required ones, exports typed `config` object
// Throws on missing JWT_SECRET
export const config = { port, nodeEnv, jwtSecret, corsOrigin, redisUrl, llm: { apiKey, baseUrl, model } }
```

**`apps/server/src/lib/errors.ts`**
Domain error hierarchy all extending `AppError`:
- `AppError(code, message, statusCode)` — base
- `ValidationError` → 400
- `AuthenticationError` → 401
- `AuthorizationError` → 403
- `NotFoundError(resource)` → 404
- `ConflictError` → 409
- `CycleError` → 400 `CYCLE_DETECTED`
- `SelfDependencyError` → 400 `SELF_DEPENDENCY`
- `BlockedTaskError` → 400 `TASK_IS_BLOCKED`

**`apps/server/src/middleware/errorHandler.ts`**
Centralized Express error handler — maps `AppError` → JSON response; masks 500 internals in production.

**`apps/server/src/middleware/validate.ts`**
```ts
validate(schema, target?: 'body'|'params'|'query') → Express middleware
// Uses schema.safeParse; on failure throws ValidationError with joined messages
```

**`apps/server/src/middleware/authMiddleware.ts`**
```ts
// Extracts Bearer token → jwt.verify → attaches req.user = { userId, email }
// Throws AuthenticationError on missing/invalid token
declare global { namespace Express { interface Request { user?: { userId: number; email: string } } } }
```

**`apps/server/src/app.ts`**
```ts
// Express app with: helmet, cors, json body parser (1mb limit), morgan logging
// Routes: GET /health, GET /ready (DB ping), /api/v1 → router
// Last middleware: errorHandler
```

**`apps/server/src/server.ts`**
```ts
// Starts HTTP server, registers SIGTERM/SIGINT handlers
// Shutdown: server.close → prisma.$disconnect() → redis.disconnect() → exit(0)
```

> **Verify**: `bun run dev` — server starts, `/health` and `/ready` return `{ "status": "ok" }`.

---

## Phase 5 — Authentication

**Goal**: Register, login, logout, /me with JWT + bcrypt.

### Files to Create

**`apps/server/src/services/auth.service.ts`**
```ts
class AuthService {
  async register(dto: RegisterDto): Promise<{ user: SafeUser; token: string }>
  // - Check email uniqueness → ConflictError if taken
  // - bcryptjs.hash(password, 12)
  // - prisma.user.create(...)
  // - signToken({ userId, email })
  // - return omitHash(user) + token

  async login(dto: LoginDto): Promise<{ user: SafeUser; token: string }>
  // - Find by email → AuthenticationError if not found
  // - bcrypt.compare → AuthenticationError if mismatch
  // - signToken + return

  async me(userId: number): Promise<SafeUser>
  // - prisma.user.findUniqueOrThrow → omit passwordHash
}
// Helper: signToken(payload) → string (exp: '7d')
// Helper: omitHash(user) → Omit<User, 'passwordHash'>
```

**`apps/server/src/controllers/auth.controller.ts`**
Thin — delegates entirely to AuthService; 201 for register, 200 for login/me.

**`apps/server/src/routes/auth.routes.ts`**
```ts
POST /register  → validate(RegisterSchema) → register
POST /login     → validate(LoginSchema)    → login
POST /logout    → authMiddleware           → logout (returns 200, JWT is stateless)
GET  /me        → authMiddleware           → me
```

**Wire into `apps/server/src/routes/index.ts`**:
`router.use('/auth', authRouter)`

> **Verify**:
> - Register → 201, `{ success: true, data: { user, token } }`, no `passwordHash` in response
> - Login with wrong password → 401
> - `GET /me` with token → 200
> - `GET /me` without token → 401

---

## Phase 6 — Project Service

**Goal**: Project CRUD + membership management with owner authorization.

### Files to Create

**`apps/server/src/services/project.service.ts`**
```ts
class ProjectService {
  async createProject(dto, userId)
  // - prisma.$transaction: create Project + create ProjectMember(OWNER)

  async getProjects(userId)
  // - findMany where user is a member

  async getProject(projectId, userId)
  // - verify membership → NotFoundError/AuthorizationError

  async updateProject(projectId, dto, userId)
  // - verify OWNER role → update

  async deleteProject(projectId, userId)
  // - verify OWNER role → delete (cascade handles members, tasks, deps)

  async addMember(projectId, dto, requesterId)
  // - verify requester is OWNER → upsert ProjectMember

  async removeMember(projectId, targetUserId, requesterId)
  // - verify requester is OWNER, cannot remove last OWNER → delete
}
```

**`apps/server/src/controllers/project.controller.ts`** + **`apps/server/src/routes/project.routes.ts`**

All project routes behind `authMiddleware`.

> **Verify**: Full CRUD with membership and role guard tests.

---

## Phase 7 — Task Service (Core)

**Goal**: Task CRUD + Kanban movement with DAG engine integration.

### Design Decisions
- On `createTask`: `readiness = READY` (no deps yet); compute schedule if `plannedStart` + `duration` provided.
- On `moveTask`: **enforce blocked guard before any DB write** — `if (task.readiness === 'BLOCKED' && dto.status === 'IN_PROGRESS') throw BlockedTaskError()`.
- On `updateTask` with date/duration changes: reload graph → `computeSchedule` → persist descendants.
- On `deleteTask`: cascade in DB; recompute readiness for former dependents.
- Publish domain events after every committed transaction.

### Files to Create

**`apps/server/src/services/task.service.ts`**
```ts
class TaskService {
  async createTask(projectId, dto, userId)
  async getTasks(projectId, userId)
  async getTask(taskId, userId)
  async updateTask(taskId, dto, userId)
  async moveTask(taskId, dto, userId)    // ← BLOCKED guard here
  async deleteTask(taskId, userId)

  // Private helpers:
  private _verifyProjectAccess(projectId, userId): Promise<ProjectMember>
  private _loadGraph(projectId): Promise<{ tasks: Map<number, GraphTask>, edges: GraphEdge[] }>
  private _persistGraphUpdates(tx, updates): Promise<void>  // bulk DB update inside transaction
  private _emit(type, projectId, taskId?, payload): Promise<void>  // calls publishDomainEvent
}
```

**`apps/server/src/controllers/task.controller.ts`** + **`apps/server/src/routes/task.routes.ts`**

> **Verify**:
> - Create task → `readiness: "READY"` in response
> - Move BLOCKED task to IN_PROGRESS → 400 `TASK_IS_BLOCKED`
> - Move valid task → event published, WS client receives broadcast

---

## Phase 8 — Dependency Service

**Goal**: Full graph mutation with cycle detection, readiness recalculation, and no-compounding schedule propagation.

### Files to Create

**`apps/server/src/services/dependency.service.ts`**
```ts
class DependencyService {
  async createDependency(projectId, dto, userId):
  // 1. Verify both taskIds exist in projectId (NotFoundError, also ConflictError for cross-project)
  // 2. Reject self-dependency
  // 3. Reject duplicate edge (ConflictError)
  // 4. assertNoCycle(currentEdges, dto.prerequisiteTaskId, dto.dependentTaskId) → CycleError
  // 5. prisma.$transaction:
  //      a. INSERT TaskDependency
  //      b. computeReadiness(tasks, newEdges) → UPDATE affected tasks
  //      c. topologicalSort → computeSchedule → UPDATE dates
  //      d. INSERT TaskEvent(DEPENDENCY_ADDED)
  //      e. INSERT TaskEvent(SCHEDULE_CHANGED) per affected task if dates changed
  // 6. publishDomainEvent(DEPENDENCY_ADDED)
  // 7. publishDomainEvent(SCHEDULE_CHANGED) if needed
  // 8. Return updated graph

  async deleteDependency(dependencyId, userId):
  // 1. Load dep, verify project access
  // 2. prisma.$transaction:
  //      a. DELETE TaskDependency
  //      b. Recompute readiness + schedule for affected subgraph
  //      c. INSERT TaskEvent(DEPENDENCY_REMOVED)
  // 3. publishDomainEvent(DEPENDENCY_REMOVED)

  async getProjectGraph(projectId, userId): { tasks, dependencies }
  // Returns full graph state for board rendering (status, readiness, computedStart/End, position)

  async getCriticalPath(projectId, userId)
  // Calls computeCriticalPath(tasks, edges) engine function
}
```

**`apps/server/src/controllers/dependency.controller.ts`** + **`apps/server/src/routes/dependency.routes.ts`**

Routes:
```
POST   /projects/:projectId/dependencies
DELETE /dependencies/:dependencyId
GET    /projects/:projectId/graph
GET    /projects/:projectId/critical-path
```

> **Verify**:
> - Create dep A→B: B.readiness becomes BLOCKED (A not DONE)
> - Mark A as DONE: B.readiness becomes READY
> - Create cycle: 400 `CYCLE_DETECTED`
> - Diamond graph no-compounding: A→B, A→C, B→D, C→D. Set all plannedStart+duration. Move A forward +3d. Confirm D shifts +3d exactly.

---

## Phase 9 — WebSocket Server (`apps/ws-server`)

**Goal**: Standalone ws server. Redis Pub/Sub → clients.

### Install
```bash
cd apps/ws-server
bun add ws ioredis dotenv
bun add -d @types/ws @types/node
```

### Update `apps/ws-server/package.json`
Add `scripts.dev`, `dependencies`.

### Files to Create

**`apps/ws-server/src/manager.ts`**
```ts
class ConnectionManager {
  private clients = new Map<WebSocket, Set<number>>() // ws → subscribed projectIds

  subscribe(ws: WebSocket, projectId: number): void
  unsubscribe(ws: WebSocket, projectId: number): void
  remove(ws: WebSocket): void  // cleanup on disconnect
  broadcast(projectId: number, message: string): void  // send to all subscribed clients
}
```

**`apps/ws-server/src/handlers.ts`**
```ts
function handleClientMessage(ws, rawMessage, manager):
// Parse JSON → if type === 'PROJECT_SUBSCRIBE' → manager.subscribe(ws, projectId)
```

**`apps/ws-server/src/index.ts`**
```ts
// WebSocketServer({ port: WS_PORT })
// Redis psubscribe('taskflow:project:*:events')
// On pmessage: extract projectId → manager.broadcast(projectId, raw)
// wss.on('connection'): set up message/close/error handlers
// Graceful shutdown: wss.close() + redisSub.disconnect()
```

> **Verify**:
> - `wscat -c ws://localhost:4001`
> - Send `{ "type": "PROJECT_SUBSCRIBE", "projectId": 1 }`
> - Trigger REST mutation → WS client receives event broadcast

---

## Phase 10 — AI Dependency Suggestions

**Goal**: LLM-backed suggestion pipeline; gracefully degrades when no key configured.

### Files to Create

**`apps/server/src/lib/ai-provider.ts`**
```ts
interface AiProvider {
  generateDependencySuggestions(context: { projectName: string; tasks: { id: number; title: string }[] }): Promise<AiSuggestionItem[]>
}

class OpenAiProvider implements AiProvider {
  // Builds structured prompt; calls LLM via fetch; parses + validates with AiSuggestionResponseSchema
  // On failure: logs warning, throws AiProviderError
}

class NoopAiProvider implements AiProvider {
  async generateDependencySuggestions() { return []; }
}

export function createAiProvider(config): AiProvider {
  return config.llm.apiKey ? new OpenAiProvider(config) : new NoopAiProvider();
}
```

**`apps/server/src/services/ai.service.ts`**
```ts
class AiService {
  async generateSuggestions(projectId, taskId, requesterId):
  // 1. Load project tasks
  // 2. aiProvider.generateDependencySuggestions(...) — may return [] on failure
  // 3. Validate each suggestion:
  //      - prerequisiteTaskId exists in project (reject unknown IDs)
  //      - not self-dependency
  //      - no duplicate AiSuggestion already exists for same (taskId, prerequisiteTaskId)
  // 4. prisma.aiSuggestion.createMany(valid suggestions, PENDING status)
  // 5. Emit AI_SUGGESTION_CREATED events
  // 6. Return suggestions

  async acceptSuggestion(suggestionId, userId):
  // 1. Load suggestion (must be PENDING) → NotFoundError/ConflictError
  // 2. DependencyService.createDependency(...)  ← full validation pipeline
  // 3. prisma.aiSuggestion.update(ACCEPTED, decidedById, decidedAt)
  // 4. Emit AI_SUGGESTION_ACCEPTED

  async rejectSuggestion(suggestionId, userId):
  // 1. Load suggestion (must be PENDING)
  // 2. prisma.aiSuggestion.update(REJECTED)
  // 3. Emit AI_SUGGESTION_REJECTED
}
```

**`apps/server/src/controllers/ai.controller.ts`** + **`apps/server/src/routes/ai.routes.ts`**

Routes:
```
POST /projects/:projectId/ai/dependency-suggestions
POST /ai/suggestions/:suggestionId/accept
POST /ai/suggestions/:suggestionId/reject
```

> **Verify**:
> - No `LLM_API_KEY`: POST returns `{ success: true, data: { suggestions: [] } }` (graceful degradation)
> - Accept suggestion: creates real dependency, runs cycle check
> - Accept cycle-creating suggestion: 400 `CYCLE_DETECTED`

---

## Phase 11 — Audit Events Endpoint

**Goal**: Paginated event log query.

Add to project routes:
```
GET /projects/:projectId/events?limit=50&before=<eventId>
```

Thin service: `prisma.taskEvent.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: limit })`.

---

## Phase 12 — Tests

### DAG Engine Unit Tests (from Phase 3 — all 7 files)

### Integration Tests (`apps/server/src/__tests__/`)

| Test | Coverage |
|------|---------|
| `auth.integration.test.ts` | Register/login/me; `passwordHash` never in response |
| `task-move.integration.test.ts` | BLOCKED task cannot move to IN_PROGRESS (real DB) |
| `dependency.integration.test.ts` | Create dep → readiness recalculates → TaskEvent persisted |
| `diamond.integration.test.ts` | Diamond graph A→B, A→C, B→D, C→D; schedule no-compounding |

---

## Phase 13 — Final Verification

```bash
# From repo root
bun install
docker compose up -d
cd packages/db && bunx prisma migrate dev && bunx prisma db seed && cd ../..

bun run check-types   # all workspaces
bun run lint
bun test              # all tests

# Manual smoke tests
curl http://localhost:4000/health
curl http://localhost:4000/ready
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@test.com","password":"password123"}'
# set TOKEN=... from response
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/v1/auth/me
wscat -c ws://localhost:4001  # send PROJECT_SUBSCRIBE, trigger REST → observe WS broadcast
```

### Definition of Done Checklist

- [ ] `docker compose up -d` → PostgreSQL + Redis healthy
- [ ] `prisma migrate dev` → succeeds with demo seed data
- [ ] `/health` + `/ready` → `{ "status": "ok" }`
- [ ] Register/login/logout/me → no `passwordHash` in any response
- [ ] Project CRUD + membership → authorization enforced
- [ ] Task CRUD + position persistence
- [ ] `PATCH /tasks/:id/move` BLOCKED→IN_PROGRESS → 400 `TASK_IS_BLOCKED`
- [ ] `POST /dependencies` cycle → 400 `CYCLE_DETECTED`
- [ ] Diamond graph A→B, A→C, B→D, C→D: A shifts +3d → D shifts +3d (not +6)
- [ ] Regression: A DONE→IN_PROGRESS → B, C readiness=BLOCKED; `status` columns unchanged
- [ ] WebSocket receives events after REST mutations (no polling needed)
- [ ] AI suggestions stored as PENDING; accept routes through DependencyService full pipeline
- [ ] `bun test` → all unit + integration tests green
- [ ] `bun run check-types` → zero TypeScript errors
- [ ] `bun run lint` → clean

---

## Phase Execution Order Summary

```
Phase 0  →  docker-compose.yml, .env, .env.example
Phase 1  →  packages/types/src/**
Phase 2  →  packages/queue/src/**
Phase 3  →  apps/server/src/engine/** + __tests__/**  [verify: bun test engine]
Phase 4  →  config, errors, middleware, app.ts, server.ts  [verify: /health works]
Phase 5  →  auth.service + controller + routes  [verify: register/login/me]
Phase 6  →  project.service + controller + routes
Phase 7  →  task.service + controller + routes  [verify: BLOCKED guard]
Phase 8  →  dependency.service + controller + routes  [verify: cycle + diamond]
Phase 9  →  apps/ws-server/src/**  [verify: WS broadcast]
Phase 10 →  ai-provider + ai.service + controller + routes
Phase 11 →  events endpoint
Phase 12 →  integration tests
Phase 13 →  final bun test / check-types / lint / verification
```
