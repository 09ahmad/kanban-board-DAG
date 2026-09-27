import { z } from "zod";

export const AiSuggestionItemSchema = z.object({
  id: z.number().int().positive(),
  prerequisiteTaskId: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export type AiSuggestionItem = z.infer<typeof AiSuggestionItemSchema>;

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
