import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAiSuggestions } from "@/hooks/use-ai-suggestions";
import type { AiSuggestionItem } from "@repo/types";

interface AiSuggestionsProps {
  projectId: number;
  taskId?: number;
}

export function AiSuggestions({ projectId, taskId }: AiSuggestionsProps) {
  const { suggestions, busy, error, generate, accept, reject } = useAiSuggestions({
    projectId,
    taskId,
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[18px] text-ink">AI Suggestions</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={generate}
          disabled={busy}
        >
          {busy ? "Generating…" : "Generate"}
        </Button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-3 text-error text-[14px]">
          {error}
        </div>
      )}

      {suggestions.length === 0 && !busy && (
        <p className="text-body text-[14px] text-muted">
          No suggestions right now. Click Generate to see AI-proposed dependencies.
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
              </div>
              {suggestion.reason && (
                <span className="text-[13px] text-muted">{suggestion.reason}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => accept(suggestion)}>
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
