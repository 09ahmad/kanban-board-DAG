# TaskFlow Pro — Current State (updated 2026-09-27)

## Project Status: feature-complete, with known gaps

All verification passes:
- `bun run build` ✓ (Turbopack)
- `bun run check-types` ✓ (all 6 packages)
- `bun run lint` ✓ (0 warnings)
- `bun test` ✓ (195 pass, 0 fail, 26 files)

Feature-complete against the audit list except the items under **Open work** below.
Counts and inventories here were regenerated from the tree on 2026-09-27; if they
drift, regenerate rather than trusting them.

## What is done

### Frontend (`apps/web/`)
- Next.js 16 + React 19 App Router
- Pages: `/`, `/login`, `/register`, `/projects`, `/projects/[projectId]`,
  `/projects/[projectId]/graph`, `/board/[projectId]`, `/task/[taskId]`
- Components: kanban-board (`board`, `board-column`, `task-card`,
  `create-task-modal`, `add-dependency-modal`, `dependency-list`),
  `dependency-graph`, `ai-suggestions`, `critical-path-display`, `project-actions`
  (edit/delete modals), `project-members`, `project-events`, `confirm-dialog`,
  `error-boundary`, `toaster`, `layout/AppLayout`
- UI primitives: `button`, `card`, `input`, `textarea`, `badge`, `nav-link`
- Hooks: `use-board`, `use-websocket`, `use-ai-suggestions`
- Lib: `api-client`, `auth-context`, `utils`
- Tailwind v4 (`@tailwindcss/postcss`), custom CSS classes in `app/globals.css`
- Drag-and-drop via `@dnd-kit/core`, with `PointerSensor` and `KeyboardSensor`

### Backend (`apps/server/`)
- Express REST API (port 4000) + pure-TS DAG engine (`src/engine/`)
- Engine: `graph`, `cycle-detector`, `topological-sort`, `readiness`, `scheduler`,
  `critical-path`, `errors`, `types` — in-process, no I/O, no separate service
- Routes: `auth`, `projects`, `tasks`, `dependencies`, `ai`
- Services: `auth`, `project`, `task`, `dependency`, `ai`
- Middleware: `authMiddleware`, `errorHandler`, `validate`
- Lib: `errors`, `asyncHandler`, `ai-provider`
- Recomputation is scoped: a mutation touches only the changed task and its
  transitive dependents, not the whole project

### WebSocket (`apps/ws-server/`)
- `ws` package server (port 4001) + ioredis subscriber, ConnectionManager,
  PROJECT_SUBSCRIBE
- Serves `GET /health` over HTTP on the same port as the WebSocket upgrade, so one
  health check covers both and the container needs a single exposed port
- Reconnect with exponential backoff, capped at 30s; a reconnect triggers an
  authoritative refetch rather than trusting the stream to have caught up

### Packages
- `packages/types/` — enums, events, api, schemas (auth, project, task, dependency,
  ai, events), dtos
- `packages/db/` — Prisma 7 schema, PrismaPg adapter, singleton client, seed
- `packages/queue/` — ioredis Pub/Sub, BullMQ AI queue

## Documentation deliverables (for submission checklist)
- `docs/ARCHITECTURE.md` — architecture, data model, known limitations (Mandatory M)
- `docs/TESTING.md` — full test suite summary (Optional O)
- `README.md` — setup/run/security/scalability
- `DESIGN.md` — design system
- `STATE.md` — this file

`FRONTEND_ANALYSIS.md` is the original frontend-vs-backend audit (30 findings, with
a prioritised list in section 6) and is kept as the record of what was found, not
as a description of the current tree.

## Environment
- PostgreSQL + Redis running via `docker compose up -d` (ports 5432, 6379)
- `docker compose config -q` validates; the web image is built with
  `API_INTERNAL_URL` / `WS_INTERNAL_URL` baked in at build time
