import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn("bg-surface-card rounded-xl p-6 border border-hairline", className)}>
      {children}
    </div>
  );
}