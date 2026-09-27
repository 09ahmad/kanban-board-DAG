"use client";

import { useEffect, useState } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface ProjectMemberInfo {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: string;
  joinedAt: string | Date;
}

const MAX_VISIBLE = 4;

/**
 * Overlapping initial avatars for the board header, populated from
 * GET /projects/:id/members. A purely presentational row — membership
 * management lives on the project page. Pass `members` when the parent
 * already holds the list, so the endpoint is read once per page.
 */
export function MembersAvatarRow({
  projectId,
  members: membersProp,
}: {
  projectId: number;
  members?: ProjectMemberInfo[];
}) {
  const [fetched, setFetched] = useState<ProjectMemberInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const members = membersProp ?? fetched;

  useEffect(() => {
    if (membersProp) return;
    let cancelled = false;
    setLoading(true);
    apiClient<ProjectMemberInfo[]>(`/projects/${projectId}/members`)
      .then((res) => {
        if (!cancelled) setFetched(unwrapResponse(res) || []);
      })
      .catch(() => {
        // The row is decorative; the board still works without it.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, membersProp]);

  if (loading || members.length === 0) return null;

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - visible.length;

  return (
    <div className="flex items-center" aria-label={`${members.length} project member${members.length === 1 ? "" : "s"}`}>
      {visible.map((member, index) => (
        <div
          key={member.id}
          title={`${member.name}${member.role === "OWNER" ? " (owner)" : ""}`}
          className={cn(
            "w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-medium text-[12px] border-2 border-canvas",
            index > 0 && "-ml-2"
          )}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          title={`${overflow} more member${overflow === 1 ? "" : "s"}`}
          className="w-8 h-8 rounded-full bg-surface-soft flex items-center justify-center text-muted font-medium text-[12px] border-2 border-canvas -ml-2"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}