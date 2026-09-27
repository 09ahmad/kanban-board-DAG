# TaskFlow Pro — Test Suite

## Summary
**223 tests pass · 0 fail** across 29 files. Numbers below are from a full
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

## Server Tests (79 tests)
Drive the real Express app against a live PostgreSQL and Redis.

These suites take a per-run identity and delete only what they created, so they
are safe to run against any database and can be run twice in a row. They no
longer empty the tables, which means `DATABASE_URL` no longer has to point
somewhere throwaway — the scratch-database advice below is now belt and braces
rather than a requirement.

| File | Tests | Coverage |
|------|-------|----------|
| `auth.integration.test.ts` | 14 | Register, login, JWT validation, logout, session refresh |
| `dependency.integration.test.ts` | 5 | CRUD, cycle detection, graph, critical path, events |
| `task-move.integration.test.ts` | 2 | BLOCKED guard and readiness |
| `diamond.integration.test.ts` | 2 | Compounding math and regression |
| `event-publishing.integration.test.ts` | 11 | Downstream events after commit, and who caused them |
| `readiness-scope.integration.test.ts` | 6 | Recomputation touches a change and its descendants, and nothing else |
| `ai-provider.test.ts` | 12 | Bounded/timeout LLM call, request shape, candidate schema, degraded mode |
| `ai-queue.integration.test.ts` | 13 | BullMQ job lifecycle, per-task dedupe, retries, failure isolation |
| `project-membership.integration.test.ts` | 9 | Preview visibility, roster gating, idempotent join, unique-violation handling |

| File | Tests | Coverage |
|------|-------|----------|
| `config/__tests__/env.test.ts` | 5 | JWT lifetime default, blank fallback, configured duration, trimming |

## Web App Tests (119 tests)
Run under happy-dom. The AI polling hook is driven against a fake WebSocket.

| File | Tests | Coverage |
|------|-------|----------|
| `components/kanban-board/__tests__/board.test.tsx` | 20 | Columns, cards, drag-and-drop, dependency signals |
| `components/__tests__/confirm-dialog.test.tsx` | 7 | Consequence copy, confirm, cancel, Escape, backdrop, in-flight lockout |
| `components/kanban-board/__tests__/add-dependency-modal.test.tsx` | 7 | Pick a prerequisite, duplicate and self edges, cycle rejection, preselection |
| `hooks/__tests__/use-board.test.ts` | 9 | Optimistic updates and rollback |
| `hooks/__tests__/use-websocket.test.ts` | 21 | Reconnect backoff, resync on reconnect, URL resolution, teammate-only notifications |
| `hooks/__tests__/use-ai-suggestions.test.ts` | 8 | Polling lifecycle, accept, reject |
| `lib/__tests__/api-client.test.ts` | 12 | Envelope unwrapping, empty and non-JSON bodies, status-derived errors, 401 handling, redirect suppression |
| `lib/__tests__/remote-activity.test.ts` | 11 | Wording per event, own and actor-less silence, burst collapsing |
| `lib/__tests__/session.test.ts` | 8 | Refresh window, the boundary, unreadable and expired tokens |
| `components/__tests__/skeleton.test.tsx` | 9 | Each placeholder announces itself and reserves its space |
| `components/kanban-board/__tests__/dependency-list.test.tsx` | 7 | Removing an edge asks first, says what changes, cancels cleanly |

Two hook suites stub `globalThis.fetch` rather than mocking `@/lib/api-client`
with `mock.module`. A `mock.module` in Bun is global and permanent for the
process, so it silently replaced the real client for every suite that ran
afterwards; the fetch stub puts the real client, envelope unwrapping included,
under test instead.

`use-websocket.test.ts` is the one suite that does mock modules, for the toaster
and the auth context. That is safe only because nothing running after it needs
either for real, and it imports its subject *after* the mocks — a static import
at the top would capture the real ones. Treat a new mock in that file as a
constraint on later suites, not a local convenience.

These suites avoid testing-library's `screen` and query within the rendered
tree: `screen` binds to `document.body` at import time, which happy-dom does
not have until a render has happened.

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
  through `setAiProvider` instead of module mocking, and the WebSocket hook suite
  mocks only the toaster and auth context, which nothing after it needs.
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

Two consecutive full runs should both pass and leave the database as they found
it; anything else means a suite is leaking rows or depending on another suite
having emptied the tables first.

Per-file counts, if you want to regenerate this table:
```bash
bun test --reporter=junit --reporter-outfile=/tmp/junit.xml
```
