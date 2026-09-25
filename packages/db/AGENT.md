# TaskFlow Pro — Database Package (`packages/db`) Agent Prompt & Context

This file contains the complete technical specification, schema guidelines, and context for working on the **`packages/db`** workspace package (`@repo/db`).

---

## 1. Overview & Service Boundaries

`packages/db` manages the PostgreSQL database layer for TaskFlow Pro using **Prisma 7**. It defines the core domain database schema, configures the Prisma driver adapter (`@prisma/adapter-pg`), exposes the singleton `PrismaClient`, and provides seed scripts for initial demo data.

---

## 2. Technology Stack Mandates

1. **ORM Framework**: MUST use **Prisma 7** with `provider = "prisma-client"` and `@prisma/adapter-pg`.
2. **Database Engine**: PostgreSQL.
3. **Prisma Configuration**: Requires `packages/db/prisma.config.ts` to load `DATABASE_URL` from `.env`.
4. **Export Path**: Singleton `PrismaClient` MUST be exported from `@repo/db/client` (via `src/client.ts` or `src/index.ts`).

---

## 3. Directory & File Structure

```text
packages/db/
├── prisma/
│   ├── schema.prisma     # Source of truth for database entities and enums
│   └── seed.ts           # Demo seed script (8-10 tasks, diamond DAG chain)
├── src/
│   ├── client.ts         # Singleton PrismaClient initialization with @prisma/adapter-pg
│   └── index.ts          # Package re-exports
├── prisma.config.ts      # Prisma 7 environment config loader
├── package.json
└── tsconfig.json
```

---

## 4. Entity Models & Enums Summary

### Core Enums:
- `TaskStatus`: `BACKLOG`, `IN_PROGRESS`, `REVIEW`, `DONE`
- `ReadinessState`: `READY`, `BLOCKED`
- `ProjectRole`: `OWNER`, `MEMBER`
- `SuggestionStatus`: `PENDING`, `ACCEPTED`, `REJECTED`
- `TaskEventType`: `TASK_CREATED`, `TASK_UPDATED`, `TASK_MOVED`, `TASK_DELETED`, `TASK_READY`, `TASK_BLOCKED`, `DEPENDENCY_ADDED`, `DEPENDENCY_REMOVED`, `SCHEDULE_CHANGED`, `GRAPH_UPDATED`, `AI_SUGGESTION_CREATED`, `AI_SUGGESTION_ACCEPTED`, `AI_SUGGESTION_REJECTED`

### Key Entities:
- **`User`**: `id`, `email`, `passwordHash`, `name`, `createdAt`, `updatedAt`
- **`Project`**: `id`, `name`, `description`, `ownerId`, `createdAt`, `updatedAt`
- **`ProjectMember`**: `projectId`, `userId`, `role`, `joinedAt`
- **`Task`**: `id`, `projectId`, `title`, `description`, `status` (TaskStatus), `readiness` (ReadinessState), `plannedStart`, `duration`, `computedStart`, `computedEnd`, `position`, `version`, `createdAt`, `updatedAt`
- **`TaskDependency`**: `id`, `projectId`, `prerequisiteTaskId`, `dependentTaskId`, `createdAt`
  - *Semantics*: `prerequisiteTaskId → dependentTaskId` means dependent task depends on prerequisite task.
- **`AiSuggestion`**: `id`, `projectId`, `taskId`, `prerequisiteTaskId`, `confidence`, `reason`, `status` (SuggestionStatus), `createdAt`
- **`TaskEvent`**: `id`, `projectId`, `taskId`, `eventType` (TaskEventType), `payload` (Json), `createdAt`

---

## 5. Architectural Constraints & Transaction Rules

1. **Atomic Transactions Required**:
   - Any write operation modifying dependencies or task status must run inside a Prisma `$transaction` covering:
     1. `Task` status / date updates
     2. `TaskDependency` creation / deletion
     3. `TaskEvent` audit log creation
2. **Derived Readiness Column**:
   - `Task.readiness` is computed strictly by `@repo/dag-engine` and stored in DB. NEVER allow raw client writes to `readiness`.
3. **Project Isolation**:
   - `TaskDependency.prerequisiteTaskId` and `dependentTaskId` MUST belong to the exact same `projectId`.

---

## 6. Execution Commands

- **Generate Prisma Client**: `cd packages/db && bunx prisma generate`
- **Run Migrations**: `cd packages/db && bunx prisma migrate dev`
- **Run Seed**: `cd packages/db && bunx prisma db seed`
