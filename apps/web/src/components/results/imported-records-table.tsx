"use client";

import { CRM_FIELDS, type CrmRecord } from "@groweasy/shared";
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

interface ImportedRecordsTableProps {
  records: CrmRecord[];
}

// Columns come entirely from CRM_FIELDS (packages/shared) — adding or
// renaming a CRM field changes this table with no code change here. Rows
// are windowed via useRowVirtualizer so a large import doesn't create one
// live DOM row per record; a small result set renders identically to
// before virtualization existed.
export function ImportedRecordsTable({ records }: ImportedRecordsTableProps) {
  const { scrollContainerRef, virtualRows, paddingTop, paddingBottom, measureElement } =
    useRowVirtualizer(records.length);

  if (records.length === 0) {
    return (
      <EmptyState
        title="No records imported"
        description="None of the rows in this file could be imported — see the skipped records below for why."
      />
    );
  }

  return (
    <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {CRM_FIELDS.map((field) => (
              <TableHead key={field.key} scope="col">
                {field.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true" style={{ height: paddingTop }}>
              <td colSpan={CRM_FIELDS.length} />
            </tr>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const record = records[virtualRow.index];
            if (!record) return null;
            return (
              <TableRow key={virtualRow.index} data-index={virtualRow.index} ref={measureElement}>
                {CRM_FIELDS.map((field) => (
                  <TableCell key={field.key}>
                    {record[field.key] || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true" style={{ height: paddingBottom }}>
              <td colSpan={CRM_FIELDS.length} />
            </tr>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
