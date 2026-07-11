import { z } from "zod";
import { SKIP_REASONS } from "../constants/skip-reasons";

export const skipReasonSchema = z.enum([...SKIP_REASONS]);

// A row the backend declined to import, plus its original CSV values so the
// user can see why (docs/05-api-design.md §2).
export const skippedRecordSchema = z.object({
  row: z.number().int().nonnegative(),
  reason: skipReasonSchema,
  raw: z.record(z.string(), z.string()),
});

export type SkipReason = z.infer<typeof skipReasonSchema>;
export type SkippedRecord = z.infer<typeof skippedRecordSchema>;
