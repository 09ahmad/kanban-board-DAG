"use client";

import { useState } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toaster";
import type { ProjectMember } from "@repo/types";
import { ProjectRole } from "@repo/types";

interface ProjectMembersProps {
  projectId: number;
  members: ProjectMember[];
  currentUserId: number;
  isOwner: boolean;
  onChange: () => void;
}

export function ProjectMembers({ projectId, members, currentUserId, isOwner, onChange }: ProjectMembersProps) {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<ProjectRole>("MEMBER");
  const [adding, setAdding] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim()) return;
    setAdding(true);
    try {
      await apiClient(`/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(newUserId), role: newRole }),
      });
      setNewUserId("");
      setShowAddModal(false);
      toast({ type: "success", message: "Member added" });
      onChange();
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Failed to add member" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (removingIds.has(userId)) return;
    setRemovingIds((prev) => new Set(prev).add(userId));
    try {
      await apiClient(`/projects/${projectId}/members/${userId}`, { method: "DELETE" });
      toast({ type: "success", message: "Member removed" });
      onChange();
    } catch (err: any) {
      toast({ type: "error", message: err?.error?.message ?? "Failed to remove member" });
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const owners = members.filter((m) => m.role === ProjectRole.OWNER);
  const isLastOwner = (userId: number) => owners.length === 1 && owners[0]?.userId === userId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[20px] text-ink">Project Members</h2>
        {isOwner && (
          <Button onClick={() => setShowAddModal(true)}>Add Member</Button>
        )}
      </div>

      <div className="card space-y-0">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between p-4 border-t border-hairline first:border-t-0"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-medium text-sm">
                {member.userId.toString().charAt(0)}
              </div>
              <div className="space-y-1">
                <p className="font-medium text-ink">User #{member.userId}</p>
                <p className="text-sm text-muted">Role: {member.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="pill">{member.role}</Badge>
              {isOwner && member.userId !== currentUserId && !isLastOwner(member.userId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMember(member.userId)}
                  disabled={removingIds.has(member.userId)}
                >
                  {removingIds.has(member.userId) ? "Removing…" : "Remove"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[20px] text-ink">Add Member</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted hover:text-ink">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink mb-1">User ID</label>
                <Input
                  type="number"
                  placeholder="Enter user ID"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as ProjectRole)}
                  className="input w-full"
                >
                  <option value="MEMBER">Member</option>
                  <option value="OWNER">Owner</option>
                </select>
              </div>
              <div className="flex gap-3 mt-4">
                <Button type="submit" disabled={adding || !newUserId.trim()}>
                  {adding ? "Adding…" : "Add Member"}
                </Button>
                <Button variant="secondary" type="button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
