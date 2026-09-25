# TaskFlow Pro — Queue & Messaging Package (`packages/queue`) Agent Prompt & Context

This file contains the complete technical specification, Redis Pub/Sub guidelines, and BullMQ queue details for working on the **`packages/queue`** workspace package (`@repo/queue`).

---

## 1. Overview & Service Boundaries

`packages/queue` provides the central Redis messaging infrastructure and asynchronous job queuing for TaskFlow Pro. It enables loose coupling between `apps/server` (which publishes domain events) and `apps/ws-server` (which subscribes to domain events and broadcasts them to clients), as well as handling background task execution.

---

## 2. Technology Stack Mandates

1. **Redis Client**: MUST use **`ioredis`** for managing Redis connections and Pub/Sub channels.
   - 🚫 DO NOT use Bun-native `Bun.redis`.
2. **Queue Manager**: MUST use **BullMQ** (`bullmq`) for background job queues and background worker management.
3. **Environment**: Redis connection parameters loaded from `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`.

---

## 3. Directory & File Structure

```text
packages/queue/
├── src/
│   ├── redis.ts         # Singleton ioredis client initialization & connection options
│   ├── publisher.ts     # EventPublisher class / functions for posting Redis Pub/Sub events
│   ├── subscriber.ts    # EventSubscriber class / functions for consuming Redis Pub/Sub events
│   ├── queues/          # BullMQ queue definitions (e.g. aiQueue, dagBatchQueue)
│   ├── workers/         # BullMQ worker handlers
│   └── index.ts         # Public package exports
├── package.json
└── tsconfig.json
```

---

## 4. Architectural Patterns & Protocols

### A. Redis Pub/Sub Event Distribution (Server -> WS Server)
1. **Publisher (`apps/server`)**:
   - Call `EventPublisher.publish(channel, payload)` immediately after a PostgreSQL transaction commits.
   - Example channel naming: `project:<projectId>:events` or `taskflow:events`.
2. **Subscriber (`apps/ws-server`)**:
   - `EventSubscriber` subscribes to Redis channels and invokes callbacks to push events to active WebSocket clients.

```typescript
// Event shape published to Redis
export interface RedisDomainEvent {
  type: TaskEventType;
  projectId: string;
  taskId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
```

### B. BullMQ Background Job Queues
1. **AI Suggestion Queue (`ai-suggestions-queue`)**:
   - Handles background LLM calls for project dependency suggestions to prevent blocking HTTP endpoints.
2. **Batch Recalculation Queue (`dag-recalc-queue`)**:
   - Asynchronously processes large graph updates or batch migrations when needed.

---

## 5. Binding Rules

- **No In-Memory Event Emitters**: Do NOT fall back to local Node `EventEmitter` for multi-process communication. All cross-service events must pass through Redis via `@repo/queue`.
- **Clean Connection Management**: Ensure proper lifecycle handling (`disconnect()` / `quit()`) for Redis clients during server graceful shutdown signals (`SIGTERM`, `SIGINT`).

---

## 6. Execution Commands

- **Type Check**: `bun run check-types`
- **Tests**: `bun test`
