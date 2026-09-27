"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6">
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto bg-error/10 rounded-full flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="text-center space-y-2">
            <h2 className="font-display text-[24px] text-ink">Something went wrong</h2>
            <p className="text-body text-[16px] text-muted">
              We encountered an unexpected error. Please try again.
            </p>
            {error.digest && (
              <p className="text-[12px] text-muted">Error ID: {error.digest}</p>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={reset}>Try again</Button>
            <Button variant="secondary" onClick={() => window.location.href = "/projects"}>
              Go to projects
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}