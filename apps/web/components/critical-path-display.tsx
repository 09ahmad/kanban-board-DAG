"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DependencyGraph } from "@/components/dependency-graph";
import type { Task, CriticalPathResult } from "@repo/types";
import { useBoard } from "@/hooks/use-board";

interface CriticalPathDisplayProps {
  projectId: number;
  tasks: Task[];
  dependencies: Array<{ prerequisiteTaskId: number; dependentTaskId: number }>;
  onClose?: () => void;
}

export function CriticalPathDisplay({ projectId, tasks, dependencies, onClose }: CriticalPathDisplayProps) {
  const { fetchCriticalPath } = useBoard(projectId);
  const [criticalPath, setCriticalPath] = useState<CriticalPathResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCriticalPath = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCriticalPath();
      setCriticalPath(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load critical path");
    } finally {
      setLoading(false);
    }
  }, [fetchCriticalPath]);

  useEffect(() => {
    loadCriticalPath();
  }, [loadCriticalPath]);

  const criticalTaskIds = criticalPath?.criticalTaskIds ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-[24px] text-ink">Critical Path</h2>
          <p className="text-body text-[16px] text-muted">
            The longest path through the dependency graph. Tasks on this path determine the minimum project duration.
          </p>
        </div>
        <Button onClick={loadCriticalPath} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-error">
          {error}
        </div>
      )}

      {criticalPath && (
        <Card className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card p-4">
              <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Total Duration</p>
              <p className="font-display text-[32px] text-ink">{criticalPath.totalDurationDays} days</p>
            </div>
            <div className="card p-4">
              <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Critical Tasks</p>
              <p className="font-display text-[32px] text-ink">{criticalPath.criticalTaskIds.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Critical Edges</p>
              <p className="font-display text-[32px] text-ink">{criticalPath.criticalEdges.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-[12px] text-muted uppercase tracking-wide mb-1">All Tasks</p>
              <p className="font-display text-[32px] text-ink">{tasks.length}</p>
            </div>
          </div>

          <div className="mb-6 flex items-center gap-2">
            <Badge variant="pill" className="bg-primary/10 text-primary">Critical Path Highlighted</Badge>
            <Badge variant="pill" className="bg-muted/10 text-muted">Normal Tasks</Badge>
          </div>

          <DependencyGraph
            tasks={tasks}
            dependencies={dependencies}
            criticalPath={criticalTaskIds}
          />
        </Card>
      )}

      {!criticalPath && !loading && !error && (
        <Card className="p-6 text-center">
          <p className="text-body text-[16px] text-muted mb-4">
            Click Refresh to compute and display the critical path.
          </p>
          <Button onClick={loadCriticalPath}>Compute Critical Path</Button>
        </Card>
      )}
    </div>
  );
}
