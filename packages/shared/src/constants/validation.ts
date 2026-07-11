// Distinct from SKIP_REASONS.MISSING_CONTACT_INFO (constants/skip-reasons.ts),
// which is the authoritative, post-AI skip decision on a mapped CrmRecord.
// NO_CONTACT_INFO_DETECTED is a pre-AI, best-effort heuristic over raw CSV
// values — the two must stay visually distinct so they're never confused.
export const CSV_VALIDATION_ISSUE_CODES = [
  "DUPLICATE_HEADER",
  "EMPTY_HEADER_NAME",
  "NO_CONTACT_INFO_DETECTED",
] as const;
