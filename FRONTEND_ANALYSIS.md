# Frontend vs Backend API Analysis — Missing Implementations & Bugs

This document provides a complete audit of the frontend (`apps/web`) against the backend API contracts (`apps/server`). Every endpoint, feature, and data contract is verified.

---

## 1. Backend API Contract Summary

### Auth (`/api/v1/auth`)
| Method | Endpoint | Request Body | Response |
|--------|----------|--------------|----------|
| POST | `/register` | `{name, email, password}` | `{user: SafeUser, token: string}` |
| POST | `/login` | `{email, password}` | `{user: SafeUser, token: string}` |
| POST | `/logout` | — | `{loggedOut: true}` |
| GET | `/me` | — | `SafeUser` |

### Projects (`/api/v1/projects`)
| Method | Endpoint | Request Body | Response |
|--------|----------|--------------|----------|
| POST | `/` | `{name, description?}` | `Project` |
| GET | `/` | — | `Project[]` |
| GET | `/:projectId` | — | `Project & {members: ProjectMember[]}` |
| PATCH | `/:projectId` | `{name?, description?}` | `Project` |
| DELETE | `/:projectId` | — | `{deleted: true}` |
| POST | `/:projectId/members` | `{userId, role?}` | `ProjectMember` |
| DELETE | `/:projectId/members/:userId` | — | `{removed: true}` |

### Tasks (`/api/v1/tasks` & `/api/v1/projects/:projectId/tasks`)
| Method | Endpoint | Request Body | Response |
|--------|----------|--------------|----------|
| POST | `/projects/:projectId/tasks` | `{title, description?, status?, position?, plannedStart?, duration?}` | `Task` |
| GET | `/projects/:projectId/tasks` | — | `Task[]` |
| GET | `/tasks/:taskId` | — | `Task` (full task with prerequisites/dependents?) |
| PATCH | `/tasks/:taskId` | `{title?, description?, status?, position?, plannedStart?, duration?}` | `Task` |
| PATCH | `/tasks/:taskId/move` | `{status, position?}` | `Task` |
| DELETE | `/tasks/:taskId` | — | `{deleted: true}` |

### Dependencies (`/api/v1/dependencies` & `/api/v1/projects/:projectId/dependencies`)
| Method | Endpoint | Request Body | Response |
|--------|----------|--------------|----------|
| POST | `/projects/:projectId/dependencies` | `{prerequisiteTaskId, dependentTaskId}` | `{tasks: Task[], dependencies: TaskDependency[]}` |
| DELETE | `/dependencies/:dependencyId` | — | `{deleted: true}` |
| GET | `/projects/:projectId/graph` | — | `{tasks: Task[], dependencies: TaskDependency[]}` |
| GET | `/projects/:projectId/critical-path` | — | `CriticalPathResult` |
| GET | `/projects/:projectId/events` | `?limit=&before=` | `TaskEvent[]` |

### AI Suggestions (`/api/v1/ai` & `/api/v1/projects/:projectId/ai`)
| Method | Endpoint | Request Body | Response |
|--------|----------|--------------|----------|
| POST | `/projects/:projectId/ai/dependency-suggestions` | `{taskId}` | `{suggestions: AiSuggestion[]}` |
| POST | `/ai/suggestions/:suggestionId/accept` | — | `{suggestion: AiSuggestion, graph: GraphSnapshot}` |
| POST | `/ai/suggestions/:suggestionId/reject` | — | `AiSuggestion` |

---

## 2. Frontend Coverage Matrix

### ✅ Fully Implemented Pages
| Page | Route | Backend Endpoints Used |
|------|-------|------------------------|
| Landing | `/` | None (static) |
| Login | `/login` | `POST /auth/login` |
| Register | `/register` | `POST /auth/register` |
| Projects List | `/projects` | `GET /projects`, `POST /projects` |
| Project Detail | `/projects/[projectId]` | `GET /projects/:projectId`, `PATCH /projects/:projectId`, `DELETE /projects/:projectId`, `POST/DELETE /projects/:projectId/members` |
| Board | `/board/[projectId]` | `GET /projects/:projectId/graph`, `POST /projects/:projectId/tasks`, `PATCH /tasks/:taskId/move`, `DELETE /tasks/:taskId`, `POST /projects/:projectId/dependencies`, `DELETE /dependencies/:dependencyId`, `GET /projects/:projectId/critical-path`, `GET /projects/:projectId/events` |
| Task Detail | `/task/[taskId]` | `GET /tasks/:taskId`, `PATCH /tasks/:taskId`, `DELETE /dependencies/:dependencyId` |

