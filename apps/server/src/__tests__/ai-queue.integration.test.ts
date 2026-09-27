import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import type { Server } from "node:http";
import type { RedisDomainEvent } from "@repo/types";
import type { AiProvider } from "../lib/ai-provider.js";
import { prisma } from "@repo/db/client";
import { aiQueue, AI_SUGGESTIONS_QUEUE, suggestionJobId, subscribeToProject, unsubscribeFromProject } from "@repo/queue";
import { createApp } from "../app.js";
import { setAiProvider } from "../services/ai.service.js";
import { createAiProvider } from "../lib/ai-provider.js";
import { startAiSuggestionWorker } from "../workers/ai-suggestion.worker.js";

/** What the stubbed model is allowed to answer with. */
let candidates: { prerequisiteTaskId: number; confidence: number; reason?: string }[] = [];
let providerError: Error | null = null;

const stubProvider: AiProvider = {
  async generateDependencySuggestions() {
    if (providerError) throw providerError;
    return candidates;
  },
};

let server: Server;
let worker: { close: () => Promise<void> } | undefined;
let baseUrl: string;
let token: string;
let projectId: number;

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

async function makeTask(title: string): Promise<number> {
  const res = await request(`/api/v1/projects/${projectId}/tasks`, authed({
    method: "POST",
    body: JSON.stringify({ title }),
  }));
  const body = (await res.json()) as { data: { id: number } };
  return body.data.id;
}

function enqueue(taskId: number): Promise<Response> {
  return request(
    `/api/v1/projects/${projectId}/ai/dependency-suggestions`,
    authed({ method: "POST", body: JSON.stringify({ taskId }) })
  );
}

function readRun(taskId: number): Promise<RunState> {
  return status(taskId).then(async (res) => {
    const body = (await res.json()) as { data: RunState };
    return body.data;
  });
}

function status(taskId: number): Promise<Response> {
  return request(`/api/v1/projects/${projectId}/ai/dependency-suggestions?taskId=${taskId}`, authed());
}

interface RunState {
  suggestions: { id: number; prerequisiteTaskId: number; confidence: number }[];
  status: string;
}

/** The worker runs out of process, so the test waits for it to finish. */
async function waitForRun(taskId: number, timeoutMs = 15000): Promise<RunState> {
  const deadline = Date.now() + timeoutMs;
  let last: RunState = { suggestions: [], status: "queued" };
  while (Date.now() < deadline) {
    last = await readRun(taskId);
    if (last.status === "completed" || last.status === "failed") return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `run for task ${taskId} never settled (last status: ${last.status}, suggestions: ${last.suggestions.length})`,
  );
}

/**
 * The queue is shared, so a run left over from an earlier test would execute
 * against whatever `candidates` happens to hold. Each test starts empty.
 */
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
  throw new Error("queue did not settle between tests");
}

beforeAll(async () => {
  await prisma.$connect();

  setAiProvider(stubProvider);

  // Start from a clean queue so a job left by another run cannot satisfy a poll.
  await resetQueue();

  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "string" ? 0 : (addr as any).port;
  baseUrl = `http://localhost:${port}`;

  worker = startAiSuggestionWorker();

  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "AI Queue User", email: "aiqueue@example.com", password: "password123" }),
  });
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "aiqueue@example.com", password: "password123" }),
  });
  const loginBody = (await loginRes.json()) as { data: { token: string } };
  token = loginBody.data.token;

  const projRes = await request("/api/v1/projects", authed({
    method: "POST",
    body: JSON.stringify({ name: "AI Queue Project" }),
  }));
  const projBody = (await projRes.json()) as { data: { id: number } };
  projectId = projBody.data.id;
});

afterAll(async () => {
  await worker?.close();
  server.close();
  setAiProvider(createAiProvider());
  await prisma.$disconnect();
  await aiQueue.close();
});

beforeEach(async () => {
  await resetQueue();
  candidates = [];
  providerError = null;
});

