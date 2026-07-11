import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "X-Request-Id";

// Always generates a fresh ID server-side rather than trusting a
// client-supplied X-Request-Id — this API isn't behind a proxy that assigns
// correlation IDs, so there's nothing legitimate to pass through yet.
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}
