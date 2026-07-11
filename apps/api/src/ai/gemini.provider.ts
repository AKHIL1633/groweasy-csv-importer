import { ApiError, GoogleGenAI, Type, type Schema } from "@google/genai";
import { CRM_FIELDS } from "@groweasy/shared";
import { logger } from "../lib/logger";

// "gemini-2.5-flash" (pinned) was retired for new API keys — confirmed via
// a live models.list() call against this project's key, which returned a
// 404 NOT_FOUND for that pinned name. Using Google's "-latest" alias
// instead of another pinned version avoids repeating this exact failure
// the next time a specific version is retired.
const MODEL_NAME = "gemini-flash-latest";
// Full jitter keeps concurrent batches from retrying in lockstep — without
// it, N batches that all get rate-limited at the same instant would all
// retry at the same instant too, re-tripping the same rate limit together.
const JITTER_FACTOR = 0.3;

// batchIndex is the only thing ImportService/AiExtractionService know that
// GeminiProvider doesn't — passed through purely as a log-correlation id so
// every Gemini-request log line can be tied back to the batch that caused
// it. It does not change what GeminiProvider does, only what it logs with.
export interface AiRequestContext {
  batchIndex: number;
}

// The interface a future OpenAI/Claude provider would implement instead of
// GeminiProvider. Deliberately narrower than docs/07-ai-design.md's original
// AiExtractionProvider sketch (which bundled prompt-building + parsing +
// validation into one method) — a "send text, get text back" contract is
// the smallest possible surface a new provider has to implement, since
// prompt-building and response parsing/validation are shared, provider-
// agnostic concerns that live elsewhere (prompt-builder.ts,
// ai-extraction.service.ts) and never need reimplementing per provider.
export interface AiProvider {
  generateContent(prompt: string, context: AiRequestContext): Promise<string>;
}

export interface GeminiProviderConfig {
  apiKey: string;
  maxRetries: number;
  requestTimeoutMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Classifying the real Gemini failure -----------------------------------
//
// @google/genai's ApiError only surfaces a flat `status` number (429, 500,
// ...) on the TypeScript type, but the SDK actually JSON-stringifies
// Google's full structured error body into `ApiError#message` before
// throwing (see throwErrorIfNotOK in the SDK). That body carries the pieces
// a flat status code can't: the Google-specific status string
// (RESOURCE_EXHAUSTED vs. UNAVAILABLE vs. INVALID_ARGUMENT), and — for 429s
// — a RetryInfo/QuotaFailure detail with a server-suggested retry delay.
// Parsing it back out is what makes "quota/rate-limit info if available"
// (this task's requirement) possible at all.

interface GoogleErrorDetail {
  "@type"?: string;
  retryDelay?: string;
}

interface GoogleErrorBody {
  code?: number;
  message?: string;
  status?: string;
  details?: GoogleErrorDetail[];
}

function parseGoogleErrorBody(rawMessage: string): GoogleErrorBody | undefined {
  try {
    const parsed = JSON.parse(rawMessage) as { error?: GoogleErrorBody };
    return parsed.error;
  } catch {
    return undefined;
  }
}

function parseServerRetryDelayMs(body: GoogleErrorBody | undefined): number | undefined {
  const retryInfo = body?.details?.find((detail) => detail["@type"]?.endsWith("RetryInfo"));
  const match = retryInfo?.retryDelay ? /^(\d+(?:\.\d+)?)s$/.exec(retryInfo.retryDelay) : null;
  return match?.[1] ? Number(match[1]) * 1000 : undefined;
}

function hasQuotaFailureDetail(body: GoogleErrorBody | undefined): boolean {
  return body?.details?.some((detail) => detail["@type"]?.endsWith("QuotaFailure")) ?? false;
}

export type GeminiFailureReason =
  "RATE_LIMITED" | "SERVER_ERROR" | "TIMEOUT" | "TRANSPORT_ERROR" | "INVALID_REQUEST" | "UNKNOWN";

export interface ClassifiedGeminiError {
  reason: GeminiFailureReason;
  retryable: boolean;
  httpStatus?: number | undefined;
  googleStatus?: string | undefined;
  quotaExhausted: boolean;
  serverRetryDelayMs?: number | undefined;
  message: string;
}

// The retry *decision* here (429/5xx retryable, everything else not) is
// unchanged from before this task — only the classification/labeling and
// the quota/retry-delay extraction are new. A non-ApiError reaching here is
// a transport-level failure (DNS, connection reset) or our own request
// timeout (AbortError), both worth retrying same as before.
export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  if (err instanceof ApiError) {
    const body = parseGoogleErrorBody(err.message);
    const googleStatus = body?.status;
    const message = body?.message ?? err.message;
    const serverRetryDelayMs = parseServerRetryDelayMs(body);

    if (err.status === 429) {
      return {
        reason: "RATE_LIMITED",
        retryable: true,
        httpStatus: err.status,
        googleStatus,
        quotaExhausted: hasQuotaFailureDetail(body),
        serverRetryDelayMs,
        message,
      };
    }
    if (err.status >= 500) {
      return {
        reason: "SERVER_ERROR",
        retryable: true,
        httpStatus: err.status,
        googleStatus,
        quotaExhausted: false,
        message,
      };
    }
    return {
      reason: "INVALID_REQUEST",
      retryable: false,
      httpStatus: err.status,
      googleStatus,
      quotaExhausted: false,
      message,
    };
  }