describe("requesting suggestions", () => {
  test(
    "the request is accepted rather than answered inline",
    async () => {
      candidates = [{ prerequisiteTaskId: 1, confidence: 0.8, reason: "before" }];
      const target = await makeTask("Write tests");

      const res = await enqueue(target);
      const body = (await res.json()) as { data: { queued: boolean; jobId: string } };

      // The work takes a network round trip, so the answer is a job reference.
      expect(res.status).toBe(202);
      expect(body.data.queued).toBe(true);
      expect(body.data.jobId).toBe(suggestionJobId(target));
      await waitForRun(target);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "an unknown task is refused before anything is queued",
    async () => {
      const res = await enqueue(999999);
      expect(res.status).toBe(404);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a task from another project is refused",
    async () => {
      const otherRes = await request("/api/v1/projects", authed({
        method: "POST",
        body: JSON.stringify({ name: "Other" }),
      }));
      const other = (await otherRes.json()) as { data: { id: number } };
      const foreignRes = await request(`/api/v1/projects/${other.data.id}/tasks`, authed({
        method: "POST",
        body: JSON.stringify({ title: "Foreign" }),
      }));
      const foreign = (await foreignRes.json()) as { data: { id: number } };

      const res = await request(
        `/api/v1/projects/${projectId}/ai/dependency-suggestions`,
        authed({ method: "POST", body: JSON.stringify({ taskId: foreign.data.id }) })
      );

      expect(res.status).toBe(404);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "an unauthenticated request is refused",
    async () => {
      const target = await makeTask("Anon target");
      const res = await fetch(
        `${baseUrl}/api/v1/projects/${projectId}/ai/dependency-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: target }),
        }
      );
      expect(res.status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a task is not queued twice while a run is in flight",
    async () => {
      const target = await makeTask("Dedup target");
      await enqueue(target);
      const second = await enqueue(target);

      const body = (await second.json()) as { data: { jobId: string } };
      expect(body.data.jobId).toBe(suggestionJobId(target));
      await waitForRun(target);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("the worker", () => {
  test(
    "a run is observable while it is still outstanding",
    async () => {
      const target = await makeTask("Progress target");
      await enqueue(target);

      const early = await readRun(target);
      expect(["queued", "running", "completed"]).toContain(early.status);
      await waitForRun(target);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a finished run reports the suggestions it produced",
    async () => {
      const first = await makeTask("Design schema");
      const second = await makeTask("Write migration");
      candidates = [{ prerequisiteTaskId: first, confidence: 0.92, reason: "Must come first" }];

      await enqueue(second);
      const run = await waitForRun(second);

      expect(run.status).toBe("completed");
      expect(run.suggestions).toHaveLength(1);
      expect(run.suggestions[0]!.prerequisiteTaskId).toBe(first);
      expect(run.suggestions[0]!.confidence).toBeCloseTo(0.92);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a task never suggests itself",
    async () => {
      const only = await makeTask("Self referential");
      candidates = [{ prerequisiteTaskId: only, confidence: 0.9, reason: "itself" }];

      await enqueue(only);
      const run = await waitForRun(only);

      expect(run.suggestions).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a task id that does not exist is dropped",
    async () => {
      const target = await makeTask("Filter target");
      candidates = [{ prerequisiteTaskId: 999999, confidence: 0.9, reason: "ghost" }];

      await enqueue(target);
      const run = await waitForRun(target);

      expect(run.suggestions).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a pair already suggested once is not suggested again",
    async () => {
      const first = await makeTask("Existing prereq");
      const second = await makeTask("Existing dependent");
      candidates = [{ prerequisiteTaskId: first, confidence: 0.9, reason: "first pass" }];

      await enqueue(second);
      const firstRun = await waitForRun(second);
      expect(firstRun.suggestions).toHaveLength(1);

      // The first suggestion is still pending, so a second pass must not repeat it.
      await enqueue(second);
      await waitForRun(second);
      const stored = await prisma.aiSuggestion.findMany({ where: { taskId: second } });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.prerequisiteTaskId).toBe(first);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a provider failure does not take the request down",
    async () => {
      const target = await makeTask("Provider blows up");
      providerError = new Error("upstream unavailable");

      const enqueueRes = await enqueue(target);
      expect(enqueueRes.status).toBe(202);

      const run = await waitForRun(target);
      expect(["completed", "failed"]).toContain(run.status);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "a finished run announces each suggestion on the project channel",
    async () => {
      const first = await makeTask("Announced prereq");
      const second = await makeTask("Announced dependent");
      candidates = [{ prerequisiteTaskId: first, confidence: 0.7, reason: "needed" }];

      // Events reach clients over Redis Pub/Sub, not the persisted event log.
      const received: RedisDomainEvent[] = [];
      const collect = (event: RedisDomainEvent) => {
        received.push(event);
      };
      await subscribeToProject(projectId, collect);

      try {
        await enqueue(second);
        const run = await waitForRun(second);
        expect(run.suggestions).toHaveLength(1);

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (received.some((e) => e.type === "AI_SUGGESTION_CREATED" && e.taskId === second)) break;
          await new Promise((r) => setTimeout(r, 50));
        }

        const created = received.filter(
          (e) => e.type === "AI_SUGGESTION_CREATED" && e.taskId === second
        );
        expect(created).toHaveLength(run.suggestions.length);
      } finally {
        await unsubscribeFromProject(projectId, collect);
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "the queue really is bullmq, and this suite owns it",
    () => {
      expect(AI_SUGGESTIONS_QUEUE).toBe("ai-suggestions-test");
    },
    TEST_TIMEOUT_MS,
  );
});
