"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/toaster";
import type { Task, TaskDependency, TaskStatus } from "@repo/types";
import { TaskStatus as TaskStatusEnum } from "@repo/types";

interface DependencyListProps {
  tasks: Task[];
  dependencies: TaskDependency[];
  onDelete: (dependencyId: number) => Promise<void>;
  onAdd: () => void;
  onClose: () => void;
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

export function DependencyList({ tasks, dependencies, onDelete, onAdd, onClose }: DependencyListProps) {
  const { toast } = useToast();
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const handleDelete = async (dependencyId: number) => {
    if (deletingIds.has(dependencyId)) return;
    setDeletingIds((prev) => new Set(prev).add(dependencyId));
    try {
      await onDelete(dependencyId);
      toast({ type: "success", message: "Dependency removed" });
    } catch {
      toast({ type: "error", message: "Failed to remove dependency" });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(dependencyId);
        return next;
      });
    }
  };

  if (dependencies.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-surface-card rounded-xl p-6 w-full max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-surface-soft rounded-xl flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <h2 className="font-display text-[20px] text-ink mb-2">No Dependencies</h2>
          <p className="text-body text-[16px] text-muted mb-6">
            Create dependencies to define task order. The DAG engine will compute readiness automatically.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-hairline">
          <h2 className="font-display text-[20px] text-ink">Dependencies</h2>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onAdd}>Add dependency</Button>
            <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-3">
            {dependencies.map((dep) => {
              const prerequisite = taskMap.get(dep.prerequisiteTaskId);
              const dependent = taskMap.get(dep.dependentTaskId);

              if (!prerequisite || !dependent) return null;

              return (
                <Card key={dep.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Prerequisite */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-[12px] text-muted uppercase tracking-wide">Prerequisite</p>
                      <p className="font-medium text-ink truncate">{prerequisite.title}</p>
                      <div className="flex gap-1.5">
                        <Badge variant={getStatusBadgeVariant(prerequisite.status)}>
                          {getStatusLabel(prerequisite.status)}
                        </Badge>
                        <Badge variant={getReadinessBadgeVariant(prerequisite.readiness)}>
                          {prerequisite.readiness}
                        </Badge>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center text-primary mx-2 flex-shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>

                    {/* Dependent */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-[12px] text-muted uppercase tracking-wide">Dependent</p>
                      <p className="font-medium text-ink truncate">{dependent.title}</p>
                      <div className="flex gap-1.5">
                        <Badge variant={getStatusBadgeVariant(dependent.status)}>
                          {getStatusLabel(dependent.status)}
                        </Badge>
                        <Badge variant={getReadinessBadgeVariant(dependent.readiness)}>
                          {dependent.readiness}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(dep.id)}
                    disabled={deletingIds.has(dep.id)}
                    className="flex-shrink-0"
                  >
                    {deletingIds.has(dep.id) ? (
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-hairline flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
