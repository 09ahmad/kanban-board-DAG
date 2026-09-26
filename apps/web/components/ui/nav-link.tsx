import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function NavLink({ href, className, children }: NavLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        "nav-link text-[14px] font-medium text-body hover:text-ink transition-colors",
        className
      )}
    >
      {children}
    </a>
  );
}