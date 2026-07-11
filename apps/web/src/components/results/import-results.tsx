import { CircleCheck } from "lucide-react";
import type { ImportResult } from "@groweasy/shared";
import { Button } from "@/components/ui/button";
import { ImportedRecordsTable } from "./imported-records-table";
import { ImportSummaryCards } from "./import-summary-cards";
import { SkippedRecordsTable } from "./skipped-records-table";

interface ImportResultsProps {
  result: ImportResult;
  onReset: () => void;
}

// Renders directly from the single ImportResult the workflow already holds
// in state — no copies into separate imported/skipped/summary state slots.
export function ImportResults({ result, onReset }: ImportResultsProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-medium">Import complete</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Import another file
        </Button>
      </div>

      <ImportSummaryCards summary={result.summary} />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Imported records</h3>
        <ImportedRecordsTable records={result.imported} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Skipped records</h3>
        <SkippedRecordsTable records={result.skipped} />
      </div>
    </div>
  );
}
