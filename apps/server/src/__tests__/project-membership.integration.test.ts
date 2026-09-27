import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createApp } from "../app.js";
import type { Server } from "node:http";
import { prisma } from "@repo/db/client";

let server: Server;
let baseUrl: string;

let ownerToken: string;
let strangerToken: string;
let projectId: number;

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

function authed(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  };
}

async function register(name: string, email: string): Promise<string> {
  await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123" }),
  });
  const res = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const body = (await res.json()) as { data: { token: string } };
  return body.data.token;
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
  const port = typeof addr === "string" ? 0 : (addr as { port: number }).port;
  baseUrl = `http://localhost:${port}`;

  ownerToken = await register("Owner", "owner@example.com");
  strangerToken = await register("Stranger", "stranger@example.com");

  const projRes = await request("/api/v1/projects", authed(ownerToken, {
    method: "POST",
    body: JSON.stringify({ name: "Open Project", description: "Anyone may look" }),
  }));
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

describe("project preview", () => {
  test("a non-member can see enough to decide whether to join", async () => {
    const res = await request(`/api/v1/projects/${projectId}/preview`, authed(strangerToken));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { name: string; description: string | null; memberCount: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Open Project");
    expect(body.data.memberCount).toBe(1);
  });

  test("still requires a token", async () => {
    const res = await request(`/api/v1/projects/${projectId}/preview`);
    expect(res.status).toBe(401);
  });

  test("a missing project is a 404, not an empty preview", async () => {
    const res = await request("/api/v1/projects/999999/preview", authed(strangerToken));
    expect(res.status).toBe(404);
  });
});

describe("project members", () => {
  test("a member can list the roster", async () => {
    const res = await request(`/api/v1/projects/${projectId}/members`, authed(ownerToken));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ role: string; name: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.role).toBe("OWNER");
  });

  test("a non-member cannot list the roster", async () => {
    // Preview is open on purpose; the roster is not.
    const res = await request(`/api/v1/projects/${projectId}/members`, authed(strangerToken));
    expect(res.status).toBe(403);
  });
});

describe("joining a project", () => {
  test("a non-member can join and is then a member", async () => {
    const res = await request(`/api/v1/projects/${projectId}/join`, authed(strangerToken, { method: "POST" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { alreadyMember: boolean; membership: { role: string } } };
    expect(body.data.alreadyMember).toBe(false);
    expect(body.data.membership.role).toBe("MEMBER");
  });

  // This is the one that matters. joinProject has no pre-check, so a repeated
  // join's insert is what trips the unique index and lands in the handler that
  // turns a lost race into an answer.
  test("joining twice is idempotent rather than a conflict", async () => {
    const res = await request(`/api/v1/projects/${projectId}/join`, authed(strangerToken, { method: "POST" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { alreadyMember: boolean } };
    expect(body.data.alreadyMember).toBe(true);
  });

  // Note this does not reproduce the interleaving: one process with a pooled
  // connection serialises the calls, so it pins the outcome rather than proving
  // the race is handled. The handler is covered by the idempotency test above.
  test("concurrent joins all succeed with exactly one insert", async () => {
    const fresh = await register("Racer", "racer@example.com");
    const projectRes = await request("/api/v1/projects", authed(ownerToken, {
      method: "POST",
      body: JSON.stringify({ name: "Race Project" }),
    }));
    const body = (await projectRes.json()) as { data: { id: number } };
    const raceProjectId = body.data.id;

    // The unique index on (projectId, userId) means exactly one insert can win.
    // The rest must report alreadyMember rather than fail with a 500.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(`/api/v1/projects/${raceProjectId}/join`, authed(fresh, { method: "POST" })),
      ),
    );

    expect(attempts.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const flags = await Promise.all(
      attempts.map(async (r) => ((await r.json()) as { data: { alreadyMember: boolean } }).data.alreadyMember),
    );
    expect(flags.filter((f) => f === false)).toHaveLength(1);
    expect(flags.filter((f) => f === true)).toHaveLength(4);

    const meRes = await request("/api/v1/auth/me", authed(fresh));
    const me = (await meRes.json()) as { data: { id: number } };

    // Scoped to the racer: the owner is already a member from creation.
    const rows = await prisma.projectMember.count({
      where: { projectId: raceProjectId, userId: me.data.id },
    });
    expect(rows).toBe(1);
  });

  test("joining a project that does not exist is a 404", async () => {
    const res = await request("/api/v1/projects/999999/join", authed(strangerToken, { method: "POST" }));
    expect(res.status).toBe(404);
  });

});
