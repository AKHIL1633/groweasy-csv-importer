import pino, { type LoggerOptions } from "pino";
import { env } from "../config/env";

const level = env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug");

const options: LoggerOptions = { level };

// Key omitted entirely (not set to undefined) in production — required
// under exactOptionalPropertyTypes, and correct anyway: production wants
// plain JSON logs, not the pino-pretty dev transport.
if (env.NODE_ENV !== "production") {
  options.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss" },
  };
}

export const logger = pino(options);