### ❌ Missing Pages
| Page | Route | Required Endpoints |
|------|-------|-------------------|
| **Graph View** | `/projects/[projectId]/graph` | `GET /projects/:projectId/graph` (full graph visualization) |
| **User Profile/Settings** | `/settings` | `GET /auth/me`, `PATCH /auth/me` (not in backend) |
| **Project Settings** | `/projects/[projectId]/settings` | Partially in project detail tabs |

---

## 3. Critical Bugs & Missing Features

### 3.1 AI Suggestions — **Broken Accept/Reject**
**File:** `apps/web/components/ai-suggestions/index.tsx` (lines 40-65)

```typescript
// BUG: Uses prerequisiteTaskId instead of suggestionId
const accept = useCallback(async (suggestion: AiSuggestionItem) => {
  await apiClient(`/ai/suggestions/${suggestion.prerequisiteTaskId}/accept`, ...);
  // Should be: suggestion.id (the AI suggestion record ID)
}, []);
```

**Backend expects:** `POST /ai/suggestions/:suggestionId/accept` where `suggestionId` is the `AiSuggestion.id` from database.
**Frontend sends:** `prerequisiteTaskId` (a task ID, not suggestion ID).

**Impact:** Accept/reject will always fail with 404 or wrong suggestion.

---

### 3.2 Task Detail Page — **Wrong API Contract**
**File:** `apps/web/app/task/[taskId]/page.tsx` (line 21-25)

```typescript
interface TaskDetailResponse {
  task: Task;
  prerequisites: TaskDependency[];
  dependents: TaskDependency[];
}
```

**Backend returns:** Single `Task` object from `GET /tasks/:taskId` (see `taskController.get` → `taskService.getTask`).
**Frontend expects:** Custom shape with `prerequisites` and `dependents` arrays.

**Impact:** Task detail page will fail to parse response, `prerequisites`/`dependents` will be undefined.

---

### 3.3 Project Detail — **Critical Path Missing Dependencies**
**File:** `apps/web/app/projects/[projectId]/page.tsx` (lines 236-241)

```tsx
<CriticalPathDisplay
  projectId={projectId}
  tasks={project.tasks ?? []}
  dependencies={[]}  // BUG: Empty array!
/>
```

**Impact:** Critical path visualization shows no edges, only nodes.

---

### 3.4 Board Page — **Duplicate State & Stale Data**
**Files:** `apps/web/hooks/use-board.ts` + `apps/web/components/kanban-board/board.tsx`

- `useBoard` maintains `tasks` Map and `dependencies` array
- `KanbanBoard` creates its **own** `tasks` Map from `initialTasks` prop
- On `refetch()`, `useBoard` updates its state but `KanbanBoard` doesn't receive new props (it uses local state)
- Drag-and-drop uses `KanbanBoard`'s local state, not `useBoard`'s

**Impact:** WebSocket events trigger `refetch()` but board doesn't update; optimistic updates diverge from server state.

---

### 3.5 WebSocket Connection — **Invalid Project ID on Initial Load**
**File:** `apps/web/app/task/[taskId]/page.tsx` (line 152-153)

```tsx
const projectId = task?.projectId;
useWebSocket(projectId || 0, handleWSEvent);  // BUG: Connects to project 0!
```

**Impact:** WebSocket connects to invalid project `0` before task loads, causing errors in WS server logs.

---

### 3.6 WebSocket Event Handling — **Incomplete Event Coverage**
**File:** `apps/web/app/board/[projectId]/page.tsx` (lines 63-88)

Handled: `TASK_CREATED`, `TASK_UPDATED`, `TASK_MOVED`, `TASK_DELETED`, `TASK_READY`, `TASK_BLOCKED`, `DEPENDENCY_ADDED`, `DEPENDENCY_REMOVED`, `SCHEDULE_CHANGED`, `GRAPH_UPDATED`, `AI_SUGGESTION_CREATED`, `AI_SUGGESTION_ACCEPTED`, `AI_SUGGESTION_REJECTED`

**Missing:** 
- No handling of `computedStart`/`computedEnd` updates from `SCHEDULE_CHANGED` payload
- No handling of `readiness` changes on tasks not currently visible
- Task detail page only handles subset of events

---

### 3.7 useBoard Hook — **No Optimistic Create/Delete**
**File:** `apps/web/hooks/use-board.ts`

- `createTask`: Calls API, then `refetch()` (full reload)
- `deleteTask`: Calls API, then `refetch()` (full reload)
- No optimistic UI for create/delete

**Impact:** Poor UX — full board reload on every task creation/deletion.

