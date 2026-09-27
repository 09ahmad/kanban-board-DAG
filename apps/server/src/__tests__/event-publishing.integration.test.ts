import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "../app.js";
import { taskService } from "../services/task.service.js";
import type { Server } from "node:http";
import { prisma } from "@repo/db/client";
import type { TaskEventType } from "@repo/types";

let server: Server;
let baseUrl: string;
let token: string;
let projectId: number;
let userId: number;

type Emitted = { type: TaskEventType; projectId: number; taskId?: number; actorId?: number };
let emitted: Emitted[] = [];
let realEmit: typeof taskService._emit;

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  };
}

async function createTask(body: Record<string, unknown>): Promise<number> {
  const res = await request(
    `/api/v1/projects/${projectId}/tasks`,
    authed({ method: "POST", body: JSON.stringify(body) }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: number } }).data.id;
}

async function addDependency(prerequisiteTaskId: number, dependentTaskId: number): Promise<number> {
  const res = await request(
    `/api/v1/projects/${projectId}/dependencies`,
    authed({
      method: "POST",
      body: JSON.stringify({ prerequisiteTaskId, dependentTaskId }),
    }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    data: { dependencies: { id: number; prerequisiteTaskId: number; dependentTaskId: number }[] };
  };
  // The snapshot returns every edge in the project, so select the one just created.
  const created = body.data.dependencies.find(
    (d) =>
      d.prerequisiteTaskId === prerequisiteTaskId && d.dependentTaskId === dependentTaskId,
  );
  if (!created) throw new Error("created dependency not found in snapshot");
  return created.id;
}

function typesSince(): TaskEventType[] {
  return emitted.map((e) => e.type);
}

function findEvent(type: TaskEventType, taskId: number | undefined): Emitted | undefined {
  return emitted.find((e) => e.type === type && e.taskId === taskId);
}

beforeAll(async () => {
  await prisma.$connect();

  // Intercept the publish boundary so we can assert on which domain events the
  // server *intends* to broadcast, without depending on a live Redis instance.
  realEmit = taskService._emit.bind(taskService);
  taskService._emit = (async (
    type: TaskEventType,
    p: number,
    t?: number,
    _payload?: Record<string, unknown>,
    actorId?: number,
  ) => {
    emitted.push({ type, projectId: p, taskId: t, actorId });
  }) as typeof taskService._emit;

  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "string" ? 0 : (addr as { port: number }).port;
  baseUrl = `http://localhost:${port}`;

  // A per-run identity, so the suite never has to clear the table to run twice
  // and never touches whatever else is in the database. A blank slate here would
  // also be a trap: a developer with a server running against this same database
  // would lose their own accounts and projects.
  const email = `event-pub-${Date.now()}@test.local`;
  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Event Publishing User", email, password: "password123" }),
  });
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  token = ((await loginRes.json()) as { data: { token: string } }).data.token;
  userId = (JSON.parse(atob(token.split(".")[1]!)) as { userId: number }).userId;

  const projRes = await request(
    "/api/v1/projects",
    authed({ method: "POST", body: JSON.stringify({ name: "Event Publishing Project" }) }),
  );
  projectId = ((await projRes.json()) as { data: { id: number } }).data.id;
});

afterAll(async () => {
  taskService._emit = realEmit;
  await new Promise((resolve) => server.close(resolve));

  // Remove only what this run created, so a developer's own data is untouched.
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  emitted = [];
});

