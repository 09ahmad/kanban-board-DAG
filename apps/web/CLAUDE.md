# TaskFlow Pro — Frontend Memory (`apps/web`)

Read this before any frontend task. Rename this in as `apps/web/CLAUDE.md` — Claude Code does
not read `AGENT.md` automatically, only `CLAUDE.md`. The backend is fully implemented; this
app only ever calls its real REST API and subscribes to the real WebSocket server.

---

## Part 1 — Design direction

### The trap to actively avoid
Before building anything, check every screen against these generic-AI-UI defaults:
1. Warm cream background + high-contrast serif + terracotta accent.
2. Near-black background + one bright acid-green/vermilion accent.
3. Broadsheet layout: hairline rules, zero border-radius, dense newspaper columns.
4. **The SaaS-card kit** — identical rounded cards, one border-radius on everything regardless
   of hierarchy, the same soft grey shadow under each. The single most likely trap here
   specifically, since a Kanban board is already card-shaped content.
5. Template chrome: ALL-CAPS eyebrow labels, middle-dot-joined meta strings, monospace for
   small data labels, a "→" on every button, numbered markers on content that isn't a sequence.

**No palette, typeface, or layout is specified in this file on purpose.** Originate the full
token system from the product's own subject matter, not from a default. Two things are
structural, not aesthetic, and hold regardless of whatever direction is chosen:
- Readiness (`READY`/`BLOCKED`) is the one piece of state this product invents that no generic
  Kanban tool has — give it a real, load-bearing signal, not just another status badge that
  looks like `status`.
- The dependency graph screen is the one place worth a genuine design risk, since it's the one
  screen a generic template has no opinion about at all.

### Two design contexts, calibrated differently
- **Landing page** (`app/page.tsx`): unauthenticated visitors land here first. It's allowed —
  expected — to have a real hero moment, a nav with conventional **Log in** / **Register**
  buttons (Log in lower-emphasis, Register primary), and marketing feature sections. Ground the
  hero in the product's real content (e.g. an actual seeded dependency graph) rather than the
  generic "headline + gradient + stat callout" template the design skill flags as an overused
  default.
- **The app itself** (project list, board, task detail, graph, AI panel): quiet and
  disciplined — a tool people use daily, not a page visited once to be impressed by.

### Process
1. **Plan**: a compact token system (4–6 named colors, type roles, layout concept) and ASCII
   wireframes for the landing page, project list, board, task detail, and graph screens.
2. **Review against the brief**: check the plan against the five traits above; revise anything
   that's a generic default rather than a choice made for this product.
3. **Build.**
4. **Self-critique**: screenshot every screen (desktop + mobile), check again against the five
   traits, plus keyboard focus, reduced motion, and real contrast.

Spend boldness once — on the graph (and, differently, on the landing page hero). Keep
everything else quiet.

### Writing
- Name things the way a user thinks about them: "Blocked by 2 tasks," not "2 unresolved
  dependency edges."
- Buttons say exactly what they do, and the confirmation/toast uses the same word.
- Empty and error states explain what happened and what to do next, in the interface's voice —
  never vague, never apologetic. An empty board column is an invitation to add a task.

---

## Part 2 — Technical conventions (confirmed against the real backend)

### Structure
```text
apps/web/
├── app/
│   ├── page.tsx                # landing page — Log in / Register in the nav
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── projects/page.tsx        # project list/dashboard — GET /api/v1/projects already exists
│   ├── board/[projectId]/page.tsx
│   ├── task/[taskId]/page.tsx
│   └── layout.tsx
├── components/
│   ├── kanban-board/
│   ├── task-detail/
│   ├── dependency-graph/         # custom SVG — no graph library
│   └── ai-suggestions/
├── lib/
│   ├── api-client.ts
│   └── auth-context.tsx
├── hooks/
│   ├── use-board.ts
│   └── use-ai-suggestions.ts
└── .env.local                    # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL only
```

