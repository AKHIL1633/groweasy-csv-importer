import type { CrmRecord } from "../schemas/crm-record.schema";
import type { CsvRow } from "./csv";

// Internal ImportService <-> AiExtractionProvider contract — never sent over
// the wire, so it isn't schema-validated. See docs/06-shared-package.md §5.
export interface ExtractionBatchInput {
  headers: string[];
  rows: CsvRow[];
  batchIndex: number;
}

// Shape the AI is expected to return, before the skip-rule/enum/sanitization
// re-validation pass described in docs/07-ai-design.md §4.
export type RawExtractedRecord = CrmRecord;

export interface ExtractionBatchResult {
  records: RawExtractedRecord[];
  batchIndex: number;
}
