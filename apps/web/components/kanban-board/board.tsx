"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState, useCallback, useMemo } from "react";
import type { Task, TaskDependency } from "@repo/types";
import { TaskStatus } from "@repo/types";
import { KanbanColumn } from "@/components/kanban-board/board-column";
import { TaskCard } from "@/components/kanban-board/task-card";
import { useToast } from "@/components/toaster";

const STATUS_RANK: Record<TaskStatus, number> = {
  BACKLOG: 0,
  IN_PROGRESS: 1,
  REVIEW: 2,
  DONE: 3,
};

/**
 * A drop should mean the same thing anywhere over a column's box, not only
 * where a card or the column's centre happens to sit. pointerWithin answers
 * "which column is the pointer inside of" and wins whenever it has an answer;
 * closestCenter stays as the fallback so keyboard drags — which have no
 * pointer — still resolve to a target.
 */
const columnFirstCollision: CollisionDetection = (args) => {
  const columnCollisions = pointerWithin(args).filter((collision) =>
    args.droppableContainers.some(
      (container) => container.id === collision.id && container.data.current?.type === "column"
    )
  );
  if (columnCollisions.length > 0) return columnCollisions;
  return closestCenter(args);
};

interface KanbanBoardProps {
  columns: Array<{ id: TaskStatus; title: string; tasks: Task[] }>;
  dependencies: TaskDependency[];
  criticalTaskIds: number[];
  pendingReadinessIds: Set<number>;
  onMoveTask: (taskId: number, status: TaskStatus, position?: number) => Promise<void>;
  onReorderTask: (taskId: number, newPosition: number, status: TaskStatus) => Promise<void>;
  onTaskClick: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
  onManageDependencies?: (taskId: number) => void;
  onAssign?: (taskId: number, assigneeId: number | null) => void;
  members?: Array<{ id: number; userId: number; name: string; role: string }>;
  loading?: boolean;
  error?: string | null;
}

interface BoardColumn {
  id: TaskStatus;
  tasks: Task[];
}

export type DropAction =
  | { kind: "move"; taskId: number; status: TaskStatus; position: number }
  | { kind: "reorder"; taskId: number; position: number; status: TaskStatus }
  | { kind: "blocked" }
  | { kind: "none" };

/**
 * Decide what a drop means, with no side effects. Kept separate from the drag
 * handlers so the rules are testable without a live drag.
 */
export function resolveDrop(taskId: number, overId: string | number, columns: BoardColumn[]): DropAction {
  const allTasks = columns.flatMap((c) => c.tasks);
  const dragged = allTasks.find((t) => t.id === taskId);
  if (!dragged) return { kind: "none" };

  const targetStatus = Object.values(TaskStatus).find((s) => s === overId);

  let status: TaskStatus;
  let position: number;

  if (targetStatus) {
    // Dropping back into the card's own column is not a move.
    if (dragged.status === targetStatus) return { kind: "none" };
    status = targetStatus;
    position = columns.find((c) => c.id === targetStatus)?.tasks.length ?? 0;
  } else {
    const overTaskId = Number(overId);
    if (!Number.isInteger(overTaskId)) return { kind: "none" };

    const overTask = allTasks.find((t) => t.id === overTaskId);
    if (!overTask) return { kind: "none" };

    if (overTask.status === dragged.status) {
      const column = columns.find((c) => c.id === dragged.status);
      if (!column) return { kind: "none" };

      const activeIndex = column.tasks.findIndex((t) => t.id === taskId);
      const overIndex = column.tasks.findIndex((t) => t.id === overTaskId);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return { kind: "none" };

      return { kind: "reorder", taskId, position: overIndex, status: dragged.status };
    }

    // Dropping onto a card in another column is a move into that column, so a
    // drop lands anywhere over the target box — over a card or over empty
    // space alike — instead of only where the column droppable is closest.
    // The card's own index decides where the move lands, matching the drop
    // point; the position tiebreak stays with the server and the id sort.
    status = overTask.status;
    position = columns.find((c) => c.id === overTask.status)?.tasks.findIndex((t) => t.id === overTaskId) ?? 0;
    if (position === -1) position = 0;
  }

  // A BLOCKED task may not move ahead of its current column while its
  // prerequisites are incomplete. Refusing here keeps the dependency rule
  // legible on the board instead of surfacing as a server rejection after the
  // card has already travelled there. Moving back stays open.
  if (dragged.readiness === "BLOCKED" && STATUS_RANK[status] > STATUS_RANK[dragged.status]) {
    return { kind: "blocked" };
  }

  return { kind: "move", taskId, status, position };
}

interface DropDeps {
  onMoveTask: (taskId: number, status: TaskStatus, position?: number) => Promise<void>;
  onReorderTask: (taskId: number, newPosition: number, status: TaskStatus) => Promise<void>;
  toast: (options: { type: "success" | "error" | "info"; message: string }) => void;
}

/**
 * Carry out a resolved drop. Only the board's own refusals are announced here:
 * useBoard already reports the server's verdict on success and on failure, so
 * reporting either of those again would stack two toasts on one drag.
 */
export async function performDrop(action: DropAction, deps: DropDeps): Promise<void> {
  if (action.kind === "none") return;

  if (action.kind === "blocked") {
    deps.toast({
      type: "error",
      message: "This task is blocked — finish its prerequisites before moving it forward.",
    });
    return;
  }

  try {
    if (action.kind === "move") {
      await deps.onMoveTask(action.taskId, action.status, action.position);
    } else {
      await deps.onReorderTask(action.taskId, action.position, action.status);
    }
  } catch {
    // Intentionally silent: useBoard holds the server's message and has already
    // rolled the card back.
  }
}

export function KanbanBoard({
  columns,
  dependencies,
  criticalTaskIds,
  pendingReadinessIds,
  onMoveTask,
  onReorderTask,
  onTaskClick,
  onDeleteTask,
  onManageDependencies,
  onAssign,
  members,
  loading,
  error,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const { toast } = useToast();

  // Pointer alone left the board unusable without a mouse. dnd-kit's
  // keyboard sensor drives the same onDragEnd path, so a card moves with
  // Space, the arrow keys, and Space again — and announces each step through
  // its live region.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const criticalSet = useMemo(() => new Set(criticalTaskIds), [criticalTaskIds]);
  const activeTask = useMemo(
    () => (activeId === null ? null : columns.flatMap((c) => c.tasks).find((t) => t.id === activeId) ?? null),
    [activeId, columns]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const action = resolveDrop(Number(active.id), over.id, columns);
      await performDrop(action, { onMoveTask, onReorderTask, toast });
    },
    [columns, onMoveTask, onReorderTask, toast]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnFirstCollision}
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
            onManageDependencies={onManageDependencies}
            onAssign={onAssign}
            members={members}
            criticalTaskIds={criticalTaskIds}
            pendingReadinessIds={pendingReadinessIds}
            loading={loading}
            error={error}
          />
        ))}
      </div>

      {activeTask && (
        <DragOverlay>
          <div className="bg-surface-card border border-hairline rounded-md p-3 shadow-md">
            <TaskCard
              task={activeTask}
              isCritical={criticalSet.has(activeTask.id)}
              readinessPending={pendingReadinessIds.has(activeTask.id)}
            />
          </div>
        </DragOverlay>
      )}
    </DndContext>
  );
}
