import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandlerMiddleware } from "./middleware/error-handler.middleware";
import { notFoundMiddleware } from "./middleware/not-found.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware";
import { securityHeadersMiddleware } from "./middleware/security-headers.middleware";
import { createRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  // Removes the "X-Powered-By: Express" response header — a free (no new
  // dependency), one-line fix for the tech-stack fingerprinting this
  // otherwise leaks to every client by default.
  app.disable("x-powered-by");

  // Order matters: cors before everything else (a blocked preflight should
  // never reach app logic), request-id before request-logger (the logger
  // reuses the ID request-id just assigned), routes before the Not Found
  // handler (so real routes get a chance to match first), and the error
  // handler last — Express only routes a thrown/next(err) error to handlers
  // registered after the point where it occurred.
  // Each entry trimmed individually too — a multi-origin list like
  // "a.com, b.com" has a leading space on the second entry otherwise, the
  // same class of invisible-whitespace bug env.ts's own .trim() only
  // catches on the outer string, not per comma-separated piece.
  const allowedOrigins = env.ALLOWED_ORIGIN.split(",").map((origin) => origin.trim());
  app.use(cors({ origin: allowedOrigins }));
  app.use(securityHeadersMiddleware);
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  app.use(createRouter());

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