---

### 3.8 Graph Page — **Completely Missing**
**Route:** `/projects/[projectId]/graph` — **Does not exist**

Backend provides `GET /projects/:projectId/graph` returning full graph data.
Frontend has `DependencyGraph` component but no page using it.

---

### 3.9 Task Detail — **No Dependency Creation**
**File:** `apps/web/app/task/[taskId]/page.tsx`

Task detail shows prerequisites/dependents but **no "Add Dependency" button**.
User must go to board → Dependencies modal to add.

---

### 3.10 Task Detail — **No Inline Status Change**
**File:** `apps/web/app/task/[taskId]/page.tsx`

Status can only be changed via full "Edit" mode (opens form).
No quick status dropdown or drag-to-column from detail view.

---

### 3.11 Auth — **No Token Refresh / Session Management**
**File:** `apps/web/lib/auth-context.tsx`

- Token stored in `localStorage` only
- No automatic refresh before expiry
- No logout on 401 responses from API
- `logout` calls server but doesn't await before clearing local state

---

### 3.12 Error Handling — **Inconsistent**
**Multiple files:**

```typescript
// Some places:
catch (err: any) {
  toast({ message: err?.error?.message ?? "Failed" });
}

// Others:
catch (err: any) {
  toast({ message: err?.message ?? "Failed" });
}
```

Backend returns `{success: false, error: {code, message}}` — frontend sometimes accesses `err.error.message`, sometimes `err.message`.

---

### 3.13 CriticalPathDisplay — **Stale Data & Wrong Hook Usage**
**File:** `apps/web/components/critical-path-display.tsx`

- Uses `useBoard(projectId)` just for `fetchCriticalPath`
- Receives `tasks` and `dependencies` as props (from parent)
- Calls `fetchCriticalPath` on mount but doesn't refresh when parent data changes
- Parent (`ProjectDetailPage`) passes empty `dependencies={[]}`

---

### 3.14 Drag-and-Drop — **No Position Reordering**
**File:** `apps/web/components/kanban-board/board.tsx`

- Only supports moving between columns (status change)
- No within-column reordering (position change)
- `MoveTaskSchema` accepts `position` but UI never sends it

---

### 3.15 Task Card — **Readiness Color Logic Wrong**
**File:** `apps/web/components/kanban-board/task-card.tsx` (lines 12-27)

```typescript
const readinessOverrides: Record<ReadinessState, string> = {
  BLOCKED: "#fecaca",  // Red
  READY: "#bbf7d0",    // Green
};
```

**Issue:** Overrides status color completely. A `DONE` task that's `READY` shows green, but a `BACKLOG` task that's `READY` also shows green — loses status distinction.

---

### 3.16 Add Dependency Modal — **No Cycle Detection Feedback**
**File:** `apps/web/components/kanban-board/add-dependency-modal.tsx`

- Client-side validation prevents self-dependency and duplicates
- **No cycle detection** — backend will reject with `CYCLE_DETECTED` but UI shows generic error
- Should pre-validate using graph data or show specific "would create cycle" message

---

### 3.17 Dependency List — **No Bulk Actions**
**File:** `apps/web/components/kanban-board/dependency-list.tsx`

- Can only delete one dependency at a time
- No "select multiple" or "delete all" for cleanup

---

### 3.18 Project Members — **User ID Input Instead of Search**
**File:** `apps/web/components/project-members.tsx` (lines 127-134)

```tsx
<Input type="number" placeholder="Enter user ID" ... />
```

**Issue:** Users must know numeric ID of person to add. No user search/autocomplete.

---

### 3.19 Landing Page — **HeroGraph Uses Wrong Readiness Values**
**File:** `apps/web/app/page.tsx` (lines 194-198)

```tsx
const nodes = [
  { id: 1, ..., readiness: "READY" as const },
  { id: 2, ..., readiness: "DONE" as const },  // INVALID: "DONE" not in ReadinessState!
  { id: 3, ..., readiness: "IN_PROGRESS" as const },  // INVALID!
  { id: 4, ..., readiness: "BLOCKED" as const },
];
```

`ReadinessState` is only `READY | BLOCKED`. The hero graph uses status values incorrectly.

---

### 3.20 Critical Path Display — **No Critical Path Edge Highlighting on Graph**
**File:** `apps/web/components/critical-path-display.tsx`

The `DependencyGraph` component receives `criticalPath` (task IDs) but highlights only nodes, not edges between critical tasks correctly in all cases.

---

### 3.21 Missing: Project Graph Page
**Route:** `/projects/[projectId]/graph` — **Not implemented**

