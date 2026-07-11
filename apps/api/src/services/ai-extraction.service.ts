import {
  crmRecordSchema,
  type ExtractionBatchInput,
  type ExtractionBatchResult,
  type RawExtractedRecord,
} from "@groweasy/shared";
import { z } from "zod";
import type { AiProvider } from "../ai/gemini.provider";
import { buildExtractionPrompt } from "../ai/prompt-builder";
import { logger } from "../lib/logger";

const extractionResponseSchema = z.array(crmRecordSchema);

export class AiExtractionService {
  constructor(private readonly provider: AiProvider) {}

  async extractBatch(input: ExtractionBatchInput): Promise<ExtractionBatchResult> {
    const startedAt = Date.now();

    try {
      const prompt = buildExtractionPrompt(input);
      const rawResponse = await this.provider.generateContent(prompt, {
        batchIndex: input.batchIndex,
      });
      const records = this.parseAndValidate(rawResponse, input);

      logger.info(
        {
          batchIndex: input.batchIndex,
          durationMs: Date.now() - startedAt,
          recordCount: records.length,
        },
        "Batch extraction succeeded",
      );

      return { records, batchIndex: input.batchIndex };
    } catch (err) {
      logger.error(
        {
          batchIndex: input.batchIndex,
          durationMs: Date.now() - startedAt,
          errorType: err instanceof Error ? err.name : typeof err,
        },
        "Batch extraction failed",
      );
      throw err;
    }
  }

  private parseAndValidate(rawResponse: string, input: ExtractionBatchInput): RawExtractedRecord[] {
    const json = extractJson(rawResponse);
    const result = extractionResponseSchema.safeParse(json);

    if (!result.success) {
      throw new AiExtractionValidationError(
        "Gemini's response did not match the expected CRM record shape.",
      );
    }

    if (result.data.length !== input.rows.length) {
      throw new AiExtractionValidationError(
        `Expected ${input.rows.length} records but received ${result.data.length}.`,
      );
    }

    return result.data;
  }
}

function extractJson(rawResponse: string): unknown {
  const trimmed = rawResponse.trim();

  if (trimmed.length === 0) {
    throw new AiExtractionValidationError("Gemini returned an empty response.");
  }

  const withoutFences = stripMarkdownFences(trimmed);
  const direct = tryParseJson(withoutFences);
  if (direct !== undefined) {
    return direct;
  }

  const arraySlice = extractJsonArraySlice(withoutFences);
  const fromSlice = arraySlice ? tryParseJson(arraySlice) : undefined;
  if (fromSlice !== undefined) {
    return fromSlice;
  }

  throw new AiExtractionValidationError("Gemini's response was not valid JSON.");
}

// Handles a fenced block anywhere in the text, not just at the very start —
// covers both "```json\n[...]\n```" alone and a fence surrounded by
// explanatory prose the prompt asked the model not to include.
function stripMarkdownFences(text: string): string {
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  return fenceMatch?.[1] ?? text;
}

// Last-resort fallback for a response that has stray text around a JSON
// array but no code fence at all.
function extractJsonArraySlice(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

// JSON.parse never legitimately returns undefined, so it's a safe "parsing
// failed" sentinel here.
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// Framework-independent, like AiProviderCallError — never retried (per the
// "do not retry validation failures" requirement, retry only wraps the
// provider's own network call, not this parsing/validation step).
export class AiExtractionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiExtractionValidationError";
  }
}
