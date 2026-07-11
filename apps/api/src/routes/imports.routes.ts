import type { ApiResponse, ImportResult } from "@groweasy/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { GeminiProvider } from "../ai/gemini.provider";
import { env } from "../config/env";
import { OperationalError } from "../errors/app-error";
import { uploadMiddleware } from "../middleware/upload.middleware";
import { AiExtractionService } from "../services/ai-extraction.service";
import { ImportPreparationService } from "../services/import-preparation.service";
import { ImportService } from "../services/import.service";

export const importsRouter = Router();

const geminiProvider = new GeminiProvider({
  apiKey: env.GEMINI_API_KEY,
  maxRetries: env.AI_BATCH_MAX_RETRIES,
  requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  retryBaseDelayMs: env.AI_RETRY_BASE_DELAY_MS,
  retryMaxDelayMs: env.AI_RETRY_MAX_DELAY_MS,
});
const aiExtractionService = new AiExtractionService(geminiProvider);
const importPreparationService = new ImportPreparationService();
const importService = new ImportService(
  importPreparationService,
  aiExtractionService,
  env.AI_BATCH_CONCURRENCY,
);

// Express 4 does not forward a rejected promise from an async route handler
// to the error middleware on its own (unlike a synchronous throw) — this is
// the one wrapper needed to make that async handler below safe.
function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

importsRouter.post(
  "/",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new OperationalError(
        400,
        "VALIDATION_ERROR",
        'No file was uploaded. Include a CSV file in the "file" field.',
      );
    }

    const result = await importService.processImport(req.file.buffer);

    const body: ApiResponse<ImportResult> = { data: result };
    res.json(body);
  }),
);
