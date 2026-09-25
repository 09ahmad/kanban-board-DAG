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
      name: "Task Test User",
      email: "tasktest@example.com",
      password: "password123",
    }),
  });
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "tasktest@example.com",
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
    body: JSON.stringify({ name: "Task Test Project" }),
  });
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
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
});