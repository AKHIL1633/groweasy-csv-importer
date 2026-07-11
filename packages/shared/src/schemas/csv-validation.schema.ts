import { z } from "zod";
import { CSV_VALIDATION_ISSUE_CODES } from "../constants/validation";

export const csvValidationIssueCodeSchema = z.enum([...CSV_VALIDATION_ISSUE_CODES]);

export const csvValidationIssueSchema = z.object({
  code: csvValidationIssueCodeSchema,
  message: z.string(),
});

// Mirrors the {isValid, errors, warnings} shape requested for Phase 5.
export const rowValidationResultSchema = z.object({
  row: z.number().int().positive(),
  isValid: z.boolean(),
  errors: z.array(csvValidationIssueSchema),
  warnings: z.array(csvValidationIssueSchema),
});

// rowIssues only lists rows with at least one error or warning — mirrors
// SkippedRecord[] only ever listing skipped rows, not every row.
export const csvValidationReportSchema = z.object({
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  fileErrors: z.array(csvValidationIssueSchema),
  fileWarnings: z.array(csvValidationIssueSchema),
  rowIssues: z.array(rowValidationResultSchema),
});

export type CsvValidationIssueCode = z.infer<typeof csvValidationIssueCodeSchema>;
export type CsvValidationIssue = z.infer<typeof csvValidationIssueSchema>;
export type RowValidationResult = z.infer<typeof rowValidationResultSchema>;
export type CsvValidationReport = z.infer<typeof csvValidationReportSchema>;
