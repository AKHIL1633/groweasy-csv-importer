import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API server started");
});

// app.listen() failures (e.g. port already in use) surface asynchronously
// on this event, not as a thrown exception from listen() itself.
server.on("error", (error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutdown signal received, closing server");

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error while closing server");
      process.exit(1);
    }
    logger.info("Server closed gracefully");
    process.exit(0);
  });

  // Belt-and-suspenders: force-exit if an open connection keeps close()
  // from ever calling back.
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
