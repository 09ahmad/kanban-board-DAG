"use client";

/**
 * Loading placeholders.
 *
 * These mirror the shape of the thing they stand in for rather than showing a
 * spinner in the middle of an empty page. Two reasons: the layout does not jump
 * when the real content arrives, and the person waiting can see what is coming,
 * so the wait has a shape instead of being a pause.
 *
 * All motion respects `prefers-reduced-motion` via the shared `animate-pulse`,
 * which the motion-reduce variant disables at the Tailwind level.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-surface-soft animate-pulse ${className}`} />;
}

export function ProjectListSkeleton() {
  return (
    <div role="status" aria-label="Loading projects" aria-busy="true">
      <div className="flex items-center justify-between mb-6">
        <Bar className="h-8 w-40" />
        <Bar className="h-10 w-28 rounded-md" />
      </div>

      {/* Three across on a wide screen, so three across here too. */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface-card rounded-xl p-5 space-y-3">
            <Bar className="h-5 w-3/4" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-1/2" />
            <div className="flex gap-2 pt-2">
              <Bar className="h-5 w-16 rounded-full" />
              <Bar className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  const columns = ["Backlog", "In progress", "Review", "Done"];

  return (
    <div role="status" aria-label="Loading board" aria-busy="true">
      <Bar className="h-7 w-56 mb-4" />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((title) => (
          <div key={title} className="w-72 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              {/* The real column names, because they are fixed and knowing the
                  shape of the board is part of what the wait is for. */}
              <span className="text-[13px] font-medium text-muted">{title}</span>
              <Bar className="h-4 w-6 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="bg-surface-card rounded-md p-3 space-y-2">
                <Bar className="h-4 w-4/5" />
                <Bar className="h-3 w-2/5" />
              </div>
              <div className="bg-surface-card rounded-md p-3 space-y-2">
                <Bar className="h-4 w-3/5" />
                <Bar className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading task" aria-busy="true" className="space-y-6">
      <div className="space-y-3">
        <Bar className="h-4 w-32" />
        <Bar className="h-9 w-3/4" />
        <div className="flex gap-2">
          <Bar className="h-6 w-24 rounded-full" />
          <Bar className="h-6 w-20 rounded-full" />
        </div>
      </div>

      <div className="space-y-2">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-11/12" />
        <Bar className="h-4 w-2/3" />
      </div>

      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <Bar className="h-6 w-48" />
          <div className="bg-surface-card rounded-xl p-4 space-y-2">
            <Bar className="h-4 w-2/5" />
            <Bar className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div role="status" aria-label="Loading project" aria-busy="true" className="space-y-6">
      <div className="space-y-3">
        <Bar className="h-9 w-1/2" />
        <Bar className="h-4 w-1/3" />
      </div>
      <Bar className="h-10 w-full rounded-md" />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl p-5 space-y-3">
          <Bar className="h-4 w-1/2" />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-4/5" />
        </div>
        <div className="bg-surface-card rounded-xl p-5 space-y-3">
          <Bar className="h-4 w-1/2" />
          <Bar className="h-3 w-full" />
        </div>
      </div>
    </div>
  );
}
