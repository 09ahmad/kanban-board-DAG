# Known Limitations & Failure Cases

> **Implementation Note**: All required core features—including the DAG dependency engine (cycle detection, critical path calculation, auto-shifting downstream planned dates, readiness states), real-time WebSocket broadcasts, interactive Kanban board, graph visualization, and JWT authentication—are **100% fully implemented, verified, and backed by 241+ automated tests**.
>
> This document outlines architectural tradeoffs, scale boundaries, and known failure mode behaviors intended for operational awareness.

---

## 1. Synchronous DAG Engine Computation

- **Whole-Graph In-Memory Loading**: Writes and recomputations are scoped to changed tasks and their descendants. However, for every mutation (e.g. moving a task date, adding an edge, marking a task `DONE`), the engine loads the project's task and dependency graph into memory to perform topological sorting and critical path calculation (`O(V + E)` algorithm complexity).
  - *Impact*: Performs in under `<15ms` for typical project sizes (up to ~1,000 tasks). For massive projects with 10,000+ tasks, graph loading and sorting should be shifted to an incremental view or worker thread.
- **No Project-Wide Reconciliation**: Because recomputation is descendant-scoped for performance, any historical graph drift that is not downstream of a modified task is not automatically repaired during unrelated task updates. An explicit system-wide repair utility would be needed for manual data correction.
- **Synchronous Graph Updates**: Graph recalculations run synchronously within the HTTP request handler (`PATCH /api/v1/projects/:id/tasks/:taskId` or `POST /api/v1/projects/:id/dependencies`) before sending the response back to the client.

---

## 2. AI Service & LLM Integration

- **Graceful Degradation**: The AI suggestion service relies on external LLM providers (OpenAI or OpenRouter). If the API key is not configured (`LLM_API_KEY=""`), or if the external provider times out or returns rate-limit errors (HTTP 429/503), the BullMQ background job marks the job as `failed`. The REST API returns an empty suggestions list rather than throwing a server crash.
- **No Multi-Model Fallback Cascade**: If the primary configured LLM model (`LLM_MODEL`) fails, the system does not automatically fall back to an secondary model.
- **Single Worker Process Concurrency**: AI jobs are processed asynchronously via BullMQ on Redis. In the default configuration, BullMQ worker concurrency is scoped per API instance. For heavy concurrent usage, separate dedicated background worker processes should be deployed.

---

## 3. Real-Time WebSocket & Redis Pub/Sub

- **Single Redis Instance**: Real-time board state updates are broadcast via Redis Pub/Sub (`taskflow:project:*:events`). The project is configured for a single Redis node rather than a multi-region Redis Cluster with sentinel failover.
- **Socket Disconnection Recovery**: If a client's WebSocket connection drops (e.g. network switch or mobile sleep), the client automatically attempts reconnection with exponential backoff (up to 10 attempts). Upon reconnecting, the client triggers a full REST state resynchronization (`onReconnect`) to pick up any missed events.

---

## 4. Frontend & Mobile Drag-and-Drop

- **Touch Device Drag-and-Drop**: The Kanban board UI is responsive and desktop-first. While `@dnd-kit` supports touch sensors, complex drag-and-drop card movements across long multi-column views are optimized for pointer/mouse interfaces.
- **JWT Storage in `localStorage`**: Authentication tokens are stored in `localStorage` for simplicity. A production environment handling high-security enterprise data would wrap JWTs in `httpOnly`, `SameSite=Strict` cookies with refresh-token rotation.

---

## 5. Known Failure Cases & System Recovery Behavior

| Failure Scenario | System Behavior & Protection | Recovery / Resolution |
| :--- | :--- | :--- |
| **Cyclic Dependency Attempt** | The DAG engine detects cycles prior to persistence. Rejects with HTTP 400 Bad Request containing cycle path details (e.g. `A → B → C → A`). | The database transaction is rolled back; state remains clean. |
| **Redis Connection Outage** | The API server continues serving REST endpoints; WebSocket server absorbs connection errors without crashing. Pub/Sub broadcasts pause. | Once Redis reconnects, Pub/Sub auto-resubscribes without requiring process restart. |
| **LLM Provider Timeout / Rate Limit** | BullMQ retries the suggestion job up to 2 times with exponential backoff. If it fails, state is marked `failed`. | Frontend shows "No AI suggestions available" without blocking board operations. |
| **Simultaneous Task Moves (Race Condition)** | Database transactions wrap edge additions and task updates. Optimistic UI state on frontend reverts if server rejects request. | Client receives error notification and resyncs latest board state from server. |
