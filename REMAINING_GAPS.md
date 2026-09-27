# REMAINING_GAPS.md

**What is finished, what is not, and where all of it lives.**

Written 2026-09-27 against the working tree, not from memory. Every claim here was
checked against the code or git.

---

## 1. Where this work is

| | |
|---|---|
| **Branch** | `feat/join-flow-and-board-features` |
| **Ahead of `main`** | **19 commits** |
| **Behind `main`** | 0 — nothing on `main` is missing here |
| **Merge base** | `de4ce35` "Recompute only the graph downstream of what changed" |
| **Remotes** | **None configured.** `git remote -v` is empty, so this exists only on this machine |
| **Upstream tracking** | Not set |

Other local branches, all untouched by this work: `main`, `feat/backend-implementation`,
`feat/task-create-delete`, `fix/frontend-issues`.

**`main` is at `de4ce35`.** None of the 19 commits below, and none of the uncommitted
work, has reached `main`. If this machine is lost, all of it is lost — there is nowhere
it is pushed.

To publish it, a remote has to be created first:

```bash
git remote add origin <url>
git push -u origin feat/join-flow-and-board-features
```

### Verification on this branch

| Check | Result |
|---|---|
| `bun run build` | pass (Turbopack) |
| `bun run check-types` | pass (8/8 tasks, 6 packages) |
| `bun run lint` | pass (0 warnings) |
| `bun test` | **226 pass, 0 fail, 29 files** |

Run twice in a row to confirm. The suite is safe against any database now — see
`124350d` in the table below.

---

## 2. What is done

19 commits ahead of `main`, oldest first. Every one is committed and verified.

| Commit | What it did |
|---|---|
| `9d5f880` | Gave the deployed stack a working `/health`, `/api`, and `/ws` |
| `d03c972` | Corrected documentation the code had moved past |
| `a4d6982` | Project preview, roster, and open join |
| `30da4f8` | Stopped an unparseable 401 from stranding the user |
| `acab663` | Ask before deleting a task; stop refetching the graph on every move |
| `39accd4` | Brought `TESTING.md` back in line with the suite |
| `7acfe49` | Task page can add the dependencies it was missing |
| `95c3ad4` | Stopped `STATE.md` claiming things that were no longer true |
| `67657cc` | Board can be moved with a keyboard (dnd-kit `KeyboardSensor`) |
| `c47473b` | `actorId` on every event; toasts for teammates only, batched |
| `62ecc69` | `JWT_EXPIRES_IN`, 30-day default, replacing a hardcoded 7 days |
| `b4c95fc` | Test inventory and open-work list brought back in line |
| `124350d` | **Test suites stopped deleting the developer's database** |
| `fd28995` | Dependency removal asks first, in both places that offered it |
| `88a5623` | Corrected testing notes; closed the last open destructive action |
| `bb00928` | Loading skeletons that mirror the layout, with accessible names |
| `8db5cb8` | Sliding session via `POST /auth/refresh` |
| `88d0a93` | Emptied the open-work list; recounted to 226 tests |
| `b056e03` | Stopped the board asking the server what it already knew |

### Audit items closed, with the evidence

The audit was re-run against this branch's code rather than trusted. Eleven of the
twelve items were **already implemented**; only one was a real defect.

| Item | State found | Evidence |
|---|---|---|
| Phase 4a — LLM timeout + temperature | Already done | `AbortController` on `LLM_TIMEOUT_MS`; `temperature: 0`; 12 tests in `ai-provider.test.ts` |
| Phase 4b — BullMQ AI queue worker | Already done | `apps/server/src/workers/ai-suggestion.worker.ts`; 13 tests in `ai-queue.integration.test.ts` |
| Phase 4c — descendant-scoped recompute | Already done | `computeDownstreamReadiness` at `task.service.ts:277`; 6 tests in `readiness-scope.integration.test.ts` |
| Phase 5 — docker routing + ws healthcheck | Already done | healthchecks on all 5 services; `/health` served on 4001 alongside the upgrade handler |
| Phase 6 — README + LICENSE | Already done | 21-line MIT `LICENSE`; README limitations accurate |
| 401 non-JSON | Already fixed | `30da4f8` |
| Owner gating | Already done | `assertOwner` on update, delete, addMember, removeMember |
| Error boundary | Already done | `apps/web/app/error.tsx` |
| Delete confirmation | Already fixed | `acab663` (task), `fd28995` (dependency) |
| **Duplicate graph fetch** | **Real defect, fixed in `b056e03`** | see below |

The one real defect: deleting a task from the board fetched the whole graph **twice** —
once on load, then again in `fetchDependents` purely to filter it down to "what depends
on this task", rebuilding a task map the hook was already holding. Every click of a delete
button paid a full round trip for information already on screen. Now derived from state,
synchronous, and renamed to `getDependents` so the old name stops inviting the request
back. It also deleted a failure path that could not usefully fire: a network error used
to abort a delete over the wording of its own confirmation prompt.

