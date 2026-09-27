"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProjectMembers } from "@/components/project-members";
import { EditProjectModal, DeleteProjectModal } from "@/components/project-actions";
import { CriticalPathDisplay } from "@/components/critical-path-display";
import { ProjectEvents } from "@/components/project-events";
import { useBoard } from "@/hooks/use-board";
import type { Project, ProjectMember, Task, TaskDependency } from "@repo/types";
import { ProjectRole, TaskStatus } from "@repo/types";
import { useToast } from "@/components/toaster";

interface ProjectDetailData {
  project: Project & { members: ProjectMember[] };
}

interface GraphData {
  tasks: Task[];
  dependencies: TaskDependency[];
}

export default function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: projectIdStr } = use(params);
  const projectId = Number(projectIdStr);
  const router = useRouter();
  const { toast } = useToast();
  const { columns, createTask, refetch: refetchBoard } = useBoard(projectId);
  const [project, setProject] = useState<ProjectDetailData["project"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "members" | "critical-path" | "events" | "settings">("overview");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const allTasks = Array.from(columns.flatMap((c) => c.tasks));

  const fetchProject = useCallback(async () => {
    try {
      const res = await apiClient<ProjectDetailData["project"]>(`/projects/${projectId}`);
      const data = unwrapResponse(res);
      setProject(data);
      setError(null);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchGraph = useCallback(async () => {
    setGraphLoading(true);
    try {
      const res = await apiClient<GraphData>(`/projects/${projectId}/graph`);
      const data = unwrapResponse(res);
      setGraphData(data);
    } catch (err: any) {
      // Silently fail, CriticalPathDisplay will handle its own error
    } finally {
      setGraphLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Fetch graph data when critical-path tab is activated
  useEffect(() => {
    if (activeTab === "critical-path" && !graphData) {
      fetchGraph();
    }
  }, [activeTab, fetchGraph, graphData]);

  const handleUpdate = async (data: { name: string; description: string }) => {
    try {
      const res = await apiClient<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updatedProject = unwrapResponse(res);
      setProject((prev) => prev ? { ...prev, ...updatedProject } : null);
      setShowEditModal(false);
      toast({ type: "success", message: "Project updated" });
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Update failed" });
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient(`/projects/${projectId}`, { method: "DELETE" });
      setShowDeleteModal(false);
      toast({ type: "success", message: "Project deleted" });
      router.push("/projects");
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Delete failed" });
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreating(true);
    try {
      await createTask({ title: newTaskTitle.trim() });
      toast({ type: "success", message: "Task created" });
      setNewTaskTitle("");
      setShowCreateTask(false);
      await refetchBoard();
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Create failed" });
    } finally {
      setCreating(false);
    }
  };

  const handleMemberChange = () => {
    fetchProject();
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted text-[16px]">Loading project…</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !project) {
    return (
      <AppLayout>
        <div className="bg-error/10 border border-error/20 rounded-lg p-6 text-error">
          {error ?? "Project not found"}
        </div>
      </AppLayout>
    );
  }

  const currentUserId = project.ownerId;
  const isOwner = project.members.some((m) => m.userId === currentUserId && m.role === ProjectRole.OWNER);


  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-display text-[32px] text-ink">{project.name}</h1>
            {project.description && (
              <p className="text-body text-[16px] text-ink/80">{project.description}</p>
            )}
            <div className="flex items-center gap-2">
              <Badge variant="pill">{project.members.length} member{project.members.length !== 1 ? "s" : ""}</Badge>
              <Badge variant={isOwner ? "pill" : "pill"}>Owner</Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href={`/board/${projectId}`}>
              <Button>Go to Board</Button>
            </Link>
            <Button onClick={() => setShowCreateTask(true)}>Create Task</Button>
            {isOwner && (
              <>
                <Button variant="secondary" onClick={() => setShowEditModal(true)}>Edit</Button>
                <Button variant="danger" onClick={() => setShowDeleteModal(true)}>Delete</Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-hairline">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "overview"
                ? "bg-surface-card text-ink border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "tasks"
                ? "bg-surface-card text-ink border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Tasks <span className="ml-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px]">{allTasks.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "members"
                ? "bg-surface-card text-ink border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab("critical-path")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "critical-path"
                ? "bg-surface-card text-ink border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Critical Path
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "events"
                ? "bg-surface-card text-ink border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "settings"
                ? "bg-surface-card text-ink border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="p-6">
                <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Total Tasks</p>
                <p className="font-display text-[32px] text-ink">{allTasks.length}</p>
              </Card>
              <Card className="p-6">
                <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Members</p>
                <p className="font-display text-[32px] text-ink">{project.members.length}</p>
              </Card>
              <Card className="p-6">
                <p className="text-[12px] text-muted uppercase tracking-wide mb-1">Created</p>
                <p className="font-display text-[20px] text-ink">
                  {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "—"}
                </p>
              </Card>
            </div>

            {(allTasks.length) > 0 && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-[20px] text-ink">Recent Tasks</h2>
                  <Link href={`/board/${projectId}`}>
                    <Button size="sm">View All on Board →</Button>
                  </Link>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allTasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 bg-surface-soft rounded-lg border border-hairline">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.readiness === 'BLOCKED' ? '#ea580c' : '#059669' }} />
                        <span className="font-medium text-ink truncate max-w-xs">{task.title}</span>
                        <Badge variant={task.status === "BACKLOG" ? "pill" : task.status === "IN_PROGRESS" ? "in-progress" : task.status === "REVIEW" ? "review" : "done"} className="text-[11px]">
                          {task.status.replace("_", " ")}
                        </Badge>
                        <Badge variant={task.readiness === "READY" ? "ready" : "blocked"} className="text-[11px]">
                          {task.readiness}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-6">
              <h2 className="font-display text-[20px] text-ink mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <Link href={`/board/${projectId}`}>
                  <Button>Open Kanban Board</Button>
                </Link>
                <Button onClick={() => setShowCreateTask(true)}>Create Task</Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[24px] text-ink">All Tasks</h2>
              <div className="flex gap-3">
                <Link href={`/board/${projectId}`}>
                  <Button variant="secondary" size="sm">Open Kanban Board</Button>
                </Link>
                <Button onClick={() => setShowCreateTask(true)}>Create Task</Button>
              </div>
            </div>

            {(allTasks.length === 0) ? (
              <div className="card text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 bg-surface-soft rounded-xl flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <h3 className="font-display text-[20px] text-ink mb-2">No tasks yet</h3>
                <p className="text-body text-[16px] text-muted mb-6 max-w-md mx-auto">
                  Create your first task to get started.
                </p>
                <Button onClick={() => setShowCreateTask(true)}>Create Task</Button>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-soft">
                        <th className="px-4 py-3 text-left text-[12px] font-medium text-muted uppercase tracking-wide">Task</th>
                        <th className="px-4 py-3 text-left text-[12px] font-medium text-muted uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3 text-left text-[12px] font-medium text-muted uppercase tracking-wide">Readiness</th>
                        <th className="px-4 py-3 text-left text-[12px] font-medium text-muted uppercase tracking-wide">Duration</th>
                        <th className="px-4 py-3 text-left text-[12px] font-medium text-muted uppercase tracking-wide">Computed Dates</th>
                        <th className="px-4 py-3 text-right text-[12px] font-medium text-muted uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {allTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-surface-soft transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/task/${task.id}`} className="font-medium text-ink hover:text-primary">
                              {task.title}
                            </Link>
                            {task.description && (
                              <p className="text-[13px] text-muted truncate max-w-xs mt-0.5">{task.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={task.status === "BACKLOG" ? "pill" : task.status === "IN_PROGRESS" ? "in-progress" : task.status === "REVIEW" ? "review" : "done"}>
                              {task.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={task.readiness === "READY" ? "ready" : "blocked"}>
                              {task.readiness}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-[14px] text-ink">
                            {task.duration ? `${task.duration}d` : "—"}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-muted">
                            {task.computedStart && task.computedEnd ? (
                              <>
                                {new Date(task.computedStart).toLocaleDateString()} → {new Date(task.computedEnd).toLocaleDateString()}
                              </>
                            ) : task.computedStart ? (
                              new Date(task.computedStart).toLocaleDateString()
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/task/${task.id}`}>
                              <Button variant="ghost" size="sm">View</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "members" && (
          <ProjectMembers
            projectId={projectId}
            members={project.members}
            currentUserId={currentUserId}
            isOwner={isOwner}
            onChange={handleMemberChange}
          />
        )}

        {activeTab === "critical-path" && (
          <CriticalPathDisplay
            projectId={projectId}
            tasks={graphData?.tasks ?? allTasks}
            dependencies={graphData?.dependencies ?? []}
          />
        )}

        {activeTab === "events" && (
          <ProjectEvents projectId={projectId} />
        )}

        {activeTab === "settings" && (
          <div className="space-y-8">
            <div className="card p-6">
              <h2 className="font-display text-[20px] text-ink mb-4">Critical Path & Schedule</h2>
              <p className="text-body text-[16px] text-muted mb-4">
                View the critical path and computed schedule for this project.
              </p>
              <Link href={`/board/${projectId}`}>
                <Button>View on Board</Button>
              </Link>
            </div>

            <div className="card p-6 border border-error/20 bg-error/5">
              <h2 className="font-display text-[20px] text-ink mb-2 text-error">Danger Zone</h2>
              <p className="text-body text-[16px] text-muted mb-4">
                Once deleted, this project and all its tasks, dependencies, and history cannot be recovered.
              </p>
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                Delete Project
              </Button>
            </div>
          </div>
        )}

        {/* Modals */}
        {showEditModal && project && (
          <EditProjectModal
            initialName={project.name}
            initialDescription={project.description ?? ""}
            onClose={() => setShowEditModal(false)}
            onSave={handleUpdate}
          />
        )}

        {showDeleteModal && project && (
          <DeleteProjectModal
            projectName={project.name}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDelete}
          />
        )}

        {/* Create Task Modal */}
        {showCreateTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-surface-card rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-[20px] text-ink">Create Task</h2>
                <button onClick={() => setShowCreateTask(false)} className="text-muted hover:text-ink">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ink mb-1">Task title</label>
                  <Input
                    placeholder="What needs to be done?"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 mt-4">
                  <Button type="submit" disabled={creating || !newTaskTitle.trim()}>
                    {creating ? "Creating…" : "Create Task"}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => setShowCreateTask(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
