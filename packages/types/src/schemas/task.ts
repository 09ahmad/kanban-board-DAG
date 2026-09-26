import { z } from "zod";
import { TaskStatus } from "../enums.ts";

const taskStatusValues = [
  TaskStatus.BACKLOG,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVIEW,
  TaskStatus.DONE,
] as const;

export const CreateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(taskStatusValues).optional(),
  position: z.number().int().optional(),
  plannedStart: z.coerce.date().optional(),
  duration: z.number().int().positive().optional(),
});

export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial();

export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;

export const MoveTaskSchema = z.object({
  status: z.enum(taskStatusValues),
  position: z.number().int().optional(),
});

export type MoveTaskDto = z.infer<typeof MoveTaskSchema>;

export const TaskIdParamsSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

export const ProjectTaskParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});
