import { z } from "zod";

export const CreateDependencySchema = z.object({
  prerequisiteTaskId: z.number().int().positive(),
  dependentTaskId: z.number().int().positive(),
});

export type CreateDependencyDto = z.infer<typeof CreateDependencySchema>;

export const DependencyIdParamsSchema = z.object({
  dependencyId: z.coerce.number().int().positive(),
});
