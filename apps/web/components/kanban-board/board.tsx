"use client";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { useState, useCallback, useMemo } from "react";
import type { Task, TaskDependency } from "@repo/types";
import { TaskStatus } from "@repo/types";
import { KanbanColumn } from "@/components/kanban-board/board-column";
import { TaskCard } from "@/components/kanban-board/task-card";
import { useToast } from "@/components/toaster";

interface KanbanBoardProps {
  columns: Array<{ id: TaskStatus; title: string; tasks: Task[] }>;
  dependencies: TaskDependency[];
  criticalTaskIds: number[];
  onMoveTask: (taskId: number, status: TaskStatus, position?: number) => Promise<void>;
  onReorderTask: (taskId: number, newPosition: number, status: TaskStatus) => Promise<void>;
  onTaskClick: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
}

export function KanbanBoard({
  columns,
  dependencies,
  criticalTaskIds,
  onMoveTask,
  onReorderTask,
  onTaskClick,
  onDeleteTask,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const criticalSet = useMemo(() => new Set(criticalTaskIds), [criticalTaskIds]);
  const activeTask = useMemo(
    () => (activeId === null ? null : columns.flatMap((c) => c.tasks).find((t) => t.id === activeId) ?? null),
    [activeId, columns]
  );

  const handleDragStart = useCallback((event: any) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    async (event: any) => {
      setActiveId(null);
      const { active, over } = event;

      if (!over) return;

      const taskId = Number(active.id);
      const overId = over.id;

      const targetStatus = Object.values(TaskStatus).find((s) => s === overId);
      const targetTaskId = targetStatus ? null : Number(overId);

      if (targetStatus) {
        const column = columns.find((c) => c.id === targetStatus);
        const targetPosition = column?.tasks.length ?? 0;

        try {
          await onMoveTask(taskId, targetStatus, targetPosition);
          toast({ type: "success", message: `Task moved to ${targetStatus.replace("_", " ")}` });
        } catch (err: any) {
          toast({ type: "error", message: err?.error?.message ?? "Move failed" });
        }
        return;
      }

      if (targetTaskId) {
        const activeTask = columns.flatMap((c) => c.tasks).find((t) => t.id === taskId);
        const overTask = columns.flatMap((c) => c.tasks).find((t) => t.id === targetTaskId);

        if (!activeTask || !overTask || activeTask.status !== overTask.status) return;

        const currentColumn = columns.find((c) => c.id === activeTask.status);
        if (!currentColumn) return;

        const activeIndex = currentColumn.tasks.findIndex((t) => t.id === taskId);
        const overIndex = currentColumn.tasks.findIndex((t) => t.id === targetTaskId);

        if (activeIndex === -1 || overIndex === -1) return;

        try {
          await onReorderTask(taskId, overIndex, activeTask.status);
          toast({ type: "success", message: "Task reordered" });
        } catch (err: any) {
          toast({ type: "error", message: err?.error?.message ?? "Reorder failed" });
        }
      }
    },
    [columns, onMoveTask, onReorderTask, toast]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            tasks={col.tasks}
            onTaskClick={onTaskClick}
            onDeleteTask={onDeleteTask}
            criticalTaskIds={criticalTaskIds}
          />
        ))}
      </div>

      {activeTask && (
        <DragOverlay>
          <div className="bg-surface-card border border-hairline rounded-md p-3 shadow-md">
            <TaskCard task={activeTask} isCritical={criticalSet.has(activeTask.id)} />
          </div>
        </DragOverlay>
      )}
    </DndContext>
  );
}