### Also verified, not changed

`TaskFlow_Pro_Synopsis_v6.xlsx` is excluded from git. `.gitignore:47` carries both
`*.xlsx` and the filename, 0 xlsx files are tracked, and `git check-ignore` confirms it.

---

## 3. What still has to be done

### 3.1 The uncommitted work — commit it or lose it

**12 modified files, 2 untracked paths, 340 insertions, 55 deletions, all uncommitted.**
This is the single largest piece of outstanding work and it exists only in the working
tree.

```bash
git status --short   # current inventory
git stash            # if you need it out of the way — do NOT `git add -A`
```

Do not `git add -A` or `git reset --hard` on this tree until it is committed or stashed.

It contains six distinct features:

#### a. AI suggestions show their critical-path cost

`ai.service.ts` gains `edgeImpactDays()`, which prices a proposed edge as the difference
between the critical path with it and without it, reusing `computeCriticalPath` from the
engine so no critical-path logic is duplicated. `POST /ai/suggestions/:id/accept` now
returns `criticalPathImpactDays`; `packages/types/src/schemas/ai.ts` gains the nullable
optional field; the AI panel shows the impact after accepting.

Files: `apps/server/src/services/ai.service.ts`, `packages/types/src/schemas/ai.ts`,
`apps/web/hooks/use-ai-suggestions.ts`, `apps/web/components/ai-suggestions/index.tsx`,
`apps/web/app/task/[taskId]/page.tsx`.

#### b. Invite / join flow

A new page at `/projects/[projectId]/invite` that previews the project and offers to
join, redirecting to sign-in with `?redirect=` when unauthenticated. The projects list
gains a paste-a-link-or-ID box; the project page gains a "Copy Invite Link" button;
`login/page.tsx` honours `?redirect=`.

`parseProjectInvite` is exported from `app/projects/page.tsx` and accepts either a bare
ID (`147`) or a full URL (`.../projects/147/invite`).

Files: `apps/web/app/projects/[projectId]/invite/page.tsx` *(untracked)*,
`apps/web/app/projects/page.tsx`, `apps/web/app/projects/[projectId]/page.tsx`,
`apps/web/app/login/page.tsx`.

#### c. Members avatar row

`members-avatar-row.tsx` *(untracked)* — overlapping initial avatars in the board header
from `GET /projects/:id/members`, showing 4 then a `+n` overflow, with the owner marked in
the tooltip. Presentational only; membership management stays on the project page.

#### d. Board search and readiness filter

`board/[projectId]/page.tsx` filters columns client-side by title and by
`READY`/`BLOCKED`, with a filtered-count readout and an "active filters" state. The
modals keep the unfiltered task list so the dependency picker is unaffected.

#### e. Readiness toasts are buffered

`queueReadinessToast()` collapses a cascade of `TASK_BLOCKED` / `TASK_READY` events into
one toast each after `READINESS_TOAST_MS`, instead of one per task. A backward move marks
every descendant at once, which would otherwise produce a storm.

#### f. Sortable-card refactor

`board.tsx`, `board-column.tsx`, `task-card.tsx` — a per-card "Manage dependencies"
menuitem, `loading`/`error` props threaded to the column, and a `SortableContext` change.
**This one needs a close look before committing** (see 3.2).

### 3.2 The sortable-card refactor — checked, and it is fine

Worth recording because it looked alarming at first glance. The diff in
`board-column.tsx` *moved* the `SortableContext` block rather than deleting it, so a
hunk that opens with a `-` on `SortableContext` reads like a removal when it is a
relocation above newly added card controls.

Verified in the working tree:

- `board-column.tsx:73` opens `SortableContext`, `:88` closes it, with
  `verticalListSortingStrategy` still imported at `:4`
- `task-card.tsx:218` still calls `useSortable`
- `reorderTask` is wired end to end: `use-board.ts:157` → `board/[projectId]/page.tsx:344`
  → `onReorderTask={reorderTask}`

So position reordering within a column is live, not dead code, and nothing needs
restoring. What the refactor actually adds is a per-card "Manage dependencies" menuitem
plus `loading` / `error` props threaded down to the column.

The one thing still true of this area: the 20 tests in `board.test.tsx` exercise the
committed card, not the refactored one. `3.3` covers that.

### 3.3 The uncommitted work has zero test coverage

Checked directly — **no test file references any of it**:

| Feature | Test files |
|---|---|
| `parseProjectInvite` | 0 |
| Invite page | 0 |
| `MembersAvatarRow` | 0 |
| `readinessFilter` / `matchesFilter` | 0 |
| `criticalPathImpactDays` | 0 |
| `queueReadinessToast` | 0 |
| `onManageDependencies` | 0 |

