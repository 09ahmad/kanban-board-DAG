import { useState, useEffect, useCallback } from "react";
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

interface UseBoardReturn {
  tasks: Map<number, Task>;
  dependencies: TaskDependency[];
  columns: BoardColumnData[];
  loading: boolean;
  error: string | null;
  moveTask: (taskId: number, status: TaskStatus, position?: number) => Promise<void>;
  reorderTask: (taskId: number, newPosition: number, status: TaskStatus) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  deleteTask: (taskId: number) => Promise<void>;
  createDependency: (prerequisiteTaskId: number, dependentTaskId: number) => Promise<void>;
  deleteDependency: (dependencyId: number) => Promise<void>;
  fetchCriticalPath: () => Promise<CriticalPathResult | null>;
  fetchEvents: (limit?: number, before?: number) => Promise<TaskEvent[]>;
  refetch: () => Promise<void>;
}

const statusOrder: TaskStatus[] = ["BACKLOG", "IN_PROGRESS", "REVIEW", "DONE"];

export function useBoard(projectId: number): UseBoardReturn {
  const [tasks, setTasks] = useState<Map<number, Task>>(new Map());
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient<{ tasks: Task[]; dependencies: TaskDependency[] }>(
        `/projects/${projectId}/graph`
      );
      const data = unwrapResponse(res);
      const taskMap = new Map<number, Task>();
      data.tasks.forEach((t) => taskMap.set(t.id, t));
      setTasks(taskMap);
      setDependencies(data.dependencies);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const moveTask = useCallback(
    async (taskId: number, status: TaskStatus, position?: number) => {
      setTasks((prev) => {
        const next = new Map(prev);
        const task = next.get(taskId);
        if (task) {
          next.set(taskId, { ...task, status, position: position ?? task.position });
        }
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
          const next = new Map(prev);
          const task = next.get(taskId);
          if (task) {
            next.set(taskId, { ...task, status: task.status });
          }
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
      setTasks((prev) => {
        const next = new Map(prev);
        const task = next.get(taskId);
        if (task) {
          next.set(taskId, { ...task, position: newPosition });
        }
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
          const next = new Map(prev);
          const task = next.get(taskId);
          if (task) {
            next.set(taskId, { ...task, position: task.position });
          }
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
      return unwrapResponse(res);
    },
    [projectId]
  );

  const deleteTask = useCallback(
    async (taskId: number) => {
      await apiClient(`/tasks/${taskId}`, { method: "DELETE" });
      await refetch();
    },
    [refetch]
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
        await refetch();
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
    tasks: Array.from(tasks.values()).filter((t) => t.status === status),
  }));

  return { tasks, dependencies, columns, loading, error, moveTask, reorderTask, createTask, deleteTask, createDependency, deleteDependency, fetchCriticalPath, fetchEvents, refetch };
}
