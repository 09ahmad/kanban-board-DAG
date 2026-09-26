"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Task, TaskDependency } from "@repo/types";
import { TaskStatus } from "@repo/types";

export default function TaskDetailPage({ params }: { params: { taskId: string } }) {
  const taskId = Number(params.taskId);
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("BACKLOG");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  const fetchTask = async () => {
    try {
      const res = await apiClient<{ task: Task; prerequisites: TaskDependency[]; dependents: TaskDependency[] }>(
        `/tasks/${taskId}`
      );
      const data = unwrapResponse(res);
      setTask(data.task);
      setTitle(data.task.title);
      setDescription(data.task.description ?? "");
      setStatus(data.task.status);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load task");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, status }),
      });
      setEditing(false);
      await fetchTask();
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted text-[16px]">Loading task…</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !task) {
    return (
      <AppLayout>
        <div className="bg-error/10 border border-error/20 rounded-lg p-6 text-error">
          {error ?? "Task not found"}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            {editing ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="max-w-md"
              />
            ) : (
              <h1 className="font-display text-[32px] text-ink">{task.title}</h1>
            )}
            <div className="flex gap-2">
              <Badge variant={task.readiness === "READY" ? "ready" : "blocked"}>
                {task.readiness}
              </Badge>
              <Badge variant={task.status === "BACKLOG" ? "pill" : task.status === "IN_PROGRESS" ? "in-progress" : task.status === "REVIEW" ? "review" : "done"}>
                {task.status}
              </Badge>
            </div>
          </div>

          <div className="flex gap-2">
            {editing ? (
              <>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            )}
          </div>
        </div>

        {/* Dates & Duration */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Planned Start</p>
            <p className="text-[14px] text-ink font-medium">{task.plannedStart ? new Date(task.plannedStart).toLocaleDateString() : "—"}</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Duration</p>
            <p className="text-[14px] text-ink font-medium">{task.duration ? `${task.duration}d` : "—"}</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Computed Start</p>
            <p className="text-[14px] text-ink font-medium">{task.computedStart ? new Date(task.computedStart).toLocaleDateString() : "—"}</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Computed End</p>
            <p className="text-[14px] text-ink font-medium">{task.computedEnd ? new Date(task.computedEnd).toLocaleDateString() : "—"}</p>
          </div>
        </div>

        {/* Description */}
        <div className="card p-6">
          <h2 className="font-display text-[20px] text-ink mb-3">Description</h2>
          {editing ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Add a description…"
            />
          ) : (
            <p className="text-body text-[16px] leading-[1.55] text-ink/80">
              {task.description || "No description. Click Edit to add one."}
            </p>
          )}
        </div>

        {/* Dependencies — Prerequisites */}
        <div className="space-y-4">
          <h2 className="font-display text-[24px] text-ink">Prerequisites (waiting on)</h2>
          <div className="space-y-3">
            {/* Prerequisites would come from API — placeholder */}
            <p className="text-body text-[14px] text-muted">
              Prerequisites list loads from the graph data.
            </p>
          </div>
        </div>

        {/* Dependencies — Dependents */}
        <div className="space-y-4">
          <h2 className="font-display text-[24px] text-ink">Dependents (waiting on this)</h2>
          <div className="space-y-3">
            {/* Dependents would come from API — placeholder */}
            <p className="text-body text-[14px] text-muted">
              Dependent tasks list loads from the graph data.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}