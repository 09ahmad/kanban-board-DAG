import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createApp } from "../app.js";
import type { Server } from "node:http";
import { prisma } from "@repo/db/client";
import { registerAndLogin, TestRun, uniqueEmail } from "./helpers/identity.js";

let server: Server;
let baseUrl: string;
let token: string;
let projectId: number;
const run = new TestRun();

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

beforeAll(async () => {
  await prisma.$connect();


  // Start the server on a random port
  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "string" ? 0 : (addr as any).port;
  baseUrl = `http://localhost:${port}`;

  const { token: signedIn, userId } = await registerAndLogin(
    baseUrl,
    "Dependency Test User",
    uniqueEmail("deptest"),
  );
  run.track(userId);
  token = signedIn;

  // Create a project
  const projRes = await request("/api/v1/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "Dep Test Project" }),
  });
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await run.cleanup();
  await prisma.$disconnect();
});

describe("dependency integration", () => {
  test("create dependency: dependent becomes READY when prereq is DONE", async () => {
    // Create two tasks: A (DONE) and B (BACKLOG)
    const taskA = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Task A", status: "DONE" }),
    });
    const aBody = (await taskA.json()) as { data: { id: number } };
    const taskAId = aBody.data.id;

    const taskB = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Task B" }),
    });
    const bBody = (await taskB.json()) as { data: { id: number; readiness: string } };
    const taskBId = bBody.data.id;

    // Create dependency A → B
    const depRes = await request(
      `/api/v1/projects/${projectId}/dependencies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prerequisiteTaskId: taskAId,
          dependentTaskId: taskBId,
        }),
      },
    );
    expect(depRes.status).toBe(201);

    // Verify B is now READY (since A is DONE)
    const taskBAfter = await request(`/api/v1/tasks/${taskBId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bAfter = (await taskBAfter.json()) as { data: { readiness: string } };
    expect(bAfter.data.readiness).toBe("READY");
  });

  test("create cycle returns 400 CYCLE_DETECTED", async () => {
    // Create tasks A, B, C
    const taskA = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Cycle Task A" }),
    });
    const aId = (await taskA.json()).data.id;

    const taskB = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Cycle Task B" }),
    });
    const bId = (await taskB.json()).data.id;

    const taskC = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Cycle Task C" }),
    });
    const cId = (await taskC.json()).data.id;

    // Create A → B → C
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: aId, dependentTaskId: bId }),
    });
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: bId, dependentTaskId: cId }),
    });

    // Try to create C → A (cycle)
    const cycleRes = await request(
      `/api/v1/projects/${projectId}/dependencies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prerequisiteTaskId: cId, dependentTaskId: aId }),
      },
    );
    expect(cycleRes.status).toBe(400);
    const cycleBody = (await cycleRes.json()) as { error: { code: string } };
    expect(cycleBody.error.code).toBe("CYCLE_DETECTED");
  });

  test("get graph returns full graph state", async () => {
    const res = await request(
      `/api/v1/projects/${projectId}/graph`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tasks: unknown[]; dependencies: unknown[] } };
    expect(body.data.tasks).toBeDefined();
    expect(body.data.dependencies).toBeDefined();
  });

  test("get critical path returns result", async () => {
    const res = await request(
      `/api/v1/projects/${projectId}/critical-path`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { criticalTaskIds: number[]; criticalEdges: unknown[]; totalDurationDays: number } };
    expect(body.data.criticalTaskIds).toBeDefined();
    expect(body.data.criticalEdges).toBeDefined();
    expect(typeof body.data.totalDurationDays).toBe("number");
  });

  test("get events returns event log", async () => {
    const res = await request(
      `/api/v1/projects/${projectId}/events`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});