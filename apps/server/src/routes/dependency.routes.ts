import { Router } from "express";
import { DependencyIdParamsSchema } from "@repo/types";
import { dependencyController } from "../controllers/dependency.controller.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

export const dependencyRouter = Router();
dependencyRouter.use(authMiddleware);
dependencyRouter.delete(
  "/:dependencyId",
  validate(DependencyIdParamsSchema, "params"),
  asyncHandler(dependencyController.remove),
);
