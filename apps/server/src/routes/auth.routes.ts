import { Router } from "express";
import { LoginSchema, RegisterSchema } from "@repo/types";
import { authController } from "../controllers/auth.controller.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

export const authRouter = Router();

authRouter.post("/register", validate(RegisterSchema), asyncHandler(authController.register));
authRouter.post("/login", validate(LoginSchema), asyncHandler(authController.login));
authRouter.post("/logout", authMiddleware, asyncHandler(authController.logout));
authRouter.get("/me", authMiddleware, asyncHandler(authController.me));
authRouter.post("/refresh", authMiddleware, asyncHandler(authController.refresh));
