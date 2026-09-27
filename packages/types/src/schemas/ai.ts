import { z } from "zod";

export const AiSuggestionItemSchema = z.object({
  id: z.number().int().positive(),
  prerequisiteTaskId: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  criticalPathImpactDays: z.number().nullable().optional(),
});

export type AiSuggestionItem = z.infer<typeof AiSuggestionItemSchema>;

/**
 * A suggestion as the model proposes it, before the database has seen it.
 *
 * Deliberately separate from `AiSuggestionItemSchema`: the row id is assigned by
 * PostgreSQL on insert, so a model asked for one either invents a number or
 * fails to answer. Validating model output against the stored shape rejected
 * every response and the feature silently returned nothing.
 */
export const AiSuggestionCandidateSchema = z.object({
  prerequisiteTaskId: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export type AiSuggestionCandidate = z.infer<typeof AiSuggestionCandidateSchema>;

export const AiSuggestionCandidateResponseSchema = z.object({
  suggestions: z.array(AiSuggestionCandidateSchema).max(10),
});

export type AiSuggestionCandidateResponse = z.infer<typeof AiSuggestionCandidateResponseSchema>;

export const AiSuggestionResponseSchema = z.object({
  suggestions: z.array(AiSuggestionItemSchema).max(10),
});

export type AiSuggestionResponse = z.infer<typeof AiSuggestionResponseSchema>;

export const SuggestionIdParamsSchema = z.object({
  suggestionId: z.coerce.number().int().positive(),
});

export const GenerateSuggestionsSchema = z.object({
  taskId: z.number().int().positive(),
});

/** `queued`/`running` mean the LLM call is still outstanding. */
export const SuggestionRunStateSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);
export type SuggestionRunStateDto = z.infer<typeof SuggestionRunStateSchema>;

export const TaskSuggestionsQuerySchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

/** What a poller reads while a background run is outstanding. */
export const SuggestionRunSchema = z.object({
  suggestions: z.array(AiSuggestionItemSchema),
  status: SuggestionRunStateSchema,
});
export type SuggestionRun = z.infer<typeof SuggestionRunSchema>;
