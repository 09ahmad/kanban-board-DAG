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
    "Task Test User",
    uniqueEmail("tasktest"),
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
    body: JSON.stringify({ name: "Task Test Project" }),
  });
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await run.cleanup();
  await prisma.$disconnect();
});

describe("task move integration", () => {
  test("create task returns readiness READY", async () => {
    const res = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Test Task",
        description: "A test task",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { readiness: string } };
    expect(body.data.readiness).toBe("READY");
  });

  test("BLOCKED task cannot move to IN_PROGRESS", async () => {
    // Create prerequisite task A (IN_PROGRESS — not DONE, so B is BLOCKED)
    const taskARes = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Prereq Task", status: "IN_PROGRESS" }),
    });
    const aBody = (await taskARes.json()) as { data: { id: number } };
    const taskAId = aBody.data.id;

    // Create task B (no deps yet)
    const taskBRes = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Dependent Task" }),
    });
    const bBody = (await taskBRes.json()) as { data: { id: number; readiness: string } };
    const taskBId = bBody.data.id;

    // Add dependency A → B (B becomes BLOCKED)
    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prerequisiteTaskId: taskAId,
        dependentTaskId: taskBId,
      }),
    });

    // Verify B is BLOCKED
    const taskBAfter = await request(`/api/v1/tasks/${taskBId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bAfterBody = (await taskBAfter.json()) as { data: { readiness: string } };
    expect(bAfterBody.data.readiness).toBe("BLOCKED");

    // Try to move BLOCKED task B to IN_PROGRESS - should fail
    const moveRes = await request(`/api/v1/tasks/${taskBId}/move`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(moveRes.status).toBe(400);
    const moveBody = (await moveRes.json()) as { error: { code: string } };
    expect(moveBody.error.code).toBe("TASK_IS_BLOCKED");
  });

  /** A not DONE, B blocked behind it: every forward move must be refused. */
  async function createBlockedPair(): Promise<{ taskAId: number; taskBId: number }> {
    const taskARes = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Prereq Task", status: "IN_PROGRESS" }),
    });
    const aBody = (await taskARes.json()) as { data: { id: number } };

    const taskBRes = await request(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Dependent Task" }),
    });
    const bBody = (await taskBRes.json()) as { data: { id: number } };

    await request(`/api/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prerequisiteTaskId: aBody.data.id,
        dependentTaskId: bBody.data.id,
      }),
    });

    return { taskAId: aBody.data.id, taskBId: bBody.data.id };
  }

  async function moveTask(taskId: number, status: string): Promise<Response> {
    return request(`/api/v1/tasks/${taskId}/move`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
  }

  test("BLOCKED task cannot move forward to REVIEW", async () => {
    const { taskBId } = await createBlockedPair();
    const res = await moveTask(taskBId, "REVIEW");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TASK_IS_BLOCKED");
  });

  test("BLOCKED task cannot move forward to DONE", async () => {
    const { taskBId } = await createBlockedPair();
    const res = await moveTask(taskBId, "DONE");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TASK_IS_BLOCKED");
  });

  test("PATCH /tasks/:id cannot move a BLOCKED task forward either", async () => {
    const { taskBId } = await createBlockedPair();
    const res = await request(`/api/v1/tasks/${taskBId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TASK_IS_BLOCKED");
  });

  test("BLOCKED task can still move back", async () => {
    const { taskAId, taskBId } = await createBlockedPair();

    // Finish A, then B (READY) moves forward to REVIEW.
    const doneRes = await moveTask(taskAId, "DONE");
    expect(doneRes.status).toBe(200);
    const forwardRes = await moveTask(taskBId, "REVIEW");
    expect(forwardRes.status).toBe(200);

    // Regression: A moves back to IN_PROGRESS. B becomes BLOCKED but keeps
    // its REVIEW column.
    const regressRes = await moveTask(taskAId, "IN_PROGRESS");
    expect(regressRes.status).toBe(200);
    const bAfter = await request(`/api/v1/tasks/${taskBId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bBody = (await bAfter.json()) as { data: { readiness: string; status: string } };
    expect(bBody.data.readiness).toBe("BLOCKED");
    expect(bBody.data.status).toBe("REVIEW");

    // Moving back stays open: B returns to BACKLOG.
    const backRes = await moveTask(taskBId, "BACKLOG");
    expect(backRes.status).toBe(200);
    const bFinal = await request(`/api/v1/tasks/${taskBId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bFinalBody = (await bFinal.json()) as { data: { status: string } };
    expect(bFinalBody.data.status).toBe("BACKLOG");
  });

  test("a task that becomes READY jumps to the top of its column", async () => {
    // Fresh project so the column's positions are fully controlled.
    const projRes = await request("/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Ready Top Test Project" }),
    });
    const projBody = (await projRes.json()) as { data: { id: number } };
    const pid = projBody.data.id;

    async function createInProject(body: Record<string, unknown>): Promise<number> {
      const res = await request(`/api/v1/projects/${pid}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const parsed = (await res.json()) as { data: { id: number } };
      return parsed.data.id;
    }

    // Two backlog tasks deep in the column, and a gate holding the first back.
    const firstId = await createInProject({ title: "First", position: 10 });
    const secondId = await createInProject({ title: "Second", position: 20 });
    const gateId = await createInProject({ title: "Gate", status: "IN_PROGRESS" });
    await request(`/api/v1/projects/${pid}/dependencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prerequisiteTaskId: gateId, dependentTaskId: firstId }),
    });

    const gateDone = await moveTask(gateId, "DONE");
    expect(gateDone.status).toBe(200);

    const firstAfter = await request(`/api/v1/tasks/${firstId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const firstBody = (await firstAfter.json()) as { data: { readiness: string; position: number } };
    expect(firstBody.data.readiness).toBe("READY");
    expect(firstBody.data.position).toBeLessThan(20);
  });
});