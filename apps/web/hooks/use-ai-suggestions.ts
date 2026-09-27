import { useState, useCallback, useEffect, useRef } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import type { AiSuggestionItem, SuggestionRunStateDto } from "@repo/types";

const PENDING_STATES: SuggestionRunStateDto[] = ["queued", "running"];
const POLL_INTERVAL_MS = 1000;
/** How long the panel visibly thinks before a fast answer may land. */
const THINKING_WINDOW_MS = 2200;

interface UseAiSuggestionsArgs {
  projectId: number;
  taskId?: number;
  /** How long to wait between reads of a run that is still outstanding. */
  pollIntervalMs?: number;
  /** How long the panel visibly thinks before a fast answer may land. */
  thinkingWindowMs?: number;
}

export function useAiSuggestions({ projectId, taskId, pollIntervalMs = POLL_INTERVAL_MS, thinkingWindowMs = THINKING_WINDOW_MS }: UseAiSuggestionsArgs) {
  const [suggestions, setSuggestions] = useState<AiSuggestionItem[]>([]);
  const [runState, setRunState] = useState<SuggestionRunStateDto>("completed");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const busy = PENDING_STATES.includes(runState);

  // The worker finishes out of process, so a run is followed rather than awaited.
  const poll = useCallback(async () => {
    if (taskId === undefined) return;
    try {
      const res = await apiClient<{ suggestions: AiSuggestionItem[]; status: SuggestionRunStateDto }>(
        `/projects/${projectId}/ai/dependency-suggestions?taskId=${taskId}`
      );
      if (!mountedRef.current) return;
      const data = unwrapResponse(res);
      setSuggestions(data.suggestions);
      setRunState(data.status);
      if (PENDING_STATES.includes(data.status)) {
        timerRef.current = setTimeout(() => void poll(), pollIntervalMs);
      } else if (data.status === "failed") {
        setError("The suggestion run failed. Generate again to retry.");
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setRunState("failed");
      setError(err?.error?.message ?? "Failed to read suggestions");
    }
  }, [projectId, taskId, pollIntervalMs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // A run may have finished out of process before this panel ever opened, so
  // an existing pending list is read as soon as the task is picked — waiting
  // for a Generate click would hide work that is already done.
  useEffect(() => {
    if (taskId !== undefined) void poll();
  }, [taskId, poll]);

  const generate = useCallback(async () => {
    setError(null);
    try {
      await apiClient<{ queued: boolean; jobId: string }>(
        `/projects/${projectId}/ai/dependency-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        }
      );
      if (!mountedRef.current) return;
      setRunState("queued");
      // The analysis is worked out of process either way. When it settles
      // fast — a heuristic run takes milliseconds — the first read still
      // waits out a thinking window, so the answer never lands before the
      // panel has visibly thought about it.
      const firstReadMs = Math.max(pollIntervalMs, thinkingWindowMs);
      timerRef.current = setTimeout(() => void poll(), firstReadMs);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setRunState("completed");
      setError(err?.error?.message ?? "Failed to generate suggestions");
    }
  }, [projectId, taskId, poll, pollIntervalMs]);

  const accept = useCallback(async (suggestion: AiSuggestionItem): Promise<number | null | undefined> => {
    try {
      const res = await apiClient<{ criticalPathImpactDays?: number | null }>(`/ai/suggestions/${suggestion.id}/accept`, { method: "POST" });
      const impact = unwrapResponse(res).criticalPathImpactDays;
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      return impact;
    } catch (err: any) {
      setError(err?.error?.message ?? "Accept failed");
      return undefined;
    }
  }, []);

  const reject = useCallback(async (suggestion: AiSuggestionItem) => {
    try {
      await apiClient(`/ai/suggestions/${suggestion.id}/reject`, { method: "POST" });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (err: any) {
      setError(err?.error?.message ?? "Reject failed");
    }
  }, []);

  return { suggestions, busy, error, generate, accept, reject };
}
