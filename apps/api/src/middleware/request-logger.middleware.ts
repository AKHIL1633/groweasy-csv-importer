import pinoHttp from "pino-http";
import { logger } from "../lib/logger";

// Wraps the shared pino instance so every request/response line is a child
// log carrying req.id — reuses the ID request-id.middleware already
// assigned instead of generating a second one.
export const requestLoggerMiddleware = pinoHttp({
  logger,
  genReqId: (req) => req.id,
});
