import { z } from "zod";
import { ProjectRole } from "../enums.ts";

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial();

export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;

export const AddMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum([ProjectRole.OWNER, ProjectRole.MEMBER]).optional(),
});

export type AddMemberDto = z.infer<typeof AddMemberSchema>;

export const ProjectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export const MemberParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});
