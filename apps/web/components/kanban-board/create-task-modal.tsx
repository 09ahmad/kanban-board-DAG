"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskDependency, CreateTaskInput } from "@repo/types";

interface CreateTaskModalProps {
  tasks: Task[];
  dependencies: TaskDependency[];
  onClose: () => void;
  onCreateTask: (input: CreateTaskInput) => Promise<Task>;
  onLinkDependency: (prerequisiteTaskId: number, dependentTaskId: number) => Promise<void>;
  onTasksChanged: () => Promise<void> | void;
}

type LinkState = "linking" | "linked" | "failed";

function getStatusLabel(status: TaskStatus): string {
  return status.replace("_", " ");
}

function getStatusBadgeVariant(status: TaskStatus): "pill" | "in-progress" | "review" | "done" {
  switch (status) {
    case "BACKLOG":
      return "pill";
    case "IN_PROGRESS":
      return "in-progress";
    case "REVIEW":
      return "review";
    case "DONE":
      return "done";
  }
}

export function CreateTaskModal({
  tasks,
  dependencies,
  onClose,
  onCreateTask,
  onLinkDependency,
  onTasksChanged,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [duration, setDuration] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [linkStates, setLinkStates] = useState<Record<number, LinkState>>({});
  const [linkErrors, setLinkErrors] = useState<Record<number, string>>({});
  const [createdTask, setCreatedTask] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) => task.title.toLowerCase().includes(query));
  }, [tasks, search]);

  const blockedByCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const edge of dependencies) {
      counts.set(edge.dependentTaskId, (counts.get(edge.dependentTaskId) ?? 0) + 1);
    }
    return counts;
  }, [dependencies]);

  const durationValue = Number.parseInt(duration, 10);
  const durationValid = Number.isFinite(durationValue) && durationValue > 0;
  const canSubmit = title.trim().length > 0 && durationValid && !submitting;

  const toggleTask = (taskId: number) => {
    setSelectedIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
    setLinkStates((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setLinkErrors((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const linkPrerequisites = async (dependentId: number, prerequisiteIds: number[]) => {
    for (const prerequisiteId of prerequisiteIds) {
      setLinkStates((prev) => ({ ...prev, [prerequisiteId]: "linking" }));
      try {
        await onLinkDependency(prerequisiteId, dependentId);
        setLinkStates((prev) => ({ ...prev, [prerequisiteId]: "linked" }));
      } catch (err: any) {
        setLinkStates((prev) => ({ ...prev, [prerequisiteId]: "failed" }));
        setLinkErrors((prev) => ({
          ...prev,
          [prerequisiteId]: err?.error?.message ?? err?.message ?? "Could not add this dependency",
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      let task = createdTask;

      if (!task) {
        task = await onCreateTask({
          title: title.trim(),
          description: description.trim() || undefined,
          plannedStart: plannedStart || null,
          duration: durationValue,
        });
        setCreatedTask(task);
      }

      if (selectedIds.length > 0) {
        await linkPrerequisites(task.id, selectedIds);
      }

      await onTasksChanged();
    } catch (err: any) {
      setError(err?.error?.message ?? err?.message ?? "Could not create the task");
    } finally {
      setSubmitting(false);
    }
  };

  const failedIds = selectedIds.filter((id) => linkStates[id] === "failed");
  const allSettled = createdTask !== null && selectedIds.every((id) => linkStates[id] !== undefined && linkStates[id] !== "linking");

  if (createdTask && allSettled) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-surface-card rounded-xl p-6 w-full max-w-lg">
          <h2 className="font-display text-[20px] text-ink">Task created</h2>
          <p className="text-[14px] text-muted mt-1">
            &ldquo;{createdTask.title}&rdquo; is in the backlog. Its readiness is set by the dependency
            graph, not by you.
          </p>

          {selectedIds.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {selectedIds.map((id) => {
                const task = tasks.find((t) => t.id === id);
                const state = linkStates[id];
                return (
                  <li key={id} className="flex items-center gap-2 text-[13px]">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full flex-shrink-0",
                        state === "linked" ? "bg-ready" : "bg-blocked"
                      )}
                    />
                    <span className="flex-1 truncate text-ink">{task?.title ?? `Task ${id}`}</span>
                    <span className={state === "linked" ? "text-ready" : "text-blocked"}>
                      {state === "linked" ? "linked" : "not linked"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {failedIds.length > 0 && (
            <p className="mt-4 text-[13px] text-blocked">
              {failedIds.length === 1 ? "One dependency was not" : `${failedIds.length} dependencies were not`} added.
              The task was still created — open Dependencies to retry.
            </p>
          )}

          <div className="flex justify-end mt-6">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-[20px] text-ink">New task</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="text-muted hover:text-ink disabled:opacity-40"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-[14px] text-muted mb-5">
          New tasks land in the backlog. Whether they can start is decided by their dependencies.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="bg-error/10 border border-error/20 rounded-lg p-3 text-error text-[14px]">
              {error}
            </div>
          )}

          <Input
            label="Title"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            disabled={submitting}
          />

          <Textarea
            label="Description"
            placeholder="Optional detail"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={submitting}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Planned start"
              type="date"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
              disabled={submitting}
            />
            <Input
              label="Duration (working days)"
              type="number"
              min="1"
              placeholder="5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
              disabled={submitting}
              error={duration && !durationValid ? "Enter a whole number of days" : undefined}
            />
          </div>

          <div className="space-y-2 pt-2">
            <label className="block text-sm font-medium text-ink">Depends on</label>
            <p className="text-[13px] text-muted">
              This task stays blocked until every task you pick here is done.
            </p>

            {tasks.length === 0 ? (
              <p className="text-[13px] text-muted">
                This project has no other tasks yet, so there is nothing to depend on.
              </p>
            ) : (
              <>
                <Input
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={submitting}
                />

                {selectedIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedIds.map((id) => {
                      const task = tasks.find((t) => t.id === id);
                      const state = linkStates[id];
                      return (
                        <span
                          key={id}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px]",
                            state === "failed"
                              ? "bg-error/10 text-blocked"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {task?.title ?? `Task ${id}`}
                          {state === "linking" && <span className="text-muted">calculating…</span>}
                          {state === "failed" && <span title={linkErrors[id]}>not linked</span>}
                        </span>
                      );
                    })}
                  </div>
                )}

                <ul className="max-h-56 overflow-y-auto rounded-md border border-hairline divide-y divide-hairline">
                  {filteredTasks.length === 0 && (
                    <li className="px-3 py-3 text-[13px] text-muted">No task matches &ldquo;{search}&rdquo;.</li>
                  )}
                  {filteredTasks.map((task) => {
                    const selected = selectedIds.includes(task.id);
                    return (
                      <li key={task.id}>
                        <label
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 cursor-pointer",
                            selected ? "bg-primary/5" : "hover:bg-surface-soft"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTask(task.id)}
                            disabled={submitting}
                            className="w-4 h-4 accent-[var(--color-primary)]"
                          />
                          <span className="flex-1 min-w-0 truncate text-[14px] text-ink">{task.title}</span>
                          <Badge variant={getStatusBadgeVariant(task.status)} className="text-[11px] px-2 py-0.5">
                            {getStatusLabel(task.status)}
                          </Badge>
                          <Badge variant={task.readiness === "READY" ? "ready" : "blocked"} className="text-[11px] px-2 py-0.5">
                            {task.readiness === "READY"
                              ? "Ready"
                              : `Blocked by ${blockedByCount.get(task.id) ?? 0} ${
                                  (blockedByCount.get(task.id) ?? 0) === 1 ? "task" : "tasks"
                                }`}
                          </Badge>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-hairline">
            <Button type="submit" disabled={!canSubmit} className="flex-1">
              {submitting ? "Creating…" : "Create task"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
