"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TaskEvent, TaskEventType } from "@repo/types";
import { useBoard } from "@/hooks/use-board";

interface ProjectEventsProps {
  projectId: number;
  onClose?: () => void;
}

function formatEventMessage(event: TaskEvent): string {
  const payload = event.payload as Record<string, unknown> | null;
  const taskTitle = (payload?.title as string) ?? `Task #${event.taskId}`;
  
  switch (event.type) {
    case "TASK_CREATED":
      return `Created task "${taskTitle}"`;
    case "TASK_UPDATED":
      return `Updated task "${taskTitle}"`;
    case "TASK_MOVED": {
      const oldStatus = (payload?.oldStatus as string) ?? "";
      const newStatus = (payload?.newStatus as string) ?? "";
      return `Moved "${taskTitle}" from ${oldStatus?.replace("_", " ")} to ${newStatus?.replace("_", " ")}`;
    }
    case "TASK_DELETED":
      return `Deleted task "${taskTitle}"`;
    case "TASK_READY":
      return `Task "${taskTitle}" is now READY`;
    case "TASK_BLOCKED":
      return `Task "${taskTitle}" is BLOCKED`;
    case "DEPENDENCY_ADDED": {
      const prereq = payload?.prerequisiteTaskId;
      const dependent = payload?.dependentTaskId;
      return `Added dependency: Task #${prereq} → Task #${dependent}`;
    }
    case "DEPENDENCY_REMOVED": {
      const prereq = payload?.prerequisiteTaskId;
      const dependent = payload?.dependentTaskId;
      return `Removed dependency: Task #${prereq} → Task #${dependent}`;
    }
    case "SCHEDULE_CHANGED":
      return `Schedule updated for "${taskTitle}"`;
    case "GRAPH_UPDATED":
      return "Project graph updated";
    case "AI_SUGGESTION_CREATED":
      return "AI suggested new dependency";
    case "AI_SUGGESTION_ACCEPTED":
      return "AI suggestion accepted";
    case "AI_SUGGESTION_REJECTED":
      return "AI suggestion rejected";
    default:
      return `${event.type} on ${taskTitle}`;
  }
}

function getEventBadgeVariant(type: TaskEventType): "ready" | "blocked" | "in-progress" | "review" | "done" | "pill" {
  switch (type) {
    case "TASK_CREATED": return "pill";
    case "TASK_MOVED": return "in-progress";
    case "TASK_READY": return "ready";
    case "TASK_BLOCKED": return "blocked";
    case "TASK_DELETED": return "pill";
    case "DEPENDENCY_ADDED": return "pill";
    case "DEPENDENCY_REMOVED": return "pill";
    case "SCHEDULE_CHANGED": return "review";
    case "GRAPH_UPDATED": return "pill";
    case "AI_SUGGESTION_CREATED": return "pill";
    case "AI_SUGGESTION_ACCEPTED": return "ready";
    case "AI_SUGGESTION_REJECTED": return "blocked";
    default: return "pill";
  }
}

function formatTimestamp(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProjectEvents({ projectId, onClose }: ProjectEventsProps) {
  const { fetchEvents } = useBoard(projectId);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async (before?: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const newEvents = await fetchEvents(50, before);
      if (append) {
        setEvents((prev) => [...prev, ...newEvents]);
      } else {
        setEvents(newEvents);
      }
      setHasMore(newEvents.length === 50);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to load events");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetchEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleLoadMore = () => {
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      loadEvents(lastEvent.id, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[24px] text-ink">Activity Feed</h2>
        <Button onClick={() => loadEvents()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-error">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="divide-y divide-hairline">
          {events.length === 0 && !loading ? (
            <div className="p-8 text-center">
              <p className="text-body text-[16px] text-muted">
                No activity yet. Changes to tasks, dependencies, and schedules will appear here.
              </p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="p-4 hover:bg-surface-soft transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Badge variant={getEventBadgeVariant(event.type)} className="mt-1 flex-shrink-0">
                    {event.type.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-body text-[14px] text-ink">
                      {formatEventMessage(event)}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted">
                      <span>{formatTimestamp(event.createdAt)}</span>
                      {event.actorId && (
                        <span>by User #{event.actorId}</span>
                      )}
                      {event.taskId && (
                        <span>Task #{event.taskId}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {hasMore && (
          <div className="p-4 border-t border-hairline">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading more…" : "Load More"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
