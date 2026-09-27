import { describe, expect, test, beforeAll } from "bun:test";
import { createApp } from "../app.js";
import type { Server } from "node:http";
import { prisma } from "@repo/db/client";

let server: Server;
let baseUrl: string;
let token: string;
let projectId: number;

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  };
}

async function makeTask(body: Record<string, unknown>): Promise<number> {
  const res = await request(`/api/v1/projects/${projectId}/tasks`, authed({
    method: "POST",
    body: JSON.stringify(body),
  }));
  const json = (await res.json()) as { data: { id: number } };
  return json.data.id;
}

async function dependOn(prerequisiteTaskId: number, dependentTaskId: number): Promise<void> {
  const res = await request(`/api/v1/projects/${projectId}/dependencies`, authed({
    method: "POST",
    body: JSON.stringify({ prerequisiteTaskId, dependentTaskId }),
  }));
  expect(res.status).toBe(201);
}

async function move(taskId: number, status: string): Promise<Response> {
  return request(`/api/v1/tasks/${taskId}/move`, authed({
    method: "PATCH",
    body: JSON.stringify({ status }),
  }));
}

async function snapshot(taskId: number) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  return {
    readiness: task.readiness,
    version: task.version,
    computedStart: task.computedStart?.toISOString() ?? null,
  };
}

async function eventsFor(taskId: number): Promise<string[]> {
  const rows = await prisma.taskEvent.findMany({
    where: { projectId, taskId },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.type);
}

beforeAll(async () => {
  await prisma.$connect();

  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "string" ? 0 : (addr as any).port;
  baseUrl = `http://localhost:${port}`;

  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Scope User", email: "scope@example.com", password: "password123" }),
  });
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "scope@example.com", password: "password123" }),
  });
  const loginBody = (await loginRes.json()) as { data: { token: string } };
  token = loginBody.data.token;

  const projRes = await request("/api/v1/projects", authed({
    method: "POST",
    body: JSON.stringify({ name: "Scope Project" }),
  }));
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

describe("recomputation is scoped to what changed", () => {
  test("a new task with a prerequisite is blocked", async () => {
    const prereq = await makeTask({ title: "Scope prereq" });
    await move(prereq, "DONE");
    const dependent = await makeTask({ title: "Scope dependent" });

    await dependOn(prereq, dependent);

    expect((await snapshot(dependent)).readiness).toBe("READY");
  });

  test("regressing a prerequisite blocks its descendants", async () => {
    const upstream = await makeTask({ title: "Upstream", status: "DONE" });
    const middle = await makeTask({ title: "Middle" });
    const leaf = await makeTask({ title: "Leaf" });
    await dependOn(upstream, middle);
    await dependOn(middle, leaf);

    // Transitive descendants must follow, not just direct children.
    await move(upstream, "IN_PROGRESS");

    expect((await snapshot(middle)).readiness).toBe("BLOCKED");
    expect((await snapshot(leaf)).readiness).toBe("BLOCKED");
  });

  test("a task in another branch is left alone", async () => {
    const upstream = await makeTask({ title: "Branch upstream", status: "DONE" });
    const follower = await makeTask({ title: "Branch follower" });
    const bystander = await makeTask({ title: "Bystander" });
    await dependOn(upstream, follower);

    const before = await snapshot(bystander);
    const eventsBefore = await eventsFor(bystander);

    await move(upstream, "IN_PROGRESS");

    const after = await snapshot(bystander);
    expect(after.readiness).toBe(before.readiness);
    // A task nobody recomputed is not rewritten, so its version does not move.
    expect(after.version).toBe(before.version);
    // And it gets no graph-derived event of its own.
    expect(await eventsFor(bystander)).toEqual(eventsBefore);
  });

  test("removing a dependency re-readies only the dependent", async () => {
    const prereq = await makeTask({ title: "Removable prereq" });
    const dependent = await makeTask({ title: "Removable dependent" });
    const bystander = await makeTask({ title: "Removal bystander" });
    await dependOn(prereq, dependent);

    const bystanderBefore = await snapshot(bystander);
    const bystanderEventsBefore = await eventsFor(bystander);
    expect((await snapshot(dependent)).readiness).toBe("BLOCKED");

    const dep = await prisma.taskDependency.findFirst({
      where: { prerequisiteTaskId: prereq, dependentTaskId: dependent },
    });
    expect(dep).not.toBeNull();
    const del = await request(`/api/v1/dependencies/${dep!.id}`, authed({ method: "DELETE" }));
    expect(del.status).toBe(200);

    expect((await snapshot(dependent)).readiness).toBe("READY");
    const bystanderAfter = await snapshot(bystander);
    expect(bystanderAfter.version).toBe(bystanderBefore.version);
    expect(await eventsFor(bystander)).toEqual(bystanderEventsBefore);
  });

  test("a blocked task cannot be moved into progress", async () => {
    const prereq = await makeTask({ title: "Guard prereq" });
    const dependent = await makeTask({ title: "Guard dependent" });
    await dependOn(prereq, dependent);

    expect((await snapshot(dependent)).readiness).toBe("BLOCKED");
    const res = await move(dependent, "IN_PROGRESS");
    expect(res.status).toBe(400);
  });

  test("completing a task re-readies the whole descendant chain", async () => {
    const upstream = await makeTask({ title: "Finish upstream" });
    const middle = await makeTask({ title: "Finish middle" });
    const leaf = await makeTask({ title: "Finish leaf" });
    await dependOn(upstream, middle);
    await dependOn(middle, leaf);

    await move(upstream, "DONE");

    expect((await snapshot(middle)).readiness).toBe("READY");
    expect((await snapshot(leaf)).readiness).toBe("BLOCKED");
  });
});