- `.env` is gitignored; `.env.example` has no real secrets
- Most server integration suites truncate shared tables, so `bun test` needs
  `DATABASE_URL` pointed at a scratch database. Against the development database
  it will delete whatever is in it, including anything a local server is using.

## Known limitations (see `docs/ARCHITECTURE.md` §4 for the full list)
- Auth uses `localStorage` JWT (documented simplification, not production-grade).
  There is no refresh-token rotation: an expired token means logging in again, and
  the client clears the session and redirects rather than silently retrying. The
  lifetime is therefore the whole session, so it is configurable via
  `JWT_EXPIRES_IN` and defaults to 30 days.
- Anything published while a socket was down is lost for that client, so a
  reconnect refetches instead of assuming the stream was complete.
- AI degrades gracefully when the LLM is unavailable; the run is executed by a
  BullMQ worker and the client polls for the result. Two retries, no circuit breaker.
- Mobile touch drag-and-drop is not fully validated across mobile browsers.
- Critical-path recalculation is O(V+E) per mutation; fine at this scale, not for
  graphs beyond roughly a thousand tasks.
- Single Redis instance; no clustering or multi-region story.

## Open work

Verified still open against the code on 2026-09-27, from the audit's section 6:

| # | Item | Notes |
|---|------|-------|
| 1 | Loading skeletons | Spinners only. Not a correctness issue. |
| 2 | Token refresh / session management | Not needed for the stated scope: the login lasts 30 days and is configurable, so a lapse means signing in again. Full rotation would still need a refresh endpoint and revocation story, which is a larger change than the audit asked for. |
| 3 | Deleting a dependency asks first | A task's page confirms before deleting the task, and a project confirms before deletion, but removing a single dependency edge still happens immediately. `ConfirmDialog` already covers the case. |

Resolved since the audit list was written:

- **Toast notifications for updates made by other clients.** `WsEventBroadcast`
  now carries `actorId`, threaded through the task and dependency services
  including the events the engine derives as consequences, so the client can
  credit the person whose change blocked a task. Events with no actor are work
  with no human behind it, such as the AI worker, and are never announced. The
  socket speaks for other people only and batches, so dragging a card across
  three columns produces one line rather than three, and it stays silent when
  nobody is signed in to compare against. The wording lives in
  `apps/web/lib/remote-activity.ts`, apart from the socket so it is testable
  without a DOM.

Fixed but not covered by an automated test, for the record:

- **Keyboard dragging on the board.** `DndContext` now registers dnd-kit's
  `KeyboardSensor` alongside the pointer sensor, so a card can be lifted, moved
  and dropped with Space and the arrow keys. The drag sequence itself cannot be
  tested here: dnd-kit measures element rects to decide where a keyboard move
  lands, happy-dom reports every element as zero-sized, and the rendered markup
  is identical with and without the sensor. It needs a real browser — a
  Playwright test or a manual pass. The shared move logic (`resolveDrop`,
  `performDrop`) is unit-tested; what is untested is dnd-kit's own key handling.

Deliberately out of scope, for the record:

- Cycle feedback in the add-dependency modal is generic rather than
  pre-emptive. Cycle detection needs the whole graph, which is the engine's job,
  so the server's `CYCLE_DETECTED` message is what the user sees — the modal
  keeps itself open so the reason stays on screen.
- `DeleteProjectModal` (in `components/project-actions.tsx`) and the newer
  `ConfirmDialog` are two implementations of the same idea. `ConfirmDialog` is the
  more complete one (Escape, backdrop dismissal, `role="alertdialog"`); folding
  the project modal into it would be worth doing but touches the project pages
  while that work is in flight.

## If continuing (opencode)
1. `bun run build && bun run check-types && bun run lint && bun test` to confirm green
2. Read the **Open work** table above before claiming the project is finished
3. Integration tests truncate PostgreSQL state — point them at a scratch database
   before running them
