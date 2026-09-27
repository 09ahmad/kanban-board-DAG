"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAiSuggestions } from "@/hooks/use-ai-suggestions";
import type { AiSuggestionItem } from "@repo/types";

interface AiSuggestionsProps {
  projectId: number;
  taskId?: number;
}

/** What the panel says it is doing while a run is in flight, ChatGPT-style. */
const THINKING_STEPS = [
  "Reading the task…",
  "Scanning the other tasks…",
  "Ranking candidate dependencies…",
  "Checking the graph…",
];

export function AiSuggestions({ projectId, taskId }: AiSuggestionsProps) {
  const { suggestions, busy, error, generate, accept, reject } = useAiSuggestions({
    projectId,
    taskId,
  });
  const [acceptedNote, setAcceptedNote] = useState<string | null>(null);
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setThinkingStep(0);
    const interval = setInterval(() => {
      setThinkingStep((step) => (step + 1) % THINKING_STEPS.length);
    }, 800);
    return () => clearInterval(interval);
  }, [busy]);

  const handleGenerate = async () => {
    setGeneratedOnce(true);
    setAcceptedNote(null);
    await generate();
  };

  const handleAccept = async (suggestion: AiSuggestionItem) => {
    const impact = await accept(suggestion);
    setAcceptedNote(
      typeof impact === "number" && impact > 0
        ? `Accepted — this dependency extends the critical path by ${impact} day${impact === 1 ? "" : "s"}.`
        : "Accepted — no change to the critical path.",
    );
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[18px] text-ink">AI Suggestions</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerate}
          disabled={busy || !taskId}
        >
          {busy ? "Analyzing…" : "Generate"}
        </Button>
      </div>

      {busy && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <svg className="animate-spin flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            <span className="text-[14px] text-ink transition-all">{THINKING_STEPS[thinkingStep]}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-3 text-error text-[14px]">
          {error}
        </div>
      )}

      {acceptedNote && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-success text-[14px]">
          {acceptedNote}
        </div>
      )}

      {suggestions.length === 0 && !busy && (
        <p className="text-body text-[14px] text-muted">
          {generatedOnce
            ? "No missing links found — every useful dependency for this task already exists."
            : "No suggestions right now. Click Generate to see AI-proposed dependencies."}
        </p>
      )}

      <div className="space-y-3">
        {suggestions.map((suggestion: AiSuggestionItem) => (
          <div
            key={suggestion.id}
            className="bg-surface-soft rounded-lg p-4 border border-hairline"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="pill">
                  {Math.round(suggestion.confidence * 100)}% confidence
                </Badge>
                {typeof suggestion.criticalPathImpactDays === "number" && suggestion.criticalPathImpactDays > 0 && (
                  <Badge variant="pill" className="bg-primary/10 text-primary">
                    +{suggestion.criticalPathImpactDays} day{suggestion.criticalPathImpactDays === 1 ? "" : "s"} on critical path
                  </Badge>
                )}
              </div>
              {suggestion.reason && (
                <span className="text-[13px] text-muted">{suggestion.reason}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => handleAccept(suggestion)}>
                Accept
              </Button>
              <Button variant="secondary" size="sm" onClick={() => reject(suggestion)}>
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
