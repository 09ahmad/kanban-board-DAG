"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toaster";

interface EditProjectModalProps {
  initialName: string;
  initialDescription: string;
  onClose: () => void;
  onSave: (data: { name: string; description: string }) => Promise<void>;
}

export function EditProjectModal({ initialName, initialDescription, onClose, onSave }: EditProjectModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
    } catch {
      toast({ type: "error", message: "Failed to update project" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[20px] text-ink">Edit Project</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">Project Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Project description"
            />
          </div>
          <div className="flex gap-3 mt-4">
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteProjectModalProps {
  projectName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteProjectModal({ projectName, onClose, onConfirm }: DeleteProjectModalProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-card rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[20px] text-ink">Delete Project</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-body text-[16px] text-ink">
            Are you sure you want to delete <strong>"{projectName}"</strong>?
          </p>
          <p className="text-body text-[14px] text-muted">
            This action cannot be undone. All tasks, dependencies, and project history will be permanently deleted.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="danger" onClick={handleConfirm} disabled={confirming}>
              {confirming ? "Deleting…" : "Delete Project"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={confirming}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
