import { Router } from "express";
import {
  AddMemberSchema,
  CreateDependencySchema,
  CreateProjectSchema,
  CreateTaskSchema,
  GenerateSuggestionsSchema,
  MemberParamsSchema,
  ProjectEventsQuerySchema,
  ProjectIdParamsSchema,
  TaskSuggestionsQuerySchema,
  UpdateProjectSchema,
} from "@repo/types";
import { aiController } from "../controllers/ai.controller.js";
import { dependencyController } from "../controllers/dependency.controller.js";
import { projectController } from "../controllers/project.controller.js";
import { taskController } from "../controllers/task.controller.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

export const projectRouter = Router();

projectRouter.use(authMiddleware);

projectRouter.post("/", validate(CreateProjectSchema), asyncHandler(projectController.create));
projectRouter.get("/", asyncHandler(projectController.list));
projectRouter.get(
  "/:projectId",
  validate(ProjectIdParamsSchema, "params"),
  asyncHandler(projectController.get),
);
projectRouter.patch(
  "/:projectId",
  validate(ProjectIdParamsSchema, "params"),
  validate(UpdateProjectSchema),
  asyncHandler(projectController.update),
);
projectRouter.delete(
  "/:projectId",
  validate(ProjectIdParamsSchema, "params"),
  asyncHandler(projectController.remove),
);
projectRouter.post(
  "/:projectId/members",
  validate(ProjectIdParamsSchema, "params"),
  validate(AddMemberSchema),
  asyncHandler(projectController.addMember),
);
projectRouter.delete(
  "/:projectId/members/:userId",
  validate(MemberParamsSchema, "params"),
  asyncHandler(projectController.removeMember),
);
projectRouter.post(
  "/:projectId/tasks",
  validate(ProjectIdParamsSchema, "params"),
  validate(CreateTaskSchema),
  asyncHandler(taskController.create),
);
projectRouter.get(
  "/:projectId/tasks",
  validate(ProjectIdParamsSchema, "params"),
  asyncHandler(taskController.list),
);
projectRouter.post(
  "/:projectId/dependencies",
  validate(ProjectIdParamsSchema, "params"),
  validate(CreateDependencySchema),
  asyncHandler(dependencyController.create),
);
projectRouter.get(
  "/:projectId/graph",
  validate(ProjectIdParamsSchema, "params"),
  asyncHandler(dependencyController.graph),
);
projectRouter.get(
  "/:projectId/critical-path",
  validate(ProjectIdParamsSchema, "params"),
  asyncHandler(dependencyController.criticalPath),
);
projectRouter.get(
  "/:projectId/events",
  validate(ProjectIdParamsSchema, "params"),
  validate(ProjectEventsQuerySchema, "query"),
  asyncHandler(dependencyController.events),
);
projectRouter.post(
  "/:projectId/ai/dependency-suggestions",
  validate(ProjectIdParamsSchema, "params"),
  validate(GenerateSuggestionsSchema),
  asyncHandler(aiController.generate),
);
projectRouter.get(
  "/:projectId/ai/dependency-suggestions",
  validate(ProjectIdParamsSchema, "params"),
  validate(TaskSuggestionsQuerySchema, "query"),
  asyncHandler(aiController.listSuggestions),
);
