# TaskFlow Pro — Architecture, Data Model & Known Limitations

## 1. System Architecture

### Monorepo (Turborepo)
```
kanban-board/
├── apps/
│   ├── web/               # Next.js 16 + React 19 App Router
│   ├── server/            # Express + TS REST API + DAG Engine (port 4000)
│   └── ws-server/         # ws package WebSocket server (port 4001)
├── packages/
│   ├── db/                # Prisma 7 + PostgreSQL (pg adapter)
│   ├── queue/             # BullMQ + ioredis Redis Pub/Sub
│   └── types/             # @repo/types — shared DTOs + Zod schemas
└── turbo.json
```

### Service Boundaries
- **DAG Engine** (`apps/server/src/engine/`) — pure TypeScript, zero I/O: topological sort (Kahn), cycle detection (DFS), readiness recalculation (transitive closure), finish-to-start scheduler (CPM), critical path (longest path).
- **REST API** (`apps/server/src/routes/`, `controllers/`, `services/`) — thin controllers, business logic in services, JWT auth (`jsonwebtoken` + `bcryptjs`), Zod validation (`packages/types/src/schemas/`).
- **WebSocket** (`apps/ws-server/`) — independent Node `ws` server subscribing to `@repo/queue` Redis Pub/Sub; pushes `TASK_UPDATED`/`TASK_MOVED`/`TASK_READY`/`TASK_BLOCKED`/`DEPENDENCY_ADDED`/etc. events to clients via `PROJECT_SUBSCRIBE`.
- **Queue** (`packages/queue/`) — `ioredis` for Pub/Sub, BullMQ for background jobs (`ai-suggestions-queue`, `dag-recalc-queue`).
- **Database** (`packages/db/`) — Prisma 7 schema at `prisma/schema.prisma`; singleton `PrismaClient` exported from `@repo/db/client`.

### Dependency Semantics
`A → B` means **B depends on A** (A must be `DONE` before B is `READY`). `readiness` (`READY`/`BLOCKED`) is derived exclusively by the engine; never settable by any API client.

## 2. Data Model (Prisma + Domain)

### Project
- `id` (int, PK), `name`, `description`, `ownerId` (FK User), `createdAt`, `members` (ProjectMember[])

### Task
- `id`, `projectId`, `title`, `description`, `status` (BACKLOG → IN_PROGRESS → REVIEW → DONE), `readiness` (READY/BLOCKED), `plannedStart`, `duration`, `computedStart`, `computedEnd`, `position`, `createdAt`/`updatedAt`
- Critical: `readiness` NEVER accepted in any API body; `BLOCKED` tasks must not be moved to `IN_PROGRESS`.

### TaskDependency
- `id`, `prerequisiteTaskId` (FK Task), `dependentTaskId` (FK Task)
- Atomic mutations covered by Prisma transaction over Task + TaskDependency + TaskEvent.

### TaskEvent (audit / WS broadcast)
- `id`, `projectId`, `taskId`, `type` (TaskEventType enum), `payload` (JSON), `createdAt`

### User
- `id`, `name`, `email`, `passwordHash`, `createdAt`

## 3. Key Architectural Decisions

- **No client-settable readiness**: `Task.readiness` never in request payloads (Zod schema enforcement).
- **Blocked-task movement guard**: `PATCH /tasks/:id/move` rejects moving `BLOCKED` → `IN_PROGRESS` (`TASK_IS_BLOCKED` 400).
- **Atomic transactions**: Dependency mutations + scheduling updates inside Prisma transaction (Task + TaskDependency + TaskEvent).
- **Cycle detection**: Direct & indirect cycles caught in-memory by `engine/` before DB write (`CYCLE_DETECTED`, `SELF_DEPENDENCY`).
- **No-compounding dates**: Diamond (`A→B`, `A→C`, `B→D`, `C→D`) — shift by +3d on A moves D by +3d once, not +6d.
- **Regression handling**: If A moves `DONE` → `IN_PROGRESS`, downstream revert `readiness` to `BLOCKED` without altering `status`.
- **Event broadcasting**: HTTP mutations publish domain events via `@repo/queue`; standalone `ws-server` subscribes to Redis Pub/Sub.
- **Uniform API envelope**: Success `{ success: true, data: ... }`; Error `{ success: false, error: { code, message } }`.

## 4. Known Limitations / Design Trade-offs

- **Auth simplification**: `localStorage` JWT storage (documented simplification, not production-grade). No refresh-token rotation.
- **WebSocket reliability**: One connection per board page; no automatic reconnect with exponential backoff implemented in this build.
- **AI integration**: Graceful degradation — if LLM API is unavailable, suggestions are skipped; no fallback model cascade.
- **Mobile responsive**: CSS is responsive (Tailwind v4 `@theme` tokens) but touch-optimized drag-and-drop (dnd-kit) not fully validated on all mobile browsers.
- **Performance**: Critical-path recalculation is O(V+E) per mutation; for very large graphs (>1000 tasks) this may need caching or incremental updates.
- **No multi-region Redis clustering** configured; single Redis instance used for Pub/Sub.
- **No circuit breaker / retry logic** on BullMQ background jobs (AI queue).