Should display full dependency graph with:
- All tasks as nodes
- All dependencies as edges
- Critical path highlighted
- Readiness indicators
- Zoom/pan controls
- Node click → task detail

---

### 3.22 Missing: Task Filtering/Sorting on Board
**File:** `apps/web/components/kanban-board/board.tsx`

No ability to:
- Filter by assignee (not in backend yet)
- Filter by label/tag (not in backend yet)
- Sort by priority, date, etc.
- Search tasks by title

---

### 3.23 Missing: Keyboard Accessibility
- Drag-and-drop not keyboard accessible
- No arrow-key navigation between columns
- No Enter/Space to open task detail

---

### 3.24 Missing: Loading Skeletons
- Pages show "Loading…" text instead of skeleton screens
- No progressive loading for large boards

---

### 3.25 Missing: Empty States with Actions
- Empty board columns: no "Add task here" drop zone or button
- Empty project list: has CTA but could be more prominent
- Empty dependency list: has CTA but modal doesn't open automatically

---

### 3.26 Missing: Confirmation Dialogs
- Delete task: no confirmation
- Delete project: has modal ✓
- Remove member: no confirmation
- Delete dependency: no confirmation

---

### 3.27 Missing: Toast Notifications for WebSocket Events
**File:** `apps/web/app/board/[projectId]/page.tsx`

Only shows toast for AI suggestion events. Other real-time updates (task moved by another user, dependency added) silently update via `refetch()` with no user notification.

---

### 3.28 Bug: useWebSocket Reconnection Logic
**File:** `apps/web/hooks/use-websocket.ts` (lines 42-48)

```typescript
ws.onclose = () => {
  setConnected(false);
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  setReconnectAttempts((prev) => prev + 1);
  setTimeout(connect, delay);
};
```

**Issue:** `connect` is in `useCallback` deps including `reconnectAttempts`, causing new function on every retry, which triggers `useEffect` reconnection loop incorrectly.

---

### 3.29 Bug: Board Page — Active Tab State Lost on Refetch
**File:** `apps/web/app/board/[projectId]/page.tsx`

`refetch()` called from WebSocket events doesn't preserve `activeTab` — but this is local state so it's fine. However, `criticalPath` state is reset on refetch because `loadCriticalPath` is called but `criticalPath` is set from response.

---

### 3.30 Missing: Responsive Design for Board
- Board uses `overflow-x-auto` but columns don't shrink on mobile
- No horizontal scroll indicator
- Task cards may overflow on small screens

---

## 4. Type Contract Mismatches

| Frontend Type | Backend Reality | Location |
|---------------|-----------------|----------|
| `TaskDetailResponse` (task + prerequisites + dependents) | `Task` only | `app/task/[taskId]/page.tsx` |
| `AiSuggestionItem` used for accept/reject | `AiSuggestion` has `id` field | `components/ai-suggestions/index.tsx` |
| `CriticalPathDisplay` expects `dependencies` prop | Parent passes `[]` | `app/projects/[projectId]/page.tsx` |
| `useBoard` returns `Map<number, Task>` | `KanbanBoard` expects `Task[]` | `hooks/use-board.ts` + `components/kanban-board/board.tsx` |

---

## 5. API Endpoints Not Called by Frontend

| Endpoint | Reason |
|----------|--------|
| `GET /projects/:projectId/tasks` | Board uses `/graph` instead |
| `PATCH /tasks/:taskId` (full update) | Only `move` used; detail page uses it but with wrong contract |
| `GET /tasks/:taskId` | Task detail uses it but expects wrong shape |
| `GET /projects/:projectId/graph` | Board uses it ✓ |
| `POST /projects/:projectId/ai/dependency-suggestions` | AI component uses it ✓ |
| `POST /ai/suggestions/:suggestionId/accept` | **Broken** — wrong parameter |
| `POST /ai/suggestions/:suggestionId/reject` | **Broken** — wrong parameter |
| `GET /projects/:projectId/events` | Project events & board use it ✓ |

---

## 6. Priority Fix List

### P0 — Blocking/Incorrect Behavior
1. **Fix AI suggestion accept/reject** — use `suggestion.id` not `prerequisiteTaskId`
2. **Fix Task Detail API contract** — either update backend to return prerequisites/dependents or update frontend to fetch separately
3. **Fix Project Detail Critical Path** — pass actual dependencies to `CriticalPathDisplay`
4. **Fix Board duplicate state** — unify `useBoard` and `KanbanBoard` state
5. **Fix WebSocket projectId=0** — defer connection until `projectId` known

