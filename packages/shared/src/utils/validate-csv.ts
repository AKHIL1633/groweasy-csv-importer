import { MAX_CSV_ROWS } from "../constants/limits";
import type {
  CsvValidationIssue,
  CsvValidationReport,
  RowValidationResult,
} from "../schemas/csv-validation.schema";
import type { CsvPreview, CsvRow } from "../types/csv";

const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const RENAMED_HEADER_PATTERN = /^(.+)_(\d+)$/;

function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function looksLikePhoneNumber(value: string): boolean {
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= MIN_PHONE_DIGITS && digitCount <= MAX_PHONE_DIGITS;
}

function hasContactInfo(row: CsvRow): boolean {
  return Object.values(row).some((value) => looksLikeEmail(value) || looksLikePhoneNumber(value));
}

// parseCsv's underlying parser already auto-renames true duplicate headers
// (e.g. "Email" -> "Email", "Email_1") to prevent data loss, so exact
// duplicates never reach here. This instead recognizes that rename pattern
// in the already-parsed headers — a documented heuristic, not a rewrite of
// the parser: a real (if rare) column literally named "Email_1" alongside
// "Email" would false-positive here, which is acceptable since this is
// informational only, never blocking.
function findRenamedDuplicateHeaders(headers: string[]): string[] {
  const headerSet = new Set(headers);
  const duplicates: string[] = [];

  for (const header of headers) {
    const match = RENAMED_HEADER_PATTERN.exec(header);
    if (match?.[1] && headerSet.has(match[1])) {
      duplicates.push(match[1]);
    }
  }

  return duplicates;
}

function validateFileStructure(headers: string[]): {
  errors: CsvValidationIssue[];
  warnings: CsvValidationIssue[];
} {
  const errors: CsvValidationIssue[] = findRenamedDuplicateHeaders(headers).map((header) => ({
    code: "DUPLICATE_HEADER",
    message: `The column "${header}" appears more than once. Duplicate columns were automatically renamed.`,
  }));

  const emptyHeaderCount = headers.filter((header) => header.length === 0).length;
  const warnings: CsvValidationIssue[] =
    emptyHeaderCount > 0
      ? [
          {
            code: "EMPTY_HEADER_NAME",
            message: `${emptyHeaderCount} column(s) have no name.`,
          },
        ]
      : [];

  return { errors, warnings };
}

function validateRow(row: CsvRow, rowNumber: number): RowValidationResult {
  const errors: CsvValidationIssue[] = hasContactInfo(row)
    ? []
    : [
        {
          code: "NO_CONTACT_INFO_DETECTED",
          message: "No value in this row looks like an email address or phone number.",
        },
      ];

  return { row: rowNumber, isValid: errors.length === 0, errors, warnings: [] };
}

// Validates already-parsed CSV data — never re-parses, never mutates rows.
// Only throws for the one condition that must reject the whole request
// (too many rows); every other issue is returned in the report, per the
// "return validation information only, never discard records" requirement.
export function validateCsv(preview: CsvPreview): CsvValidationReport {
  if (preview.rows.length > MAX_CSV_ROWS) {
    throw new Error(
      `This file has ${preview.rows.length} rows, which exceeds the maximum of ${MAX_CSV_ROWS}.`,
    );
  }

  const { errors: fileErrors, warnings: fileWarnings } = validateFileStructure(preview.headers);

  const rowResults = preview.rows.map((row, index) => validateRow(row, index + 1));
  const rowIssues = rowResults.filter(
    (result) => result.errors.length > 0 || result.warnings.length > 0,
  );
  const invalidRows = rowResults.filter((result) => !result.isValid).length;

  return {
    totalRows: preview.rows.length,
    validRows: preview.rows.length - invalidRows,
    invalidRows,
    fileErrors,
    fileWarnings,
    rowIssues,
  };
}
