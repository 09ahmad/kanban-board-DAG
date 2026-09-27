"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/components/toaster";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AddDependencyModal } from "@/components/kanban-board/add-dependency-modal";
import { AiSuggestions } from "@/components/ai-suggestions";
import type { TaskEventType } from "@repo/types";
import { use } from "react";
import { TaskDetailSkeleton } from "@/components/ui/skeleton";

interface GraphData {
  tasks: Task[];
  dependencies: TaskDependency[];
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

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId: taskIdStr } = use(params);
  const taskId = Number(taskIdStr);
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [prerequisites, setPrerequisites] = useState<TaskDependency[]>([]);
  const [dependents, setDependents] = useState<TaskDependency[]>([]);
  const [prereqTasks, setPrereqTasks] = useState<Map<number, Task>>(new Map());
  const [dependentTasks, setDependentTasks] = useState<Map<number, Task>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("BACKLOG");
  const [plannedStart, setPlannedStart] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The dependency being cut, held so the confirmation can name both ends of the
  // edge and say what the removal will do to the dependent.
  const [pendingDepRemoval, setPendingDepRemoval] = useState<{
    id: number;
    prerequisiteTitle: string;
    dependentTitle: string;
    dependentStatus: TaskStatus;
    dependentReadiness: "READY" | "BLOCKED";
  } | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [showDependencyModal, setShowDependencyModal] = useState(false);

  const fetchTask = async () => {
    try {
      const res = await apiClient<Task>(`/tasks/${taskId}`);
      const taskData = unwrapResponse(res);
      setTask(taskData);
      setTitle(taskData.title);
      setDescription(taskData.description ?? "");
      setStatus(taskData.status);
      setPlannedStart(taskData.plannedStart ? new Date(taskData.plannedStart).toISOString().slice(0, 10) : "");
      setDuration(taskData.duration ? String(taskData.duration) : "");

      setError(null);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to load task");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Prerequisites and dependents are derived from the project graph rather than
   * from a task payload, so this is a second request — and it is the only part
   * of the page that the graph can change. Task events leave it alone; a
   * refetching the whole graph on every TASK_MOVED was most of the traffic this
   * page generated.
   */
  useEffect(() => {
    fetchTask();
  }, [taskId]);

  const fetchDependencies = useCallback(async () => {
    if (!task?.projectId) return;
    try {
      const graphRes = await apiClient<GraphData>(`/projects/${task.projectId}/graph`);
      const graphData = unwrapResponse(graphRes);
      const taskMap = new Map(graphData.tasks.map((t) => [t.id, t]));

      const nextPrereqs: TaskDependency[] = [];
      const nextDependents: TaskDependency[] = [];
      const prereqMap = new Map<number, Task>();
      const dependentMap = new Map<number, Task>();
      for (const dep of graphData.dependencies) {
        if (dep.dependentTaskId === taskId) {
          nextPrereqs.push(dep);
          const t = taskMap.get(dep.prerequisiteTaskId);
          if (t) prereqMap.set(t.id, t);
        }
        if (dep.prerequisiteTaskId === taskId) {
          nextDependents.push(dep);
          const t = taskMap.get(dep.dependentTaskId);
          if (t) dependentMap.set(t.id, t);
        }
      }
      setGraph(graphData);
      setPrerequisites(nextPrereqs);
      setDependents(nextDependents);
      setPrereqTasks(prereqMap);
      setDependentTasks(dependentMap);
    } catch {
      // The task itself is already on screen; a failed graph read should not
      // replace it with an error, it just leaves the lists as they were.
    }
  }, [taskId, task?.projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const durationValue = Number.parseInt(duration, 10);
      await apiClient(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          status,
          ...(plannedStart ? { plannedStart } : {}),
          ...(duration && Number.isFinite(durationValue) && durationValue > 0 ? { duration: durationValue } : {}),
        }),
      });
      setEditing(false);
      toast({ type: "success", message: "Task updated" });
      await fetchTask();
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    setDeleting(true);
    setConfirmingDelete(false);
    try {
      await apiClient(`/tasks/${taskId}`, { method: "DELETE" });
      toast({ type: "success", message: "Task deleted" });
      router.push(task?.projectId ? `/board/${task.projectId}` : "/projects");
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Delete failed" });
      setDeleting(false);
    }
  };

  const handleDeleteDependency = async (dependencyId: number) => {
    try {
      await apiClient(`/dependencies/${dependencyId}`, { method: "DELETE" });
      toast({ type: "success", message: "Dependency removed" });
      await fetchTask();
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Failed to remove dependency" });
    }
  };

  /**
   * Adds an edge with this task as the dependent. The engine recomputes
   * readiness and the scheduler, so the answer is whatever the server says —
   * this only relays it. Both halves are re-read because a new prerequisite can
   * change the task's own readiness and the list it is waiting on.
   */
  const handleAddDependency = async (prerequisiteTaskId: number) => {
    const res = await apiClient(`/projects/${task?.projectId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prerequisiteTaskId, dependentTaskId: taskId }),
    });
    unwrapResponse(res);

    toast({ type: "success", message: "Dependency added" });
    await Promise.all([fetchTask(), fetchDependencies()]);
  };

  const handleWSEvent = useCallback((event: { type: TaskEventType; projectId: number; taskId?: number; payload: Record<string, unknown> }) => {
    if (event.taskId !== taskId) return;
    
    switch (event.type) {
      case "TASK_UPDATED":
      case "TASK_MOVED":
      case "TASK_READY":
      case "TASK_BLOCKED":
        // The task moved; the edges around it did not.
        fetchTask();
        break;
      case "DEPENDENCY_ADDED":
      case "DEPENDENCY_REMOVED":
        fetchTask();
        fetchDependencies();
        break;
      case "TASK_DELETED":
        router.push("/projects");
        break;
    }
  }, [taskId, router, fetchTask, fetchDependencies]);

  useEffect(() => {
    void fetchDependencies();
  }, [fetchDependencies]);

  // Only subscribe to WebSocket after task loads and we have projectId
  const projectId = task?.projectId;
  useWebSocket(
    projectId || 0,
    handleWSEvent,
    // Changes made elsewhere while this tab was disconnected arrive as nothing
    // at all, so a reconnect has to re-read the task.
    useCallback(() => {
      void fetchTask();
      void fetchDependencies();
    }, [fetchTask, fetchDependencies])
  );

  if (loading) {
    return (
      <AppLayout>
        <TaskDetailSkeleton />
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
              <>
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Dates & Duration */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Planned Start</p>
            {editing ? (
              <input
                type="date"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                className="input w-full mt-1"
              />
            ) : (
              <p className="text-[14px] text-ink font-medium">{task.plannedStart ? new Date(task.plannedStart).toLocaleDateString() : "—"}</p>
            )}
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Duration</p>
            {editing ? (
              <input
                type="number"
                min="1"
                placeholder="Days"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="input w-full mt-1"
              />
            ) : (
              <p className="text-[14px] text-ink font-medium">{task.duration ? `${task.duration}d` : "—"}</p>
            )}
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
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[24px] text-ink">Prerequisites (waiting on)</h2>
            <Button variant="secondary" size="sm" onClick={() => setShowDependencyModal(true)}>
              Add Dependency
            </Button>
          </div>
          <div className="space-y-3">
            {prerequisites.length === 0 ? (
              <p className="text-body text-[14px] text-muted">
                No prerequisites. This task can start immediately.
              </p>
            ) : (
              prerequisites.map((dep) => {
                const prereqTask = prereqTasks.get(dep.prerequisiteTaskId);
                return (
                  <div key={dep.id} className="card p-4 flex items-center justify-between">
                    <Link href={`/task/${dep.prerequisiteTaskId}`} className="flex items-center gap-4 min-w-0 flex-1 group/prereq">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-medium text-sm">
                        {prereqTask ? prereqTask.title.charAt(0).toUpperCase() : dep.prerequisiteTaskId}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-ink truncate group-hover/prereq:text-primary transition-colors">
                          {prereqTask ? prereqTask.title : `Task #${dep.prerequisiteTaskId}`}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {prereqTask && (
                            <>
                              <Badge variant={getStatusBadgeVariant(prereqTask.status)}>
                                {getStatusLabel(prereqTask.status)}
                              </Badge>
                              <Badge variant={getReadinessBadgeVariant(prereqTask.readiness)}>
                                {prereqTask.readiness}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="pill">{prereqTask?.readiness ?? "Waiting"}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPendingDepRemoval({
                            id: dep.id,
                            prerequisiteTitle: prereqTask?.title ?? "This task",
                            dependentTitle: task.title,
                            dependentStatus: task.status,
                            dependentReadiness: task.readiness,
                          })
                        }
                        className="text-error hover:text-error"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Dependencies — Dependents */}
        <div className="space-y-4">
          <h2 className="font-display text-[24px] text-ink">Dependents (waiting on this)</h2>
          <div className="space-y-3">
            {dependents.length === 0 ? (
              <p className="text-body text-[14px] text-muted">
                No dependents. No tasks are waiting on this one.
              </p>
            ) : (
              dependents.map((dep) => {
                const dependentTask = dependentTasks.get(dep.dependentTaskId);
                return (
                  <div key={dep.id} className="card p-4 flex items-center justify-between">
                    <Link href={`/task/${dep.dependentTaskId}`} className="flex items-center gap-4 min-w-0 flex-1 group/dependent">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-medium text-sm">
                        {dependentTask ? dependentTask.title.charAt(0).toUpperCase() : dep.dependentTaskId}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-ink truncate group-hover/dependent:text-primary transition-colors">
                          {dependentTask ? dependentTask.title : `Task #${dep.dependentTaskId}`}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {dependentTask && (
                            <>
                              <Badge variant={getStatusBadgeVariant(dependentTask.status)}>
                                {getStatusLabel(dependentTask.status)}
                              </Badge>
                              <Badge variant={getReadinessBadgeVariant(dependentTask.readiness)}>
                                {dependentTask.readiness}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="pill">{dependentTask?.readiness ?? "Waiting"}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPendingDepRemoval({
                            id: dep.id,
                            prerequisiteTitle: task.title,
                            dependentTitle: dependentTask?.title ?? "This task",
                            dependentStatus: dependentTask?.status ?? "BACKLOG",
                            dependentReadiness: dependentTask?.readiness ?? "READY",
                          })
                        }
                        className="text-error hover:text-error"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AI dependency suggestions for this task */}
        <div className="space-y-4">
          <h2 className="font-display text-[24px] text-ink">AI Suggestions</h2>
          <AiSuggestions projectId={task.projectId} taskId={taskId} />
        </div>
      </div>

      {showDependencyModal && graph && (
        <AddDependencyModal
          tasks={graph.tasks}
          dependencies={graph.dependencies}
          defaultDependentTaskId={taskId}
          onClose={() => setShowDependencyModal(false)}
          onAdd={handleAddDependency}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this task?"
        body={
          dependents.length > 0
            ? `${dependents.length} task${dependents.length === 1 ? "" : "s"} depend${dependents.length === 1 ? "s" : ""} on it. Deleting it removes those links, and anything downstream becomes unblocked.`
            : "This cannot be undone."
        }
        confirmLabel="Delete task"
        busy={deleting}
        onConfirm={handleDeleteTask}
        onCancel={() => setConfirmingDelete(false)}
      />

      <ConfirmDialog
        open={pendingDepRemoval !== null}
        title="Remove this dependency?"
        body={
          pendingDepRemoval
            ? pendingDepRemoval.dependentReadiness === "BLOCKED"
              ? `“${pendingDepRemoval.dependentTitle}” is waiting on “${pendingDepRemoval.prerequisiteTitle}”. Removing this will unblock it.`
              : `“${pendingDepRemoval.dependentTitle}” is no longer held back by “${pendingDepRemoval.prerequisiteTitle}”. ` +
                (pendingDepRemoval.dependentStatus === "DONE"
                  ? "Its history is kept."
                  : "Work on it can start whenever it is otherwise clear.")
            : ""
        }
        confirmLabel="Remove dependency"
        onConfirm={() => {
          if (!pendingDepRemoval) return;
          const id = pendingDepRemoval.id;
          setPendingDepRemoval(null);
          void handleDeleteDependency(id);
        }}
        onCancel={() => setPendingDepRemoval(null)}
      />
    </AppLayout>
  );
}
