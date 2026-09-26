"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (options: { type: Toast["type"]; message: string }) => void;
  remove: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((options: { type: Toast["type"]; message: string }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...options, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, remove }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

function Toaster() {
  const { toasts, remove } = useToast();

  return (
    <div className="fixed top-right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "px-4 py-3 rounded-lg text-[14px] font-medium shadow-lg",
            toast.type === "success" && "bg-success/10 text-success border border-success/20",
            toast.type === "error" && "bg-error/10 text-error border border-error/20",
            toast.type === "info" && "bg-primary/10 text-primary border border-primary/20",
          )}
        >
          {toast.message}
          <button
            onClick={() => remove(toast.id)}
            className="absolute top-1 right-2 text-current opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}