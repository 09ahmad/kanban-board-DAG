/**
 * Integration tests for edgeImpactDays.
 *
 * `edgeImpactDays` is module-private, so it is exercised through the public
 * endpoint that exposes its result: GET /ai/dependency-suggestions?taskId=<id>
 * returns `criticalPathImpactDays` on every pending suggestion.
 *
 * Two cases from Section 3.3:
 *   - An edge that extends the critical path reports a positive delta.
 *   - An edge between two off-path tasks reports 0.
 */
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import type { Server } from "node:http";
import type { AiProvider } from "../lib/ai-provider.js";
import { prisma } from "@repo/db/client";
import { registerAndLogin, TestRun, uniqueEmail } from "./helpers/identity.js";
import { aiQueue, suggestionJobId } from "@repo/queue";
import { createApp } from "../app.js";
import { setAiProvider } from "../services/ai.service.js";
import { createAiProvider } from "../lib/ai-provider.js";
import { startAiSuggestionWorker } from "../workers/ai-suggestion.worker.js";

/** Candidates returned by the stub for the current test. */
let candidates: { prerequisiteTaskId: number; confidence: number; reason?: string }[] = [];

const stubProvider: AiProvider = {
  async generateDependencySuggestions() {
    return candidates;
  },
};

let server: Server;
let worker: { close: () => Promise<void> } | undefined;
let baseUrl: string;
let token: string;
let projectId: number;
const run = new TestRun();

const TEST_TIMEOUT_MS = 20000;

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  };
}

async function makeTask(title: string, duration?: number): Promise<number> {
  const res = await request(`/api/v1/projects/${projectId}/tasks`, authed({
    method: "POST",
    body: JSON.stringify({ title, ...(duration !== undefined ? { duration } : {}) }),
  }));
  const body = (await res.json()) as { data: { id: number } };
  return body.data.id;
}

async function linkDependency(prerequisiteTaskId: number, dependentTaskId: number): Promise<void> {
  const res = await request(`/api/v1/projects/${projectId}/dependencies`, authed({
    method: "POST",
    body: JSON.stringify({ prerequisiteTaskId, dependentTaskId }),
  }));
  expect(res.status).toBe(201);
}

async function enqueue(taskId: number): Promise<void> {
  const res = await request(
    `/api/v1/projects/${projectId}/ai/dependency-suggestions`,
    authed({ method: "POST", body: JSON.stringify({ taskId }) }),
  );
  expect(res.status).toBe(202);
}

interface SuggestionResult {
  id: number;
  prerequisiteTaskId: number;
  criticalPathImpactDays: number;
}

interface RunState {
  suggestions: SuggestionResult[];
  status: string;
}

async function pollUntilSettled(taskId: number, timeoutMs = 15000): Promise<RunState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(
      `/api/v1/projects/${projectId}/ai/dependency-suggestions?taskId=${taskId}`,
      authed(),
    );
    const body = (await res.json()) as { data: RunState };
    if (body.data.status === "completed" || body.data.status === "failed") {
      return body.data;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`run for task ${taskId} never settled within ${timeoutMs}ms`);
}

async function resetQueue(): Promise<void> {
  await aiQueue.drain(true);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const outstanding =
      (await aiQueue.getWaitingCount()) +
      (await aiQueue.getActiveCount()) +
      (await aiQueue.getDelayedCount());
    if (outstanding === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("queue did not settle");
}

beforeAll(async () => {
  await prisma.$connect();
  setAiProvider(stubProvider);
  await resetQueue();

  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "string" ? 0 : (addr as any).port;
  baseUrl = `http://localhost:${port}`;

  worker = startAiSuggestionWorker();

  const { token: signedIn, userId } = await registerAndLogin(
    baseUrl,
    "Edge Impact User",
    uniqueEmail("edgeimpact"),
  );
  run.track(userId);
  token = signedIn;

  const projRes = await request("/api/v1/projects", authed({
    method: "POST",
    body: JSON.stringify({ name: "Edge Impact Project" }),
  }));
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await worker?.close();
  server.close();
  setAiProvider(createAiProvider());
  await run.cleanup();
  await prisma.$disconnect();
  await aiQueue.close();
});

beforeEach(async () => {
  await resetQueue();
  candidates = [];
});

describe("edgeImpactDays", () => {
  test(
    "an edge that extends the critical path reports a positive delta",
    async () => {
      // Build a linear chain A → B (each 5 days). The critical path is A + B = 10.
      // The suggestion is to make C (5 days, off-path) a prerequisite of B.
      // Adding C → B does not extend the critical path because A → B already
      // takes 10 days, which equals A + C → B (5+5). So we need a longer side chain.
      //
      // Topology: A (5) → B (5). Suggest: C (20) → B.
      // Without edge: critical path = A + B = 10 days.
      // With edge C → B:  critical path = max(A → B, C → B) = max(10, 25) = 25.
      // Impact = 25 - 10 = 15 days (positive).
      const taskA = await makeTask("Critical A", 5);
      const taskB = await makeTask("Critical B", 5);
      const taskC = await makeTask("Long side C", 20);
      await linkDependency(taskA, taskB);

      candidates = [{ prerequisiteTaskId: taskC, confidence: 0.9, reason: "needed before B" }];
      await enqueue(taskB);
      const result = await pollUntilSettled(taskB);

      expect(result.status).toBe("completed");
      expect(result.suggestions).toHaveLength(1);

      const suggestion = result.suggestions[0]!;
      expect(suggestion.prerequisiteTaskId).toBe(taskC);
      expect(suggestion.criticalPathImpactDays).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "an edge between two tasks not on the critical path reports 0",
    async () => {
      // Topology: A (10) → B (10) is the main chain.
      // X (1) and Y (1) are isolated leaf tasks. Suggesting X → Y adds an
      // edge where max(X, Y) = 2, far less than the existing critical path
      // of 20. Extending a sub-critical chain does not move the project end.
      const taskA = await makeTask("Main chain A", 10);
      const taskB = await makeTask("Main chain B", 10);
      await linkDependency(taskA, taskB);

      const taskX = await makeTask("Off-path X", 1);
      const taskY = await makeTask("Off-path Y", 1);

      candidates = [{ prerequisiteTaskId: taskX, confidence: 0.7, reason: "off-path suggestion" }];
      await enqueue(taskY);
      const result = await pollUntilSettled(taskY);

      expect(result.status).toBe("completed");
      expect(result.suggestions).toHaveLength(1);

      const suggestion = result.suggestions[0]!;
      expect(suggestion.prerequisiteTaskId).toBe(taskX);
      // Adding X → Y (1+1=2) does not lengthen the critical path (A→B = 20).
      expect(suggestion.criticalPathImpactDays).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
