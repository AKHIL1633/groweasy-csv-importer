"use client";

import type { SkipReason, SkippedRecord } from "@groweasy/shared";
import { EmptyState } from "@/components/empty-state";
import { useRowVirtualizer } from "@/hooks/use-row-virtualizer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SkippedRecordsTableProps {
  records: SkippedRecord[];
}

// Record<SkipReason, string> forces this map to stay exhaustive — adding a
// new SkipReason in packages/shared will fail typecheck here until it's
// given a human-readable label.
const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  MISSING_CONTACT_INFO: "Missing email and phone number",
  AI_EXTRACTION_FAILED: "AI processing failed for this row",
};

export function SkippedRecordsTable({ records }: SkippedRecordsTableProps) {
  const { scrollContainerRef, virtualRows, paddingTop, paddingBottom, measureElement } =
    useRowVirtualizer(records.length);

  if (records.length === 0) {
    return (
      <EmptyState title="All rows imported" description="No rows in this file were skipped." />
    );
  }

  // "raw" columns are whatever the source CSV's own headers were — unknown
  // ahead of time, so derived from the data itself rather than hardcoded.
  const rawColumns = Array.from(new Set(records.flatMap((record) => Object.keys(record.raw))));
  const columnCount = 2 + rawColumns.length;

  return (
    <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead scope="col">Row</TableHead>
            <TableHead scope="col">Reason</TableHead>
            {rawColumns.map((column) => (
              <TableHead key={column} scope="col">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true" style={{ height: paddingTop }}>
              <td colSpan={columnCount} />
            </tr>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const record = records[virtualRow.index];
            if (!record) return null;
            return (
              <TableRow key={record.row} data-index={virtualRow.index} ref={measureElement}>
                <TableCell>{record.row}</TableCell>
                <TableCell>{SKIP_REASON_LABELS[record.reason]}</TableCell>
                {rawColumns.map((column) => (
                  <TableCell key={column}>{record.raw[column] || ""}</TableCell>
                ))}
              </TableRow>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true" style={{ height: paddingBottom }}>
              <td colSpan={columnCount} />
            </tr>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
