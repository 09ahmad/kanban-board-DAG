# TaskFlow Pro — Standalone WebSocket Server (`apps/ws-server`) Agent Prompt & Context

This file contains the complete technical specification, architectural rules, and context for working on the **`apps/ws-server`** workspace service.

---

## 1. Overview & Service Boundaries

`apps/ws-server` is the standalone real-time WebSocket broadcasting server for TaskFlow Pro, running on **Port 4001**. It manages client WebSocket connections, project subscriptions, and broadcasts real-time graph and task domain events pushed from Redis Pub/Sub.

### Workspaces Dependencies:
- `@repo/queue`: Redis Pub/Sub subscriber client (`ioredis`).
- `@repo/types`: Shared domain event interfaces, WebSocket message DTOs, and schemas.
- `@repo/db`: Database client (if initial subscription state validation is required).

---

## 2. Technology Stack Mandates

1. **WebSocket Framework**: MUST explicitly use the standard **`ws`** npm package (`import WebSocket, { WebSocketServer } from "ws"`).
   - 🚫 DO NOT use `Bun.serve()` native WebSockets or built-in Bun WS handlers.
2. **Redis Messaging**: MUST subscribe to Redis Pub/Sub channels using **`ioredis`** via `@repo/queue`.
   - 🚫 DO NOT use `Bun.redis`.

---

## 3. Directory & Code Structure

```text
apps/ws-server/
├── src/
│   ├── handlers/        # WebSocket client message handlers (PROJECT_SUBSCRIBE, PING)
│   ├── subscriptions/   # Redis Pub/Sub message consumer and client broadcaster
│   ├── manager/         # ConnectionManager tracking active clients per projectId
│   └── index.ts         # WS Server initialization & Redis subscriber binding
├── package.json
└── tsconfig.json
```

---

## 4. Client Protocol & Event Broadcasting

### Incoming Client Message Protocol:
Clients send JSON text messages to subscribe to project updates:
```json
{
  "type": "PROJECT_SUBSCRIBE",
  "projectId": "proj_123"
}
```

### Event Distribution Flow:
1. `apps/server` performs a mutation (e.g. task moved, dependency added) and commits a PostgreSQL transaction.
2. `apps/server` publishes a domain event to Redis Pub/Sub channel (e.g., `project:proj_123:events`) via `@repo/queue`.
3. `apps/ws-server`'s Redis subscriber receives the event payload.
4. `ConnectionManager` filters active WebSocket connections subscribed to `proj_123`.
5. `apps/ws-server` serializes and sends the event payload over active WebSockets.

### Event Payload Shape Broadcasted to WS Clients:
```json
{
  "type": "TASK_MOVED",
  "projectId": "proj_123",
  "taskId": "task_456",
  "payload": {
    "status": "IN_PROGRESS",
    "readiness": "READY",
    "updatedAt": "2026-09-25T12:00:00.000Z"
  }
}
```

---

## 5. Key Domain Event Types

- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_MOVED`
- `TASK_READY`
- `TASK_BLOCKED`
- `DEPENDENCY_ADDED`
- `DEPENDENCY_REMOVED`
- `SCHEDULE_CHANGED`
- `GRAPH_UPDATED`
- `AI_SUGGESTION_CREATED`
- `AI_SUGGESTION_ACCEPTED`
- `AI_SUGGESTION_REJECTED`

---

## 6. Binding Constraints

1. **Stateless Messaging**: The WebSocket server does NOT hold authoritative task or dependency state. PostgreSQL is the single source of truth.
2. **Resilience**: If a client disconnects or a WebSocket send fails, database mutations in `apps/server` remain committed and are unaffected.

---

## 7. Execution Commands

- **Development Server**: `bun run dev` (from workspace root)
- **Type Check**: `bun run check-types`
- **Tests**: `bun test`
