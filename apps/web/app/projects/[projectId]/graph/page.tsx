"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DependencyGraph } from "@/components/dependency-graph";
import { CriticalPathDisplay } from "@/components/critical-path-display";
import { useToast } from "@/components/toaster";
import type { Task, TaskDependency, CriticalPathResult } from "@repo/types";
import { TaskStatus } from "@repo/types";
import { use } from "react";

export default function ProjectGraphPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: projectIdStr } = use(params);
  const projectId = Number(projectIdStr);
  const router = useRouter();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient<{ tasks: Task[]; dependencies: TaskDependency[] }>(
        `/projects/${projectId}/graph`
      );
      const data = unwrapResponse(res);
      setTasks(data.tasks);
      setDependencies(data.dependencies);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const statusOrder: TaskStatus[] = ["BACKLOG", "IN_PROGRESS", "REVIEW", "DONE"];

  function getStatusLabel(status: TaskStatus): string {
    return status.replace("_", " ");
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted text-[16px]">Loading graph…</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="bg-error/10 border border-error/20 rounded-lg p-6 text-error">{error}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link
                href={`/projects/${projectId}`}
                className="text-muted hover:text-ink flex items-center gap-1"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Back to Project
              </Link>
            </div>
            <h1 className="font-display text-[32px] text-ink">Dependency Graph</h1>
            <p className="text-body text-[16px] text-muted">
              Visualize task dependencies and critical path. Critical path highlighted in purple.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={fetchGraph}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </Button>
            <Link href={`/board/${projectId}`}>
              <Button>Open Board</Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Total Tasks</p>
            <p className="font-display text-[28px] text-ink">{tasks.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Dependencies</p>
            <p className="font-display text-[28px] text-ink">{dependencies.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Columns</p>
            <p className="font-display text-[28px] text-ink">{statusOrder.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Critical Tasks</p>
            <p className="font-display text-[28px] text-ink">
              <span id="critical-count">—</span>
            </p>
          </Card>
        </div>

        {/* Graph */}
        <CriticalPathDisplay
          projectId={projectId}
          tasks={tasks}
          dependencies={dependencies}
        />
      </div>
    </AppLayout>
  );
}
