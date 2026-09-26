# TaskFlow Pro — Master Claude Code Prompt & Project Memory

Read this file before executing any task in this repository. It reflects binding decisions for architecture, monorepo structure, and technology stack. Do not deviate from these rules.

---

## 1. Project Overview & Business Domain

TaskFlow Pro is a DAG-powered Kanban project management backend. It explicitly separates two kinds of task state:
- **Workflow State (`status`)**: `BACKLOG → IN_PROGRESS → REVIEW → DONE` (user-controlled via Kanban move).
- **Dependency State (`readiness`)**: `READY` or `BLOCKED` (derived exclusively by the DAG engine, never settable by any API client).

**Dependency Semantics**: `A → B` means **B depends on A** (A must be `DONE` before B becomes `READY`).

---

## 2. Monorepo Structure & Service Agent Specifications

This is a Turborepo monorepo with workspace packages under `apps/*` and `packages/*`. Each service has its own dedicated `AGENT.md` file containing complete context and specifications so agents can work independently.

```text
kanban-board/
├── AGENT.md                 # Root Master Prompt & Architecture Specification (This file)
├── apps/
│   ├── web/                 # Next.js Frontend App
│   │   └── AGENT.md         # Specs context for apps/web
│   ├── server/              # Express + TS REST API Service (Port 4000) & DAG Engine
│   │   ├── src/
│   │   │   ├── engine/      # Pure TS DAG & Scheduling Engine (Zero I/O) inside apps/server
│   │   │   ├── routes/      # Express routes (/api/v1/auth, /api/v1/projects, /api/v1/tasks, etc.)
│   │   │   ├── controllers/ # Thin controllers (no business logic)
│   │   │   ├── services/    # Business logic (TaskService, DependencyService, ProjectService, AuthService, AiService)
│   │   │   └── server.ts
│   │   └── AGENT.md         # Specs context for apps/server & DAG engine
│   └── ws-server/           # Standalone WebSocket Server (Node.js 'ws' package)
│       └── AGENT.md         # Specs context for apps/ws-server
├── packages/
│   ├── db/                  # @repo/db — Prisma 7 schema, pg adapter, seed & client singleton
│   │   └── AGENT.md         # Specs context for packages/db
│   ├── queue/               # @repo/queue — BullMQ & ioredis Redis Pub/Sub & Queue layer
│   │   └── AGENT.md         # Specs context for packages/queue
│   └── types/               # @repo/types — Shared DTOs, Zod validation schemas & TS types
│       └── AGENT.md         # Specs context for packages/types
├── docs/
│   └── build-specs/
│       └── TaskFlow_Pro_Backend_Build_Prompt.md
├── package.json
└── turbo.json
```

