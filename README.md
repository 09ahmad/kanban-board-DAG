# Kanban Board — Hackathon Project

A full-stack Kanban board with intelligent DAG-based task dependency management, AI-powered scheduling suggestions, and real-time collaboration.

## Architecture Overview

The system is a **Turborepo monorepo** with the following packages and apps:

```
kanban-board/
├── apps/
│   ├── server/          # Express.js REST API (port 4000)
│   └── ws-server/       # WebSocket server (port 4001)
├── packages/
│   ├── db/              # Prisma ORM + PostgreSQL schema
│   ├── queue/           # Redis Pub/Sub domain events
│   └── types/           # Shared TypeScript types
└── turbo.json           # Turborepo pipeline config
```

### Core Engine

The `apps/server/src/engine/` directory implements a **pure TypeScript DAG engine** with zero I/O:

| File | Algorithm | Description |
|------|-----------|-------------|
| `topological-sort.ts` | Kahn's algorithm | Produces deterministic execution order for all tasks |
| `cycle-detector.ts` | DFS-based detection | Validates no circular dependencies exist |
| `graph.ts` | Adjacency list | Builds and queries the task dependency graph |
| `readiness.ts` | Transitive closure | Computes READY/BLOCKED status for every task |
| `scheduler.ts` | Critical path method (CPM) | Calculates earliest start/end dates, float, and critical path |
| `critical-path.ts` | Longest path | Identifies the critical chain of tasks |
| `types.ts` | — | Core type definitions |
| `errors.ts` | — | Domain-specific error classes |

### Key Design Decisions

- **No-compounding**: When a task's planned start shifts, downstream tasks shift by the exact delta, not a compounded offset. The scheduler recalculates absolute dates from the critical path.
- **Immutable readiness**: Task readiness is computed from the full graph on every change and persisted atomically via a Prisma transaction.
- **Event-driven**: All state changes emit domain events via Redis Pub/Sub for real-time WebSocket push.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.1
- [PostgreSQL](https://postgresql.org/) >= 15
- [Redis](https://redis.io/) >= 7
- [Node.js](https://nodejs.org/) >= 20 (for the built-in test runner)

### Environment Setup

```bash
# Copy the example env file and fill in your values
cp .env.example .env
```

Required `.env` variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://localhost:5432/kanban` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Signing secret for JWT auth | — |
| `LLM_API_KEY` | Gemini API key for AI suggestions | — |
| `LLM_BASE_URL` | LLM endpoint (Gemini) | `https://generativelanguage.googleapis.com/v1beta/models` |
| `LLM_MODEL` | Model to use | `gemini-1.5-flash-latest` |

### Installation

```bash
# Install all dependencies
bun install

# Generate Prisma client
bun run db:generate

# Push schema to database
bun run db:push

# Seed the database with sample data
bun run db:seed
```

### Running the Services

```bash
# Start the REST API server (port 4000)
bun run dev --filter=server

# Start the WebSocket server (port 4001)
bun run dev --filter=ws-server
```

### Database Operations

```bash
# Generate Prisma client
bun run db:generate

# Push schema changes
bun run db:push

# Seed with pre-populated tasks
bun run db:seed

# Run Prisma Studio (GUI for the database)
bun run db:studio
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register a new user |
| `POST` | `/api/v1/auth/login` | Login and receive JWT |
| `GET` | `/api/v1/auth/me` | Get current user |
| `POST` | `/api/v1/auth/logout` | Invalidate session |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/projects` | List projects |
| `POST` | `/api/v1/projects` | Create a project |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/projects/:id/tasks` | List tasks in a project |
| `POST` | `/api/v1/projects/:id/tasks` | Create a task |
| `GET` | `/api/v1/tasks/:id` | Get a single task |
| `PATCH` | `/api/v1/tasks/:id` | Update a task |
| `PATCH` | `/api/v1/tasks/:id/move` | Move task to a new status |
| `DELETE` | `/api/v1/tasks/:id` | Delete a task |

### Dependencies
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/projects/:id/dependencies` | Create a dependency edge |
| `GET` | `/api/v1/projects/:id/graph` | Get full dependency graph |
| `GET` | `/api/v1/projects/:id/critical-path` | Get critical path analysis |
| `GET` | `/api/v1/projects/:id/events` | Get domain event log |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Readiness check |

## AI Integration

The system uses **Google Gemini** (`gemini-1.5-flash-latest`) as the AI provider — a free tier model that generates task scheduling suggestions and dependency analysis.

### How it works

1. The `ai-provider.ts` module sends task context to the Gemini API
2. Returns structured scheduling suggestions and risk analysis
3. Suggestions are surfaced via the `/api/v1/ai/suggest` endpoint

The prompt is optimized for task management domain expertise with clear instructions for scheduling recommendations.

## Testing

### Unit Tests (Engine)

19 engine tests covering:
- Topological sort (Kahn's algorithm)
- Cycle detection (DFS)
- No-compounding schedule logic
- Diamond dependency math
- Critical path computation
- Readiness propagation

```bash
bun test apps/server/src/__tests__/
```

### Integration Tests

End-to-end tests via HTTP against a live server:
- **Auth integration**: 9 tests for register, login, JWT validation, logout
- **Dependency integration**: 5 tests for CRUD, cycle detection, graph, critical path, events
- **Task move integration**: 2 tests for BLOCKED guard and readiness
- **Diamond integration**: 2 tests for compounding math and regression

```bash
bun test apps/server/src/__tests__/
```

### Type Checking

```bash
bun run typecheck
```

All 6 packages pass TypeScript strict type checking.

## Security

- **JWT authentication** with bcryptjs password hashing
- **Zod validation** on all API payloads
- **No hardcoded secrets** — all via environment variables
- **Prisma parameterized queries** — SQL injection prevention
- **Domain events** emitted via Redis Pub/Sub, never directly exposed

## Scalability

- **Stateless API servers** — horizontally scalable behind a load balancer
- **WebSocket server** for real-time updates independent of REST API
- **Redis Pub/Sub** for cross-instance domain event distribution
- **BullMQ queues** for background processing (AI suggestions, notifications)
- **Prisma connection pooling** for PostgreSQL

## License

MIT
