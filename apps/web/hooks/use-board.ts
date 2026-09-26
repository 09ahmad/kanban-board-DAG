import { useState, useEffect, useCallback } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { useToast } from "@/components/toaster";
import type { Task, TaskDependency } from "@repo/types";
import { TaskStatus } from "@repo/types";

interface BoardColumnData {
  id: TaskStatus;
  title: string;
  tasks: Task[];
}

interface UseBoardReturn {
  tasks: Map<number, Task>;
  dependencies: TaskDependency[];
  columns: BoardColumnData[];
  loading: boolean;
  error: string | null;
  moveTask: (taskId: number, status: TaskStatus) => Promise<void>;
  createTask: (projectId: number, title: string) => Promise<Task>;
  deleteTask: (taskId: number) => Promise<void>;
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
    async (taskId: number, status: TaskStatus) => {
      setTasks((prev) => {
        const next = new Map(prev);
        const task = next.get(taskId);
        if (task) {
          next.set(taskId, { ...task, status });
        }
        return next;
      });

      try {
        await apiClient(`/tasks/${taskId}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
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
        toast({ type: "error", message: err?.message ?? "Move failed" });
        throw err;
      }
    },
    [toast]
  );

  const createTask = useCallback(
    async (pid: number, title: string) => {
      const res = await apiClient<Task>(`/projects/${pid}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = unwrapResponse(res);
      await refetch();
      return data;
    },
    [refetch]
  );

  const deleteTask = useCallback(
    async (taskId: number) => {
      await apiClient(`/tasks/${taskId}`, { method: "DELETE" });
      await refetch();
    },
    [refetch]
  );

  const columns = statusOrder.map((status) => ({
    id: status,
    title: status.replace("_", " "),
    tasks: Array.from(tasks.values()).filter((t) => t.status === status),
  }));

  return { tasks, dependencies, columns, loading, error, moveTask, createTask, deleteTask, refetch };
}