### P1 — Major Missing Features
6. **Create `/projects/[projectId]/graph` page** with full `DependencyGraph`
7. **Add dependency creation from Task Detail page**
8. **Add inline status editing on Task Detail**
9. **Add position reordering (drag within column)**
10. **Fix WebSocket event handling for schedule/readiness changes**

### P2 — UX Improvements
11. **Optimistic create/delete in useBoard**
12. **Consistent error handling pattern**
13. **Add confirmation dialogs for destructive actions**
14. **Add toast notifications for real-time updates**
15. **Fix Task Card readiness color logic**
16. **Add cycle detection feedback in Add Dependency modal**
17. **User search/autocomplete for adding members**

### P3 — Polish
18. **Landing page HeroGraph readiness values**
19. **Loading skeletons**
20. **Keyboard accessibility for board**
21. **Responsive board layout**
22. **Token refresh / session management**

---

## 7. Backend Endpoints Requiring Frontend Changes

| Endpoint | Frontend Change Required |
|----------|-------------------------|
| `GET /tasks/:taskId` | Update TaskDetailResponse type or add bulk fetch |
| `POST /ai/suggestions/:id/accept` | Fix parameter from `prerequisiteTaskId` to `id` |
| `POST /ai/suggestions/:id/reject` | Fix parameter from `prerequisiteTaskId` to `id` |
| `GET /projects/:projectId/graph` | Create Graph page |
| `PATCH /tasks/:taskId` | Add position reordering, full edit from detail |
| `POST /projects/:projectId/dependencies` | Add from task detail page |

---

## 8. WebSocket Event Payload Verification

Backend publishes (via `taskService._emit` and `dependencyService._emit`):
```typescript
// TASK_MOVED
{ type: "TASK_MOVED", projectId, taskId, payload: { oldStatus, newStatus } }

// TASK_READY / TASK_BLOCKED
{ type: "TASK_READY|TASK_BLOCKED", projectId, taskId, payload: {} }

// SCHEDULE_CHANGED
{ type: "SCHEDULE_CHANGED", projectId, taskId, payload: { computedStart, computedEnd } }

// DEPENDENCY_ADDED
{ type: "DEPENDENCY_ADDED", projectId, taskId: dependentTaskId, payload: { prerequisiteTaskId, dependentTaskId } }

// AI_SUGGESTION_CREATED
{ type: "AI_SUGGESTION_CREATED", projectId, taskId, payload: { suggestionId } }
```

Frontend `handleWSEvent` in board page handles all these but:
- `SCHEDULE_CHANGED` payload has `computedStart`/`computedEnd` but frontend doesn't update task dates
- `TASK_READY`/`TASK_BLOCKED` only trigger `refetch()` — no local readiness update

---

## 9. Recommended Architecture Fixes

### 9.1 Unify Board State
Move all task/dependency state to `useBoard`. Make `KanbanBoard` a pure presentational component receiving tasks/dependencies as props.

### 9.2 Fix Task Detail Data Fetching
Option A: Update backend `GET /tasks/:taskId` to include prerequisites/dependents
Option B: Frontend fetches `/tasks/:taskId` then `/projects/:projectId/graph` and correlates

### 9.3 WebSocket Event Application
Instead of `refetch()` on every event, apply events directly to local state:
```typescript
// On TASK_MOVED
setTasks(prev => {
  const next = new Map(prev);
  const task = next.get(event.taskId);
  if (task) next.set(task.id, { ...task, status: event.payload.newStatus });
  return next;
});
```

### 9.4 AI Suggestion Type
Update `AiSuggestionItem` in `@repo/types` to include `id` field matching database `AiSuggestion.id`.

---

## 10. Testing Checklist

After fixes, verify:
- [ ] Login → Register → Projects list → Create project → Board
- [ ] Board: Create task, move between columns, delete task
- [ ] Board: Add dependency, verify readiness updates (BLOCKED→READY)
- [ ] Board: Move blocked task to IN_PROGRESS → shows error
- [ ] Board: Critical path tab shows correct highlighting
- [ ] Board: Events tab shows real-time updates
- [ ] Board: AI suggestions generate, accept creates dependency, reject removes suggestion
- [ ] Task detail: View prerequisites/dependents, delete dependency
- [ ] Task detail: Edit title/description/status
- [ ] Project detail: Members tab add/remove members
- [ ] Project detail: Critical path tab works with dependencies
- [ ] Graph page: Shows full graph with critical path
- [ ] WebSocket: Reconnects after disconnect
- [ ] WebSocket: Multiple tabs sync state
- [ ] Auth: Token expiry handled gracefully