describe("downstream event publication", () => {
  test("adding a dependency publishes TASK_BLOCKED for the newly blocked dependent", async () => {
    const a = await createTask({ title: "EP-A", status: "BACKLOG" });
    const b = await createTask({ title: "EP-B" });
    emitted = [];

    await addDependency(a, b);

    expect(findEvent("TASK_BLOCKED", b)).toBeDefined();
    expect(findEvent("DEPENDENCY_ADDED", b)).toBeDefined();
    expect(findEvent("GRAPH_UPDATED", undefined)).toBeDefined();
  });

  test("reverting a prerequisite to IN_PROGRESS publishes TASK_BLOCKED downstream", async () => {
    const a = await createTask({ title: "REG-A", status: "DONE" });
    const b = await createTask({ title: "REG-B", status: "DONE" });
    await addDependency(a, b);
    emitted = [];

    const res = await request(
      `/api/v1/tasks/${a}`,
      authed({ method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) }),
    );
    expect(res.status).toBe(200);

    expect(findEvent("TASK_BLOCKED", b)).toBeDefined();
  });

  test("completing a prerequisite publishes TASK_READY for the unblocked dependent", async () => {
    const a = await createTask({ title: "RDY-A", status: "IN_PROGRESS" });
    const b = await createTask({ title: "RDY-B" });
    await addDependency(a, b);
    emitted = [];

    const res = await request(
      `/api/v1/tasks/${a}`,
      authed({ method: "PATCH", body: JSON.stringify({ status: "DONE" }) }),
    );
    expect(res.status).toBe(200);

    expect(findEvent("TASK_READY", b)).toBeDefined();
  });

  test("moving a scheduled prerequisite publishes SCHEDULE_CHANGED downstream", async () => {
    const a = await createTask({
      title: "SCH-A",
      plannedStart: "2026-02-01",
      duration: 2,
    });
    const b = await createTask({
      title: "SCH-B",
      plannedStart: "2026-02-01",
      duration: 2,
    });
    await addDependency(a, b);
    emitted = [];

    const res = await request(
      `/api/v1/tasks/${a}`,
      authed({ method: "PATCH", body: JSON.stringify({ plannedStart: "2026-02-10" }) }),
    );
    expect(res.status).toBe(200);

    expect(findEvent("SCHEDULE_CHANGED", b)).toBeDefined();
  });

  test("deleting a dependency publishes GRAPH_UPDATED", async () => {
    const a = await createTask({ title: "DEL-A", status: "DONE" });
    const b = await createTask({ title: "DEL-B" });
    const depId = await addDependency(a, b);
    emitted = [];

    const res = await request(
      `/api/v1/dependencies/${depId}`,
      authed({ method: "DELETE" }),
    );
    expect(res.status).toBe(200);

    expect(typesSince()).toContain("DEPENDENCY_REMOVED");
    expect(typesSince()).toContain("GRAPH_UPDATED");
  });

  test("deleting a dependency publishes TASK_READY for the freed dependent", async () => {
    // Prerequisite is not DONE, so the dependent is BLOCKED until the edge goes away.
    const a = await createTask({ title: "FREE-A", status: "IN_PROGRESS" });
    const b = await createTask({ title: "FREE-B" });
    const depId = await addDependency(a, b);

    const blockedRes = await request(`/api/v1/tasks/${b}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(((await blockedRes.json()) as { data: { readiness: string } }).data.readiness).toBe(
      "BLOCKED",
    );

    emitted = [];
    await request(`/api/v1/dependencies/${depId}`, authed({ method: "DELETE" }));

    expect(findEvent("TASK_READY", b)).toBeDefined();
  });

  test("every event type the web client treats as graph-relevant is publishable", async () => {
    // Guards against the client subscribing to types the server never sends.
    const clientTypes: TaskEventType[] = [
      "TASK_CREATED",
      "TASK_UPDATED",
      "TASK_MOVED",
      "TASK_DELETED",
      "TASK_READY",
      "TASK_BLOCKED",
      "DEPENDENCY_ADDED",
      "DEPENDENCY_REMOVED",
      "SCHEDULE_CHANGED",
      "GRAPH_UPDATED",
    ];

    const a = await createTask({
      title: "COV-A",
      plannedStart: "2026-03-01",
      duration: 1,
    });
    const b = await createTask({
      title: "COV-B",
      plannedStart: "2026-03-01",
      duration: 1,
    });
    const depId = await addDependency(a, b);

    // TASK_BLOCKED (b blocked by a) + SCHEDULE_CHANGED (b follows a)
    await request(
      `/api/v1/tasks/${a}/move`,
      authed({ method: "PATCH", body: JSON.stringify({ status: "DONE" }) }),
    );
    // TASK_READY (a is DONE, b unblocks)
    await request(`/api/v1/dependencies/${depId}`, authed({ method: "DELETE" }));
    // TASK_UPDATED + SCHEDULE_CHANGED (shift a)
    await request(
      `/api/v1/tasks/${a}`,
      authed({ method: "PATCH", body: JSON.stringify({ plannedStart: "2026-03-20" }) }),
    );
    await request(`/api/v1/tasks/${b}`, authed({ method: "DELETE" }));

    const seen = new Set(emitted.map((e) => e.type));
    const unreachable = clientTypes.filter((t) => !seen.has(t));
    expect(unreachable).toEqual([]);
  });
});

describe("event actor attribution", () => {
  test("the signed-in user is attributed on their own task events", async () => {
    const me = userId;
    const a = await createTask({ title: "ACT-CREATE" });

    const res = await request(
      `/api/v1/tasks/${a}/move`,
      authed({ method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) }),
    );
    expect(res.status).toBe(200);

    expect(emitted.find((e) => e.type === "TASK_CREATED" && e.taskId === a)?.actorId).toBe(me);
    expect(emitted.find((e) => e.type === "TASK_MOVED" && e.taskId === a)?.actorId).toBe(me);
  });

  test("graph-derived events carry the actor of the mutation that caused them", async () => {
    // The TASK_BLOCKED downstream is a consequence of *this* user's move, not of
    // nobody's — the client is being told who to credit for it.
    const me = userId;
    const a = await createTask({ title: "ACT-BLOCK", status: "DONE" });
    const b = await createTask({ title: "ACT-UNBLOCK" });
    await addDependency(a, b);
    emitted = [];

    const res = await request(
      `/api/v1/tasks/${a}/move`,
      authed({ method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) }),
    );
    expect(res.status).toBe(200);

    expect(emitted.find((e) => e.type === "TASK_BLOCKED" && e.taskId === b)?.actorId).toBe(me);
  });

  test("dependency events and the graph-refresh signal are attributed", async () => {
    const me = userId;
    const a = await createTask({ title: "ACT-DEP-A" });
    const b = await createTask({ title: "ACT-DEP-B" });
    const c = await createTask({ title: "ACT-DEP-C" });
    emitted = [];

    await addDependency(a, b);

    expect(emitted.find((e) => e.type === "DEPENDENCY_ADDED")?.actorId).toBe(me);
    // GRAPH_UPDATED is the "something moved, refetch" signal, so it is exactly
    // the one a client must not mistake for its own doing.
    expect(emitted.find((e) => e.type === "GRAPH_UPDATED")?.actorId).toBe(me);
  });

  test("a refused request attributes nothing", async () => {
    const me = userId;
    const a = await createTask({ title: "ACT-REJ-A" });
    const b = await createTask({ title: "ACT-REJ-B" });
    await addDependency(a, b);
    emitted = [];

    // The edge already exists, so this is rejected outright.
    const res = await request(
      `/api/v1/projects/${projectId}/dependencies`,
      authed({ method: "POST", body: JSON.stringify({ prerequisiteTaskId: a, dependentTaskId: b }) }),
    );
    expect(res.status).toBe(409);

    // Nothing was committed, so nothing may be broadcast — a notification for a
    // change that did not happen is worse than no notification.
    expect(emitted).toEqual([]);
    expect(me).toBeGreaterThan(0);
  });
});
