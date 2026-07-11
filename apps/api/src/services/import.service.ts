import {
  CONTACT_INFO_FIELDS,
  DEFAULT_AI_BATCH_SIZE,
  parseCsv,
  validateCsv,
  type ApiErrorCode,
  type CrmRecord,
  type ExtractionBatchInput,
  type ImportResult,
  type ImportSummary,
  type RawExtractedRecord,
  type SkippedRecord,
  type SkipReason,
} from "@groweasy/shared";
import { OperationalError } from "../errors/app-error";
import { logger } from "../lib/logger";
import type { AiExtractionService } from "./ai-extraction.service";
import type {
  ImportContext,
  ImportPreparationService,
  PreparedRow,
} from "./import-preparation.service";

interface BatchOutcome {
  batchIndex: number;
  succeeded: boolean;
  records: RawExtractedRecord[];
}

// The application's orchestration layer: coordinates the already-built
// pipeline (parse -> validate -> prepare -> AI-extract -> merge) into the
// final ImportResult. Owns no step's implementation — every individual
// capability is reused exactly as built in earlier phases.
export class ImportService {
  constructor(
    private readonly preparationService: ImportPreparationService,
    private readonly aiExtractionService: AiExtractionService,
    private readonly batchConcurrency: number,
  ) {}

  async processImport(buffer: Buffer): Promise<ImportResult> {
    const startedAt = Date.now();
    logger.info("Import started");

    const csvText = this.decodeUtf8(buffer);
    const preview = runOrThrow(() => parseCsv(csvText), "EMPTY_OR_UNPARSEABLE_CSV");
    logger.info({ totalRows: preview.rows.length }, "CSV parsed");

    const validationReport = runOrThrow(() => validateCsv(preview), "TOO_MANY_ROWS");
    const context = this.preparationService.prepare(preview, validationReport);
    logger.info({ batchCount: context.batches.length }, "Batches prepared");

    const outcomes = await this.runBatchesConcurrently(context.batches);
    this.assertNotTotalFailure(context.batches.length, outcomes);

    const result = this.mergeResults(context, outcomes);

    logger.info(
      {
        durationMs: Date.now() - startedAt,
        totalImported: result.summary.totalImported,
        totalSkipped: result.summary.totalSkipped,
        failedBatches: result.summary.batches.failed,
      },
      "Import completed",
    );

    return result;
  }

  private decodeUtf8(buffer: Buffer): string {
    const text = buffer.toString("utf-8");
    const UNICODE_REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

    if (text.includes(UNICODE_REPLACEMENT_CHARACTER)) {
      throw new OperationalError(
        422,
        "EMPTY_OR_UNPARSEABLE_CSV",
        "The file does not appear to be valid UTF-8 text.",
      );
    }

    return text;
  }

  private async runBatchesConcurrently(batches: ExtractionBatchInput[]): Promise<BatchOutcome[]> {
    return runWithConcurrencyLimit(batches, this.batchConcurrency, (batch) =>
      this.runSingleBatch(batch),
    );
  }

  private async runSingleBatch(batch: ExtractionBatchInput): Promise<BatchOutcome> {
    logger.info({ batchIndex: batch.batchIndex, rowCount: batch.rows.length }, "Batch started");

    try {
      const result = await this.aiExtractionService.extractBatch(batch);
      logger.info(
        { batchIndex: batch.batchIndex, recordCount: result.records.length },
        "Batch completed",
      );
      return { batchIndex: batch.batchIndex, succeeded: true, records: result.records };
    } catch (err) {
      logger.error(
        { batchIndex: batch.batchIndex, errorType: err instanceof Error ? err.name : typeof err },
        "Batch failed",
      );
      return { batchIndex: batch.batchIndex, succeeded: false, records: [] };
    }
  }

  // A batch failing is expected and handled per-row (AI_EXTRACTION_FAILED).
  // Every batch failing means nothing useful can be returned at all —
  // docs/05-api-design.md §2's 502 case. Zero batches (e.g. every row was
  // already invalid before reaching AI) is a different, valid situation,
  // not a failure.
  private assertNotTotalFailure(batchCount: number, outcomes: BatchOutcome[]): void {
    const allFailed = batchCount > 0 && outcomes.every((outcome) => !outcome.succeeded);

    if (allFailed) {
      throw new OperationalError(
        502,
        "UPSTREAM_AI_ERROR",
        "The AI provider failed to process this import. Please try again.",
      );
    }
  }

