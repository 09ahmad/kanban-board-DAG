import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createApp } from "../app.js";
import type { Server } from "node:http";
import { prisma } from "@repo/db/client";
import { TestRun, uniqueEmail, userIdFromToken } from "./helpers/identity.js";

let server: Server;
let baseUrl: string;
let token: string;

// One address for the whole file, so the tests that register then log in share an
// account while a second run of the suite starts clean.
const email = uniqueEmail("auth");
const run = new TestRun();

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
  await run.cleanup();
  await prisma.$disconnect();
});

describe("auth integration", () => {
  test("register returns 201 with no passwordHash", async () => {
    const res = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: email,
        password: "password123",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
    expect(body.data.token).toBeDefined();
    expect(body.data.user.passwordHash).toBeUndefined();
    expect(body.data.user.email).toBe(email);
    token = body.data.token;
    run.track(userIdFromToken(token));
  });

  test("register duplicate email returns 409", async () => {
    const res = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Another User",
        email: email,
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
        email: email,
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
        email: email,
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
    expect(body.data.email).toBe(email);
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

describe("session refresh", () => {
  /** A JWT payload, decoded but not verified: enough to read its claims. */
  function claims(token: string): { userId: number; exp: number; iat: number } {
    return JSON.parse(atob(token.split(".")[1]!));
  }

  test("extends a session that has not lapsed", async () => {
    const res = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { token: string; user: { email: string; passwordHash?: string } };
    };
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.passwordHash).toBeUndefined();
    // The same person, and the same account. Note the token is not asserted to
    // differ: JWT claims have second resolution, so a renewal inside the same
    // second is byte-identical to the original. What matters is that it works.
    expect(claims(body.data.token).userId).toBe(claims(token).userId);

    const meRes = await request("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${body.data.token}` },
    });
    expect(meRes.status).toBe(200);
  });

  test("the renewed token lasts as long as a fresh login would", async () => {
    const res = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { data: { token: string } };

    // The point of the endpoint: an extended session is not a shorter one.
    const renewed = claims(body.data.token);
    const original = claims(token);
    expect(renewed.exp - renewed.iat).toBe(original.exp - original.iat);
  });

  test("refuses without a token", async () => {
    const res = await request("/api/v1/auth/refresh", { method: "POST" });

    expect(res.status).toBe(401);
  });

  test("refuses a token that is not a session at all", async () => {
    const res = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Authorization: "Bearer not.a.token" },
    });

    // Sliding sessions extend a live session; they are not a way past a lapsed one.
    expect(res.status).toBe(401);
  });
});
