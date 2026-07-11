import { z } from "zod";
import { crmRecordSchema } from "./crm-record.schema";
import { importSummarySchema } from "./import-summary.schema";
import { skippedRecordSchema } from "./skipped-record.schema";

// The payload of a successful POST /api/imports — docs/05-api-design.md §2.
export const importResultSchema = z.object({
  imported: z.array(crmRecordSchema),
  skipped: z.array(skippedRecordSchema),
  summary: importSummarySchema,
});

export type ImportResult = z.infer<typeof importResultSchema>;