  private mergeResults(context: ImportContext, outcomes: BatchOutcome[]): ImportResult {
    const imported: CrmRecord[] = [];
    const skipped: SkippedRecord[] = [];

    for (const row of context.invalidRows) {
      skipped.push(toSkippedRecord(row, "MISSING_CONTACT_INFO"));
    }

    const outcomeByBatchIndex = new Map(outcomes.map((outcome) => [outcome.batchIndex, outcome]));

    for (const batch of context.batches) {
      const originalRows = this.originalRowsForBatch(context.validRows, batch);
      const outcome = outcomeByBatchIndex.get(batch.batchIndex);

      if (!outcome?.succeeded) {
        for (const row of originalRows) {
          skipped.push(toSkippedRecord(row, "AI_EXTRACTION_FAILED"));
        }
        continue;
      }

      outcome.records.forEach((record, position) => {
        const originalRow = originalRows[position];
        if (!originalRow) {
          return;
        }

        if (hasNoContactInfo(record)) {
          skipped.push(toSkippedRecord(originalRow, "MISSING_CONTACT_INFO"));
          return;
        }

        imported.push(sanitizeFreeText(record));
      });
    }

    return { imported, skipped, summary: this.buildSummary(context, imported, skipped, outcomes) };
  }

  // batches are a straightforward sequential chunking of validRows (see
  // import-preparation.service.ts) — recoverable via this slice rather than
  // ImportPreparationService needing to expose it separately, per this
  // phase's "do not rewrite ImportPreparationService" instruction.
  private originalRowsForBatch(
    validRows: PreparedRow[],
    batch: ExtractionBatchInput,
  ): PreparedRow[] {
    const start = batch.batchIndex * DEFAULT_AI_BATCH_SIZE;
    return validRows.slice(start, start + batch.rows.length);
  }

  private buildSummary(
    context: ImportContext,
    imported: CrmRecord[],
    skipped: SkippedRecord[],
    outcomes: BatchOutcome[],
  ): ImportSummary {
    return {
      totalRows: context.validationReport.totalRows,
      totalImported: imported.length,
      totalSkipped: skipped.length,
      batches: {
        total: context.batches.length,
        failed: outcomes.filter((outcome) => !outcome.succeeded).length,
      },
    };
  }
}

function hasNoContactInfo(record: CrmRecord): boolean {
  return CONTACT_INFO_FIELDS.every((field) => record[field] === "");
}

function toSkippedRecord(row: PreparedRow, reason: SkipReason): SkippedRecord {
  return { row: row.row, reason, raw: row.data };
}

// The CRM schema rule ("free-text fields must never contain raw unescaped
// newlines") is enforced here regardless of what the prompt asked for — AI
// output is never trusted blindly (docs/07-ai-design.md §4).
function sanitizeFreeText(record: RawExtractedRecord): CrmRecord {
  return {
    ...record,
    crm_note: escapeNewlines(record.crm_note),
    description: escapeNewlines(record.description),
  };
}

function escapeNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "\\n");
}

// Shared translation for the shared package's plain, framework-independent
// throws (parseCsv, validateCsv) into the API's AppError contract.
function runOrThrow<T>(fn: () => T, code: ApiErrorCode): T {
  try {
    return fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to process this file.";
    throw new OperationalError(422, code, message);
  }
}

// Minimal, dependency-free concurrency-limited map: runs `task` over `items`
// with at most `concurrency` in flight at once, preserving input order in
// the returned array regardless of completion order. Not exported — this
// is the one generic algorithm ImportService needs, not a reusable utility
// with a second caller yet.
async function runWithConcurrencyLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];
      if (item === undefined) {
        // Structurally unreachable: currentIndex < items.length was just
        // checked, and this array (ExtractionBatchInput[]) has no holes.
        continue;
      }
      results[currentIndex] = await task(item);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
