"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useBoard } from "@/hooks/use-board";
import { KanbanBoard } from "@/components/kanban-board/board";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toaster";
import { useWebSocket } from "@/hooks/use-websocket";
import { AddDependencyModal } from "@/components/kanban-board/add-dependency-modal";
import { CreateTaskModal } from "@/components/kanban-board/create-task-modal";
import { DependencyList } from "@/components/kanban-board/dependency-list";
import { CriticalPathDisplay } from "@/components/critical-path-display";
import { ProjectEvents } from "@/components/project-events";
import type { TaskEventType, Task, CriticalPathResult } from "@repo/types";

export default function BoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: projectIdStr } = use(params);
  const projectId = Number(projectIdStr);
  const {
    tasks,
    columns,
    dependencies,
    loading,
    error,
    moveTask,
    reorderTask,
    createTask,
    deleteTask,
    createDependency,
    deleteDependency,
    refetch,
    fetchCriticalPath,
  } = useBoard(projectId);

  const allTasks = columns.flatMap((c) => c.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const [showDependencyList, setShowDependencyList] = useState(false);
  const [activeTab, setActiveTab] = useState<"board" | "critical-path" | "events">("board");
  const [criticalPath, setCriticalPath] = useState<CriticalPathResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ task: Task; dependents: Task[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const loadCriticalPath = useCallback(async () => {
    const data = await fetchCriticalPath();
    if (data) setCriticalPath(data);
  }, [fetchCriticalPath]);

  useEffect(() => {
    loadCriticalPath();
  }, [loadCriticalPath]);

  const handleWSEvent = useCallback(
    (event: { type: TaskEventType; projectId: number; taskId?: number; payload: Record<string, unknown> }) => {
      const relevantEvents: TaskEventType[] = [
        "TASK_CREATED", "TASK_UPDATED", "TASK_MOVED",
        "TASK_DELETED", "TASK_READY", "TASK_BLOCKED",
        "DEPENDENCY_ADDED", "DEPENDENCY_REMOVED",
        "SCHEDULE_CHANGED", "GRAPH_UPDATED",
      ];

      if (relevantEvents.includes(event.type)) {
        refetch();
        loadCriticalPath();
      }

      switch (event.type) {
        case "AI_SUGGESTION_CREATED":
          toast({ type: "info", message: "AI suggested new dependencies" });
          break;
        case "AI_SUGGESTION_ACCEPTED":
          toast({ type: "success", message: "AI suggestion accepted" });
          break;
        case "AI_SUGGESTION_REJECTED":
          toast({ type: "info", message: "AI suggestion rejected" });
          break;
      }
    },
    [refetch, loadCriticalPath, toast]
  );

  useWebSocket(projectId, handleWSEvent);

  const requestDeleteTask = useCallback(
    (taskId: number) => {
      const task = tasks.get(taskId);
      if (!task) return;

      const dependents = dependencies
        .filter((edge) => edge.prerequisiteTaskId === taskId)
        .map((edge) => tasks.get(edge.dependentTaskId))
        .filter((t): t is Task => Boolean(t));

      setPendingDelete({ task, dependents });
    },
    [tasks, dependencies]
  );

  const confirmDeleteTask = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteTask(pendingDelete.task.id);
      toast({ type: "success", message: `Deleted "${pendingDelete.task.title}"` });
      setPendingDelete(null);
      loadCriticalPath();
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Could not delete the task" });
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deleteTask, loadCriticalPath, toast]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted text-[16px]">Loading board…</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="bg-error/10 border border-error/20 rounded-lg p-6 text-error">{error}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[32px] text-ink">Kanban Board</h1>
            <p className="text-body text-[16px]">Drag tasks between columns. Blocked tasks cannot enter In Progress.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowDependencyList(true)}
              variant="secondary"
            >
              Dependencies
            </Button>
            <Button onClick={() => setShowCreate(true)}>+ New Task</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-hairline">
          {(["board", "critical-path", "events"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === tab
                  ? "bg-surface-card text-ink border-b-2 border-primary"
                  : "text-muted hover:text-ink"
              }`}
            >
              {tab === "board" ? "Board" : tab === "critical-path" ? "Critical Path" : "Activity"}
            </button>
          ))}
        </div>

        {activeTab === "board" && (
          <KanbanBoard
            columns={columns}
            dependencies={dependencies}
            criticalTaskIds={criticalPath?.criticalTaskIds ?? []}
            onMoveTask={moveTask}
            onReorderTask={reorderTask}
            onTaskClick={setSelectedTaskId}
            onDeleteTask={requestDeleteTask}
          />
        )}

        {activeTab === "critical-path" && (
          <CriticalPathDisplay
            projectId={projectId}
            tasks={allTasks}
            dependencies={dependencies}
          />
        )}

        {activeTab === "events" && <ProjectEvents projectId={projectId} />}
      </div>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* New Task Modal */}
      {showCreate && (
        <CreateTaskModal
          tasks={allTasks}
          dependencies={dependencies}
          onClose={() => setShowCreate(false)}
          onCreateTask={createTask}
          onLinkDependency={createDependency}
          onTasksChanged={refetch}
        />
      )}

      {/* Add Dependency Modal */}
      {showDependencyModal && (
        <AddDependencyModal
          tasks={allTasks}
          dependencies={dependencies}
          onClose={() => setShowDependencyModal(false)}
          onAdd={createDependency}
        />
      )}

      {/* Dependency List Modal */}
      {showDependencyList && (
        <DependencyList
          tasks={allTasks}
          dependencies={dependencies}
          onClose={() => setShowDependencyList(false)}
          onDelete={deleteDependency}
          onAdd={() => {
            setShowDependencyList(false);
            setShowDependencyModal(true);
          }}
        />
      )}

      {/* Delete Task Confirmation */}
      {pendingDelete && (
        <DeleteTaskDialog
          task={pendingDelete.task}
          dependents={pendingDelete.dependents}
          deleting={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDeleteTask}
        />
      )}
    </AppLayout>
  );
}

function DeleteTaskDialog({
  task,
  dependents,
  deleting,
  onCancel,
  onConfirm,
}: {
  task: Task;
  dependents: Task[];
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-task-heading" className="bg-surface-card rounded-xl p-6 w-full max-w-md">
        <h2 id="delete-task-heading" className="font-display text-[20px] text-ink">Delete &ldquo;{task.title}&rdquo;?</h2>

        {dependents.length === 0 ? (
          <p className="text-[14px] text-muted mt-2">
            Nothing depends on this task, so deleting it changes no other task.
          </p>
        ) : (
          <>
            <p className="text-[14px] text-muted mt-2">
              {dependents.length === 1 ? "One task is waiting" : `${dependents.length} tasks are waiting`} on it.
              Deleting it removes {dependents.length === 1 ? "that dependency" : "those dependencies"}, and each
              affected task&rsquo;s readiness is recalculated by the graph — not by this dialog.
            </p>
            <ul className="mt-4 space-y-1.5 max-h-48 overflow-y-auto">
              {dependents.map((dependent) => (
                <li
                  key={dependent.id}
                  className="flex items-center gap-2 text-[13px] px-3 py-2 rounded bg-surface-soft"
                >
                  <span className="flex-1 truncate text-ink">{dependent.title}</span>
                  <Badge variant={dependent.readiness === "READY" ? "ready" : "blocked"} className="text-[11px] px-2 py-0.5">
                    {dependent.readiness === "READY" ? "Ready" : "Blocked"}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onCancel} disabled={deleting}>
            Keep task
          </Button>
          <Button onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[20px] text-ink">Task Details</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-body text-[14px]">
          Full detail view:{" "}
          <a href={`/task/${taskId}`} className="text-primary hover:underline">
            Open task page
          </a>
        </p>
      </div>
    </div>
  );
}
