import type { ApiErrorResponse } from "@groweasy/shared";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { logger } from "../lib/logger";

// The single place that turns a thrown error into the API's JSON error
// envelope — see docs/09-coding-guidelines.md §3. Registered last, after
// every route and the Not Found middleware, so it catches everything.
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const log = req.log ?? logger;

  if (err instanceof AppError) {
    log.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    const body: ApiErrorResponse = { error: { code: err.code, message: err.message } };
    res.status(err.statusCode).json(body);
    return;
  }

  log.error({ err }, "Unhandled error");
  const body: ApiErrorResponse = {
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  };
  res.status(500).json(body);
}
