"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import type { Project } from "@repo/types";
import { ProjectListSkeleton } from "@/components/ui/skeleton";

interface ProjectsPageData {
  projects?: Project[];
}

/** Accepts a raw project ID ("147") or a full invite URL (".../projects/147/invite"). */
export function parseProjectInvite(raw: string): number | null {
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/\/projects\/(\d+)(?:\/invite)?\/?$/);
  return match ? Number(match[1]) : null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await apiClient<Project[]>("/projects");
      setProjects(unwrapResponse(res) || []);
    } catch {
      // handled by error boundary
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiClient<Project>("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
      });
      const createdProject = unwrapResponse(res);
      setNewProjectName("");
      setNewProjectDesc("");
      setShowCreate(false);
      await fetchProjects();
    } catch {
      // error handled
    } finally {
      setCreating(false);
    }
  };

  const handleCreateProject = () => {
    setShowCreate(true);
  };

  if (loading) {
    return (
      <AppLayout>
        <ProjectListSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[32px] text-ink">Projects</h1>
            <p className="text-body text-[16px]">Manage your projects and dependencies.</p>
          </div>
          <Button onClick={handleCreateProject}>New project</Button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="card space-y-4">
            <h2 className="font-display text-[18px] text-ink">Create a new project</h2>
            <input
              type="text"
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="input w-full max-w-sm"
              autoFocus
              required
            />
            <textarea
              placeholder="Description (optional)"
              value={newProjectDesc}
              onChange={(e) => setNewProjectDesc(e.target.value)}
              className="textarea w-full max-w-sm"
              rows={2}
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={creating || !newProjectName.trim()}>
                {creating ? "Creating…" : "Create project"}
              </Button>
              <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {projects.length === 0 ? (
          <div className="card text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 bg-surface-soft rounded-xl flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </div>
            <h2 className="font-display text-[24px] text-ink mb-2">Create your first project</h2>
            <p className="text-body text-[16px] mb-6 max-w-md mx-auto">
              This is the starting point for everything. Create a project, add tasks,
              define dependencies, and let the DAG engine compute readiness for you.
            </p>
            <Button onClick={handleCreateProject}>Create your first project</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-display text-[20px] text-ink group-hover:text-primary transition-colors">
                      {project.name}
                    </h3>
                  </div>
                  {project.description && (
                    <p className="text-body text-[14px] leading-[1.55] mb-4">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="pill">{project._count?.tasks ?? project.tasks?.length ?? 0} tasks</Badge>
                    <Badge variant="pill">{project._count?.members ?? project.members?.length ?? 0} members</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
