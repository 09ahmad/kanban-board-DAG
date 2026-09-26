import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "pill" | "coral" | "ready" | "blocked" | "in-progress" | "done" | "review";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "pill", children, className }: BadgeProps) {
  const base = "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1 rounded-full";

  const variantStyles = {
    pill: "bg-surface-card text-ink",
    coral: "bg-primary text-on-primary tracking-wide uppercase text-[12px]",
    ready: "bg-success/10 text-ready",
    blocked: "bg-error/10 text-blocked",
    "in-progress": "bg-review/10 text-review",
    done: "bg-success/10 text-success",
    review: "bg-primary/10 text-primary",
  };

  const dotColors = {
    ready: "bg-ready",
    blocked: "bg-blocked",
    "in-progress": "bg-review",
    done: "bg-success",
    review: "bg-primary",
  };

  return (
    <span className={cn(base, variantStyles[variant], className)}>
      {(variant === "ready" || variant === "blocked" || variant === "done" || variant === "in-progress" || variant === "review") && (
        <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[variant])} />
      )}
      {children}
    </span>
  );
}