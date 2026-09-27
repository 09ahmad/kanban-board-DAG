import { useState, useCallback } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AiSuggestionItem } from "@repo/types";

interface AiSuggestionsProps {
  projectId: number;
  taskId?: number;
}

export function AiSuggestions({ projectId, taskId }: AiSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<AiSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient<{ suggestions: AiSuggestionItem[] }>(
        `/projects/${projectId}/ai/dependency-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        }
      );
      const data = unwrapResponse(res);
      setSuggestions(data.suggestions);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to generate suggestions");
    } finally {
      setGenerating(false);
    }
  }, [projectId, taskId]);

  const accept = useCallback(
    async (suggestion: AiSuggestionItem) => {
      try {
        await apiClient(`/ai/suggestions/${suggestion.id}/accept`, {
          method: "POST",
        });
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      } catch (err: any) {
        setError(err?.error?.message ?? "Accept failed");
      }
    },
    []
  );

  const reject = useCallback(
    async (suggestion: AiSuggestionItem) => {
      try {
        await apiClient(`/ai/suggestions/${suggestion.id}/reject`, {
          method: "POST",
        });
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      } catch (err: any) {
        setError(err?.error?.message ?? "Reject failed");
      }
    },
    []
  );

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[18px] text-ink">AI Suggestions</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={generate}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate"}
        </Button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-3 text-error text-[14px]">
          {error}
        </div>
      )}

      {suggestions.length === 0 && !generating && (
        <p className="text-body text-[14px] text-muted">
          No suggestions right now. Click Generate to see AI-proposed dependencies.
        </p>
      )}

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
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
