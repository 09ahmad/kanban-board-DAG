import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../lib/errors.js";

type Target = "body" | "params" | "query";

export function validate(schema: ZodType, target: Target = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      next(new ValidationError(message));
      return;
    }
    req[target] = result.data as never;
    next();
  };
}
