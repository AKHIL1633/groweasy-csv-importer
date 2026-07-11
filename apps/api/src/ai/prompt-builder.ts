import { CRM_FIELDS, CRM_STATUS_VALUES, DATA_SOURCE_VALUES } from "@groweasy/shared";
import type { ExtractionBatchInput } from "@groweasy/shared";

// Every row in a batch already passed Phase 5/6's contact-info pre-check
// before it was ever batched, so — unlike docs/07-ai-design.md's original
// sketch — this prompt does not ask the model to decide whether to skip a
// row. It always returns exactly one record per input row; the actual
// import/skip decision is made later, in code, from the returned data —
// the skip rule is re-applied in code regardless of what the prompt says
// (docs/07-ai-design.md §4: AI output is never trusted blindly).
export function buildExtractionPrompt(input: ExtractionBatchInput): string {
  return [
    buildRoleSection(),
    buildFieldSection(),
    buildRulesSection(),
    buildResponseFormatSection(input.rows.length),
    buildInputSection(input),
  ].join("\n\n");
}

function buildRoleSection(): string {
  return [
    "You are extracting CRM lead data from a batch of rows taken from an",
    "arbitrary CSV export (Facebook Lead Ads, Google Ads, a real-estate CRM,",
    "a manually created spreadsheet, or similar). Column names are",
    "unpredictable and will not match the target field names below.",
  ].join(" ");
}

function buildFieldSection(): string {
  const fieldLines = CRM_FIELDS.map((field) => `- ${field.key}: ${field.description}`).join("\n");

  return ["Map each row onto exactly these fields:", fieldLines].join("\n");
}

function buildRulesSection(): string {
  const statusList = CRM_STATUS_VALUES.join(", ");
  const sourceList = DATA_SOURCE_VALUES.join(", ");

  return [
    "Rules:",
    `- crm_status must be exactly one of: ${statusList}, or "" if the row gives no confident signal. Never invent a status.`,
    `- data_source must be exactly one of: ${sourceList}, or "" if none match confidently. Never guess the closest one.`,
    '- created_at must be a value JavaScript "new Date(value)" can parse. If no date-like column exists, leave it "".',
    "- If a row has multiple emails, use the first as email and append the rest to crm_note. Do the same for multiple phone numbers into mobile_without_country_code/crm_note.",
    "- mobile_without_country_code must never itself start with a country code or +; put the country code in country_code instead.",
    '- Never write a raw newline character inside crm_note or description; use the literal two characters "\\n" if a line break is genuinely needed.',
    "- If you cannot confidently determine a field's value from the row, leave it as an empty string. Never invent, guess, or hallucinate information that is not present in the row.",
  ].join("\n");
}

function buildResponseFormatSection(rowCount: number): string {
  return [
    "Response format:",
    "- Respond with JSON only. No markdown code fences, no explanations, no text before or after the JSON.",
    `- Respond with a JSON array of exactly ${rowCount} objects, one per input row below, in the same order as the input rows.`,
    "- Every object must have exactly the field names listed above, all values as strings.",
  ].join("\n");
}

function buildInputSection(input: ExtractionBatchInput): string {
  return [
    `Input rows (batch ${input.batchIndex}, ${input.rows.length} rows), as JSON objects keyed by the source CSV's own column headers:`,
    JSON.stringify(input.rows),
  ].join("\n");
}
