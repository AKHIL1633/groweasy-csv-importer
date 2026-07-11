// See docs/05-api-design.md §4 — the full error taxonomy. NOT_FOUND is a
// generic addition (not in that table, which only covers /api/imports):
// every Express app needs a code for "no route matched" independent of any
// specific endpoint's business errors.
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_FILE_TYPE",
  "PAYLOAD_TOO_LARGE",
  "EMPTY_OR_UNPARSEABLE_CSV",
  "TOO_MANY_ROWS",
  "UPSTREAM_AI_ERROR",
  "INTERNAL_ERROR",
  "NOT_FOUND",
] as const;
