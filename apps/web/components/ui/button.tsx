import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = "inline-flex items-center justify-center gap-2 font-medium text-[14px] font-sans rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

  const variantClasses = {
    primary: "bg-primary text-on-primary hover:bg-primary-active disabled:bg-primary-disabled disabled:text-muted",
    secondary: "bg-surface-card text-ink border border-hairline hover:border-hairline-soft",
    ghost: "bg-transparent text-ink hover:bg-surface-soft",
    danger: "bg-error/10 text-error hover:bg-error/20 border border-error/20",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 h-32px text-[13px]",
    md: "px-5 py-[12px] h-[40px]",
    lg: "px-6 py-3 h-[48px] text-[16px]",
  };

  return (
    <button
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], disabled && "opacity-50 cursor-not-allowed", className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
