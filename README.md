# TaskFlow Pro

A Kanban project management web app for engineering/product teams who plan work as dependency chains (e.g. integration tests can't start until backend API is done). Responsive, desktop-first but usable on tablet/mobile.

## Problem Statement

Engineering teams plan work as dependency chains — "Task B cannot start until Task A is done." Traditional Kanban boards treat tasks as independent items. TaskFlow Pro makes dependencies first-class citizens:

- **Workflow state** (`status`): BACKLOG → IN_PROGRESS → REVIEW → DONE (user moves cards)
- **Dependency state** (`readiness`): READY / BLOCKED (computed by the DAG engine, never manually set)
- **Diamond-dependency math**: If task A shifts by +3 days, downstream task D moves by +3 days **once**, never +6
- **Regression handling**: If A moves back from DONE to IN_PROGRESS, downstream tasks revert to BLOCKED without altering their workflow status

## Screens

### 1. Auth — Single screen, toggle between Log in / Create account
- Login: email, password
- Register: name, email, password
- One primary submit button labeled to match active mode
- Utility login screen — no marketing copy, no hero image

### 2. Kanban Board — 4 columns (Backlog, In Progress, Review, Done)
- Column headers show name + task count
- Cards show: title, legible Ready/Blocked indicator (core product state), compact dependency-load signal ("waiting on 2" / "blocking 3") — only when relevant
- Blocked cards look visibly non-interactive for moving into In Progress
- Top bar: project name, member-avatar cluster, link to dependency graph view
- Drag-and-drop via @dnd-kit (column drop calls `PATCH /tasks/:id/move`)

### 3. Task Detail — Two columns
- **Left**: title, description, status, planned start date, duration, "Waiting on" (prerequisites) and "Blocking" (dependents) lists with task title + status, add-dependency search control
- **Right**: computed schedule (computed start/end, visually marked as system-calculated), AI suggestions panel — suggested prerequisites with reason and Accept/Reject per suggestion

### 4. Dependency Graph — Full-canvas node-link diagram
- Nodes = tasks, colored by Ready/Blocked distinction
- Directional edges, layout reads left-to-right in dependency order
- One connected chain marked as "critical path" (heavier line weight), distinguishable at a glance
- Back link to the board

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js   │────▶│   Express    │────▶│  PostgreSQL  │
│   (port 3000)    │  (port 4000)  │     │  (Prisma 7)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │    Redis     │
                    │  (Pub/Sub)   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  WebSocket   │
                    │  (port 4001) │
                    └──────────────┘
```


### Core Engine (`apps/server/src/engine/`)
Pure TypeScript DAG engine with zero I/O:
| File | Algorithm | Description |
|------|-----------|-------------|
| `topological-sort.ts` | Kahn's algorithm | Deterministic execution order |
| `cycle-detector.ts` | DFS-based | Validates no circular dependencies |
| `graph.ts` | Adjacency list | Builds and queries dependency graph |
| `readiness.ts` | Transitive closure | Computes READY/BLOCKED per task |
| `scheduler.ts` | CPM | Calculates earliest start/end, float, critical path |
| `critical-path.ts` | Longest path | Identifies critical chain of tasks |

### Key Design Decisions
- **No-compounding**: Downstream shifts by exact delta, never compounded
- **Immutable readiness**: Computed from full graph on every change, persisted atomically
- **Event-driven**: All state changes emit domain events via Redis Pub/Sub for real-time WebSocket push

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) >= 1.2
- [Docker](https://docker.com/) (for PostgreSQL & Redis)

### Option 1: Docker (Production-like)

```bash
# 1. Configure environment
cp .env.production.example .env
# Edit .env: set JWT_SECRET, POSTGRES_PASSWORD, etc.

# 2. Build and start all services
docker compose build
docker compose up -d

# 3. Verify
docker compose ps
```

**Services exposed:**
| Service | Port |
|---------|------|
| Web (Next.js) | 3000 |
| REST API (Express) | 4000 |
| WebSocket (`ws`) | 4001 |
| PostgreSQL | 5432 |
| Redis | 6379 |

### Option 2: Bun Scripts (Development)

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values (required: DATABASE_URL, REDIS_URL, JWT_SECRET)

# 3. Start databases
docker compose up -d postgres redis

# 4. Complete database setup (generate + push + seed)
bun run setup:db

# 5. Build all packages
bun run build

# 6. Start all services with hot reload
bun run dev
```

**Individual service commands:**
```bash
# Start only REST API server (port 4000)
bun run start:server

# Start only WebSocket server (port 4001)
bun run start:ws

# Start only Frontend (port 3000) - run in separate terminal
bun run start:web
```

## Environment Variables

Required `.env` variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://taskflow:taskflow@localhost:5432/taskflow` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Signing secret for JWT auth (min 32 chars) | — |
| `PORT` | REST API server port | `4000` |
| `WS_PORT` | WebSocket server port | `4001` |
| `NODE_ENV` | Node environment | `development` |
| `CORS_ORIGIN` | CORS origin for frontend | `http://localhost:3000` |
| `LLM_API_KEY` | **Optional** - OpenAI API key for AI suggestions | — |
| `LLM_BASE_URL` | LLM endpoint (OpenAI) | `https://api.openai.com/v1` |
| `LLM_MODEL` | Model to use | `gpt-4o-mini` |

> **AI Service**: AI-powered dependency suggestions are **optional**. If `LLM_API_KEY` is not set, the system works normally but AI suggestions are disabled with a warning.

## API Reference

Base URL: `http://localhost:4000/api/v1`

All responses follow uniform envelope:
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login and receive JWT |
| `GET` | `/auth/me` | Get current user |
| `POST` | `/auth/logout` | Invalidate session |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects` | List projects |
| `POST` | `/projects` | Create a project |
| `GET` | `/projects/:id` | Get project details |
| `PATCH` | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Delete project |
| `POST` | `/projects/:id/members` | Add member |
| `DELETE` | `/projects/:id/members/:userId` | Remove member |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects/:id/tasks` | List tasks in a project |
| `POST` | `/projects/:id/tasks` | Create a task |
| `GET` | `/tasks/:id` | Get a single task |
| `PATCH` | `/tasks/:id` | Update a task |
| `PATCH` | `/tasks/:id/move` | Move task to new status |
| `DELETE` | `/tasks/:id` | Delete a task |

### Dependencies
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects/:id/dependencies` | Create a dependency edge |
| `DELETE` | `/dependencies/:id` | Remove a dependency |
| `GET` | `/projects/:id/graph` | Get full dependency graph |
| `GET` | `/projects/:id/critical-path` | Get critical path analysis |
| `GET` | `/projects/:id/events` | Get domain event log |

### AI Suggestions (requires `LLM_API_KEY`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects/:id/ai/dependency-suggestions` | Generate AI suggestions |
| `POST` | `/ai/suggestions/:id/accept` | Accept a suggestion |
| `POST` | `/ai/suggestions/:id/reject` | Reject a suggestion |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Readiness check |

## Data Model

### Project
- `id` (int, PK), `name`, `description`, `ownerId` (FK User), `createdAt`, `members` (ProjectMember[])

### Task
- `id`, `projectId`, `title`, `description`, `status` (BACKLOG → IN_PROGRESS → REVIEW → DONE), `readiness` (READY/BLOCKED), `plannedStart`, `duration`, `computedStart`, `computedEnd`, `position`, `createdAt`/`updatedAt`
- **Critical**: `readiness` NEVER accepted in any API body; `BLOCKED` tasks must not be moved to `IN_PROGRESS`

### TaskDependency
- `id`, `prerequisiteTaskId` (FK Task), `dependentTaskId` (FK Task)
- Atomic mutations covered by Prisma transaction over Task + TaskDependency + TaskEvent

### TaskEvent (audit / WS broadcast)
- `id`, `projectId`, `taskId`, `type` (TaskEventType enum), `payload` (JSON), `createdAt`

### User
- `id`, `name`, `email`, `passwordHash`, `createdAt`

## WebSocket Real-time Updates

Connect to `ws://localhost:4001` and subscribe to project events:

```javascript
const ws = new WebSocket("ws://localhost:4001");

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "PROJECT_SUBSCRIBE",
    projectId: "your-project-id"
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Real-time event:", data);
  // Handle: TASK_MOVED, TASK_READY, TASK_BLOCKED, DEPENDENCY_ADDED, etc.
};
```

### Event Types Broadcasted
- `TASK_CREATED`, `TASK_UPDATED`, `TASK_MOVED`, `TASK_DELETED`
- `TASK_READY`, `TASK_BLOCKED`
- `DEPENDENCY_ADDED`, `DEPENDENCY_REMOVED`
- `SCHEDULE_CHANGED`, `GRAPH_UPDATED`
- `AI_SUGGESTION_CREATED`, `AI_SUGGESTION_ACCEPTED`, `AI_SUGGESTION_REJECTED`

## Testing

```bash
# Run all tests (unit + integration)
bun test

# Run with coverage
bun test --coverage

# Individual test suites
bun run test:server        # All server tests
bun run test:server:engine # DAG engine unit tests only
bun run test:ws            # WebSocket server tests
bun run test:web           # Web app tests
```

## Type Checking & Linting

```bash
# Type check all packages
bun run check-types

# Lint all packages
bun run lint

# Format code
bun run format
```

## AI Usage Disclosure

**AI assistants were used to help draft code and documentation throughout this project.** Specifically:
- GitHub Copilot / Cursor / similar tools assisted with boilerplate, type definitions, and test scaffolding
- LLM (OpenAI GPT-4o-mini) is used at runtime for the **optional** AI dependency suggestions feature — this is a documented product feature, not a development tool
- No AI-generated code was accepted without human review and verification against the project's architectural constraints

## Known Limitations

- **Auth simplification**: `localStorage` JWT storage (documented simplification, not production-grade). No refresh-token rotation.
- **WebSocket reliability**: One connection per board page; no automatic reconnect with exponential backoff.
- **AI integration**: Graceful degradation — if LLM API is unavailable, suggestions are skipped; no fallback model cascade.
- **Mobile responsive**: CSS is responsive (Tailwind v4 `@theme` tokens) but touch-optimized drag-and-drop not fully validated on all mobile browsers.
- **Performance**: Critical-path recalculation is O(V+E) per mutation; for very large graphs (>1000 tasks) this may need caching or incremental updates.
- **No multi-region Redis clustering** configured; single Redis instance used for Pub/Sub.
- **No circuit breaker / retry logic** on BullMQ background jobs (AI queue).

## Documentation

- **Architecture & Data Model** — [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Test Suite** — [`docs/TESTING.md`](docs/TESTING.md)

## License

MIT