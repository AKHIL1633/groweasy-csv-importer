import type { ImportSummary } from "@groweasy/shared";

interface ImportSummaryCardsProps {
  summary: ImportSummary;
}

// Exactly three stat tiles (total/imported/skipped) plus one supplementary
// line for batch failures if any occurred — not a full batch-metrics
// dashboard, since a user importing leads cares about lead outcomes, not
// backend batch mechanics (docs/12-ui-design.md §16).
export function ImportSummaryCards({ summary }: ImportSummaryCardsProps) {
  const stats = [
    { label: "Total Rows", value: summary.totalRows },
    { label: "Imported", value: summary.totalImported },
    { label: "Skipped", value: summary.totalSkipped },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border p-3 text-center transition-colors sm:p-4"
          >
            <p className="text-xl font-semibold sm:text-2xl">{stat.value}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
          </div>
        ))}
      </div>
      {summary.batches.failed > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {summary.batches.failed} of {summary.batches.total} AI batches could not be processed;
          affected rows were skipped.
        </p>
      ) : null}
    </div>
  );
}
