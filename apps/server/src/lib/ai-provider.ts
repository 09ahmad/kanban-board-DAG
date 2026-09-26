import type { AiSuggestionItem } from "@repo/types";
import { AiSuggestionResponseSchema } from "@repo/types";
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
  }): Promise<AiSuggestionItem[]>;
}

/**
 * OpenAI AI Provider - uses OpenAI's GPT models via the Chat Completions API.
 * Falls back gracefully when no API key is configured (returns empty suggestions).
 */
class OpenAiProvider implements AiProvider {
  async generateDependencySuggestions(context: {
    projectName: string;
    taskId: number;
    tasks: { id: number; title: string }[];
  }): Promise<AiSuggestionItem[]> {
    const apiKey = process.env.LLM_API_KEY;
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
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "json_object" }
      }),
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

    const validated = AiSuggestionResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn("OpenAI payload failed validation");
      return [];
    }

    return validated.data.suggestions;
  }
}

class NoopAiProvider implements AiProvider {
  async generateDependencySuggestions(): Promise<AiSuggestionItem[]> {
    return [];
  }
}

export function createAiProvider(): AiProvider {
  return config.llm.apiKey
    ? new OpenAiProvider()
    : new NoopAiProvider();
}