import "../../happydom";
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

/** What the API answers with, keyed by endpoint substring. */
const routes: { match: string; payload: unknown }[] = [];
const calls: string[] = [];

const apiMock = mock(async (endpoint: string) => {
  calls.push(endpoint);
  const hit = routes.find((r) => endpoint.includes(r.match));
  if (!hit) throw { success: false, error: { code: "NOT_FOUND", message: "no route" } };
  return { success: true, data: hit.payload };
});

mock.module("@/lib/api-client", () => ({
  apiClient: apiMock,
  unwrapResponse: (res: any) => {
    if (!res.success) throw res.error;
    return res.data;
  },
}));

const { useAiSuggestions } = await import("../use-ai-suggestions");

const suggestion = { id: 7, prerequisiteTaskId: 3, confidence: 0.8, reason: "first" };

/**
 * The poll read must be matched before the enqueue, otherwise the enqueue
 * route would swallow both (the poll URL contains the same path).
 */
function serveRun(run: { suggestions: unknown[]; status: string }): void {
  routes.push({ match: "?taskId=5", payload: run });
  routes.push({ match: "/ai/dependency-suggestions", payload: { queued: true, jobId: "job-1" } });
}

beforeEach(() => {
  routes.length = 0;
  calls.length = 0;
  apiMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("useAiSuggestions", () => {
  test("starts idle with nothing to show", () => {
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("generating hands the work to the server and waits for the worker", async () => {
    serveRun({ suggestions: [], status: "running" });
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    await act(async () => {
      await result.current.generate();
    });

    // The POST returns a job reference; the answer arrives by polling.
    expect(calls[0]).toBe("/projects/1/ai/dependency-suggestions");
    await waitFor(() => expect(result.current.busy).toBe(true));
  });

  test("a finished run surfaces the suggestions the worker produced", async () => {
    serveRun({ suggestions: [suggestion], status: "completed" });
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    await act(async () => {
      await result.current.generate();
    });

    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(result.current.suggestions[0]!.id).toBe(7);
    expect(result.current.busy).toBe(false);
  });

  test("a failed run stops the spinner and explains itself", async () => {
    serveRun({ suggestions: [], status: "failed" });
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    await act(async () => {
      await result.current.generate();
    });

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.error).toBe("The suggestion run failed. Generate again to retry.");
  });

  test("a rejected request reports the server's message and stays idle", async () => {
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    await act(async () => {
      await result.current.generate();
    });

    await waitFor(() => expect(result.current.error).toBe("no route"));
    expect(result.current.busy).toBe(false);
  });

  test("accepting removes the suggestion from the list", async () => {
    serveRun({ suggestions: [suggestion], status: "completed" });
    routes.push({ match: "/accept", payload: { suggestion: { ...suggestion, status: "ACCEPTED" } } });
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    await act(async () => {
      await result.current.generate();
    });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    await act(async () => {
      await result.current.accept(suggestion);
    });

    expect(result.current.suggestions).toHaveLength(0);
  });

  test("rejecting removes the suggestion from the list", async () => {
    serveRun({ suggestions: [suggestion], status: "completed" });
    routes.push({ match: "/reject", payload: { suggestion: { ...suggestion, status: "REJECTED" } } });
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1, taskId: 5, pollIntervalMs: 5 }));

    await act(async () => {
      await result.current.generate();
    });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    await act(async () => {
      await result.current.reject(suggestion);
    });

    expect(result.current.suggestions).toHaveLength(0);
  });

  test("a task-less panel does not poll", async () => {
    const { result } = renderHook(() => useAiSuggestions({ projectId: 1 }));

    await act(async () => {
      await result.current.generate();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.includes("?taskId="))).toHaveLength(0);
  });
});