### Real API contract — use these, not assumed ones
Base URL `http://localhost:4000/api/v1` (`NEXT_PUBLIC_API_URL`). Every response is
`{ success: true, data }` or `{ success: false, error: { code, message } }`.

**Confirmed real endpoints**:
```
POST   /auth/register              POST /auth/login          GET /auth/me
POST   /auth/refresh            # reissue a session that has not lapsed yet
POST   /projects                   GET  /projects            GET /projects/:projectId
PATCH  /projects/:projectId        DELETE /projects/:projectId
POST   /projects/:projectId/members            DELETE /projects/:projectId/members/:userId
POST   /projects/:projectId/tasks              GET /projects/:projectId/tasks
GET    /tasks/:taskId              PATCH /tasks/:taskId      PATCH /tasks/:taskId/move
DELETE /tasks/:taskId
POST   /projects/:projectId/dependencies       DELETE /dependencies/:dependencyId
GET    /projects/:projectId/graph              GET /projects/:projectId/critical-path
GET    /projects/:projectId/events
POST   /projects/:projectId/ai/dependency-suggestions
POST   /ai/suggestions/:suggestionId/accept    POST /ai/suggestions/:suggestionId/reject
```

**Confirmed real error codes** — these are the only ones the backend actually throws:
`VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`CONFLICT` (409 — covers duplicate email, duplicate dependency, and cross-project mismatch, all
under the same code), `CYCLE_DETECTED` (400), `SELF_DEPENDENCY` (400), `TASK_IS_BLOCKED` (400).
**Do not branch UI logic on any other code string** (there is no `EMAIL_TAKEN` or
`DUPLICATE_DEPENDENCY`). For `CONFLICT`, display the server's `message` text directly — it's
already a complete, human-readable sentence — rather than trying to distinguish sub-cases.

### Binding technical decisions
- **No React Flow, no graph library.** The dependency graph is a small custom SVG component.
- **Drag-and-drop**: `@dnd-kit/core`. Column drop calls `PATCH /tasks/:id/move`, optimistic
  update, rollback on failure.
- **Project list/dashboard is a real, required screen** — `GET /projects` already exists on
  the backend and nothing currently calls it. Login/register success routes to this screen
  (or straight to the one project if the user has exactly one), not to a hardcoded board.
- **Data fetching**: no heavy state library. `lib/api-client.ts` is a thin `fetch` wrapper
  that unwraps the envelope once; `hooks/use-board.ts` loads the graph once and patches itself
  from WebSocket events rather than refetching.
- **Auth token**: `localStorage`, attached as a Bearer header — a documented simplification,
  not production-grade, write it down as an assumption rather than presenting it as final.
- **WebSocket**: one connection per board page to `NEXT_PUBLIC_WS_URL`, sends
  `{ type: 'PROJECT_SUBSCRIBE', projectId }` on open, applies incoming
  `TASK_UPDATED`/`TASK_MOVED`/`TASK_READY`/`TASK_BLOCKED`/`DEPENDENCY_ADDED`/
  `DEPENDENCY_REMOVED`/`SCHEDULE_CHANGED`/`AI_SUGGESTION_CREATED`/`AI_SUGGESTION_ACCEPTED`/
  `AI_SUGGESTION_REJECTED` events directly to local state.
- **`readiness` is never editable anywhere in the UI.** A `BLOCKED` task's move-to-
  `IN_PROGRESS` affordance should be visibly disabled, not just rejected after the fact.
- Avoid decorative flourishes (glow effects, gradient washes) by default on the critical path
  highlight or anywhere else — if one genuinely improves legibility, that's a deliberate choice
  to state explicitly, not a default reach for polish.

### Verification, every phase
`bun run check-types`, `bun run lint`, and a real screenshot review against Part 1's five-trait
checklist — not just "it renders."

### Full spec
`docs/build-specs/TaskFlow_Pro_Frontend_Build_Prompt.md` (note: `build-specs`, plural — matches
this repo's actual folder name).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
