import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { AuthenticationError } from "../lib/errors.js";

declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; email: string };
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new AuthenticationError("Missing bearer token."));
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: number;
      email: string;
    };
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch {
    next(new AuthenticationError("Invalid or expired token."));
  }
}
