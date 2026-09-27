import { prisma } from "@repo/db/client";

/**
 * Test identity helpers.
 *
 * The integration suites used to empty the database in `beforeAll` so they could
 * start from a clean slate. That is fine on a throwaway database and ruinous on
 * a developer's own: `bun test` would delete every account and project sitting
 * behind a server they had running.
 *
 * So a suite now takes an identity that is unique to its run and removes only
 * what it created. Deleting a user cascades to the projects they own and those
 * to their tasks, dependencies and events, so the user ids are all that needs
 * tracking.
 */

/** A fresh address per run, so a suite is re-runnable without clearing anything. */
export function uniqueEmail(prefix: string): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${unique}@test.local`;
}

/** The user a token belongs to, taken from the token the request path will use. */
export function userIdFromToken(token: string): number {
  const claims = JSON.parse(atob(token.split(".")[1]!)) as { userId: number };
  return claims.userId;
}

export interface RegisteredUser {
  token: string;
  userId: number;
}

/** Register a per-run user and sign them in, returning the token and their id. */
export async function registerAndLogin(
  baseUrl: string,
  name: string,
  email: string,
  password = "password123",
): Promise<RegisteredUser> {
  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const token = ((await loginRes.json()) as { data: { token: string } }).data.token;
  return { token, userId: userIdFromToken(token) };
}

/** Track the users a suite created so `cleanupTestRun` can remove exactly them. */
export class TestRun {
  private readonly userIds: number[] = [];

  track(userId: number): number {
    this.userIds.push(userId);
    return userId;
  }

  /** Remove only what this run created, leaving the rest of the database alone. */
  async cleanup(): Promise<void> {
    if (this.userIds.length === 0) return;
    await prisma.user.deleteMany({ where: { id: { in: this.userIds } } });
    this.userIds.length = 0;
  }
}