  if (err instanceof Error && err.name === "AbortError") {
    return { reason: "TIMEOUT", retryable: true, quotaExhausted: false, message: err.message };
  }

  if (err instanceof Error) {
    return {
      reason: "TRANSPORT_ERROR",
      retryable: true,
      quotaExhausted: false,
      message: err.message,
    };
  }

  return { reason: "UNKNOWN", retryable: true, quotaExhausted: false, message: String(err) };
}

// Exponential backoff with full jitter, capped at retryMaxDelayMs. For a
// rate limit that came with a server-suggested delay (RetryInfo), that
// delay is honored instead of guessing — but still capped, since this is a
// single bounded HTTP request/response cycle (no job queue to defer into,
// per docs/03-system-architecture.md §5-6), not a background worker that
// can afford to wait out an arbitrary quota reset window.
export function computeRetryDelayMs(
  attempt: number,
  classified: ClassifiedGeminiError,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  if (classified.serverRetryDelayMs !== undefined) {
    return Math.min(classified.serverRetryDelayMs, maxDelayMs);
  }

  const exponential = baseDelayMs * 2 ** attempt;
  const jittered = exponential * (1 - JITTER_FACTOR + Math.random() * 2 * JITTER_FACTOR);
  return Math.min(Math.round(jittered), maxDelayMs);
}

// Structured-output schema for one CRM record. Built from the same shared
// constants the prompt text uses, so the two can never drift apart.
//
// crm_status/data_source are deliberately plain STRING here, not a Gemini
// `enum`-constrained schema: Gemini's structured output rejects an empty
// string as an enum member ("enum[...]: cannot be empty"), but both fields
// must be allowed to be blank per the CRM schema. The prompt text spells
// out the exact allowed values, and — since AI output is never trusted
// blindly (docs/07-ai-design.md §4) — the shared zod crmRecordSchema is the
// actual authority that rejects an invalid value regardless of what
// Gemini's schema does or doesn't constrain.
function buildCrmRecordArraySchema(): Schema {
  const properties: Record<string, Schema> = {};

  for (const field of CRM_FIELDS) {
    properties[field.key] = { type: Type.STRING };
  }

  const fieldNames = CRM_FIELDS.map((field) => field.key);

  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties,
      required: fieldNames,
      propertyOrdering: fieldNames,
    },
  };
}

const RESPONSE_SCHEMA = buildCrmRecordArraySchema();

