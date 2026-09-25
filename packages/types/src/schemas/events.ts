import { z } from "zod";

export const ProjectEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  before: z.coerce.number().int().positive().optional(),
});
