# TaskFlow Pro — Next.js Frontend (`apps/web`) Agent Prompt & Context

This file contains the complete technical specification, API integration contracts, and context for working on the **`apps/web`** workspace service.

---

## 1. Overview & Service Boundaries

`apps/web` is the Next.js web application for TaskFlow Pro, serving the frontend user interface. It renders the DAG-powered Kanban board, graph dependency visualizers, AI suggestion panels, and project management dashboards.

### Workspaces Dependencies:
- `@repo/types`: Shared DTOs, TypeScript interfaces, and API payload contracts.

---

## 2. Integration & Network Contracts

### REST API Integration:
- **Base URL**: `http://localhost:4000/api/v1` (configured via `NEXT_PUBLIC_API_URL`).
- **Authentication**: Bearer JWT token attached in `Authorization` header (`Authorization: Bearer <jwt_token>`).
- **Response Format Handling**:
  - Success responses return `{ success: true, data: ... }`.
  - Error responses return `{ success: false, error: { code: "...", message: "..." } }`.

### WebSocket Real-time Integration:
- **WebSocket URL**: `ws://localhost:4001` (configured via `NEXT_PUBLIC_WS_URL`).
- Upon opening a project view, send subscription payload:
  ```json
  { "type": "PROJECT_SUBSCRIBE", "projectId": "<CURRENT_PROJECT_ID>" }
  ```
- Listen for live event broadcasts (`TASK_MOVED`, `TASK_READY`, `TASK_BLOCKED`, `DEPENDENCY_ADDED`, etc.) to update Kanban column states without page reloads.

---

## 3. UI/UX & Kanban Business Logic Boundaries

1. **Dual-State Task Rendering**:
   - **Workflow State (`status`)**: Render Kanban columns (`BACKLOG`, `IN_PROGRESS`, `REVIEW`, `DONE`).
   - **Dependency State (`readiness`)**: Render visual badges or indicators (`READY` in green/blue, `BLOCKED` in red/gray with lock icon).
2. **Blocked Task Drag & Drop Guard**:
   - Disable moving cards with `readiness === "BLOCKED"` into the `IN_PROGRESS` column.
   - Gracefully handle HTTP 400 `TASK_IS_BLOCKED` error notifications if attempted.
3. **AI Suggestions Panel**:
   - Render pending AI dependency suggestions with confidence scores.
   - Accept button triggers `POST /api/v1/ai/suggestions/:suggestionId/accept`.
   - Reject button triggers `POST /api/v1/ai/suggestions/:suggestionId/reject`.

---

## 4. Directory Structure

```text
apps/web/
├── app/                 # Next.js App Router pages and layouts
├── components/          # Kanban board, Task card, Graph view, AI suggestion panel
├── lib/                 # API client, WebSocket subscription hook, auth context
├── public/              # Static assets
├── package.json
└── tsconfig.json
```

---

## 5. Execution Commands

- **Development Server**: `bun run dev` (from workspace root)
- **Type Check**: `bun run check-types`
- **Lint**: `bun run lint`
