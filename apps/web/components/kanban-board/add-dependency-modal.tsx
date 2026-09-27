"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Task, TaskDependency, TaskStatus } from "@repo/types";
import { TaskStatus as TaskStatusEnum } from "@repo/types";

interface AddDependencyModalProps {
  tasks: Task[];
  dependencies: TaskDependency[];
  onClose: () => void;
  onAdd: (prerequisiteTaskId: number, dependentTaskId: number) => Promise<void>;
  /**
   * Pre-fills the dependent side. Opened from a task's own page the dependent
   * is never in question — it is the task you are looking at — so making the
   * user re-pick what they just clicked on is noise.
   */
  defaultDependentTaskId?: number;
}

function getStatusLabel(status: TaskStatus): string {
  return status.replace("_", " ");
}

function getStatusBadgeVariant(status: TaskStatus): "pill" | "in-progress" | "review" | "done" {
  switch (status) {
    case "BACKLOG": return "pill";
    case "IN_PROGRESS": return "in-progress";
    case "REVIEW": return "review";
    case "DONE": return "done";
    default: return "pill";
  }
}

function getReadinessBadgeVariant(readiness: "READY" | "BLOCKED"): "ready" | "blocked" {
  return readiness === "READY" ? "ready" : "blocked";
}

export function AddDependencyModal({
  tasks,
  dependencies,
  onClose,
  onAdd,
  defaultDependentTaskId,
}: AddDependencyModalProps) {
  const [prerequisiteTaskId, setPrerequisiteTaskId] = useState<number | "" >("");
  const [dependentTaskId, setDependentTaskId] = useState<number | "" >(
    defaultDependentTaskId ?? ""
  );
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingPairs = new Set(
    dependencies.map((d) => `${d.prerequisiteTaskId}-${d.dependentTaskId}`)
  );

  const isInvalidPair = useCallback(() => {
    if (!prerequisiteTaskId || !dependentTaskId) return true;
    if (prerequisiteTaskId === dependentTaskId) return true;
    if (existingPairs.has(`${prerequisiteTaskId}-${dependentTaskId}`)) return true;
    return false;
  }, [prerequisiteTaskId, dependentTaskId, existingPairs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidPair()) return;
    setAdding(true);
    setError(null);
    try {
      await onAdd(Number(prerequisiteTaskId), Number(dependentTaskId));
      onClose();
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to add dependency");
    } finally {
      setAdding(false);
    }
  };

  const taskOptions = tasks.map((task) => (
    <option key={task.id} value={task.id}>
      {task.title} ({getStatusLabel(task.status)}) {task.readiness === "BLOCKED" && "🚫"}
    </option>
  ));

  const prerequisiteTask = tasks.find((t) => t.id === prerequisiteTaskId);
  const dependentTask = tasks.find((t) => t.id === dependentTaskId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[20px] text-ink">Add Dependency</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-body text-[14px] text-muted mb-6">
          The prerequisite task must be <strong>DONE</strong> before the dependent task becomes <strong>READY</strong>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/20 rounded-lg p-3 text-error text-[14px]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Prerequisite Task (must complete first)
            </label>
            <select
              value={prerequisiteTaskId}
              onChange={(e) => setPrerequisiteTaskId(e.target.value === "" ? "" : Number(e.target.value))}
              className="input w-full"
              required
            >
              <option value="">Select a task…</option>
              {taskOptions}
            </select>
          </div>

          <div className="flex items-center my-2 text-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Dependent Task (waits for prerequisite)
            </label>
            <select
              value={dependentTaskId}
              onChange={(e) => setDependentTaskId(e.target.value === "" ? "" : Number(e.target.value))}
              className="input w-full"
              required
            >
              <option value="">Select a task…</option>
              {taskOptions}
            </select>
          </div>

          {(prerequisiteTask || dependentTask) && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface-soft rounded-lg">
              {prerequisiteTask && (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted uppercase tracking-wide">Prerequisite</p>
                  <p className="font-medium text-ink">{prerequisiteTask.title}</p>
                  <div className="flex gap-1.5">
                    <Badge variant={getStatusBadgeVariant(prerequisiteTask.status)}>
                      {getStatusLabel(prerequisiteTask.status)}
                    </Badge>
                    <Badge variant={getReadinessBadgeVariant(prerequisiteTask.readiness)}>
                      {prerequisiteTask.readiness}
                    </Badge>
                  </div>
                </div>
              )}
              {dependentTask && (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted uppercase tracking-wide">Dependent</p>
                  <p className="font-medium text-ink">{dependentTask.title}</p>
                  <div className="flex gap-1.5">
                    <Badge variant={getStatusBadgeVariant(dependentTask.status)}>
                      {getStatusLabel(dependentTask.status)}
                    </Badge>
                    <Badge variant={getReadinessBadgeVariant(dependentTask.readiness)}>
                      {dependentTask.readiness}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <Button type="submit" disabled={adding || isInvalidPair()}>
              {adding ? "Adding…" : "Add Dependency"}
            </Button>
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
