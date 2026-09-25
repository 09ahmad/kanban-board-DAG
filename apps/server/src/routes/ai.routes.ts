import { Router } from "express";
import { SuggestionIdParamsSchema, GenerateSuggestionsSchema } from "@repo/types";
import { aiController } from "../controllers/ai.controller.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

export const aiRouter = Router();
aiRouter.use(authMiddleware);

aiRouter.post(
  "/suggestions/:suggestionId/accept",
  validate(SuggestionIdParamsSchema, "params"),
  asyncHandler(aiController.accept),
);
aiRouter.post(
  "/suggestions/:suggestionId/reject",
  validate(SuggestionIdParamsSchema, "params"),
  asyncHandler(aiController.reject),
);