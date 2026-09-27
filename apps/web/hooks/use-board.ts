import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { useToast } from "@/components/toaster";
import type { Task, TaskDependency, TaskEvent, CreateTaskInput } from "@repo/types";
import { TaskStatus } from "@repo/types";

interface BoardColumnData {
  id: TaskStatus;
  title: string;
  tasks: Task[];
}

interface CriticalPathResult {
  criticalTaskIds: number[];
  criticalEdges: Array<{ prerequisiteTaskId: number; dependentTaskId: number }>;
  totalDurationDays: number;
}

interface GraphResponse {
  tasks: Task[];
  dependencies: TaskDependency[];
}

/** Tracks how stale a newly created card's readiness badge is. */
interface PendingReadiness {
  /** True once every selected prerequisite has been posted. */
  dependenciesPosted: boolean;
  /** A graph request is only trusted when it started after this sequence. */
  trustedAfterSeq: number;
}

interface UseBoardReturn {
  tasks: Map<number, Task>;
  dependencies: TaskDependency[];
  columns: BoardColumnData[];
  loading: boolean;
  error: string | null;
  moveTask: (taskId: number, status: TaskStatus, position?: number) => Promise<void>;
  reorderTask: (taskId: number, newPosition: number, status: TaskStatus) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  markDependenciesPosted: (taskId: number) => void;
  pendingReadinessIds: Set<number>;
  deleteTask: (taskId: number) => Promise<void>;
  fetchDependents: (taskId: number) => Promise<Task[]>;
  createDependency: (prerequisiteTaskId: number, dependentTaskId: number) => Promise<void>;
  deleteDependency: (dependencyId: number) => Promise<void>;
  fetchCriticalPath: () => Promise<CriticalPathResult | null>;
  fetchEvents: (limit?: number, before?: number) => Promise<TaskEvent[]>;
  refetch: (options?: { silent?: boolean }) => Promise<boolean>;
}

const statusOrder: TaskStatus[] = ["BACKLOG", "IN_PROGRESS", "REVIEW", "DONE"];

