"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@repo/types";
import { SortableTaskCard } from "@/components/kanban-board/task-card";

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskClick: (taskId: number) => void;
  onDeleteTask?: (taskId: number) => void;
  onManageDependencies?: (taskId: number) => void;
  criticalTaskIds: number[];
  pendingReadinessIds: Set<number>;
  loading?: boolean;
  error?: string | null;
}

export function KanbanColumn({
  id,
  title,
  tasks,
  isOverlay,
  onTaskClick,
  onDeleteTask,
  onManageDependencies,
  criticalTaskIds,
  pendingReadinessIds,
  loading,
  error,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", status: id },
  });

  const criticalSet = new Set(criticalTaskIds);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-w-[280px] max-w-[360px] bg-surface-soft rounded-xl p-4 border border-hairline transition-colors",
        isOver && "bg-surface-card border-primary/30",
        isOverlay && "opacity-80 shadow-lg"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-body text-[14px] font-medium text-ink uppercase tracking-wide">
          {title}
        </h3>
        <span className="badge bg-surface-card text-muted text-[12px]">
          {tasks.length}
        </span>
      </div>

      <div className="space-y-3 min-h-[120px]">
        {error ? (
          <div className="bg-error/10 border border-error/20 rounded-lg p-3 text-error text-[13px]">
            {error}
          </div>
        ) : loading ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-[52px] rounded-md bg-surface-card animate-pulse" />
            <div className="h-[52px] rounded-md bg-surface-card animate-pulse opacity-70" />
          </div>
        ) : (
          <>
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task.id)}
                  onDeleteTask={onDeleteTask}
                  isCritical={criticalSet.has(task.id)}
                  columnId={id}
                  readinessPending={pendingReadinessIds.has(task.id)}
                />
              ))}
            </SortableContext>

            {tasks.length === 0 && (
              <div className="h-24 rounded-lg border-2 border-dashed border-hairline flex items-center justify-center">
                <p className="text-muted text-[13px]">Drop tasks here</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}