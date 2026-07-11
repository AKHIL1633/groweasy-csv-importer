import type { NextFunction, Request, Response } from "express";
import { OperationalError } from "../errors/app-error";

// Registered after every real route, so only unmatched paths reach it.
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  next(new OperationalError(404, "NOT_FOUND", `No route matches ${req.method} ${req.originalUrl}`));
}
