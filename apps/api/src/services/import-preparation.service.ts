import {
  DEFAULT_AI_BATCH_SIZE,
  type CsvPreview,
  type CsvRow,
  type CsvValidationReport,
  type ExtractionBatchInput,
} from "@groweasy/shared";

// Never sent to the client as-is once the AI phase exists — internal to
// apps/api, unlike CsvPreview/CsvValidationReport, which do cross the wire.
// See docs/06-shared-package.md §1 ("if only one app cares, it stays local").
export interface PreparedRow {
  row: number;
  data: CsvRow;
}

export interface ImportContext {
  headers: string[];
  validRows: PreparedRow[];
  invalidRows: PreparedRow[];
  batches: ExtractionBatchInput[];
  validationReport: CsvValidationReport;
}

export class ImportPreparationService {
  prepare(preview: CsvPreview, validationReport: CsvValidationReport): ImportContext {
    const { validRows, invalidRows } = this.splitRows(preview.rows, validationReport);
    const batches = this.buildBatches(preview.headers, validRows);

    return {
      headers: preview.headers,
      validRows,
      invalidRows,
      batches,
      validationReport,
    };
  }

  private splitRows(
    rows: CsvRow[],
    validationReport: CsvValidationReport,
  ): { validRows: PreparedRow[]; invalidRows: PreparedRow[] } {
    const invalidRowNumbers = new Set(
      validationReport.rowIssues.filter((result) => !result.isValid).map((result) => result.row),
    );

    const validRows: PreparedRow[] = [];
    const invalidRows: PreparedRow[] = [];

    rows.forEach((data, index) => {
      const preparedRow: PreparedRow = { row: index + 1, data };
      const target = invalidRowNumbers.has(preparedRow.row) ? invalidRows : validRows;
      target.push(preparedRow);
    });

    return { validRows, invalidRows };
  }

  private buildBatches(headers: string[], validRows: PreparedRow[]): ExtractionBatchInput[] {
    const batches: ExtractionBatchInput[] = [];

    for (let start = 0; start < validRows.length; start += DEFAULT_AI_BATCH_SIZE) {
      const chunk = validRows.slice(start, start + DEFAULT_AI_BATCH_SIZE);
      batches.push({
        headers,
        rows: chunk.map((preparedRow) => preparedRow.data),
        batchIndex: batches.length,
      });
    }

    return batches;
  }
}
