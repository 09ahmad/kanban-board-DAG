"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useBoard } from "@/hooks/use-board";
import { KanbanBoard } from "@/components/kanban-board/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toaster";

export default function BoardPage({ params }: { params: { projectId: string } }) {
  const projectId = Number(params.projectId);
  const { columns, loading, error, moveTask, createTask, deleteTask, refetch } = useBoard(projectId);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const allTasks = Array.from(columns.flatMap((c) => c.tasks));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreating(true);
    try {
      await createTask(projectId, newTaskTitle.trim());
      toast({ type: "success", message: "Task created" });
      setNewTaskTitle("");
      setShowCreate(false);
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Create failed" });
    } finally {
      setCreating(false);
    }
  };

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
          <Button onClick={() => setShowCreate(true)}>Add task</Button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-surface-card rounded-xl p-4 border border-hairline">
            <Input
              label="Task title"
              placeholder="What needs to be done?"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 mt-3">
              <Button type="submit" disabled={creating || !newTaskTitle.trim()}>
                {creating ? "Adding…" : "Add task"}
              </Button>
              <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        <KanbanBoard
          projectId={projectId}
          initialTasks={allTasks}
          initialDependencies={[]}
          onMoveTask={moveTask}
          onTaskClick={setSelectedTaskId}
        />
      </div>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          projectId={projectId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </AppLayout>
  );
}

function TaskDetailModal({ taskId, projectId, onClose }: { taskId: number; projectId: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[20px] text-ink">Task Details</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-body text-[14px]">Full detail view: <a href={`/task/${taskId}`} className="text-primary hover:underline">Open task page</a></p>
        <div className="mt-4 flex gap-2">
          <Badge variant="ready">Open full page</Badge>
        </div>
      </div>
    </div>
  );
}