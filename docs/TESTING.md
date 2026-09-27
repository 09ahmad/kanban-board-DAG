# TaskFlow Pro — Test Suite

## Summary
**142 tests pass · 0 fail** across 21 files. Numbers below are from a full
`bun test` run; regenerate rather than trusting them if they drift again.

## Engine Unit Tests (19 tests)
Pure functions, no I/O, no database.

| File | Tests | Coverage |
|------|-------|----------|
| `cycle-detection.test.ts` | 4 | Self-cycle, direct cycle, indirect cycle, valid chain |
| `topological-sort.test.ts` | 4 | Linear chain, diamond, disconnected nodes, cyclic throws |
| `readiness.test.ts` | 4 | No deps → READY, one dep not DONE → BLOCKED, all DONE → READY, multi-prereq |
| `scheduler.test.ts` | 3 | plannedStart, chain propagation, diamond no-compounding (+3d → +3d not +6d) |
| `critical-path.test.ts` | 2 | Linear path, diamond picks longest branch |
| `regression.test.ts` | 1 | A reverts to IN_PROGRESS; B and C become BLOCKED, status untouched |
| `convergence.test.ts` | 1 | Diamond A→B, A→C, B→D, C→D; A shifts +3d; D shifts +3d exactly once |

## Server Integration Tests (66 tests)
Drive the real Express app against a live PostgreSQL and Redis. **These truncate
shared tables between files** — point `DATABASE_URL` at a scratch database.

| File | Tests | Coverage |
|------|-------|----------|
| `auth.integration.test.ts` | 10 | Register, login, JWT validation, logout |
| `dependency.integration.test.ts` | 5 | CRUD, cycle detection, graph, critical path, events |
| `task-move.integration.test.ts` | 2 | BLOCKED guard and readiness |
| `diamond.integration.test.ts` | 2 | Compounding math and regression |
| `event-publishing.integration.test.ts` | 7 | Downstream events reach Redis Pub/Sub after commit |
| `readiness-scope.integration.test.ts` | 6 | Recomputation touches a change and its descendants, and nothing else |
| `ai-provider.test.ts` | 12 | Bounded/timeout LLM call, request shape, candidate schema, degraded mode |
| `ai-queue.integration.test.ts` | 13 | BullMQ job lifecycle, per-task dedupe, retries, failure isolation |
| `project-membership.integration.test.ts` | 9 | Preview visibility, roster gating, idempotent join, unique-violation handling |

## Web App Tests (51 tests)
Run under happy-dom. The AI polling hook is driven against a fake WebSocket.

| File | Tests | Coverage |
|------|-------|----------|
| `components/kanban-board/__tests__/board.test.tsx` | 19 | Columns, cards, drag-and-drop, dependency signals |
| `hooks/__tests__/use-board.test.ts` | 9 | Optimistic updates and rollback |
| `hooks/__tests__/use-websocket.test.ts` | 15 | Reconnect backoff, resync on reconnect, URL resolution |
| `hooks/__tests__/use-ai-suggestions.test.ts` | 8 | Polling lifecycle, accept, reject |

## WebSocket Server Tests (6 tests)

| File | Tests | Coverage |
|------|-------|----------|
| `apps/ws-server/src/__tests__/health.test.ts` | 6 | `/health` over HTTP on the WebSocket port, upgrade on that same port, 404 shape, close releases the port |

## Known Failure Cases
- **None.** No `test.skip` / `test.todo` markers exist in the suite.
- If a test fails, it is a regression to be fixed, not a documented known failure.

## Cross-file interference
Bun runs these files in one process, so a leak in one is a failure in another.
Two that have bitten:

- `mock.module` is global and permanent. Suites inject a fake AI provider
  through `setAiProvider` instead of module mocking.
- A suite that installs happy-dom replaces the global `fetch` with one that
  refuses cross-origin requests, which breaks any other suite calling a
  different origin. The WebSocket server tests use `node:http` directly.

The AI queue name is set in a `bunfig.toml` preload rather than inside a test
file, because several suites reach `@repo/queue` indirectly and the first one
loaded would otherwise fix the name for all of them.

## Running
```bash
bun test                                          # everything
bun test apps/server/src/engine                   # engine unit tests only
bun test apps/server/src/__tests__                # server integration only
bun test apps/web                                 # web app only
bun test apps/ws-server                           # WebSocket server only
```

Per-file counts, if you want to regenerate this table:
```bash
bun test --reporter=junit --reporter-outfile=/tmp/junit.xml
```
