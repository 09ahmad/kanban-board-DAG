# Docker rewrite — live state

Last updated: 2026-09-28 ~01:22 IST

Goal: one command (`docker compose up --build`) starts Postgres, Redis, Prisma migrate+seed, API `:4000`, WebSocket `:4001`, Next.js `:3000`. Only Docker files change (plus this tracker). Package manager is **Bun 1.2.19**.

---

## Structure (unchanged)

| Path | Role |
|------|------|
| `docker/Dockerfile.web` | Next.js frontend |
| `docker/Dockerfile.server` | Express API + DAG engine |
| `docker/Dockerfile.ws-server` | `ws` WebSocket server |
| `docker/Dockerfile.db-init` | one-shot Prisma migrate + seed |
| `docker-compose.yml` | full stack |
| `.dockerignore` | small build context |

---

## Done

### Root-cause findings (old Dockerfiles)

- Four images each ran a **full monorepo `bun install`** (Next.js, ESLint, Turbo, ~610 lockfile packages).
- Backend images installed **python3 / make / g++** and compiled native addons (hour-plus builds, failures mid-way).
- Incomplete workspace `package.json` copies broke `--frozen-lockfile`.
- Alpine `wget` / `nc` healthchecks did not match real `/health` endpoints.
- `oven/bun` Alpine + Prisma OpenSSL/musl was fragile.
- Parallel `bun install` in one Bake job saturates the registry and looks hung (`waiting for 2 tasks`).

### Files rewritten

- All four Dockerfiles + `docker-compose.yml` + `.dockerignore`.
- Base: `oven/bun:1.2.19` (Debian/glibc), not Alpine + g++.
- Backend images copy **only their workspace manifests**, then trim root `package.json` workspaces and drop root `devDependencies` (Turbo/Prettier) before `bun install`.
- Web: Bun builder → `node:24-bookworm-slim` standalone runner (same glibc as builder for `sharp`).
- Healthchecks: `bun`/`node` `fetch` to `/health` (API, WS) and `/` (web).
- Compose: `db-init` must exit 0 before API/WS start; web waits for both healthy.

### Verified

| Check | Result |
|-------|--------|
| `kanban-board-db-init:latest` (older 994MB image) | `prisma migrate deploy` + seed **succeeded** against live `taskflow-postgres` (3 users, 2 projects, 15 tasks). Prisma printed an OpenSSL warning; openssl is now in the Dockerfiles. |
| `taskflow-postgres` / `taskflow-redis` | Up, healthy (~1h). |

---

## Remaining

1. **Blocked:** an earlier `docker compose up --build -d` is still running Bake + several `bun install` processes. Extra installs sit on `Resolving dependencies` because they share the same npm registry. Stop that job (Ctrl+C in that terminal, or stop the compose/buildx PIDs), then continue sequentially.
2. Rebuild **one image at a time**: `docker compose build db-init` → `server` → `ws-server` → `web`.
3. `docker compose up -d` and hit health URLs:
   - `GET http://localhost:4000/health`
   - `GET http://localhost:4001/health`
   - `GET http://localhost:3000`
4. Record final image sizes here.

---

## How to start (intended)

```bash
docker compose up --build
```

Detached: `docker compose up --build -d`

If a previous build is still running, do not start another. One Bake + one `bun install` at a time.

---

## Log (append as work proceeds)

- 01:22 — Tracker created. Postgres/Redis healthy. Old db-init image works. Full stack images (server/ws/web) not tagged yet. Parallel compose build still running.
- 01:23 — Trimmed `Dockerfile.web` workspaces the same way as backends.
- 01:53 — Sequential `db-init` rebuild started; openssl layer succeeded; `bun install` stuck on "Resolving dependencies" while 4 other `bun install`s from the 01:33 Bake are still alive.
- 02:00 — Still blocked on registry contention. Need the in-flight `docker compose up --build -d` stopped before sequential builds can finish.
- 02:02 — Stopped the hung Bake/`docker compose` processes. Next: sequential `docker compose build db-init`.

---

## How to start (intended)

```bash
docker compose up --build
```

Detached: `docker compose up --build -d`

---

## Log (append as work proceeds)

- 01:22 — Tracker created. Postgres/Redis healthy. Old db-init image works. Full stack images (server/ws/web) not tagged yet. Parallel compose build still running.
- 01:23 — Trimmed `Dockerfile.web` workspaces the same way as backends. Next: sequential rebuilds (cannot kill the in-flight Bake without approval).
