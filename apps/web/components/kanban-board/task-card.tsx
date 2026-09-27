"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, ReadinessState } from "@repo/types";

interface TaskCardProps {
  task: Task;
  onClick?: (taskId: number) => void;
  onDeleteTask?: (taskId: number) => void;
  columnId?: TaskStatus;
  isCritical?: boolean;
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

export function TaskCard({ task, onClick, onDeleteTask, columnId, isCritical }: TaskCardProps) {
  const readinessColor = getStatusColor(task.status, task.readiness);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-md cursor-pointer relative group",
        "border border-transparent hover:border-primary/20 transition-colors",
        "hover:bg-surface-card",
        columnId && task.readiness === "BLOCKED" && "cursor-not-allowed hover:bg-transparent",
        task.readiness === "BLOCKED" && columnId === "IN_PROGRESS" && "opacity-50",
        task.readiness === "READY" && "ring-1 ring-primary/20",
        isCritical && "ring-2 ring-primary ring-offset-2 ring-offset-surface-soft"
      )}
      role="button"
      tabIndex={0}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onClick?.(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(task.id);
        }
      }}
    >
      {/* Critical path indicator - top left corner */}
      {isCritical && (
        <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </span>
      )}

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

      {onDeleteTask && (
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            type="button"
            aria-label={`Actions for ${task.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-surface-soft opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-6 z-30 min-w-[160px] bg-surface-card border border-hairline rounded-md shadow-lg py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDeleteTask(task.id);
                }}
                className="w-full px-3 py-2 text-left text-[13px] text-blocked hover:bg-error/10 flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete task
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
