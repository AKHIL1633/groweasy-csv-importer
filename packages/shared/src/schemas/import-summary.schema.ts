import { z } from "zod";

// Counts are structurally non-negative integers — that's a fact about what a
// count is, not a business rule about lead handling.
export const importBatchSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const importSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  totalImported: z.number().int().nonnegative(),
  totalSkipped: z.number().int().nonnegative(),
  batches: importBatchSummarySchema,
});

export type ImportSummary = z.infer<typeof importSummarySchema>;
