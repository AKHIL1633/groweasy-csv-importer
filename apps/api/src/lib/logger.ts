import pino, { type LoggerOptions } from "pino";
import { env } from "../config/env";

const level = env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug");

const options: LoggerOptions = { level };

// pino-pretty is a devDependency (apps/api/package.json), stripped from the
// production Docker image via `npm ci --omit=dev`. Gating this purely on
// NODE_ENV is unsafe: NODE_ENV defaults to "development" when unset
// (config/env.ts), so a deploy that forgot to set NODE_ENV would still try
// to load pino-pretty and crash the whole process on the first log line —
// this happened for real on a first Railway deploy. Checking that the
// module actually resolves is the only condition a misconfigured
// environment variable can't fool.
function prettyTransportIsAvailable(): boolean {
  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

// Key omitted entirely (not set to undefined) when unavailable — required
// under exactOptionalPropertyTypes, and correct anyway: without pino-pretty,
// production gets plain JSON logs regardless of what NODE_ENV says.
if (env.NODE_ENV !== "production" && prettyTransportIsAvailable()) {
  options.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss" },
  };
}

export const logger = pino(options);