226 tests pass, and none of them touch any of this. The suite is green in a way that says
nothing about the code about to be committed.

Worth writing, cheapest first:

1. **`parseProjectInvite`** — pure function, trivially testable, and it parses untrusted
   input into a project ID. Cases: bare ID, full URL, trailing slash, `//projects/1`
   (should reject), negative, zero, non-numeric, empty, whitespace, an ID embedded
   mid-string, and a `javascript:` URL. It is currently exported from a route file, which
   is also worth fixing — move it to `apps/web/lib/` so a page module stays a page.
2. **`queueReadinessToast`** — 3 blocked events in one window must produce one toast
   saying "3", not three. Also 1 blocked + 2 ready → two toasts, and a new event inside
   the window must reset the timer rather than queue a second flush.
3. **`matchesFilter`** — title match case-insensitive, readiness match, both, neither,
   empty query, and that an unfiltered board is unchanged. Confirm the dependency picker
   still sees every task.
4. **`edgeImpactDays`** — an edge on the critical path should report a positive delta; an
   edge between two off-path tasks should report 0. It needs a fake `AiProvider` and a
   scratch DB, so it belongs in an integration test alongside the existing AI ones.
5. **`MembersAvatarRow`** — 3 members shows 3, 6 members shows 4 + `+2`, 0 members renders
   the empty case, and the `aria-label` count is right for 1 vs many.

### 3.4 Merge to `main`

Nothing is on `main` yet. When the work above is committed and a remote exists:

```bash
git push -u origin feat/join-flow-and-board-features
# then open a PR, or
git checkout main && git merge --ff-only feat/join-flow-and-board-features
```

`main` has no commits this branch lacks, so a fast-forward is possible — no conflict
resolution needed.

### 3.5 Documented limitations, still true

These are deliberate and written down in `STATE.md` and `README.md`. They are not bugs to
fix, but they are the honest edges of the product.

- **Auth is a `localStorage` JWT.** No refresh-token rotation, therefore no server-side
  revocation: a token that has not expired can be reissued, one that has cannot. Lifetime
  is `JWT_EXPIRES_IN`, default 30 days, and the client slides it forward while in use.
- **Events published while a socket was down are lost** for that client, so a reconnect
  refetches rather than assuming the stream was complete.
- **AI degrades gracefully** when the LLM is unavailable — the job fails and nothing is
  recorded. Two retries, no circuit breaker, no fallback model cascade.
- **Mobile touch drag-and-drop is unvalidated** across mobile browsers.
- **Critical-path recalculation is O(V+E) per mutation.** Fine at this scale; not past
  roughly a thousand tasks. Writes are descendant-scoped, but the graph is still fully
  loaded, so the load cost is paid even for a one-task change.
- **No project-wide reconciliation.** Because recomputation is descendant-scoped, drift
  that is not downstream of a change is never corrected by a later mutation. A repair
  path would have to recompute deliberately.
- **Projects are open to any signed-in user** — preview and join need no invite and IDs
  are sequential. Fine for a demo, wrong the moment two projects hold data that should
  stay separate.
- **Single Redis instance**, no clustering or multi-region story.
- **Single worker process** for AI jobs. More than one replica is safe, but queue
  concurrency is per-replica and needs attention before scaling out.

### 3.6 Gaps in the committed work

- **Keyboard drag is not behaviourally tested.** `67657cc` added dnd-kit's
  `KeyboardSensor`, but happy-dom reports every rect as 0×0, so the full lift-move-drop
  sequence cannot be exercised. The wiring is covered by a focusability test only. This
  needs a real browser test or a manual pass — it is the one committed feature with no
  automated proof it works.
- **Integration tests need a scratch database to be practical.** They no longer *need*
  one — `124350d` made every suite take a per-run identity and delete only what it
  created, and two consecutive full runs leave the database untouched. But they still
  share one database, so they cannot run concurrently with each other. A `taskflow_test`
  database is already created and migrated locally for this reason.
- **AI is tested against a fake provider**, never a real one. Request shape, timeouts,
  retries and degradation are covered; whether OpenAI actually returns parseable
  suggestions at these settings is not.

---

## 4. Quick reference

```bash
# Where am I
git branch --show-current              # feat/join-flow-and-board-features
git log main..HEAD --oneline           # the 19 commits
git status --short                     # 12 modified + 2 untracked

# Verify
bun run check-types && bun run lint
DATABASE_URL="postgresql://taskflow:taskflow@localhost:5432/taskflow_test" bun test
bun run build

# Order of work
#   1. commit the uncommitted feature work (3.1)
#   2. write the missing tests (3.3) -- there are none for any of it
#   3. set a remote and merge to main (3.4)
```
