import type { AiSuggestionCandidate } from "@repo/types";
import { AiSuggestionCandidateResponseSchema } from "@repo/types";
import { config } from "../config/env.js";

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiProvider {
  generateDependencySuggestions(context: {
    projectName: string;
    taskId: number;
    tasks: { id: number; title: string }[];
  }): Promise<AiSuggestionCandidate[]>;
}

/**
 * OpenAI AI Provider - uses OpenAI's GPT models via the Chat Completions API.
 * Falls back gracefully when no API key is configured (returns empty suggestions).
 */
export class OpenAiProvider implements AiProvider {
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = config.llm.timeoutMs) {
    this.timeoutMs = timeoutMs;
  }

  async generateDependencySuggestions(context: {
    projectName: string;
    taskId: number;
    tasks: { id: number; title: string }[];
  }): Promise<AiSuggestionCandidate[]> {
    const apiKey = config.llm.apiKey;
    if (!apiKey) {
      return [];
    }

    const prompt = `You are an expert task dependency analyst for Kanban project management.

Given the current task and all available tasks, analyze the titles to determine which tasks should logically precede the current task.

Project: ${context.projectName}
Current task ID: ${context.taskId}
Available tasks: ${JSON.stringify(context.tasks)}

Instructions:
1. Read all task titles carefully and understand their semantic meaning
2. A task should be a prerequisite if it is logically required before the current task can begin (e.g., "Create API endpoint" must come before "Write API tests")
3. Do NOT suggest a task if it depends on the current task (reverse dependency)
4. Do NOT suggest the current task itself
5. Return ONLY valid JSON in the exact format specified

Output format (strict schema):
{
  "suggestions": [
    {
      "prerequisiteTaskId": <number>,   // Must be an existing task ID from the input
      "confidence": <number 0-1>,     // How certain you are this is a true dependency
      "reason": "<string>"              // Brief explanation: e.g., "Must complete before", "Required for", "Blocks"
    }
  ]
}
Max 10 suggestions. Focus on strong logical dependencies, not weak ones.`;

    const url = `${config.llm.baseUrl}/chat/completions`;

    // The provider is a third party on a network we do not control. Without a
    // bound, a stalled upstream holds this request — and the connection serving
    // it — open indefinitely.
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.llm.model,
          messages: [{
            role: "user",
            content: prompt
          }],
          // Reading dependencies out of task titles is a lookup, not a writing
          // task. Any randomness here just makes the same project propose
          // different edges on a later click.
          temperature: 0,
          max_tokens: 1024,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`OpenAI API request failed: ${response.status} - ${errorText}`);
        return [];
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;

      if (!text) {
        console.warn("OpenAI returned no content");
        return [];
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.warn("OpenAI returned invalid JSON");
        return [];
      }

      const validated = AiSuggestionCandidateResponseSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn("OpenAI payload failed validation");
        return [];
      }

      return validated.data.suggestions;
    } catch (error) {
      // A timeout, a refused connection or an unreadable body all mean the same
      // thing here: no suggestions, and the request still completes.
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`OpenAI API request failed: ${reason}`);
      return [];
    } finally {
      clearTimeout(deadline);
    }
  }
}

/**
 * Rule-based dependency analysis over task titles — no network, no key.
 * The fallback that keeps Generate working when the LLM is unreachable,
 * rate-limited, or never configured. Deterministic: the same project always
 * proposes the same edges.
 */
export class HeuristicAiProvider implements AiProvider {
  async generateDependencySuggestions(context: {
    projectName: string;
    taskId: number;
    tasks: { id: number; title: string }[];
  }): Promise<AiSuggestionCandidate[]> {
    const current = context.tasks.find((t) => t.id === context.taskId);
    if (!current) return [];

    const STOP = new Set([
      "the", "and", "for", "with", "this", "that", "into", "from", "out",
      "all", "any", "add", "use", "our",
    ]);

    const words = (title: string): string[] =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w));

    // A small stage ladder breaks ties when titles share no wording: setup
    // work precedes the integration and verification that sit on top of it.
    const EARLY = ["design", "plan", "setup", "install", "create", "build", "scaffold", "schema", "model", "database", "auth", "endpoint", "api"];
    const LATE = ["test", "testing", "integrate", "integration", "deploy", "deployment", "verify", "validate", "review", "launch", "release", "document", "polish", "docs"];

    const stageOf = (ws: string[]): number => {
      const early = ws.some((w) => EARLY.includes(w));
      const late = ws.some((w) => LATE.includes(w));
      if (early && !late) return 0;
      if (early && late) return 1;
      if (!early && !late) return 2;
      return 3;
    };

    const currentWords = words(current.title);
    const currentStage = stageOf(currentWords);

    const scored = context.tasks
      .filter((t) => t.id !== context.taskId)
      .map((t) => {
        const w = words(t.title);
        const shared = [...currentWords].filter((x) => w.includes(x));
        const earlierStage = currentStage > 0 && stageOf(w) < currentStage;
        const score = shared.length + (earlierStage ? 1 : 0);
        return { id: t.id, title: t.title, shared, earlierStage, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, 5);

    return scored.map((c) => ({
      prerequisiteTaskId: c.id,
      confidence: Math.min(0.9, 0.5 + 0.15 * c.score),
      reason: c.earlierStage
        ? `Earlier-stage work this task builds on${c.shared.length > 0 ? ` (${c.shared.join(", ")})` : ""}`
        : `Shares scope: ${c.shared.join(", ")}`,
    }));
  }
}

/**
 * Tries the configured LLM first and falls back to the heuristic analysis
 * when it yields nothing — a rate limit, a timeout, or an unreadable body
 * all mean the panel still gets real suggestions instead of an empty list.
 */
class FallbackAiProvider implements AiProvider {
  constructor(private readonly primary: AiProvider) {}

  async generateDependencySuggestions(context: {
    projectName: string;
    taskId: number;
    tasks: { id: number; title: string }[];
  }): Promise<AiSuggestionCandidate[]> {
    const fromLlm = await this.primary.generateDependencySuggestions(context);
    if (fromLlm.length > 0) return fromLlm;
    console.warn("LLM yielded nothing; falling back to heuristic dependency analysis");
    return new HeuristicAiProvider().generateDependencySuggestions(context);
  }
}

let aiProviderWarned = false;

export function createAiProvider(): AiProvider {
  if (!config.llm.apiKey && !aiProviderWarned) {
    console.warn(
      "⚠️  AI Service: LLM_API_KEY not configured. Using heuristic dependency analysis (no network).\n" +
      "   Add LLM_API_KEY to .env to enable LLM-powered suggestions (e.g., OpenAI or OpenRouter key).\n" +
      "   Example: LLM_API_KEY=sk-your-key-here"
    );
    aiProviderWarned = true;
  }
  return config.llm.apiKey
    ? new FallbackAiProvider(new OpenAiProvider())
    : new HeuristicAiProvider();
}