export function useBoard(projectId: number): UseBoardReturn {
  const [tasks, setTasks] = useState<Map<number, Task>>(new Map());
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // A task created in this session shows "Calculating…" until a refresh that
  // started after its prerequisites were posted brings back the readiness the
  // DAG Engine derived. The map only records how stale each card's badge is —
  // the value itself is never derived here.
  const [pendingReadiness, setPendingReadiness] = useState<Map<number, PendingReadiness>>(new Map());
  const pendingRef = useRef<Map<number, PendingReadiness>>(new Map());
  const refetchSeqRef = useRef(0);
  const readinessRetry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writePending = useCallback((next: Map<number, PendingReadiness>) => {
    pendingRef.current = next;
    setPendingReadiness(next);
  }, []);

  const refetch = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      const silent = options?.silent ?? false;
      const startSeq = refetchSeqRef.current + 1;
      refetchSeqRef.current = startSeq;

      if (!silent) setLoading(true);
      try {
        const res = await apiClient<GraphResponse>(`/projects/${projectId}/graph`);
        const data = unwrapResponse(res);
        const taskMap = new Map<number, Task>();
        data.tasks.forEach((t) => taskMap.set(t.id, t));
        setTasks(taskMap);
        setDependencies(data.dependencies);
        setError(null);

        if (pendingRef.current.size > 0) {
          const next = new Map(pendingRef.current);
          next.forEach((entry, id) => {
            // Every prerequisite posted, and this request started after that —
            // so the snapshot in hand includes them all.
            if (entry.dependenciesPosted && startSeq > entry.trustedAfterSeq) next.delete(id);
          });
          if (next.size !== pendingRef.current.size) writePending(next);
        }
        return true;
      } catch (err: any) {
        if (!silent) setError(err?.error?.message ?? "Failed to load board");
        return false;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId, writePending]
  );

  useEffect(() => {
    return () => {
      if (readinessRetry.current) clearTimeout(readinessRetry.current);
    };
  }, []);


  useEffect(() => {
    refetch();
  }, [refetch]);

  const moveTask = useCallback(
    async (taskId: number, status: TaskStatus, position?: number) => {
      // Captured from the pre-write state: the rollback below must restore the
      // values as they were, not the ones this call just applied.
      let snapshot: Task | undefined;
      setTasks((prev) => {
        const task = prev.get(taskId);
        snapshot = task;
        if (!task) return prev;
        const next = new Map(prev);
        next.set(taskId, { ...task, status, position: position ?? task.position });
        return next;
      });

      try {
        await apiClient(`/tasks/${taskId}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, position }),
        });
        toast({ type: "success", message: `Task moved to ${status.replace("_", " ")}` });
      } catch (err: any) {
        setTasks((prev) => {
          if (!snapshot) return prev;
          const next = new Map(prev);
          next.set(taskId, snapshot);
          return next;
        });
        toast({ type: "error", message: err?.error?.message ?? "Move failed" });
        throw err;
      }
    },
    [toast]
  );

  const reorderTask = useCallback(
    async (taskId: number, newPosition: number, status: TaskStatus) => {
      let snapshot: Task | undefined;
      setTasks((prev) => {
        const task = prev.get(taskId);
        snapshot = task;
        if (!task) return prev;
        const next = new Map(prev);
        next.set(taskId, { ...task, position: newPosition });
        return next;
      });

      try {
        await apiClient(`/tasks/${taskId}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, position: newPosition }),
        });
        toast({ type: "success", message: "Task reordered" });
      } catch (err: any) {
        setTasks((prev) => {
          if (!snapshot) return prev;
          const next = new Map(prev);
          next.set(taskId, snapshot);
          return next;
        });
        toast({ type: "error", message: err?.error?.message ?? "Reorder failed" });
        throw err;
      }
    },
    [toast]
  );

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task> => {
      const res = await apiClient<Task>(`/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          ...(input.plannedStart ? { plannedStart: input.plannedStart } : {}),
          ...(input.duration ? { duration: input.duration } : {}),
        }),
      });
      const task = unwrapResponse(res);

      // The server answers with a placeholder readiness, so the card is shown
      // right away but its badge stays on "Calculating…" until a refresh
      // carries the value the DAG Engine derived.
      setTasks((prev) => {
        const next = new Map(prev);
        next.set(task.id, task);
        return next;
      });

      const pending = new Map(pendingRef.current);
      pending.set(task.id, { dependenciesPosted: false, trustedAfterSeq: refetchSeqRef.current });
      writePending(pending);

      return task;
    },
    [projectId, writePending]
  );

  const markDependenciesPosted = useCallback(
    (taskId: number) => {
      const entry = pendingRef.current.get(taskId);
      if (!entry) return;

      const pending = new Map(pendingRef.current);
      pending.set(taskId, { dependenciesPosted: true, trustedAfterSeq: refetchSeqRef.current });
      writePending(pending);

      // Every prerequisite has been answered, so a refresh started now returns
      // the readiness the DAG Engine derived for this task.
      void refetch({ silent: true }).then((ok) => {
        if (ok) return;
        // One retry: a card stuck on "Calculating…" misleads more than a delay does.
        if (readinessRetry.current) clearTimeout(readinessRetry.current);
        readinessRetry.current = setTimeout(() => {
          void refetch({ silent: true });
        }, 3000);
      });
    },
    [writePending, refetch]
  );

  const deleteTask = useCallback(
    async (taskId: number) => {
      await apiClient(`/tasks/${taskId}`, { method: "DELETE" });

      setTasks((prev) => {
        if (!prev.has(taskId)) return prev;
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      if (pendingRef.current.has(taskId)) {
        const pending = new Map(pendingRef.current);
        pending.delete(taskId);
        writePending(pending);
      }
    },
    [writePending]
  );

  const fetchDependents = useCallback(
    async (taskId: number): Promise<Task[]> => {
      const res = await apiClient<GraphResponse>(`/projects/${projectId}/graph`);
      const data = unwrapResponse(res);
      const byId = new Map(data.tasks.map((t) => [t.id, t]));
      return data.dependencies
        .filter((edge) => edge.prerequisiteTaskId === taskId)
        .map((edge) => byId.get(edge.dependentTaskId))
        .filter((t): t is Task => Boolean(t));
    },
    [projectId]
  );

  const createDependency = useCallback(
    async (prerequisiteTaskId: number, dependentTaskId: number) => {
      try {
        await apiClient(`/projects/${projectId}/dependencies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prerequisiteTaskId, dependentTaskId }),
        });
        toast({ type: "success", message: "Dependency created" });
        await refetch({ silent: true });
      } catch (err: any) {
        toast({ type: "error", message: err?.error?.message ?? "Failed to create dependency" });
        throw err;
      }
    },
    [projectId, refetch, toast]
  );

  const deleteDependency = useCallback(
    async (dependencyId: number) => {
      try {
        await apiClient(`/dependencies/${dependencyId}`, { method: "DELETE" });
        toast({ type: "success", message: "Dependency removed" });
        await refetch();
      } catch (err: any) {
        toast({ type: "error", message: err?.error?.message ?? "Failed to remove dependency" });
        throw err;
      }
    },
    [refetch, toast]
  );

  const fetchCriticalPath = useCallback(async (): Promise<CriticalPathResult | null> => {
    try {
      const res = await apiClient<CriticalPathResult>(`/projects/${projectId}/critical-path`);
      return unwrapResponse(res);
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Failed to fetch critical path" });
      return null;
    }
  }, [projectId, toast]);

  const fetchEvents = useCallback(async (limit = 50, before?: number): Promise<TaskEvent[]> => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set("before", String(before));
      const res = await apiClient<TaskEvent[]>(`/projects/${projectId}/events?${params}`);
      return unwrapResponse(res) || [];
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Failed to fetch events" });
      return [];
    }
  }, [projectId, toast]);

  const columns = statusOrder.map((status) => ({
    id: status,
    title: status.replace("_", " "),
    // `position` is what a reorder writes, so it — not insertion order — has to
    // decide the visual order. The id tiebreak keeps rendering stable while a
    // drag is settling and two cards briefly share a position.
    tasks: Array.from(tasks.values())
      .filter((t) => t.status === status)
      .sort((a, b) => a.position - b.position || a.id - b.id),
  }));

  const pendingReadinessIds = useMemo(() => new Set(pendingReadiness.keys()), [pendingReadiness]);

  return {
    tasks,
    dependencies,
    columns,
    loading,
    error,
    moveTask,
    reorderTask,
    createTask,
    markDependenciesPosted,
    pendingReadinessIds,
    deleteTask,
    fetchDependents,
    createDependency,
    deleteDependency,
    fetchCriticalPath,
    fetchEvents,
    refetch,
  };
}
