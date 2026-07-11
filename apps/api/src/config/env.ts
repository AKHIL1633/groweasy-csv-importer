import path from "node:path";
import {
  DEFAULT_AI_BATCH_CONCURRENCY,
  DEFAULT_AI_BATCH_MAX_RETRIES,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  DEFAULT_AI_RETRY_BASE_DELAY_MS,
  DEFAULT_AI_RETRY_MAX_DELAY_MS,
} from "@groweasy/shared";
import dotenv from "dotenv";
import { z } from "zod";

// Local dev convenience only: loads the monorepo-root .env into process.env.
// In production the platform injects real env vars directly, so this simply
// finds nothing and no-ops — see docs/11-deployment-plan.md §2.
dotenv.config({ path: path.resolve(__dirname, "../../../../.env"), quiet: true });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    // AI_PROVIDER is intentionally not read yet — there is exactly one
    // provider and no factory/selection logic until a second one exists
    // (docs/09-coding-guidelines.md §2, "no speculative config").
    GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
    AI_BATCH_MAX_RETRIES: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_AI_BATCH_MAX_RETRIES),
    // How many batches may call the AI provider concurrently. Lower this if a
    // Gemini API key's rate limit is being tripped by concurrent batches —
    // see docs/07-ai-design.md §5.
    AI_BATCH_CONCURRENCY: z.coerce.number().int().positive().default(DEFAULT_AI_BATCH_CONCURRENCY),
    // Per-request timeout to Gemini, in ms. Bounds how long one batch attempt
    // can hang before it's treated as a retryable failure.
    AI_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_AI_REQUEST_TIMEOUT_MS),
    AI_RETRY_BASE_DELAY_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_AI_RETRY_BASE_DELAY_MS),
    AI_RETRY_MAX_DELAY_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_AI_RETRY_MAX_DELAY_MS),
    // Comma-separated allowed origins for CORS — see docs/05-api-design.md §5
    // and docs/11-deployment-plan.md §4. Never a wildcard. No default here:
    // defaulting to localhost would let a production deploy silently boot
    // with CORS that can never match the real frontend origin instead of
    // failing loudly, which is enforced below instead. .trim() matters in
    // practice, not just in theory: a Railway deploy once had this value
    // saved with a trailing newline (invisible in the dashboard UI), which
    // silently broke every CORS check via exact string mismatch against the
    // real Origin header — a value that "looks right" isn't good enough.
    ALLOWED_ORIGIN: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && !data.ALLOWED_ORIGIN) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOWED_ORIGIN"],
        message:
          "ALLOWED_ORIGIN is required in production — set it to the deployed frontend's exact origin(s).",
      });
    }
  });

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // The logger isn't safe to use yet — its own level depends on this
    // config — so this is the one place that logs via console directly
    // (already allowed by the base ESLint config's no-console rule).
    console.error("Invalid environment variables:", z.treeifyError(result.error));
    process.exit(1);
  }

  return {
    ...result.data,
    // Only defaulted for local dev/test convenience — production requires
    // an explicit value, enforced by the superRefine above.
    ALLOWED_ORIGIN: result.data.ALLOWED_ORIGIN ?? "http://localhost:3000",
  };
}

export type Env = ReturnType<typeof loadEnv>;
export const env = loadEnv();