### Quick Links to Service Context Files:
- 📱 [apps/web/AGENT.md](file:///home/sk-ahmad/Desktop/hackethon/kanban-board/apps/web/AGENT.md) — Frontend Next.js integration context
- ⚙️ [apps/server/AGENT.md](file:///home/sk-ahmad/Desktop/hackethon/kanban-board/apps/server/AGENT.md) — REST API (Express) service & DAG Engine context
- ⚡ [apps/ws-server/AGENT.md](file:///home/sk-ahmad/Desktop/hackethon/kanban-board/apps/ws-server/AGENT.md) — Standalone WebSocket server context
- 🗄️ [packages/db/AGENT.md](file:///home/sk-ahmad/Desktop/hackethon/kanban-board/packages/db/AGENT.md) — Database & Prisma client context
- 📬 [packages/queue/AGENT.md](file:///home/sk-ahmad/Desktop/hackethon/kanban-board/packages/queue/AGENT.md) — BullMQ & Redis Pub/Sub context
- 📐 [packages/types/AGENT.md](file:///home/sk-ahmad/Desktop/hackethon/kanban-board/packages/types/AGENT.md) — Shared DTOs & Zod schemas context

---

## 3. Technology Stack Requirements (EXPLICIT MANDATES)

Even though **Bun** is used as the package manager and test runner (`bun install`, `bun test`), you MUST use explicit Node.js NPM libraries for backend infrastructure. **DO NOT use Bun-native built-ins for Express, WebSockets, or Redis.**

1. **REST API Framework & DAG Engine (`apps/server`)**:
   - MUST use **Express.js** (`express`, `@types/express`).
   - DO NOT use `Bun.serve()` routes.
   - The **DAG Engine** lives inside `apps/server/src/engine/` as an internal pure TypeScript module (Zero I/O dependencies). It is NOT a standalone server or separate workspace package.

2. **WebSockets (`apps/ws-server`)**:
   - MUST explicitly import and use the standard **`ws`** npm package (`import WebSocket, { WebSocketServer } from "ws"`).
   - DO NOT use Bun's built-in `Bun.serve()` WebSocket handler or native WebSocket server.

3. **Redis & Queue Service (`packages/queue`)**:
   - MUST use **BullMQ** (`bullmq`) for background queues and **`ioredis`** (`ioredis`) for Redis Pub/Sub event broadcasting.
   - DO NOT use `Bun.redis` or Bun-native Redis clients.

4. **Database (`packages/db`)**:
   - **PostgreSQL** accessed via **Prisma 7** (`@prisma/adapter-pg` + `pg`).
   - Schema located at `packages/db/prisma/schema.prisma`.
   - Export singleton `PrismaClient` from `@repo/db/client`.

5. **Validation (`packages/types` & `apps/server`)**:
   - MUST use **Zod** (`zod`) for all API payloads, parameters, query strings, and AI suggestion responses.

6. **Authentication (`apps/server`)**:
   - MUST use **jsonwebtoken** (`jsonwebtoken`) for JWT access tokens and **bcrypt** (`bcrypt` or `bcryptjs`) for password hashing.

---

## 4. Binding Domain Rules & Architectural Constraints

- **No client-settable readiness**: `Task.readiness` must NEVER be accepted in any API request body.
- **Blocked task movement guard**: A task with `readiness === BLOCKED` MUST NOT be moved to `IN_PROGRESS`.
- **Atomic Transactions**: Every dependency mutation and scheduling update must execute inside a Prisma transaction covering `Task` + `TaskDependency` + `TaskEvent`.
- **Cycle Detection**: Direct and indirect cycles must be caught in-memory by `apps/server/src/engine` before writing to PostgreSQL.
- **No-Compounding Dates**: In diamond graphs (`A → B`, `A → C`, `B → D`, `C → D`), if `A` shifts by +3 days, `D` moves by +3 days ONCE (never +6).
- **Regression Handling**: If `A` moves back from `DONE` to `IN_PROGRESS`, downstream tasks revert `readiness` to `BLOCKED` without altering their workflow `status`.
- **Event Broadcasting**: Domain events created during HTTP mutations in `apps/server` are published to Redis Pub/Sub via `@repo/queue`. The standalone `apps/ws-server` subscribes to Redis Pub/Sub and pushes notifications to WebSocket clients.
- **Uniform API Response Format**:
  - Success: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

---

## 5. Development & Testing Commands

- **Install Dependencies**: `bun install`
- **Run Development**: `bun run dev` (starts Turbo workspaces)
- **Run Typecheck**: `bun run check-types`
- **Run Linting**: `bun run lint`
- **Run Tests**: `bun test`
- **Prisma Migrations**: `cd packages/db && bunx prisma migrate dev`
- **Prisma Seed**: `cd packages/db && bunx prisma db seed`
- **Docker Setup**: `docker compose up -d` (starts PostgreSQL & Redis services)

---

## 6. Implementation Checklist & Workflow

1. **Inspect Monorepo**: Verify all package names and configuration.
2. **Setup `@repo/types`**: Define DTOs, domain types, and Zod validation schemas.
3. **Setup `@repo/db`**: Configure `prisma.config.ts`, verify schema, generate client, export singleton, and create seed script.
4. **Setup `@repo/queue`**: Implement `ioredis` Redis Pub/Sub publisher/subscriber and `BullMQ` job queues.
5. **Build DAG Engine inside `apps/server/src/engine`**: Implement pure TS graph helpers, cycle detection, topological sort, readiness recalculation, finish-to-start scheduler, critical path, and unit tests.
6. **Build REST API in `apps/server`**: Implement Express controllers, routes, JWT auth, services, and event publishing via `@repo/queue`.
7. **Build WebSocket Server in `apps/ws-server`**: Implement `ws` WebSocket server subscribing to Redis Pub/Sub events from `@repo/queue` and handling `PROJECT_SUBSCRIBE`.
8. **AI Dependency Suggestions**: Graceful degradation LLM integration, candidate generation, Zod payload validation, manual path execution on accept.
9. **Verification**: Run `check-types`, `lint`, and `test` across all packages.