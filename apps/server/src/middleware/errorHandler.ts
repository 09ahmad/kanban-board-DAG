import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  const message =
    err instanceof Error ? err.message : "Internal server error";
  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: config.nodeEnv === "production" ? "Internal server error" : message,
    },
  });
}
