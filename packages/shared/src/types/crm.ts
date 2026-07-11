import type { CrmRecord } from "../schemas/crm-record.schema";

// Describes one entry in constants/crm-fields.ts. Not schema-validated (it
// never crosses the wire), so it stays a plain type — see
// docs/06-shared-package.md §5.
export interface CrmFieldMeta {
  key: keyof CrmRecord;
  label: string;
  description: string;
}
