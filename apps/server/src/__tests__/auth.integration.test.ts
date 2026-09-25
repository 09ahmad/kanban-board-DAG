import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createApp } from "../app.js";
import type { Server } from "node:http";
import { prisma } from "@repo/db/client";

let server: Server;
let baseUrl: string;
let token: string;

function request(
  path: string,
  init?: RequestInit & { status?: number },
): Promise<Response> {
  const url = `${baseUrl}${path}`;
  return fetch(url, init);
}

beforeAll(async () => {
  await prisma.$connect();
  const app = createApp();
  server = app.listen(0);
  const port = (server.address() as any).port;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

describe("auth integration", () => {
  test("register returns 201 with no passwordHash", async () => {
    const res = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "testuser@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
    expect(body.data.token).toBeDefined();
    expect(body.data.user.passwordHash).toBeUndefined();
    expect(body.data.user.email).toBe("testuser@example.com");
    token = body.data.token;
  });

  test("register duplicate email returns 409", async () => {
    const res = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Another User",
        email: "testuser@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
  });

  test("login with wrong password returns 401", async () => {
    const res = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "testuser@example.com",
        password: "wrongpassword",
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  test("login with correct password returns 200", async () => {
    const res = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "testuser@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.passwordHash).toBeUndefined();
    token = body.data.token;
  });

  test("GET /me with token returns 200", async () => {
    const res = await request("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("testuser@example.com");
    expect(body.data.passwordHash).toBeUndefined();
  });

  test("GET /me without token returns 401", async () => {
    const res = await request("/api/v1/auth/me");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  test("GET /me with invalid token returns 401", async () => {
    const res = await request("/api/v1/auth/me", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  test("logout returns 200", async () => {
    const res = await request("/api/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.loggedOut).toBe(true);
  });

  test("health endpoint returns ok", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("ready endpoint returns ok", async () => {
    const res = await request("/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});