export class GeminiProvider implements AiProvider {
  private readonly client: GoogleGenAI;
  private readonly maxRetries: number;
  private readonly requestTimeoutMs: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.maxRetries = config.maxRetries;
    this.requestTimeoutMs = config.requestTimeoutMs;
    this.retryBaseDelayMs = config.retryBaseDelayMs;
    this.retryMaxDelayMs = config.retryMaxDelayMs;
  }

  async generateContent(prompt: string, context: AiRequestContext): Promise<string> {
    let lastClassified: ClassifiedGeminiError | undefined;
    let lastAttempt = 0;

    for (let attempt = 1; ; attempt++) {
      lastAttempt = attempt;
      try {
        return await this.callGeminiOnce(prompt, context, attempt);
      } catch (err) {
        const classified = classifyGeminiError(err);
        lastClassified = classified;
        const exhaustedRetries = attempt > this.maxRetries;

        if (exhaustedRetries || !classified.retryable) {
          break;
        }

        const delayMs = computeRetryDelayMs(
          attempt - 1,
          classified,
          this.retryBaseDelayMs,
          this.retryMaxDelayMs,
        );

        logger.warn(
          {
            batchIndex: context.batchIndex,
            attempt,
            maxRetries: this.maxRetries,
            retryReason: classified.reason,
            httpStatus: classified.httpStatus,
            googleStatus: classified.googleStatus,
            quotaExhausted: classified.quotaExhausted,
            nextRetryDelayMs: delayMs,
          },
          "Gemini call failed, retrying",
        );

        await sleep(delayMs);
      }
    }

    logger.error(
      {
        batchIndex: context.batchIndex,
        totalAttempts: lastAttempt,
        retryReason: lastClassified?.reason,
        httpStatus: lastClassified?.httpStatus,
        googleStatus: lastClassified?.googleStatus,
        quotaExhausted: lastClassified?.quotaExhausted,
        errorMessage: lastClassified?.message,
      },
      "Gemini call failed permanently",
    );

    // The classified detail (status, googleStatus, quota info) never leaves
    // this log line — AiProviderCallError carries only a fixed, generic
    // message. ImportService's UPSTREAM_AI_ERROR response to the client
    // (see docs/05-api-design.md §2) is unaffected by any of this.
    throw new AiProviderCallError("Gemini request failed.", { cause: lastClassified });
  }

  // One Gemini HTTP call, one log line — success or failure, every attempt.
  // This is the layer that actually sees request/response bytes and
  // finishReason, so it's the only place that can log them meaningfully.
  private async callGeminiOnce(
    prompt: string,
    context: AiRequestContext,
    attempt: number,
  ): Promise<string> {
    const startTime = new Date();
    const requestBytes = Buffer.byteLength(prompt, "utf-8");

    try {
      const response = await this.client.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          httpOptions: { timeout: this.requestTimeoutMs },
        },
      });

      const text = response.text ?? "";
      const endTime = new Date();

      logger.info(
        {
          batchIndex: context.batchIndex,
          attempt,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMs: endTime.getTime() - startTime.getTime(),
          requestBytes,
          responseBytes: Buffer.byteLength(text, "utf-8"),
          finishReason: response.candidates?.[0]?.finishReason,
          httpStatus: 200,
        },
        "Gemini request succeeded",
      );

      return text;
    } catch (err) {
      const endTime = new Date();
      const classified = classifyGeminiError(err);

      logger.warn(
        {
          batchIndex: context.batchIndex,
          attempt,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMs: endTime.getTime() - startTime.getTime(),
          requestBytes,
          retryReason: classified.reason,
          httpStatus: classified.httpStatus,
          googleStatus: classified.googleStatus,
          quotaExhausted: classified.quotaExhausted,
          errorMessage: classified.message,
        },
        "Gemini request failed",
      );

      throw err;
    }
  }
}

// Framework-independent (not an AppError — see docs/06-shared-package.md §6
// on keeping the AI layer decoupled from HTTP semantics); apps/api/src/
// routes translates this into the API's error contract wherever it's
// eventually caught. `cause` carries the classified detail for anything
// upstream that wants it (currently nothing does — it's for future
// debugging via `err.cause`, never serialized to the client).
export class AiProviderCallError extends Error {
  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = "AiProviderCallError";
  }
}
