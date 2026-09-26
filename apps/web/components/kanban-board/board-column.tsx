import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@repo/types";
import { TaskCard } from "@/components/kanban-board/task-card";

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskClick: (taskId: number) => void;
}

export function KanbanColumn({
  id,
  title,
  tasks,
  isOverlay,
  onTaskClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", status: id },
  });

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
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="h-24 rounded-lg border-2 border-dashed border-hairline flex items-center justify-center">
            <p className="text-muted text-[13px]">Drop tasks here</p>
          </div>
        )}
      </div>
    </div>
  );
}