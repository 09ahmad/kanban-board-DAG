import { Router } from "express";
import { AssignTaskSchema, MoveTaskSchema, TaskIdParamsSchema, UpdateTaskSchema } from "@repo/types";
import { taskController } from "../controllers/task.controller.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

export const taskRouter = Router();
taskRouter.use(authMiddleware);

taskRouter.get("/:taskId", validate(TaskIdParamsSchema, "params"), asyncHandler(taskController.get));
taskRouter.patch(
  "/:taskId",
  validate(TaskIdParamsSchema, "params"),
  validate(UpdateTaskSchema),
  asyncHandler(taskController.update),
);
taskRouter.patch(
  "/:taskId/move",
  validate(TaskIdParamsSchema, "params"),
  validate(MoveTaskSchema),
  asyncHandler(taskController.move),
);
taskRouter.patch(
  "/:taskId/assign",
  validate(TaskIdParamsSchema, "params"),
  validate(AssignTaskSchema),
  asyncHandler(taskController.assign),
);
taskRouter.delete(
  "/:taskId",
  validate(TaskIdParamsSchema, "params"),
  asyncHandler(taskController.remove),
);
