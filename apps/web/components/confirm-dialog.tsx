"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  /** What is about to happen, in the user's words. */
  title: string;
  /** The consequence they should know before agreeing to it. */
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A modal that asks before something irreversible happens.
 *
 * Deleting a task also drops the dependencies pointing at it, so the cost of a
 * mis-click is not one row. Escape and a click on the backdrop both count as no,
 * and focus moves to the dialog so a keyboard user is not left behind on the
 * page underneath.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/40"
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        tabIndex={-1}
        className="w-full max-w-md bg-surface-card rounded-xl border border-hairline p-6 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-[17px] font-semibold text-ink">
          {title}
        </h2>
        <p id="confirm-body" className="mt-2 text-[14px] leading-relaxed text-muted">
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
