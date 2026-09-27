"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/toaster";

interface ProjectPreview {
  name: string;
  description: string | null;
  memberCount: number;
}

export default function ProjectInvitePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: projectIdStr } = use(params);
  const projectId = Number(projectIdStr);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [checking, setChecking] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitePath = `/projects/${projectId}/invite`;

  useEffect(() => {
    // State 1: not signed in — come back here after sign-in.
    if (!authLoading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(invitePath)}`);
    }
  }, [authLoading, user, router, invitePath]);

  const checkMembership = useCallback(async () => {
    if (!user) return;
    setChecking(true);
    setError(null);
    try {
      await apiClient(`/projects/${projectId}`);
      // State 2: already a member — the board is where the work happens.
      router.replace(`/board/${projectId}`);
    } catch (err: any) {
      if (err?.error?.code === "FORBIDDEN") {
        // State 3: signed in but not a member — show the preview.
        try {
          const res = await apiClient<ProjectPreview>(`/projects/${projectId}/preview`);
          setPreview(unwrapResponse(res));
        } catch (previewErr: any) {
          setError(previewErr?.error?.message ?? "Failed to load project preview");
        }
      } else {
        setError(err?.error?.message ?? "Failed to load project");
      }
    } finally {
      setChecking(false);
    }
  }, [user, projectId, router]);

  useEffect(() => {
    checkMembership();
  }, [checkMembership]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      await apiClient(`/projects/${projectId}/join`, { method: "POST" });
      toast({ type: "success", message: `Joined "${preview?.name ?? "project"}"` });
      router.push(`/board/${projectId}`);
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Could not join the project" });
      setJoining(false);
    }
  };

  if (authLoading || !user || checking) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted text-[16px]">Checking the invite…</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <Card className="p-6 space-y-4">
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-error">{error}</div>
          <Link href="/projects" className="text-primary hover:underline text-[14px] font-medium">
            Back to projects
          </Link>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-[32px] text-ink">You&rsquo;re invited</h1>
          <p className="text-body text-[16px]">
            {preview?.name ? `Someone shared "${preview.name}" with you.` : "Someone shared a project with you."}
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-display text-[24px] text-ink">{preview?.name}</h2>
            {preview?.description && (
              <p className="text-body text-[14px] mt-1 text-ink/80">{preview.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="pill">
              {preview?.memberCount ?? 0} member{(preview?.memberCount ?? 0) === 1 ? "" : "s"}
            </Badge>
          </div>

          <p className="text-body text-[14px] text-muted">
            Joining adds you as a member. Tasks, dependencies, and the board unlock immediately.
          </p>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleJoin} disabled={joining}>
              {joining ? "Joining…" : "Join Project"}
            </Button>
            <Link href="/projects">
              <Button variant="secondary" disabled={joining}>Not now</Button>
            </Link>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}