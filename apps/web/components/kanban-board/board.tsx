"use client";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { Task, TaskDependency } from "@repo/types";
import { TaskStatus } from "@repo/types";
import { KanbanColumn } from "@/components/kanban-board/board-column";
import { TaskCard } from "@/components/kanban-board/task-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toaster";
import { cn } from "@/lib/utils";

interface KanbanBoardProps {
  projectId: number;
  initialTasks: Task[];
  initialDependencies: TaskDependency[];
  onMoveTask: (taskId: number, status: TaskStatus) => Promise<void>;
  onTaskClick: (taskId: number) => void;
}

export function KanbanBoard({ projectId, initialTasks, initialDependencies, onMoveTask, onTaskClick }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Map<number, Task>>(new Map(initialTasks.map(t => [t.id, t])));
  const [dependencies] = useState<TaskDependency[]>(initialDependencies);
  const [activeId, setActiveId] = useState<number | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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

      // Determine if dropped on a column or another task
      const targetStatus = Object.values(TaskStatus).find((s) => s === overId) ||
        (tasks.get(Number(overId))?.status as TaskStatus);

      if (!targetStatus) return;

      // Guard: blocked tasks cannot be moved to IN_PROGRESS
      const task = tasks.get(taskId);
      if (task?.readiness === "BLOCKED" && targetStatus === "IN_PROGRESS") {
        toast({ type: "error", message: "This task is blocked. Resolve dependencies first." });
        return;
      }

      try {
        await onMoveTask(taskId, targetStatus);
        toast({ type: "success", message: `Task moved to ${targetStatus.replace("_", " ")}` });
      } catch (err: any) {
        toast({ type: "error", message: err?.error?.message ?? "Move failed" });
      }
    },
    [tasks, onMoveTask, toast]
  );

  const statusOrder: TaskStatus[] = ["BACKLOG", "IN_PROGRESS", "REVIEW", "DONE"];
  const columns = statusOrder.map((status) => ({
    id: status,
    title: status.replace("_", " "),
    tasks: Array.from(tasks.values()).filter((t) => t.status === status),
  }));

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
          />
        ))}
      </div>

      {activeId && (
        <DragOverlay>
          {tasks.get(activeId) ? (
            <div className="bg-surface-card border border-hairline rounded-md p-3 shadow-md">
              <TaskCard task={tasks.get(activeId)!} />
            </div>
          ) : null}
        </DragOverlay>
      )}
    </DndContext>
  );
}