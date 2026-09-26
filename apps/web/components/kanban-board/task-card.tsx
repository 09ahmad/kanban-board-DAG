import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";
import type { Task, TaskStatus, ReadinessState } from "@repo/types";

interface TaskCardProps {
  task: Task;
  onClick?: (taskId: number) => void;
  columnId?: TaskStatus;
}

function getStatusColor(status: TaskStatus, readiness: ReadinessState): string {
  const baseColors: Record<TaskStatus, string> = {
    BACKLOG: "#e6dfd8",
    IN_PROGRESS: "#eef2ff",
    REVIEW: "#fef3c7",
    DONE: "#d1fae5",
  };
  const readinessOverrides: Record<ReadinessState, string> = {
    BLOCKED: "#fecaca",
    READY: "#bbf7d0",
  };

  const statusColor = baseColors[status] || "#e6dfd8";
  const readinessOverride = readinessOverrides[readiness];
  return readinessOverride ? readinessOverride : statusColor;
}

export function TaskCard({ task, onClick, columnId }: TaskCardProps) {
  const readinessColor = getStatusColor(task.status, task.readiness);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-md cursor-pointer",
        "border border-transparent hover:border-primary/20 transition-colors",
        "hover:bg-surface-card",
        columnId && task.readiness === "BLOCKED" && "cursor-not-allowed hover:bg-transparent",
        task.readiness === "BLOCKED" && columnId === "IN_PROGRESS" && "opacity-50",
        task.readiness === "READY" && "ring-1 ring-primary/20"
      )}
      role="button"
      tabIndex={0}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e: MouseEvent<HTMLDivElement>) => onClick?.(task.id)}
      onKeyDown={(e) => e.key === "Enter" && onClick?.(task.id)}
    >
      {/* Status readiness dot */}
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: readinessColor }} />

      {/* Task title */}
      <span className="flex-1 text-[13px] font-medium text-ink overflow-hidden whitespace-nowrap tooltip">
        {task.title}
        {task.description && (
          <span className="text-xs text-muted ml-1">• {task.description}</span>
        )}
      </span>

      {/* Status badge */}
      <span className="w-[48px] text-[10px] font-medium text-muted flex items-center justify-center">
        {task.status}
      </span>

      {/* Readiness indicator */}
      {task.readiness === "BLOCKED" && (
        <span className="w-2 h-2 rounded-full bg-blocked absolute -right-1.5 -top-1.5" />
      )}

      {task.readiness === "READY" && (
        <span className="w-2 h-2 rounded-full bg-success absolute -right-1.5 -top-1.5" />
      )}
    </div>
  );
}