export const MAX_UPLOAD_SIZE_MB = 5;
export const MAX_CSV_ROWS = 10_000;
export const DEFAULT_AI_BATCH_SIZE = 25;
export const DEFAULT_AI_BATCH_CONCURRENCY = 3;
export const DEFAULT_AI_BATCH_MAX_RETRIES = 2;
// Per-request timeout to the AI provider — bounds how long one batch can
// hang before the retry loop treats it as a failure (see docs/07-ai-design.md §5).
export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 60_000;
// Base and cap for the retry backoff curve (exponential + jitter). The cap
// matters most for rate-limit responses that suggest a long server-side
// retry delay — without it, a single retry could stall the whole request.
export const DEFAULT_AI_RETRY_BASE_DELAY_MS = 500;
export const DEFAULT_AI_RETRY_MAX_DELAY_MS = 8_000;
