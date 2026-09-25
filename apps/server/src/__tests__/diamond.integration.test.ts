import { describe, expect, test, beforeAll, afterAll } from "bun:test";
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

beforeAll(async () => {
  await prisma.$connect();

  // Cleanup test data
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Start the server on a random port
  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "string" ? 0 : (addr as any).port;
  baseUrl = `http://localhost:${port}`;

  // Register and login a test user
  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Diamond Test User",
      email: "diamondtest@example.com",
      password: "password123",
    }),
  });
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "diamondtest@example.com",
      password: "password123",
    }),
  });
  const loginBody = (await loginRes.json()) as { data: { token: string } };
  token = loginBody.data.token;

  // Create a project
  const projRes = await request("/api/v1/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "Diamond Test Project" }),
  });
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

describe("diamond dependency integration", () => {
  test("diamond graph: A shifts +3d → D shifts +3d exactly once (no compounding)", async () => {
    // Create task A with plannedStart and duration
    const taskA = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Task A",
        plannedStart: "2026-01-01",
        duration: 2,
        status: "DONE",
      }),
    });
    const aBody = (await taskA.json()) as { data: { id: number; computedEnd: string } };
    const taskAId = aBody.data.id;

    // Create tasks B and C (dependents of A)
    const taskB = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Task B",
        plannedStart: "2026-01-01",
        duration: 2,
      }),
    });
    const bBody = (await taskB.json()) as { data: { id: number } };
    const taskBId = bBody.data.id;

    const taskC = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Task C",
        plannedStart: "2026-01-01",
        duration: 2,
      }),
    });
    const cBody = (await taskC.json()) as { data: { id: number } };
    const taskCId = cBody.data.id;

    // Create task D (dependent of B and C)
    const taskD = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Task D",
        plannedStart: "2026-01-01",
        duration: 2,
      }),
    });
    const dBody = (await taskD.json()) as { data: { id: number } };
    const taskDId = dBody.data.id;

    // Create diamond dependencies: A → B, A → C, B → D, C → D
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: taskAId, dependentTaskId: taskBId }),
    });
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: taskAId, dependentTaskId: taskCId }),
    });
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: taskBId, dependentTaskId: taskDId }),
    });
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: taskCId, dependentTaskId: taskDId }),
    });

    // Verify initial D computedStart
    const taskDAfter = await request(`/api/v1/tasks/${taskDId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dAfter = (await taskDAfter.json()) as {
      data: { computedStart: string; computedEnd: string };
    };

    // Shift A forward by 3 days: update A's plannedStart to 2026-01-04
    const shifted = await request(
      `/api/v1/tasks/${taskAId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plannedStart: "2026-01-04" }),
      },
    );
    expect(shifted.status).toBe(200);

    // Verify D's computedStart shifted by exactly 3 days
    const taskDShifted = await request(`/api/v1/tasks/${taskDId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dShifted = (await taskDShifted.json()) as {
      data: { computedStart: string; computedEnd: string };
    };

    // Parse dates and compute the delta
    const origDate = new Date(dAfter.data.computedStart);
    const shiftedDate = new Date(dShifted.data.computedStart);
    const deltaMs = shiftedDate.getTime() - origDate.getTime();
    const deltaDays = deltaMs / (1000 * 60 * 60 * 24);

    // D should have shifted by exactly 3 days (not 6)
    expect(deltaDays).toBe(3);
  });

  test("regression: A reverts to IN_PROGRESS → B becomes BLOCKED, C stays READY, statuses unchanged", async () => {
    // Setup: A is DONE, B is DONE (prereq for C), C is BACKLOG
    // Chain: A → B → C
    // B is READY (prereq A is DONE), C is READY (prereq B is DONE)
    // When A reverts to IN_PROGRESS, B becomes BLOCKED (its prereq is no longer DONE)
    // C stays READY (its prereq B is still DONE)
    // Workflow statuses should remain unchanged (B stays DONE, C stays BACKLOG)

    const taskA = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Regression A", status: "DONE" }),
    });
    const aId = (await taskA.json()).data.id;

    const taskB = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Regression B", status: "DONE" }),
    });
    const bId = (await taskB.json()).data.id;

    const taskC = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Regression C" }),
    });
    const cId = (await taskC.json()).data.id;

    // Create chain A → B → C
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

    // Verify initial state: B and C are READY
    const bRes = await request(`/api/v1/tasks/${bId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cRes = await request(`/api/v1/tasks/${cId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bData = (await bRes.json()) as { data: { readiness: string; status: string } };
    const cData = (await cRes.json()) as { data: { readiness: string; status: string } };
    expect(bData.data.readiness).toBe("READY");
    expect(cData.data.readiness).toBe("READY");
    expect(bData.data.status).toBe("DONE");
    expect(cData.data.status).toBe("BACKLOG");

    // Revert A to IN_PROGRESS
    await request(
      `/api/v1/tasks/${aId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      },
    );

    // B should now be BLOCKED (its prereq A is no longer DONE)
    // C should stay READY (its prereq B is still DONE)
    const bAfterRes = await request(`/api/v1/tasks/${bId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cAfterRes = await request(`/api/v1/tasks/${cId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bAfter = (await bAfterRes.json()) as { data: { readiness: string; status: string } };
    const cAfter = (await cAfterRes.json()) as { data: { readiness: string; status: string } };
    expect(bAfter.data.readiness).toBe("BLOCKED");
    expect(cAfter.data.readiness).toBe("READY");
    // Status should be unchanged
    expect(bAfter.data.status).toBe("DONE");
    expect(cAfter.data.status).toBe("BACKLOG");
  });
});